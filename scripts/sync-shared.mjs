// Copies the single sources of truth from /shared into this project.
//   shared/content/site.json      -> src/data/site.json
//   shared/stills/manifest.json   -> src/data/stills.json
//   shared/stills/** (images)     -> src/assets/stills/**
// Runs on `predev` and `prebuild`. The copies are git-ignored; never edit them.
import { cpSync, mkdirSync, rmSync, existsSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shared = resolve(root, '..', 'shared');

// Standalone checkout (e.g. the deploy repo on Vercel): use the committed copies.
if (!existsSync(shared)) {
  if (existsSync(join(root, 'src/data/site.json')) && existsSync(join(root, 'src/assets/stills'))) {
    console.log('[sync-shared] ../shared not found, using committed src/data and src/assets/stills');
    process.exit(0);
  }
  console.error(`[sync-shared] ${shared} not found and no committed copies`);
  process.exit(1);
}

const need = (p) => {
  if (!existsSync(p)) {
    console.error(`[sync-shared] missing ${p}`);
    process.exit(1);
  }
  return p;
};

mkdirSync(join(root, 'src/data'), { recursive: true });
copyFileSync(need(join(shared, 'content/site.json')), join(root, 'src/data/site.json'));
copyFileSync(need(join(shared, 'stills/manifest.json')), join(root, 'src/data/stills.json'));

const out = join(root, 'src/assets/stills');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
let n = 0;
for (const dir of readdirSync(need(join(shared, 'stills')))) {
  const src = join(shared, 'stills', dir);
  if (!statSync(src).isDirectory()) continue; // skips manifest.json
  cpSync(src, join(out, dir), { recursive: true });
  n += readdirSync(src).length;
}
console.log(`[sync-shared] site.json, stills.json and ${n} stills synced`);
