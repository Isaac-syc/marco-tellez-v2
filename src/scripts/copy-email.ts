/** "Copy email" → "Copied" for 2 s (inside an aria-live="polite" region). */
const ready = new WeakSet<Element>();

export function initCopyEmail(): void {
  document.querySelectorAll<HTMLElement>('[data-copy]').forEach((wrap) => {
    if (ready.has(wrap)) return;
    ready.add(wrap);
    const button = wrap.querySelector<HTMLButtonElement>('[data-copy-btn]');
    if (!button) return;
    const label = button.textContent ?? '';
    let timer = 0;
    button.addEventListener('click', async () => {
      const text = wrap.dataset.copy ?? '';
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Clipboard API unavailable (insecure context): fall back to a selection copy.
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
        document.body.append(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      button.textContent = 'Copied';
      window.clearTimeout(timer);
      timer = window.setTimeout(() => (button.textContent = label), 2000);
    });
  });
}
