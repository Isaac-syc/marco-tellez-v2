/**
 * Film list preview: the row you hover or focus decides which frame the sticky
 * preview column shows. (In narrow / touch layouts the column is hidden by CSS.)
 */
const ready = new WeakSet<Element>();

/** Marks `slug` as the active film of a list (row + preview frame). */
export function activateFilm(list: ParentNode, slug: string): void {
  list.querySelectorAll<HTMLElement>('[data-slug]').forEach((el) => {
    if (el.dataset.slug === slug) el.setAttribute('data-active', '');
    else el.removeAttribute('data-active');
  });
}

export function initFilmLists(): void {
  document.querySelectorAll<HTMLElement>('[data-film-list]').forEach((list) => {
    if (ready.has(list)) return;
    ready.add(list);
    const activate = (e: Event) => {
      const row = (e.target as Element).closest<HTMLElement>('.fl-row');
      if (row?.dataset.slug) activateFilm(list, row.dataset.slug);
    };
    list.addEventListener('pointerover', activate);
    list.addEventListener('focusin', activate);
    // Touch: activate on press so a shared-element transition starts from the right frame.
    list.addEventListener('pointerdown', activate);
  });
}
