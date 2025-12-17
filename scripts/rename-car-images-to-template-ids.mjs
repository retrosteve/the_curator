import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const CARS_DIR = path.join(ROOT, 'src', 'assets', 'cars');
const CAR_DB_PATH = path.join(ROOT, 'src', 'data', 'car-database.ts');

const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

function normalizeForMatch(value) {
  let s = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  s = s.replace(/[\s_]+/g, '-');
  s = s.replace(/[^a-z0-9.-]+/g, '-');
  s = s.replace(/-+/g, '-');
  s = s.replace(/^[.-]+/, '').replace(/[.-]+$/, '');

  return s;
}

function stripTrailingCounter(base) {
  // If prior sanitization created "...-2", "...-3", drop it for matching.
  // This intentionally only removes a final dash + digits.
  return base.replace(/-\d+$/, '');
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function loadTemplateCars() {
  const text = await fs.readFile(CAR_DB_PATH, 'utf8');

  // Heuristic: match object literals containing both id and name fields.
  // This intentionally avoids a full TS parse.
  const regex = /\{\s*[^}]*?\bid:\s*'([^']+)'\s*,[^}]*?\bname:\s*'([^']+)'\s*,/gms;

  const cars = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    const id = m[1];
    const name = m[2];
    if (!id || !name) continue;
    cars.push({ id, name });
  }

  return cars;
}

function inferIdFromFilenameBase(base) {
  const b = base.toLowerCase();

  // Already in desired format.
  if (/^car_(tutorial|daily|cult|icon|unicorn)_\d{3}$/.test(b)) return b;
  if (/^car_tutorial_[a-z0-9_]+$/.test(b)) return b;

  // Legacy-ish patterns we’ve seen.
  let match = b.match(/^car-(\d{3})(?:-|$)/);
  if (match) return `car_cult_${match[1]}`;

  match = b.match(/^car-starter-(\d{3})(?:-|$)/);
  if (match) return `car_daily_${match[1]}`;

  match = b.match(/^car-daily-(\d{3})(?:-|$)/);
  if (match) return `car_daily_${match[1]}`;

  match = b.match(/^car-cult-(\d{3})(?:-|$)/);
  if (match) return `car_cult_${match[1]}`;

  match = b.match(/^car-icon-(\d{3})(?:-|$)/);
  if (match) return `car_icon_${match[1]}`;

  match = b.match(/^car-unicorn-(\d{3})(?:-|$)/);
  if (match) return `car_unicorn_${match[1]}`;

  return undefined;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');

  const dirStat = await fs.stat(CARS_DIR).catch(() => null);
  if (!dirStat || !dirStat.isDirectory()) {
    console.error(`Directory not found: ${CARS_DIR}`);
    process.exitCode = 1;
    return;
  }

  const cars = await loadTemplateCars();
  const ids = new Set(cars.map((c) => c.id));

  const nameKeyToIds = new Map();
  for (const car of cars) {
    const key = normalizeForMatch(car.name);
    const existing = nameKeyToIds.get(key) ?? [];
    existing.push(car.id);
    nameKeyToIds.set(key, existing);
  }

  const entries = await fs.readdir(CARS_DIR, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);

  const planned = [];
  const skipped = [];

  for (const filename of files) {
    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) continue;

    const oldAbs = path.join(CARS_DIR, filename);
    const base = path.basename(filename, path.extname(filename));
    const baseNoCounter = stripTrailingCounter(base);

    let targetId = inferIdFromFilenameBase(baseNoCounter);

    if (!targetId) {
      const key = normalizeForMatch(baseNoCounter);
      const candidates = nameKeyToIds.get(key) ?? [];
      if (candidates.length === 1) {
        targetId = candidates[0];
      } else if (candidates.length > 1) {
        skipped.push({ filename, reason: `Ambiguous name match: ${candidates.join(', ')}` });
        continue;
      }
    }

    if (!targetId) {
      skipped.push({ filename, reason: 'No matching template id found' });
      continue;
    }

    if (!ids.has(targetId)) {
      skipped.push({ filename, reason: `Inferred id not in CarDatabase: ${targetId}` });
      continue;
    }

    let candidate = `${targetId}${ext}`;
    let newAbs = path.join(CARS_DIR, candidate);

    if (path.resolve(oldAbs) === path.resolve(newAbs)) {
      continue;
    }

    let i = 2;
    while (await fileExists(newAbs)) {
      candidate = `${targetId}-${i}${ext}`;
      newAbs = path.join(CARS_DIR, candidate);
      i += 1;
    }

    planned.push({ from: filename, to: candidate, oldAbs, newAbs });
  }

  if (planned.length === 0) {
    console.log('No renames needed.');
    if (skipped.length > 0) {
      console.log('\nSkipped:');
      for (const s of skipped) console.log(`- ${s.filename}: ${s.reason}`);
    }
    return;
  }

  console.log('Planned renames:');
  for (const p of planned) console.log(`- ${p.from} -> ${p.to}`);

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to perform renames.');
    if (skipped.length > 0) {
      console.log('\nSkipped:');
      for (const s of skipped) console.log(`- ${s.filename}: ${s.reason}`);
    }
    return;
  }

  // Two-phase rename to avoid issues on Windows.
  const tempSuffix = `.__renametmp__${Date.now()}`;

  for (const item of planned) {
    const tmpAbs = `${item.oldAbs}${tempSuffix}`;
    await fs.rename(item.oldAbs, tmpAbs);
    item.tmpAbs = tmpAbs;
  }

  for (const item of planned) {
    await fs.rename(item.tmpAbs, item.newAbs);
  }

  console.log('\nRenamed files:');
  for (const p of planned) console.log(`- ${p.from} -> ${p.to}`);

  if (skipped.length > 0) {
    console.log('\nSkipped:');
    for (const s of skipped) console.log(`- ${s.filename}: ${s.reason}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
