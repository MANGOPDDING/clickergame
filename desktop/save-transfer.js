(() => {
  const key = 'townSaveV7';
  const pendingKey = 'journeyPendingSaveImport';
  const format = 'journey-save-v1';
  // Run before the game loads, after any outgoing pagehide save.
  const pendingSave = localStorage.getItem(pendingKey);
  if (pendingSave !== null) {
    localStorage.removeItem(pendingKey);
    localStorage.setItem(key, pendingSave);
  }
  if (window.__TAURI__?.core) {
    const restore = sessionStorage.getItem('journeyContentSaveRestore');
    if (restore !== null) {
      sessionStorage.removeItem('journeyContentSaveRestore');
      const original = JSON.parse(restore);
      if (original === null) localStorage.removeItem(key);
      else localStorage.setItem(key, original);
    }
    window.__journeySaveBeforeBoot = localStorage.getItem(key);
  }
  const controls = document.querySelector('.top-actions');
  if (!controls) return;

  const importFile = document.createElement('input');
  importFile.type = 'file';
  importFile.accept = '.json,application/json';
  importFile.hidden = true;
  controls.append(importFile);

  function addButton(label, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary';
    button.textContent = label;
    button.addEventListener('click', action);
    controls.append(button);
  }

  addButton('セーブ書き出し', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      save();
      const saveData = JSON.parse(localStorage.getItem(key));
      const contents = JSON.stringify({ format, save: saveData }, null, 2);
      const tauri = window.__TAURI__?.core;
      if (tauri) {
        const path = await tauri.invoke('export_game_save', { contents });
        if (path) alert(`セーブを書き出しました。\n${path}`);
        return;
      }
      const file = new Blob([contents], { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'little-town-chronicles-save.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      alert('セーブを書き出せませんでした。');
    } finally {
      button.disabled = false;
    }
  });
  addButton('セーブ取り込み', () => importFile.click());

  importFile.addEventListener('change', async () => {
    const file = importFile.files[0];
    importFile.value = '';
    if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('Save file too large');
      const data = JSON.parse(await file.text());
      const imported = data?.format === format ? data.save : data;
      if (!isGameSave(imported)) throw new Error('Invalid save');
      if (!confirm('現在のセーブを、選んだファイルの内容で置き換えますか？')) return;
      // Importing a copy of another installation is not a period of absence.
      imported.last = Date.now();
      localStorage.setItem(pendingKey, JSON.stringify(imported));
    } catch {
      alert('セーブを取り込めませんでした。書き出したJSONファイルを選んでください。');
      return;
    }
    location.reload();
  });

  function isGameSave(data) {
    const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const isItem = value => isRecord(value) && typeof value.id === 'string' &&
      typeof value.slot === 'string' && typeof value.type === 'string' && typeof value.name === 'string';
    return isRecord(data) && Number.isFinite(data.gold) && Number.isInteger(data.selected) &&
      Number.isInteger(data.unlocked) && isRecord(data.build) && isRecord(data.skill) &&
      Array.isArray(data.inventory) && data.inventory.every(isItem) && isRecord(data.equipment) &&
      Object.values(data.equipment).every(item => item === null || isItem(item)) &&
      Array.isArray(data.stash) && data.stash.every(isItem);
  }
})();
