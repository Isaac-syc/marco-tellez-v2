// @ts-check
import { defineConfig } from 'astro/config';

// Absolute canonical / OG / hreflang URLs. Override with SITE_URL (e.g. a custom domain).
const site = process.env.SITE_URL || 'https://marco-tellez-v2.vercel.app';

export default defineConfig({
  site,
  // Fixed port for V2. `server` applies to both `astro dev` and `astro preview`.
  server: { port: 4322, host: false },
  devToolbar: { enabled: false },
  // Hover/tap prefetch so client-side navigations feel instant.
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  build: { format: 'directory' },
  trailingSlash: 'always',
  // English at the root, /es/ and /cs/ prefixed. The pages live under an optional
  // [...lang] segment (src/pages/[...lang]/); language is picked on the client
  // from the device (src/i18n/detect.ts), with no visible switcher.
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'cs'],
    routing: { prefixDefaultLocale: false },
  },
});
