// Your Sources — the reader's own feeds: add, edit, rename, mute, remove.
// They can also become the whole paper, using the build's own ranking and layout.
import { parseFeed, classify, plain, cleanSummary } from './core.js';
import { select } from './select.js';
import { renderContent } from './render.js';

const STORE = 'tech-express:sources';
const LEGACY_STORE = 'tech-express:feeds';
const OWN_KEY = 'tech-express:own-paper';
const RSS2JSON = (url) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
const MAX_STORIES = 60;

const $ = (id) => document.getElementById(id);
const els = {
  form: $('feed-form'),
  input: $('feed-url'),
  rows: $('feed-rows'),
  status: $('feed-status'),
  count: $('my-count'),
  stories: $('my-stories'),
  own: $('own-paper'),
  hint: $('my-hint'),
  refresh: $('feed-refresh'),
  suggest: $('feed-suggest'),
  main: $('main'),
  rail: $('rail'),
  invite: $('invite'),
};

// The printed edition, captured before a reader paper can replace it.
const daily = { main: els.main.innerHTML, rail: els.rail.innerHTML };

let feeds = loadFeeds(); // [{ url, label?, title?, enabled: true }]
const loaded = new Map(); // url -> { state, stories?, via?, message? }
let editing = null;
let ownPaper = localStorage.getItem(OWN_KEY) === '1';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function loadFeeds() {
  const read = (key) => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  };
  const saved = read(STORE);
  const list = saved.length ? saved : read(LEGACY_STORE); // keep feeds added by the first version
  return list
    .map((item) => ({ url: item?.url, label: item?.label, title: item?.title, enabled: item?.enabled !== false }))
    .filter((feed) => typeof feed.url === 'string' && feed.url);
}

const saveFeeds = () => {
  try {
    localStorage.setItem(STORE, JSON.stringify(feeds));
  } catch {
    /* private mode: the list just won't persist */
  }
};

