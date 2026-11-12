/**
 * Typed access to the synced content (src/data/*.json, generated from /shared)
 * and to the still photographs (src/assets/stills/**).
 * Nothing here invents copy: it only reshapes site.json / manifest.json.
 */
import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';
import site from '../data/site.json';
import manifest from '../data/stills.json';

export { site };

export type Film = (typeof site.films)[number];
export const films: Film[] = site.films;

export const filmBySlug = (slug: string): Film => {
  const f = films.find((x) => x.slug === slug);
  if (!f) throw new Error(`Unknown film ${slug}`);
  return f;
};

/** 16:9 YouTube poster. Hotlinked, never downloaded. */
export const posterUrl = (f: Film) => `https://i.ytimg.com/vi/${f.youtubeId}/maxresdefault.jpg`;
/** Small variant for row thumbnails (same 16:9 geometry, 320 px wide). */
export const posterSmallUrl = (f: Film) => `https://i.ytimg.com/vi/${f.youtubeId}/mqdefault.jpg`;
export const embedUrl = (f: Film) =>
  `https://www.youtube-nocookie.com/embed/${f.youtubeId}?autoplay=1&rel=0`;

/** Scale that removes the black bars of the 16:9 poster inside an `AR` box. */
export const barScale = (ar: number) => {
  const r = 16 / 9;
  return +(Math.max(ar / r, r / ar) + 0.01).toFixed(4);
};

/**
 * Widest a frame of ratio `ar` may be drawn (CSS px) without enlarging the
 * 1280×720 poster beyond 1.1×, once the bar-removal scale has cropped it.
 */
export const nativeWidth = (ar: number) => {
  const visible = ar >= 16 / 9 ? 1280 / barScale(ar) : (720 * ar) / barScale(ar);
  return Math.round(visible * 1.1);
};

export interface Still {
  slug: string;
  category: 'analogue' | 'digital';
  categoryLabel: string;
  title: string | null;
  alt: string;
  img: ImageMetadata;
  width: number;
  height: number;
  ar: number;
  /** Global position 1..26 across Analogue then Digital. */
  n: number;
}

const modules = import.meta.glob<{ default: ImageMetadata }>('/src/assets/stills/**/*.jpg', {
  eager: true,
});

const bySlug = new Map(manifest.map((m) => [m.slug, m]));
const labels = Object.fromEntries(site.stills.sections.map((s) => [s.key, s.label]));
const alts = site.stills.alt as Record<string, string>;

function buildStills(): Still[] {
  const out: Still[] = [];
  let n = 0;
  for (const section of site.stills.sections) {
    const order = (site.stills.order as Record<string, string[]>)[section.key];
    for (const slug of order) {
      const m = bySlug.get(slug);
      if (!m) throw new Error(`Still ${slug} not in manifest`);
      const mod = modules[`/src/assets/stills/${m.file}`];
      if (!mod) throw new Error(`Still image missing: ${m.file}`);
      const img = mod.default;
      out.push({
        slug,
        category: section.key as Still['category'],
        categoryLabel: labels[section.key],
        title: m.title,
        alt: alts[slug],
        img,
        width: img.width,
        height: img.height,
        ar: img.width / img.height,
        n: ++n,
      });
    }
  }
  return out;
}

export const stills: Still[] = buildStills();
export const stillBySlug = (slug: string) => stills.find((s) => s.slug === slug)!;
export const stillsOf = (cat: Still['category']) => stills.filter((s) => s.category === cat);

export interface LightboxSources {
  href: string;
  avif: string;
  webp: string;
}

/** Large-image sources (1600 / 2400 px, AVIF + WebP) for the lightbox. */
export async function lightboxSources(s: Still): Promise<LightboxSources> {
  const widths = [1600, 2400];
  const make = async (format: 'avif' | 'webp') => {
    const imgs = await Promise.all(
      widths.map((w) => getImage({ src: s.img, width: Math.min(w, s.width), format })),
    );
    // De-duplicate when a width collapses to the original size (portrait 1591 px).
    const seen = new Set<string>();
    return imgs
      .filter((i) => (seen.has(i.src) ? false : (seen.add(i.src), true)))
      .map((i) => `${i.src} ${i.attributes.width}w`)
      .join(', ');
  };
  const [avif, webp] = await Promise.all([make('avif'), make('webp')]);
  const big = await getImage({ src: s.img, width: Math.min(2400, s.width), format: 'webp' });
  return { href: big.src, avif, webp };
}

export const nav = [
  { href: '/films/', label: 'Films', key: 'films' },
  { href: '/stills/', label: 'Stills', key: 'stills' },
  { href: '/about/', label: 'About', key: 'about' },
  { href: '/contact/', label: 'Contact', key: 'contact' },
] as const;

export const telHref = `tel:${site.contact.mobile.tel}`;
export const mailHref = `mailto:${site.contact.email}`;

export const personJsonLd = (url?: string) => ({
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: site.person.name,
  jobTitle: site.person.role,
  ...(url ? { url } : {}),
  address: { '@type': 'PostalAddress', addressLocality: site.person.location },
  sameAs: [site.contact.instagram.url, site.contact.linkedin.url],
});
