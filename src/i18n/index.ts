/**
 * Locale helpers. English is the source (src/data/site.json, untouched);
 * es.json / cs.json override only translatable fields, keyed like site.json.
 * Components never branch on locale: they call `t(locale)` for interface strings
 * and `content(locale)` for site copy, and `href(locale, path)` for links.
 */
import site from '../data/site.json';
import es from './es.json';
import cs from './cs.json';
import { ui, type UI } from './ui';

export const locales = ['en', 'es', 'cs'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export const isLocale = (v: unknown): v is Locale => locales.includes(v as Locale);
/** `Astro.currentLocale` (or any value) → a supported locale. */
export const localeOf = (v: unknown): Locale => (isLocale(v) ? v : defaultLocale);

/** Internal link in a locale. `path` starts with "/" (e.g. "/films/"). */
export const href = (locale: Locale, path = '/'): string =>
  locale === defaultLocale ? path : `/${locale}${path === '/' ? '/' : path}`;

/** Removes the locale prefix of a pathname ("/es/films/" → "/films/"). */
export const stripLocale = (pathname: string): string => pathname.replace(/^\/(es|cs)(?=\/|$)/, '') || '/';

/** `getStaticPaths` for the optional `[...lang]` route segment. */
export const langPaths = () =>
  locales.map((l) => ({ params: { lang: l === defaultLocale ? undefined : l } }));

export const t = (locale: Locale): UI => ui[locale];

type Site = typeof site;
export type Film = Site['films'][number];

interface Overrides {
  person: Partial<Site['person']>;
  home: Partial<Site['home']>;
  filmWords: {
    type: Record<string, string>;
    language: Record<string, string>;
    format: Record<string, string>;
    color: Record<string, string>;
    credit: Record<string, string>;
  };
  synopsis: Record<string, string>;
  stills: { sections: Record<string, string>; alt: Record<string, string> };
  about: Site['about'];
  contact: { heading: string; locationLines: string[] };
}
const overrides: Partial<Record<Locale, Overrides>> = { es: es as Overrides, cs: cs as Overrides };

const cache = new Map<Locale, Site>();

/** Site copy in `locale` (English = site.json as is). */
export function content(locale: Locale): Site {
  const o = overrides[locale];
  if (!o) return site;
  const hit = cache.get(locale);
  if (hit) return hit;
  const w = o.filmWords;
  const films = site.films.map((f) => {
    const type = w.type[f.type] ?? f.type;
    const language = w.language[f.language] ?? f.language;
    const format = w.format[f.format] ?? f.format;
    const color = w.color[f.color] ?? f.color;
    return {
      ...f,
      type,
      language,
      format,
      color,
      listRole: `${type} | ${language}`,
      credit: w.credit[f.credit] ?? f.credit,
      synopsis: o.synopsis[f.slug] ?? f.synopsis,
      techLine: `${format} | ${f.aspectRatioLabel} | ${color} | ${language}`,
    };
  });
  const out: Site = {
    ...site,
    person: { ...site.person, ...o.person },
    home: { ...site.home, ...o.home },
    films,
    stills: {
      ...site.stills,
      sections: site.stills.sections.map((s) => ({ ...s, label: o.stills.sections[s.key] ?? s.label })),
      alt: { ...site.stills.alt, ...o.stills.alt },
    },
    about: o.about,
    contact: { ...site.contact, ...o.contact },
  };
  cache.set(locale, out);
  return out;
}
