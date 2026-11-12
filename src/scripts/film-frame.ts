/**
 * Film player. The YouTube iframe is NEVER present on load: it is created on
 * the first click. Frames of films with `embeddable: false` render as a plain
 * link (see FilmFrame.astro) and carry no `data-player` / `data-embed`, so this
 * code path cannot run for them.
 */
const ready = new WeakSet<Element>();

export function initFilmFrames(): void {
  document.querySelectorAll<HTMLElement>('[data-film-frame] [data-player]').forEach((box) => {
    if (ready.has(box)) return;
    ready.add(box);
    const button = box.querySelector<HTMLButtonElement>('.ff-play');
    button?.addEventListener('click', () => play(box));
  });
}

function play(box: HTMLElement): void {
  const frame = box.closest<HTMLElement>('[data-film-frame]');
  const src = box.dataset.embed;
  if (!frame || !src || box.querySelector('iframe')) return;

  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.title = box.dataset.title ?? '';
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  box.append(iframe);

  // The box animates its aspect-ratio to 16:9 (CSS) so YouTube's controls fit.
  frame.classList.add('is-playing');
  iframe.focus();
}
