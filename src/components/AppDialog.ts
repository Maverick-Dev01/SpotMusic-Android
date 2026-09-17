/** One themed dialog queue for messages, confirmations and text entry. */
class AppDialog {
  private tail: Promise<unknown> = Promise.resolve();

  private show(message: string, kind: 'alert' | 'confirm' | 'prompt', initial = ''): Promise<string | boolean | null> {
    const run = () => new Promise<string | boolean | null>(resolve => {
      const previous = document.activeElement as HTMLElement | null;
      const dialog = document.createElement('dialog');
      dialog.className = 'app-dialog';
      dialog.innerHTML = `<form method="dialog" class="app-dialog-card">
        <div class="app-dialog-mark" aria-hidden="true">♪</div>
        <h2 id="app-dialog-title">${kind === 'confirm' ? 'Confirmar acción' : kind === 'prompt' ? 'Completar información' : 'SpotMusic'}</h2>
        <p id="app-dialog-message"></p>
        <input class="app-dialog-input" aria-labelledby="app-dialog-message" maxlength="2048" autocomplete="off" />
        <div class="app-dialog-actions"><button type="button" class="dialog-secondary">Cancelar</button><button type="submit" class="dialog-primary">${kind === 'alert' ? 'Entendido' : 'Continuar'}</button></div>
      </form>`;
      dialog.setAttribute('aria-labelledby', 'app-dialog-title');
      dialog.setAttribute('aria-describedby', 'app-dialog-message');
      dialog.querySelector('p')!.textContent = message;
      const input = dialog.querySelector('input')!;
      input.hidden = kind !== 'prompt';
      input.value = initial;
      const cancel = dialog.querySelector<HTMLButtonElement>('.dialog-secondary')!;
      cancel.hidden = kind === 'alert';
      let completed = false;
      const finish = (accepted: boolean) => {
        if (completed) return;
        completed = true;
        dialog.close();
        dialog.remove();
        previous?.focus();
        resolve(kind === 'prompt' ? (accepted ? input.value.trim() : null) : accepted);
      };
      cancel.addEventListener('click', () => finish(false));
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
      dialog.querySelector('form')!.addEventListener('submit', event => { event.preventDefault(); finish(true); });
      document.body.append(dialog);
      dialog.showModal();
      if (kind === 'prompt') input.focus();
      else dialog.querySelector<HTMLButtonElement>('.dialog-primary')!.focus();
    });
    const result = this.tail.then(run, run);
    this.tail = result.catch(() => undefined);
    return result;
  }

  async alert(message: unknown): Promise<void> { await this.show(String(message), 'alert'); }
  async confirm(message: string): Promise<boolean> { return (await this.show(message, 'confirm')) === true; }
  async prompt(message: string, initial = ''): Promise<string | null> { return await this.show(message, 'prompt', initial) as string | null; }
}
export const appDialog = new AppDialog();
