use base64::{engine::general_purpose::STANDARD, Engine};
use minisign_verify::{PublicKey, Signature};
use serde::Deserialize;
use std::{
    borrow::Cow,
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
    time::Duration,
};
use tauri::{
    utils::assets::{AssetKey, AssetsIter, CspHash},
    App, AppHandle, Assets, Manager, State, Wry,
};

const LIMIT: usize = 4 * 1024 * 1024;
const PROTOCOL: u32 = 1;

#[derive(Deserialize)]
struct Config {
    endpoint: String,
    pubkey: String,
}

#[derive(Deserialize)]
struct Envelope {
    payload: String,
    signature: String,
}

#[derive(Deserialize)]
struct Content {
    protocol: u32,
    version: u32,
    html: String,
    script: String,
}

struct Package {
    content: Content,
    raw: Vec<u8>,
}

fn verify(raw: Vec<u8>, key: &PublicKey) -> Option<Package> {
    if raw.len() > LIMIT {
        return None;
    }
    let envelope: Envelope = serde_json::from_slice(&raw).ok()?;
    let signature = STANDARD.decode(envelope.signature).ok()?;
    let signature = Signature::decode(std::str::from_utf8(&signature).ok()?).ok()?;
    key.verify(envelope.payload.as_bytes(), &signature, true).ok()?;
    let content: Content = serde_json::from_str(&envelope.payload).ok()?;
    let script_tag = format!("<script src=\"game.js?v={}\"></script>", content.version);
    let version_tag = format!("<meta name=\"journey-game-version\" content=\"{}\">", content.version);
    if content.protocol != PROTOCOL
        || content.version == 0
        || content.script.is_empty()
        || !content.html.contains(&script_tag)
        || !content.html.contains(&version_tag)
        || !content.html.contains("<script src=\"save-transfer.js\"></script>")
        || !content.html.contains("<script src=\"lightweight.js\"></script>")
    {
        return None;
    }
    Some(Package { content, raw })
}

fn read_package(path: &Path, key: &PublicKey) -> Option<Package> {
    let mut raw = Vec::new();
    File::open(path).ok()?.take((LIMIT + 1) as u64).read_to_end(&mut raw).ok()?;
    verify(raw, key)
}

fn persist(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let dir = path.parent().ok_or(std::io::ErrorKind::InvalidInput)?;
    let mut file = tempfile::NamedTempFile::new_in(dir)?;
    file.write_all(bytes)?;
    file.as_file().sync_all()?;
    file.persist(path)?;
    Ok(())
}

pub type SharedContent = Arc<Mutex<GameContent>>;

pub struct GameContent {
    embedded_version: u32,
    current: Option<Package>,
    previous: Option<Package>,
    trial: bool,
    attempted: u32,
    queued: u32,
    dir: Option<PathBuf>,
    source: Option<(reqwest::Url, Arc<PublicKey>)>,
    busy: bool,
    status: &'static str,
}

impl GameContent {
    fn version(&self) -> u32 {
        self.current.as_ref().map_or(self.embedded_version, |package| package.content.version)
    }

    fn initialize(&mut self, app: &App) {
        let Some(config) = app.config().plugins.0.get("gameContent")
            .and_then(|value| serde_json::from_value::<Config>(value.clone()).ok()) else { return };
        let Some(key) = STANDARD.decode(config.pubkey).ok()
            .and_then(|bytes| PublicKey::decode(std::str::from_utf8(&bytes).ok()?).ok()) else { return };
        let Ok(endpoint) = reqwest::Url::parse(&config.endpoint) else { return };
        let qa_loopback = app.config().identifier == "jp.littletown.chronicles.qa"
            && endpoint.scheme() == "http" && endpoint.host_str() == Some("127.0.0.1");
        if endpoint.scheme() != "https" && !qa_loopback {
            return;
        }
        let Ok(base) = app.path().app_local_data_dir() else { return };
        let dir = base.join("game-content");
        if fs::create_dir_all(&dir).is_err() {
            return;
        }
        self.current = read_package(&dir.join("active.json"), &key)
            .filter(|package| package.content.version > self.embedded_version);
        self.attempted = fs::read_to_string(dir.join("attempted-version"))
            .ok().and_then(|version| version.parse().ok()).unwrap_or_default();
        if let Some(pending) = read_package(&dir.join("pending.json"), &key)
            .filter(|package| package.content.version > self.version().max(self.attempted)) {
            let version = pending.content.version;
            // Record the attempt before loading so a failed startup is tried only once.
            if persist(&dir.join("attempted-version"), version.to_string().as_bytes()).is_ok() {
                self.attempted = version;
                self.previous = self.current.take();
                self.current = Some(pending);
                self.trial = true;
            }
        }
        self.source = Some((endpoint, Arc::new(key)));
        self.dir = Some(dir);
    }
}

