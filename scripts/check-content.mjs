// Content gate for the final build. `node scripts/check-content.mjs [dir]` (default: content/)
// exits 1 with a readable list while any slide is not ready to present.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_HEADLINE_WORDS = 12;
const MAX_KEY_NUMBERS = 3;

// docs: [{ file, data }] → problems: [{ file, message }]. Pure, so Vitest can call it.
export function checkContent(docs) {
  const problems = [];
  for (const { file, data, error } of docs) {
    const add = (message) => problems.push({ file, message });
    if (error) {
      add(`not valid JSON: ${error}`);
      continue;
    }
    if (!data.owner) add('owner is missing');
    if (data.pending === true) add('pending is true (content not delivered yet)');
    const words = String(data.headline ?? '').trim().split(/\s+/).filter(Boolean).length;
    if (words === 0) add('headline is missing');
    if (words > MAX_HEADLINE_WORDS) add(`headline has ${words} words (max ${MAX_HEADLINE_WORDS})`);
    const numbers = data.keyNumbers ?? [];
    if (numbers.length > MAX_KEY_NUMBERS) add(`${numbers.length} keyNumbers (max ${MAX_KEY_NUMBERS})`);
    const items = numbers.map((n, i) => [`keyNumbers[${i}] "${n.label ?? n.value}"`, n]);
    if (data.chart) items.push([`chart "${data.chart.title ?? data.chart.type}"`, data.chart]);
    for (const [name, item] of items) {
      if (item.status !== 'verified') add(`${name} is ${item.status ?? 'missing a status'}, not verified`);
      else for (const field of ['source', 'url', 'date']) if (!String(item[field] ?? '').trim()) add(`${name} is verified but has no ${field}`);
    }
  }
  return problems;
}

export function readDocs(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => {
      try {
        return { file, data: JSON.parse(readFileSync(join(dir, file), 'utf8')) };
      } catch (err) {
        return { file, error: err.message };
      }
    });
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? 'content';
  const docs = readDocs(dir);
  const problems = checkContent(docs);
  if (problems.length === 0) {
    console.log(`check:content OK (${docs.length} files in ${dir}/)`);
  } else {
    console.error(`check:content FAILED: ${problems.length} problem(s) in ${dir}/\n`);
    for (const { file, message } of problems) console.error(`  ${file}: ${message}`);
    console.error('\nFix these before the final build (npm run build still works).');
    process.exit(1);
  }
}
