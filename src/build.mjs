// Builds one daily edition: fetch every wire, file the stories under a desk,
// archive the edition as JSON, then regenerate the newspaper.
import { mkdir, readdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { FEEDS } from './feeds.mjs';
import { parseFeed, classify, titleKey, urlKey } from './core.mjs';
import { renderEdition } from './render.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDITIONS = join(ROOT, 'data', 'editions');
const PUBLIC = join(ROOT, 'public');

const SECTION_ORDER = ['Development', 'Testing', 'DevOps', 'DevSecOps', 'Etc'];
const PER_SECTION = 12;       // stories shown per desk
const PER_SOURCE_CAP = 4;     // stops any one wire owning an edition
const WINDOW_HOURS = 168;     // a week of wire copy; newest still leads
const MIN_STORIES = 40;       // below this the window is widened to "everything"
const CONCURRENCY = 8;

// Wires whose desks usually carry the day's real news. Used only to pick the lead.
const TIER1 = new Set([
  'Ars Technica', 'The Register', 'The Verge', 'BBC Technology', 'TechCrunch', 'InfoQ', 'Dark Reading',
  'MIT Technology Review', 'ZDNET', 'SecurityWeek', 'The New Stack', 'SD Times', 'GitHub Blog',
  'Hacker News', 'Tech.eu', 'The Register Security',
]);

// Tutorials and listicles make poor front pages.
const TUTORIAL = /^(how to|how i|why (i|we)|a guide|guide to|tutorial|getting started|intro(duction)? to|what is|top \d+|\d+ (best|ways|tips|things)|build(ing)? a|let'?s build|my (journey|experience)|week in|weekly (roundup|digest)|newsletter)/i;

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

/** Front-page worthiness: a big wire, a real desk, real news, and fresh. */
function leadScore(story) {
  let score = TIER1.has(story.source) ? 10 : 0;
  if (story.desk !== 'Etc') score += 4;
  if (TUTORIAL.test(story.title)) score -= 25;
  if (story.title.length > 110) score -= 3;
  const age = story.publishedAt ? (Date.now() - Date.parse(story.publishedAt)) / 36e5 : 200;
  return score - Math.min(14, age / 8);
}

export function select(stories) {
  const seen = new Set();
  const candidates = [];
  for (const story of stories.slice().sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))) {
    // Same headline or same URL path means the same story, whichever wire carried it.
    const keys = [titleKey(story.title), urlKey(story.url)];
    if (keys.some((key) => seen.has(key))) continue;
    for (const key of keys) seen.add(key);
    candidates.push(story);
  }

  const cutoff = Date.now() - WINDOW_HOURS * 3600_000;
  const recent = candidates.filter((s) => !s.publishedAt || Date.parse(s.publishedAt) >= cutoff);
  const pool = recent.length >= MIN_STORIES ? recent : candidates;

  const sections = new Map(SECTION_ORDER.map((name) => [name, []]));
  const perSource = new Map();
  for (const story of pool) {
    const list = sections.get(story.desk) ?? sections.get('Etc');
    if (list.length >= PER_SECTION) continue;
    // The catch-all desk is mostly link-dump posts; only keep the ones that say something.
    if (list === sections.get('Etc') && story.summary.length < 40) continue;
    const used = perSource.get(story.source) ?? 0;
    if (used >= PER_SOURCE_CAP) continue;
    perSource.set(story.source, used + 1);
    list.push(story);
  }

  // The lead goes to the story that reads most like front-page news, not simply the newest.
  const lead = pool
    .filter((story) => [...sections.values()].some((list) => list.includes(story)))
    .sort((a, b) => leadScore(b) - leadScore(a) || (b.publishedAt || '').localeCompare(a.publishedAt || ''))[0];
  if (lead) for (const list of sections.values()) {
    const at = list.indexOf(lead);
    if (at !== -1) list.splice(at, 1);
  }

  return {
    lead: lead ?? null,
    sections: SECTION_ORDER.map((name) => ({ name, slug: name.toLowerCase(), stories: sections.get(name) })),
    total: [...sections.values()].reduce((n, list) => n + list.length, 0) + (lead ? 1 : 0),
  };
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

  for (const edition of editions) {
    const number = dates.length - dates.indexOf(edition.date);
    await writeFile(join(PUBLIC, 'editions', `${edition.date}.html`), renderEdition(edition, { base: '../', dates, number }));
  }
  const latest = editions.at(-1);
  await writeFile(join(PUBLIC, 'index.html'), renderEdition(latest, { base: '', dates, number: dates.length }));
  await writeFile(join(PUBLIC, '.nojekyll'), '');
  console.log(`Rendered ${editions.length} edition(s) to public/`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