type Embedded = OnceLock<Box<dyn Assets<Wry>>>;

struct GameAssets {
    embedded: Arc<Embedded>,
    state: SharedContent,
}

impl GameAssets {
    fn base(&self) -> &dyn Assets<Wry> {
        self.embedded.get().expect("embedded assets set").as_ref()
    }
}

impl Assets<Wry> for GameAssets {
    fn setup(&self, app: &App) {
        self.base().setup(app);
        self.state.lock().unwrap().initialize(app);
    }

    fn get(&self, key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        if matches!(key.as_ref(), "/index.html" | "/game.js") {
            let state = self.state.lock().unwrap();
            if let Some(package) = &state.current {
                let content = &package.content;
                let bytes = if key.as_ref() == "/index.html" { &content.html } else { &content.script };
                return Some(Cow::Owned(bytes.as_bytes().to_vec()));
            }
        }
        self.base().get(key)
    }

    fn iter(&self) -> Box<AssetsIter<'_>> {
        self.base().iter()
    }

    fn csp_hashes(&self, path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        self.base().csp_hashes(path)
    }
}

pub fn install_assets(context: &mut tauri::Context<Wry>) -> SharedContent {
    let version = context.assets().get(&AssetKey::from("game-version.txt"))
        .and_then(|bytes| std::str::from_utf8(&bytes).ok()?.parse().ok())
        .expect("embedded game version");
    let state = Arc::new(Mutex::new(GameContent {
        embedded_version: version,
        current: None,
        previous: None,
        trial: false,
        attempted: 0,
        queued: 0,
        dir: None,
        source: None,
        busy: false,
        status: "ゲームデータの更新確認を待っています。",
    }));
    let embedded = Arc::new(OnceLock::new());
    let base = context.set_assets(Box::new(GameAssets { embedded: embedded.clone(), state: state.clone() }));
    assert!(embedded.set(base).is_ok());
    state
}

async fn fetch(endpoint: reqwest::Url, key: &PublicKey) -> Result<Option<Package>, ()> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .build().map_err(|_| ())?;
    let mut response = client.get(endpoint)
        .header(reqwest::header::CACHE_CONTROL, "no-cache")
        .send().await.map_err(|_| ())?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() || response.content_length().is_some_and(|n| n > LIMIT as u64) {
        return Err(());
    }
    let mut raw = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| ())? {
        if chunk.len() > LIMIT - raw.len() {
            return Err(());
        }
        raw.extend_from_slice(&chunk);
    }
    verify(raw, key).map(Some).ok_or(())
}

#[tauri::command]
pub fn game_content_status(state: State<'_, SharedContent>) -> (u32, u32, &'static str) {
    let state = state.lock().unwrap();
    (state.version(), state.queued, state.status)
}

#[tauri::command]
pub async fn check_game_content(app: AppHandle) {
    let shared = app.state::<SharedContent>();
    let (endpoint, key) = {
        let mut state = shared.lock().unwrap();
        if state.busy {
            return;
        }
        let Some(source) = state.source.clone() else { return };
        state.busy = true;
        state.status = "ゲームデータの更新を確認しています。";
        source
    };
    let result = fetch(endpoint, &key).await;
    let mut state = shared.lock().unwrap();
    state.busy = false;
    state.status = match result {
        Ok(Some(package)) if package.content.version > state.version().max(state.queued).max(state.attempted) => {
            let path = state.dir.as_ref().unwrap().join("pending.json");
            if persist(&path, &package.raw).is_ok() {
                state.queued = package.content.version;
                "ゲームデータの新版を取得しました。次回起動時に反映します。"
            } else {
                "ゲームデータを保存できませんでした。"
            }
        }
        Ok(_) if state.queued > state.version() => "取得したゲームデータは次回起動時に反映します。",
        Ok(_) => "ゲームデータの新しい更新はありません。",
        Err(_) => "ゲームデータの更新を取得または確認できませんでした。",
    };
}

#[tauri::command]
pub fn finish_game_boot(state: State<'_, SharedContent>, version: u32, ready: bool) -> Result<bool, String> {
    let mut state = state.lock().unwrap();
    if !state.trial || state.version() != version {
        return Ok(false);
    }
    if ready {
        let path = state.dir.as_ref().unwrap().join("active.json");
        persist(&path, &state.current.as_ref().unwrap().raw).map_err(|error| error.to_string())?;
        state.previous = None;
        state.trial = false;
        return Ok(false);
    }
    state.current = state.previous.take();
    state.trial = false;
    state.status = "新版を起動できなかったため、前のゲームデータに戻しました。";
    Ok(true)
}
