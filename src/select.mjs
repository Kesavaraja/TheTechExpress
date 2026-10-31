// Picks an edition out of a pile of stories: de-duplicate, window in time, cap per
// desk and per source, then choose the lead. Shared by the daily build and the
// reader's own edition, so a personal paper ranks exactly like the printed one.
import { titleKey, urlKey } from './core.mjs';

export const SECTION_ORDER = ['Development', 'Testing', 'DevOps', 'DevSecOps', 'Etc'];

const PER_SECTION = 12; // stories shown per desk
const PER_SOURCE_CAP = 4; // stops any one wire owning an edition
const WINDOW_HOURS = 168; // a week of wire copy; newest still leads
const MIN_STORIES = 40; // below this the window is widened to "everything"

// Wires whose desks usually carry the day's real news. Used only to pick the lead.
const TIER1 = new Set([
  'Ars Technica', 'The Register', 'The Verge', 'BBC Technology', 'TechCrunch', 'InfoQ', 'Dark Reading',
  'MIT Technology Review', 'ZDNET', 'SecurityWeek', 'The New Stack', 'SD Times', 'GitHub Blog',
  'Hacker News', 'Tech.eu', 'The Register Security',
]);

// Tutorials and listicles make poor front pages.
const TUTORIAL =
  /^(how to|how i|why (i|we)|a guide|guide to|tutorial|getting started|intro(duction)? to|what is|top \d+|\d+ (best|ways|tips|things)|build(ing)? a|let'?s build|my (journey|experience)|week in|weekly (roundup|digest)|newsletter)/i;

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
  if (lead) {
    for (const list of sections.values()) {
      const at = list.indexOf(lead);
      if (at !== -1) list.splice(at, 1);
    }
  }

  return {
    lead: lead ?? null,
    sections: SECTION_ORDER.map((name) => ({ name, slug: name.toLowerCase(), stories: sections.get(name) })),
    total: [...sections.values()].reduce((n, list) => n + list.length, 0) + (lead ? 1 : 0),
  };
}
