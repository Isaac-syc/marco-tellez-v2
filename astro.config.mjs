// @ts-check
import { defineConfig } from 'astro/config';

// `site` only when SITE_URL is provided (absolute canonical / OG URLs).
const site = process.env.SITE_URL || undefined;

export default defineConfig({
  site,
  // Fixed port for V2. `server` applies to both `astro dev` and `astro preview`.
  server: { port: 4322, host: false },
  devToolbar: { enabled: false },
  // Hover/tap prefetch so client-side navigations feel instant.
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  build: { format: 'directory' },
  trailingSlash: 'always',
});
