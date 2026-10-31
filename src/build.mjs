// Builds one daily edition: fetch every wire, file the stories under a desk,
// archive the edition as JSON, then regenerate the newspaper.
import { mkdir, readdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { FEEDS } from './feeds.mjs';
import { parseFeed, classify } from './core.mjs';
import { select } from './select.mjs';
import { renderEdition } from './render.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDITIONS = join(ROOT, 'data', 'editions');
const PUBLIC = join(ROOT, 'public');

const CONCURRENCY = 8;
const UA = 'TechExpressBot/1.0 (+https://github.com/Kesavaraja/TheTechExpress)';

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await fn(items[index]);
      }
    }),
  );
  return out;
}

async function grab(feed) {
  try {
    const res = await fetch(feed.url, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const stories = parseFeed(await res.text());
    return { feed, stories: stories.map((s) => ({ ...s, source: feed.name, region: feed.region, desk: classify(s.title, s.summary) })) };
  } catch (error) {
    return { feed, stories: [], error: `${feed.name}: ${error.message}` };
  }
}

async function main() {
  const started = new Date();
  const date = started.toISOString().slice(0, 10);

  const results = await mapLimit(FEEDS, CONCURRENCY, grab);
  const failures = results.filter((r) => r.error).map((r) => r.error);
  const stories = results.flatMap((r) => r.stories);
  const { lead, sections, total } = select(stories);

  const edition = {
    date,
    generatedAt: started.toISOString(),
    stats: {
      wires: FEEDS.length,
      wiresOk: results.filter((r) => !r.error).length,
      fetched: stories.length,
      published: total,
      sources: new Set([lead, ...sections.flatMap((s) => s.stories)].filter(Boolean).map((s) => s.source)).size,
      regions: [...new Set([lead, ...sections.flatMap((s) => s.stories)].filter(Boolean).map((s) => s.region))].sort(),
      failures,
    },
    lead,
    sections,
  };

  await mkdir(EDITIONS, { recursive: true });
  await writeFile(join(EDITIONS, `${date}.json`), `${JSON.stringify(edition, null, 2)}\n`);

  await renderAll();
  console.log(`The Tech Express — ${date}: ${total} stories from ${edition.stats.sources} wires (${edition.stats.wiresOk}/${FEEDS.length} feeds ok, ${failures.length} failed)`);
  for (const failure of failures) console.log(`  ! ${failure}`);
}

async function renderAll() {
  const files = (await readdir(EDITIONS)).filter((f) => f.endsWith('.json')).sort();
  const editions = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(EDITIONS, f), 'utf8'))));
  const dates = editions.map((e) => e.date).reverse(); // newest first

  await mkdir(join(PUBLIC, 'editions'), { recursive: true });
  await copyFile(join(ROOT, 'assets', 'styles.css'), join(PUBLIC, 'styles.css'));
  // The reader's own sources run the same parser, ranking and layout in the browser.
  // Extension is rewritten because browsers resolve './core.js', not './core.mjs'.
  for (const name of ['core.mjs', 'select.mjs', 'render.mjs']) {
    const code = (await readFile(join(ROOT, 'src', name), 'utf8')).replace(/(['"])(\.\/[\w-]+)\.mjs\1/g, '$1$2.js$1');
    if (/\.mjs['"]/.test(code)) throw new Error(`${name} still imports an .mjs module`);
    await writeFile(join(PUBLIC, name.replace(/\.mjs$/, '.js')), code);
  }
  await copyFile(join(ROOT, 'assets', 'app.js'), join(PUBLIC, 'app.js'));

  for (const edition of editions) {
    const number = dates.length - dates.indexOf(edition.date);
    await writeFile(join(PUBLIC, 'editions', `${edition.date}.html`), renderEdition(edition, { base: '../', dates, number }));
  }
  const latest = editions.at(-1);
  await writeFile(join(PUBLIC, 'index.html'), renderEdition(latest, { base: '', dates, number: dates.length, personal: true }));
  await writeFile(join(PUBLIC, '.nojekyll'), '');
  console.log(`Rendered ${editions.length} edition(s) to public/`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
