/**
 * Page transitions as editing, on top of Astro's <ClientRouter /> (View
 * Transitions API). The grammar (docs/03-v2-cinematic.md §3):
 *
 *  - Every navigation dips the page to black and brings the next one up
 *    from black (CSS on ::view-transition-old/new(root)).
 *  - If a film frame is on screen in both shots it does not cut: it carries
 *    over under the shared name `screen`.
 *      list / home / pager thumbnail → film page   match cut (frame grows into the screen)
 *      film page → film page (screen on view)        masking: the screen re-frames to the next ratio
 *      film page → list / home                       reverse match cut, if that film's frame is on view
 *  - Reduced motion: no shared element, a short cross-fade (CSS).
 *
 * View-transition names must be unique per page and only frames visible in
 * the viewport should travel, so the name is applied just in time:
 *   `astro:before-preparation` → on the outgoing page (captured as "old"),
 *   `astro:after-swap`         → on the incoming page, after Astro set its scroll.
 */
import { activateFilm } from './film-list';

const FILM_PATH = /^(?:\/(?:es|cs))?\/films\/([^/]+)\/?$/;
const slugOf = (path: string): string | null => FILM_PATH.exec(path)?.[1] ?? null;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Cut {
  from: string | null;
  to: string | null;
  toPath: string;
  /** A frame was named on the outgoing page: the incoming one must name its counterpart. */
  carried: boolean;
}
let cut: Cut | null = null;

/** Box of a frame is (at least partly) inside the viewport. */
function onView(frame: HTMLElement): boolean {
  const r = (frame.querySelector('.ff-box') ?? frame).getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
}

function carry(frame: HTMLElement | null | undefined): boolean {
  if (!frame) return false;
  frame.setAttribute('data-vt', '');
  return true;
}

/** First on-view frame of film `slug` that is not the page's own screen; activates its list entry. */
function frameOf(slug: string): HTMLElement | null {
  document.querySelectorAll('[data-film-list]').forEach((l) => activateFilm(l, slug));
  const frames = document.querySelectorAll<HTMLElement>(`[data-film-frame="${CSS.escape(slug)}"]:not([data-screen])`);
  for (const f of frames) if (onView(f)) return f;
  return null;
}

/** The film page's own screen, if it is on view. */
function screen(): HTMLElement | null {
  const s = document.querySelector<HTMLElement>('[data-film-frame][data-screen]');
  return s && onView(s) ? s : null;
}

/** Reflects the current location in the persisted nav (aria-current). */
export function syncNav(path: string): void {
  // The first segment is the locale on /es/… and /cs/…; English has none.
  const parts = path.split('/');
  const section = (parts[1] === 'es' || parts[1] === 'cs' ? parts[2] : parts[1]) ?? '';
  document.querySelectorAll<HTMLAnchorElement>('.site-nav [data-nav]').forEach((a) => {
    if (a.dataset.nav === section) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

export function initTransitions(): void {
  document.addEventListener('astro:before-preparation', (e) => {
    const toPath = (e as Event & { to: URL }).to.pathname;
    const from = slugOf(location.pathname);
    const to = slugOf(toPath);
    document.documentElement.removeAttribute('data-intro');
    document.querySelectorAll('[data-vt]').forEach((el) => el.removeAttribute('data-vt'));

    let carried = false;
    if (!reduced() && toPath !== location.pathname) {
      if (to) carried = carry(frameOf(to)) || (!!from && carry(screen()));
      else if (from) carried = carry(screen());
    }
    cut = { from, to, toPath, carried };
  });

  // Once the cut is over, the frame that carried over is an ordinary frame again.
  document.addEventListener('astro:before-swap', (e) => {
    const vt = (e as Event & { viewTransition?: ViewTransition }).viewTransition;
    void vt?.finished.finally(() => {
      document.querySelectorAll('[data-vt]').forEach((el) => el.removeAttribute('data-vt'));
    });
  });

  document.addEventListener('astro:after-swap', () => {
    if (!cut) return;
    const { from, to, toPath, carried } = cut;
    cut = null;
    syncNav(toPath);
    if (!carried) return;
    if (to) carry(screen());
    else if (from) carry(frameOf(from));
  });
}
