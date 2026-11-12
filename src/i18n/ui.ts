/** Interface strings (everything that is not site.json content). */
export interface UI {
  htmlLang: string;
  ogLocale: string;
  skip: string;
  mainNav: string;
  nav: { films: string; stills: string; about: string; contact: string };
  films: string;
  stills: string;
  allFilms: string;
  allStills: string;
  moreFilms: string;
  /** "Film 1 of 6" */
  filmOf: (n: number, total: number) => string;
  prev: string;
  next: string;
  watchOnYoutube: string;
  play: string;
  playTitle: (title: string) => string;
  watchTitle: (title: string) => string;
  close: string;
  stillsViewer: string;
  email: string;
  mobile: string;
  location: string;
  copyEmail: string;
  copied: string;
  notFound: string;
}

export const ui: Record<'en' | 'es' | 'cs', UI> = {
  en: {
    htmlLang: 'en',
    ogLocale: 'en_US',
    skip: 'Skip to content',
    mainNav: 'Main',
    nav: { films: 'Films', stills: 'Stills', about: 'About', contact: 'Contact' },
    films: 'Films',
    stills: 'Stills',
    allFilms: 'All films',
    allStills: 'All stills',
    moreFilms: 'More films',
    filmOf: (n, t) => `Film ${n} of ${t}`,
    prev: 'Previous',
    next: 'Next',
    watchOnYoutube: 'Watch on YouTube',
    play: 'Play',
    playTitle: (t) => `Play ${t}`,
    watchTitle: (t) => `Watch on YouTube: ${t}`,
    close: 'Close',
    stillsViewer: 'Stills viewer',
    email: 'Email',
    mobile: 'Mobile',
    location: 'Location',
    copyEmail: 'Copy email',
    copied: 'Copied',
    notFound: 'Page not found',
  },
  es: {
    htmlLang: 'es',
    ogLocale: 'es_MX',
    skip: 'Saltar al contenido',
    mainNav: 'Principal',
    nav: { films: 'Películas', stills: 'Fotografías', about: 'Acerca de', contact: 'Contacto' },
    films: 'Películas',
    stills: 'Fotografías',
    allFilms: 'Todas las películas',
    allStills: 'Todas las fotografías',
    moreFilms: 'Más películas',
    filmOf: (n, t) => `Película ${n} de ${t}`,
    prev: 'Anterior',
    next: 'Siguiente',
    watchOnYoutube: 'Ver en YouTube',
    play: 'Reproducir',
    playTitle: (t) => `Reproducir ${t}`,
    watchTitle: (t) => `Ver en YouTube: ${t}`,
    close: 'Cerrar',
    stillsViewer: 'Visor de fotografías',
    email: 'Correo',
    mobile: 'Celular',
    location: 'Ubicación',
    copyEmail: 'Copiar correo',
    copied: 'Copiado',
    notFound: 'Página no encontrada',
  },
  cs: {
    htmlLang: 'cs',
    ogLocale: 'cs_CZ',
    skip: 'Přeskočit na obsah',
    mainNav: 'Hlavní',
    nav: { films: 'Filmy', stills: 'Fotografie', about: 'O Marcovi', contact: 'Kontakt' },
    films: 'Filmy',
    stills: 'Fotografie',
    allFilms: 'Všechny filmy',
    allStills: 'Všechny fotografie',
    moreFilms: 'Další filmy',
    filmOf: (n, t) => `Film ${n} z ${t}`,
    prev: 'Předchozí',
    next: 'Další',
    watchOnYoutube: 'Sledovat na YouTube',
    play: 'Přehrát',
    playTitle: (t) => `Přehrát ${t}`,
    watchTitle: (t) => `Sledovat na YouTube: ${t}`,
    close: 'Zavřít',
    stillsViewer: 'Prohlížeč fotografií',
    email: 'E-mail',
    mobile: 'Mobil',
    location: 'Místo',
    copyEmail: 'Zkopírovat e-mail',
    copied: 'Zkopírováno',
    notFound: 'Stránka nenalezena',
  },
};
