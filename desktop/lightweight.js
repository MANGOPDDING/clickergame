(() => {
  const { invoke } = window.__TAURI__.core;
  const actions = document.querySelector('.top-actions');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary';
  button.textContent = '更新を確認';
  actions.append(button);

  async function refreshUpdateStatus() {
    const [ready, message] = await invoke('desktop_update_status');
    button.textContent = ready ? '更新の準備完了' : '更新を確認';
    button.title = message;
    return message;
  }

  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    try {
      await invoke('check_desktop_update');
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
