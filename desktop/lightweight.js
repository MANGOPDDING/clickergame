(async () => {
  const { invoke } = window.__TAURI__.core;
  const version = Number(document.querySelector('meta[name="journey-game-version"]')?.content);
  try {
    if (version && await invoke('finish_game_boot', {
      version, ready: window.__journeyGameReady === version
    })) {
      sessionStorage.setItem('journeyContentSaveRestore', JSON.stringify(window.__journeySaveBeforeBoot ?? null));
      location.reload();
      return;
    }
  } catch (error) {
    console.error('Could not confirm game content', error);
  } finally {
    delete window.__journeySaveBeforeBoot;
  }
  const actions = document.querySelector('.top-actions');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary';
  button.textContent = '更新を確認';
  actions.append(button);
  const badge = document.createElement('span');
  actions.append(badge);

  async function refreshUpdateStatus() {
    const [[ready, message], [current, queued, contentMessage]] = await Promise.all([
      invoke('desktop_update_status'), invoke('game_content_status')
    ]);
    badge.textContent = `ゲーム V${current}`;
    button.textContent = ready ? 'アプリ更新の準備完了' :
      queued > current ? `ゲーム V${queued} を取得済み` : '更新を確認';
    button.title = `${contentMessage}\n${message}`;
    return button.title;
  }

  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    try {
      await Promise.all([invoke('check_desktop_update'), invoke('check_game_content')]);
      alert(await refreshUpdateStatus());
    } catch {
      alert('更新を確認できませんでした。');
    } finally {
      button.disabled = false;
    }
  });
  setInterval(() => void refreshUpdateStatus().catch(console.error), 5000);
  void refreshUpdateStatus().catch(console.error);

  window.journeyApplyPreparedUpdate = async () => {
    try {
      save();
      await invoke('apply_prepared_update');
    } catch {
      await invoke('cancel_update_close').catch(console.error);
      alert('更新を適用できませんでした。更新を確認してから、もう一度終了してください。');
    }
  };
})();
