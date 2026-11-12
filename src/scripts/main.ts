/**
 * Site-wide behaviour. Astro's <ClientRouter /> swaps pages without reloading,
 * and module scripts run only once, so every page-level initialiser is
 * idempotent and runs on first load AND on every `astro:page-load`.
 */
import { initFilmFrames } from './film-frame';
import { initFilmLists } from './film-list';
import { initCopyEmail } from './copy-email';
import { initTransitions, syncNav } from './transitions';

function initPage(): void {
  syncNav(location.pathname);
  initFilmFrames();
  initFilmLists();
  initCopyEmail();
  // Lightbox code is only downloaded on pages that have a gallery.
  if (document.querySelector('[data-gallery]')) {
    void import('../lib/lightbox').then((m) => m.initLightbox());
  }
}

initTransitions();
initPage();
document.addEventListener('astro:page-load', initPage);

// The home intro is a one-off: make sure it can never replay on later visits.
window.setTimeout(() => document.documentElement.removeAttribute('data-intro'), 2000);
