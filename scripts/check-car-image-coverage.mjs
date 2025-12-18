import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const CARS_DIR = path.join(ROOT, 'src', 'assets', 'cars');
const CAR_DB_PATH = path.join(ROOT, 'src', 'data', 'car-database.ts');

const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

async function main() {
  const dbText = await fs.readFile(CAR_DB_PATH, 'utf8');
  const ids = [...dbText.matchAll(/\bid:\s*'([^']+)'/g)].map((m) => m[1]);
  const uniqueIds = [...new Set(ids)].sort();

  const entries = await fs.readdir(CARS_DIR, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => ALLOWED_EXTS.has(path.extname(name).toLowerCase()))
    .map((name) => path.basename(name, path.extname(name)))
    .sort();

  const fileSet = new Set(files);
  const idSet = new Set(uniqueIds);

  const missing = uniqueIds.filter((id) => !fileSet.has(id));
  const extra = files.filter((id) => !idSet.has(id));

  console.log(`DB ids: ${uniqueIds.length}`);
  console.log(`Images: ${files.length}`);
  console.log(`Missing: ${missing.length}`);
  if (missing.length) console.log(missing.join('\n'));
  console.log(`Extra: ${extra.length}`);
  if (extra.length) console.log(extra.join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
