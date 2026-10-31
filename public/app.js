// Your Edition — a reader's own wires, fetched in the browser.
// The printed paper stays static: this file only adds a panel on top of it.
import { parseFeed, classify, plain, cleanSummary } from './core.js';

const STORE = 'tech-express:feeds';
// rss2json is CORS-enabled, which most feeds themselves are not.
const RSS2JSON = (url) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
const MAX_STORIES = 60;

const $ = (id) => document.getElementById(id);
const form = $('feed-form');
const input = $('feed-url');
const chips = $('feed-chips');
const list = $('my-stories');
const status = $('feed-status');
const count = $('my-count');

let feeds = loadFeeds();

function loadFeeds() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? '[]');
    return Array.isArray(saved) ? saved.filter((f) => f && typeof f.url === 'string') : [];
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify(feeds));
  } catch {
    /* private mode: the list just won't persist */
  }
}

function normalize(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

// Two transports: the feed itself (only ~11 of 40 public wires allow cross-origin
// reads), then rss2json for the rest. ponytail: one fallback service, swap it out
// if readers start seeing its rate limit.
async function fetchFeed(url) {
  try {
    const direct = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (direct.ok) {
      const xml = await direct.text();
      const stories = parseFeed(xml);
      if (stories.length) return { stories, title: feedTitle(xml), via: 'direct' };
    }
  } catch {
    /* blocked by CORS or unreachable — fall through */
  }

  const res = await fetch(RSS2JSON(url), { signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`rss2json replied ${res.status}`);
  const payload = await res.json();
  if (payload.status !== 'ok') throw new Error(payload.message || 'that feed could not be read');

  const stories = (payload.items ?? [])
    .map((item) => {
      const time = Date.parse(item.pubDate ?? '');
      return {
        title: plain(item.title ?? ''),
        url: item.link ?? '',
        summary: cleanSummary(plain(item.description ?? item.content ?? '')).slice(0, 260),
        publishedAt: Number.isNaN(time) ? '' : new Date(time).toISOString(),
      };
    })
    .filter((story) => story.title && /^https?:\/\//i.test(story.url));

  if (!stories.length) throw new Error('no readable stories in that feed');
  return { stories, title: plain(payload.feed?.title ?? ''), via: 'rss2json' };
}

const feedTitle = (xml) => plain(String(xml).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').slice(0, 40);

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function storyNode(story) {
  const item = el('li', 'story');
  const heading = el('h3', 'story-title');
  const link = el('a', undefined, story.title);
  link.href = story.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  heading.append(link);
  item.append(heading);

  if (story.summary && story.summary !== story.title) item.append(el('p', 'story-dek', story.summary));

  const meta = el('p', 'story-meta');
  meta.append(el('span', 'wire', story.source ?? host(story.url)));
  meta.append(el('span', 'sep', '·'), el('span', 'region', story.desk));
  if (story.publishedAt) {
    const when = new Date(story.publishedAt);
    meta.append(el('span', 'sep', '·'), el('time', undefined, `${when.toISOString().slice(11, 16)} UTC`));
  }
  item.append(meta);
  return item;
}

function renderChips(state = new Map()) {
  chips.replaceChildren();
  for (const feed of feeds) {
    const chip = el('li');
    const label = el('span', undefined, feed.title ?? host(feed.url));
    label.title = feed.url;
    const remove = el('button', undefined, '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${feed.title ?? host(feed.url)}`);
    remove.addEventListener('click', () => {
      feeds = feeds.filter((f) => f.url !== feed.url);
      save();
      renderChips();
      refresh();
    });
    chip.append(label);
    const note = state.get(feed.url);
    if (note) chip.append(el('span', 'feed-via', note));
    chip.append(remove);
    chips.append(chip);
  }
}

let running = false;

async function refresh() {
  if (running) return;
  count.textContent = String(feeds.length);
  if (!feeds.length) {
    status.replaceChildren('No feeds yet — paste any RSS or Atom URL above. Everything stays in this browser.');
    list.replaceChildren();
    return;
  }

  running = true;
  status.replaceChildren('Collecting your wires…');
  const results = await Promise.all(
    feeds.map(async (feed) => {
      try {
        const { stories, title, via } = await fetchFeed(feed.url);
        feed.title = feed.title || title || host(feed.url);
        return { feed, via, stories: stories.map((s) => ({ ...s, source: feed.title, desk: classify(s.title, s.summary) })) };
      } catch (error) {
        return { feed, error: error.message };
      }
    }),
  );
  running = false;
  save();

  const notes = new Map();
  const messages = [];
  const stories = [];
  let proxied = 0;

  for (const result of results) {
    if (result.error) {
      notes.set(result.feed.url, 'error');
      messages.push(`${host(result.feed.url)}: ${result.error}`);
      continue;
    }
    if (result.via === 'rss2json') {
      proxied += 1;
      notes.set(result.feed.url, 'rss2json');
    }
    stories.push(...result.stories);
  }

  stories.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  const shown = stories.slice(0, MAX_STORIES);

  list.replaceChildren(...shown.map(storyNode));
  count.textContent = String(feeds.length);

  const summary = `${feeds.length} feed${feeds.length === 1 ? '' : 's'} · ${stories.length} stor${stories.length === 1 ? 'y' : 'ies'}${
    proxied ? ` · ${proxied} via rss2json` : ''
  }`;
  status.replaceChildren(el('span', undefined, summary));
  for (const message of messages) status.append(el('div', 'err', message));

  renderChips(notes);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const url = normalize(input.value);
  if (!url) {
    status.replaceChildren(el('span', 'err', 'That does not look like a feed URL.'));
    return;
  }
  if (feeds.some((f) => f.url === url)) {
    status.replaceChildren(el('span', 'err', 'That feed is already on your list.'));
    return;
  }
  feeds.push({ url });
  save();
  input.value = '';
  renderChips();
  refresh();
});

$('feed-refresh').addEventListener('click', () => {
  for (const feed of feeds) delete feed.title;
  refresh();
});

// ?feeds=https://a,https://b — a shareable personal edition, and how the tests drive this page.
const seeded = new URLSearchParams(location.search).get('feeds');
if (seeded) {
  for (const raw of seeded.split(',')) {
    const url = normalize(raw);
    if (url && !feeds.some((f) => f.url === url)) feeds.push({ url });
  }
  save();
}

count.textContent = String(feeds.length);
renderChips();
refresh();