const normalize = (raw) => {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

const nameOf = (feed) => feed.label || feed.title || host(feed.url);
const today = () => new Date().toISOString().slice(0, 10);

// Two transports: the feed itself (~11 of 40 public wires allow cross-origin reads),
// then rss2json for the rest. ponytail: one fallback service, swap it if it rate-limits.
async function fetchFeed(url) {
  try {
    const direct = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (direct.ok) {
      const xml = await direct.text();
      const stories = parseFeed(xml);
      if (stories.length) {
        return { stories, title: plain(String(xml).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').slice(0, 40), via: 'direct' };
      }
    }
  } catch {
    /* CORS or offline — fall through */
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

async function loadFeed(feed) {
  loaded.set(feed.url, { state: 'loading' });
  renderRows();
  try {
    const { stories, title, via } = await fetchFeed(feed.url);
    if (!feed.title) feed.title = title || host(feed.url);
    loaded.set(feed.url, { state: 'ok', stories, via });
  } catch (error) {
    loaded.set(feed.url, { state: 'error', message: error.message });
  }
  renderRows();
  paint();
}

/** Every story from every enabled source, filed under a desk. */
function collect() {
  const stories = [];
  for (const feed of feeds) {
    if (!feed.enabled) continue;
    const result = loaded.get(feed.url);
    if (result?.state !== 'ok') continue;
    for (const story of result.stories) {
      stories.push({ ...story, source: nameOf(feed), region: 'Your feed', desk: classify(story.title, story.summary) });
    }
  }
  return stories.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
}

function counts() {
  const enabled = feeds.filter((f) => f.enabled);
  const ok = enabled.filter((f) => loaded.get(f.url)?.state === 'ok');
  const failed = enabled.filter((f) => loaded.get(f.url)?.state === 'error');
  const via = ok.filter((f) => loaded.get(f.url)?.via === 'rss2json').length;
  return { enabled, ok, failed, via };
}

function paint() {
  const stories = collect();
  const { enabled, ok, failed, via } = counts();
  const parts = [`${feeds.length} source${feeds.length === 1 ? '' : 's'}`];
  if (enabled.length) parts.push(`${stories.length} collected`);
  if (ok.length) parts.push(`${ok.length} ok`);
  if (failed.length) parts.push(`${failed.length} failed`);
  if (via) parts.push(`${via} via rss2json`);
  els.status.textContent = feeds.length ? parts.join(' · ') : 'No sources yet.';

  els.count.textContent = String(feeds.length);
  els.stories.replaceChildren(...stories.slice(0, MAX_STORIES).map(storyNode));

  if (ownPaper && enabled.length) printOwnEdition(stories);
  else restoreDaily();
}

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
  meta.append(el('span', 'wire', story.source), el('span', 'sep', '·'), el('span', 'region', story.desk));
  if (story.publishedAt) meta.append(el('span', 'sep', '·'), el('time', undefined, `${new Date(story.publishedAt).toISOString().slice(11, 16)} UTC`));
  item.append(meta);
  return item;
}

function printOwnEdition(stories) {
  const { lead, sections, total } = select(stories);
  const active = feeds.filter((f) => f.enabled).length;
  const edition = {
    date: today(),
    generatedAt: new Date().toISOString(),
    stats: { wires: active, wiresOk: active, fetched: stories.length, published: total, sources: active, regions: ['Your feed'] },
    lead,
    sections,
  };

  els.main.innerHTML = renderContent(edition);
  const banner = el('p', 'custom-banner');
  banner.append(el('span', undefined, `Your edition · ${active} source${active === 1 ? '' : 's'} · ${total} stories`));
  els.main.prepend(banner);
  els.rail.innerHTML = `${sections
    .filter((s) => s.stories.length)
    .map((s) => `<a href="#${s.slug}">${s.name}</a>`)
    .join('')}<a class="rail-more" href="#my-edition">Your sources</a>`;
  document.body.classList.add('own-paper');
}

function restoreDaily() {
  if (document.body.classList.contains('own-paper')) {
    els.main.innerHTML = daily.main;
    els.rail.innerHTML = daily.rail;
    document.body.classList.remove('own-paper');
  }
}

function describe(feed) {
  const base = host(feed.url);
  const prefix = nameOf(feed) === base ? '' : `${base} · `;
  const result = loaded.get(feed.url);
  if (result?.state === 'loading') return 'Reading…';
  if (result?.state === 'error') return `${prefix}${result.message}`;
  if (result?.state === 'ok') {
    const via = result.via === 'rss2json' ? ' · via rss2json' : '';
    return `${prefix}${result.stories.length} stories${via}`;
  }
  return base;
}

function action(label, act, feed) {
  const button = el('button', 'feed-action', label);
  button.type = 'button';
  button.addEventListener('click', () => {
    if (act === 'edit') startEdit(feed.url);
    else if (act === 'toggle') toggleFeed(feed);
    else if (act === 'retry') loadFeed(feed);
    else if (act === 'remove') removeFeed(feed);
  });
  return button;
}

function startEdit(url) {
  editing = url;
  renderRows();
}

function toggleFeed(feed) {
  feed.enabled = !feed.enabled;
  saveFeeds();
  renderRows();
  paint();
}

function removeFeed(feed) {
  feeds = feeds.filter((f) => f.url !== feed.url);
  loaded.delete(feed.url);
  if (editing === feed.url) editing = null;
  saveFeeds();
  renderRows();
  paint();
}

function feedRow(feed) {
  const row = el('li', 'feed-row');
  if (!feed.enabled) row.classList.add('is-muted');
  const result = loaded.get(feed.url);

  if (editing === feed.url) {
    const form = el('form', 'feed-edit');
    const urlInput = el('input');
    urlInput.type = 'url';
    urlInput.name = 'url';
    urlInput.value = feed.url;
    urlInput.required = true;
    urlInput.setAttribute('aria-label', 'Feed URL');

    const labelInput = el('input');
    labelInput.type = 'text';
    labelInput.name = 'label';
    labelInput.value = feed.label ?? '';
    labelInput.placeholder = feed.title || 'Name (optional)';
    labelInput.setAttribute('aria-label', 'Feed name');

    const save = el('button', undefined, 'Save');
    save.type = 'submit';
    const cancel = el('button', 'ghost', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => {
      editing = null;
      renderRows();
    });

    form.append(urlInput, labelInput, save, cancel);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const next = normalize(urlInput.value);
      if (!next) {
        urlInput.setCustomValidity('Enter a full http(s) feed URL.');
        urlInput.reportValidity();
        return;
      }
      const taken = feeds.some((f) => f.url === next && f.url !== feed.url);
      if (taken) {
        urlInput.setCustomValidity('That source is already on your list.');
        urlInput.reportValidity();
        return;
      }
      const changed = next !== feed.url;
      if (changed) loaded.delete(feed.url);
      feed.url = next;
      feed.label = labelInput.value.trim() || undefined;
      if (changed) feed.title = undefined;
      editing = null;
      saveFeeds();
      renderRows();
      loadFeed(feed);
    });

    row.append(form);
    return row;
  }

  const dot = el('span', 'feed-dot');
  dot.dataset.state = result?.state ?? 'idle';
  dot.setAttribute('aria-hidden', 'true');

  const name = el('span', 'feed-name', nameOf(feed));
  const meta = el('span', 'feed-meta', describe(feed));
  if (result?.state === 'error') meta.classList.add('is-error');
  if (!feed.enabled) meta.textContent = 'Muted · ' + meta.textContent;

  const actions = el('div', 'feed-actions');
  actions.append(
    action('Edit', 'edit', feed),
    action(feed.enabled ? 'Mute' : 'Unmute', 'toggle', feed),
    ...(result?.state === 'error' ? [action('Retry', 'retry', feed)] : []),
    action('Remove', 'remove', feed),
  );

  const identity = el('div', 'feed-id');
  identity.append(name, meta);
  row.append(dot, identity, actions);
  return row;
}

function renderRows() {
  els.rows.replaceChildren(...feeds.map(feedRow));
  els.suggest.hidden = feeds.length > 0;
  els.own.disabled = feeds.length === 0;
  els.refresh.disabled = feeds.length === 0;
  if (els.invite) els.invite.hidden = feeds.length > 0;
  els.hint.textContent = ownPaper
    ? 'Your paper is printed above. Switch this off to get the daily edition back.'
    : "Replaces the edition's daily wires with yours until you switch it off.";
}

function addSource(raw) {
  const url = normalize(raw);
  if (!url) {
    els.status.textContent = 'That does not look like a feed URL. Try https://example.com/feed.xml';
    els.input.focus();
    return;
  }
  const existing = feeds.find((f) => f.url === url);
  if (existing) {
    existing.enabled = true;
    saveFeeds();
    renderRows();
    paint();
    els.status.textContent = `${nameOf(existing)} is already on your list — unmuted it.`;
    return;
  }
  const feed = { url, enabled: true };
  feeds.push(feed);
  saveFeeds();
  renderRows();
  loadFeed(feed);
}

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  addSource(els.input.value);
  els.input.value = '';
  els.input.focus();
});

els.suggest.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-feed]');
  if (button) addSource(button.dataset.feed);
});

els.refresh.addEventListener('click', () => {
  for (const feed of feeds) if (feed.enabled) loaded.delete(feed.url);
  Promise.all(feeds.filter((f) => f.enabled).map(loadFeed)).then(paint);
});

els.own.addEventListener('change', () => {
  ownPaper = els.own.checked;
  try {
    localStorage.setItem(OWN_KEY, ownPaper ? '1' : '0');
  } catch {
    /* ignore */
  }
  renderRows();
  paint();
  if (ownPaper) window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ?feeds=https://a,https://b — a shareable personal edition, and how the tests drive this page.
const params = new URLSearchParams(location.search);
const seeded = params.get('feeds');
if (seeded) {
  for (const raw of seeded.split(',')) {
    const url = normalize(raw);
    if (url && !feeds.some((f) => f.url === url)) feeds.push({ url, enabled: true });
  }
  saveFeeds();
}
if (params.get('own') === '1') ownPaper = true;

els.own.checked = ownPaper;
renderRows();
paint();
for (const feed of feeds.filter((f) => f.enabled)) loadFeed(feed);
