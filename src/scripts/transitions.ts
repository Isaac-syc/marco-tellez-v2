/**
 * Page transitions glue for Astro's <ClientRouter />.
 *
 * The film frame is a shared element: it should travel from the list / home hero
 * to the film page (and back). View-transition names must be unique per page, so
 * rather than naming every row, the frame of the film being navigated to/from is
 * named just in time:
 *   - `astro:before-preparation`: tag the matching frame on the OLD page.
 *   - `astro:after-swap`:         tag the matching frame on the NEW page.
 * The film page names its own frame statically (see FilmFrame `vt`).
 * With prefers-reduced-motion no names are applied (CSS also guards this).
 */
import { activateFilm } from './film-list';

const FILM_PATH = /^\/films\/([^/]+)\/?$/;
const slugOf = (path: string): string | null => FILM_PATH.exec(path)?.[1] ?? null;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let leaving: { from: string | null; toPath: string } | null = null;

/** Names the first visible frame of `slug` in `doc`, activating its list entry first. */
function tag(doc: Document, slug: string): void {
  doc.querySelectorAll('[data-film-list]').forEach((l) => activateFilm(l, slug));
  const frames = doc.querySelectorAll<HTMLElement>(`[data-film-frame="${CSS.escape(slug)}"]`);
  for (const f of frames) {
    // `getClientRects` is empty for display:none (e.g. the preview column on touch).
    if (f.getClientRects().length === 0) continue;
    f.setAttribute('data-vt', '');
    f.style.setProperty('--vt', `film-${slug}`);
    return;
  }
}

/** Reflects the current location in the persisted nav (aria-current). */
export function syncNav(path: string): void {
  const section = path.split('/')[1] ?? '';
  document.querySelectorAll<HTMLAnchorElement>('.site-nav [data-nav]').forEach((a) => {
    if (a.dataset.nav === section) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

export function initTransitions(): void {
  document.addEventListener('astro:before-preparation', (e) => {
    const toPath = (e as Event & { to: URL }).to.pathname;
    leaving = { from: slugOf(location.pathname), toPath };
    document.documentElement.removeAttribute('data-intro');
    if (reduced()) return;
    const to = slugOf(toPath);
    if (to) tag(document, to);
  });

  document.addEventListener('astro:after-swap', () => {
    if (!leaving) return;
    const { from, toPath } = leaving;
    syncNav(toPath);
    // Coming back from a film page to a list / home: land on that film's frame.
    if (!reduced() && from && !slugOf(toPath)) tag(document, from);
    leaving = null;
  });
}
