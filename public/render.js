// Renders an edition as a broadsheet page. Pure template — no I/O, no DOM.
// Shared by the daily build and by the reader's own edition in the browser.

const esc = (value = '') =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Feed URLs are untrusted; only real links become anchors.
const href = (url) => (/^https?:\/\//i.test(String(url ?? '')) ? esc(url) : '#');

const longDate = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const clock = (iso) => (iso ? `${new Date(iso).toISOString().slice(11, 16)} UTC` : '');

const stamp = (iso, editionDate) => {
  if (!iso) return '';
  const day = new Date(iso).toISOString().slice(0, 10);
  const date = new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return day === editionDate ? clock(iso) : `${date} · ${clock(iso)}`;
};

function byline(story, editionDate, className = 'story-meta') {
  return `<p class="${className}"><span class="wire">${esc(story.source)}</span><span class="sep">·</span><span class="region">${esc(story.region)}</span>${story.publishedAt ? `<span class="sep">·</span><time datetime="${esc(story.publishedAt)}">${esc(stamp(story.publishedAt, editionDate))}</time>` : ''}</p>`;
}

// Each headline says where it will open: a frame for the reader panel, an arrow for a new tab.
const ICON = {
  reader: '<svg class="link-icon is-reader" viewBox="0 0 12 12" aria-hidden="true"><rect x="1.9" y="1.9" width="8.2" height="8.2" rx="0.6"/></svg>',
  external: '<svg class="link-icon is-external" viewBox="0 0 12 12" aria-hidden="true"><path d="M3.1 8.9 8.9 3.1"/><path d="M4.6 3.1h4.3v4.3"/></svg>',
};

/** Icon plus a screen-reader note, so the destination is never colour-only. */
function linkMark(story) {
  return story.embeddable
    ? `${ICON.reader}<span class="sr-only"> (opens in the reader panel)</span>`
    : `${ICON.external}<span class="sr-only"> (opens in a new tab)</span>`;
}

const embedAttrs = (story) =>
  story.embeddable ? ` data-embed data-title="${esc(story.title)}" data-source="${esc(story.source)}"` : '';

function storyItem(story, editionDate) {
  const dek = story.summary && story.summary !== story.title ? `<p class="story-dek">${esc(story.summary)}</p>` : '';
  return `<li class="story">
        <h3 class="story-title"><a href="${href(story.url)}" rel="noopener noreferrer"${embedAttrs(story)}>${esc(story.title)}${linkMark(story)}</a></h3>
        ${dek}
        ${byline(story, editionDate)}
      </li>`;
}

function deskBlock(section, editionDate) {
  const stories = section.stories.map((story) => storyItem(story, editionDate)).join('\n      ');
  return `<section class="desk" id="${esc(section.slug)}">
      <h2 class="desk-title"><span>${esc(section.name)}</span><span class="count">${section.stories.length}</span></h2>
      <ol class="stories">
      ${stories}
      </ol>
    </section>`;
}

/**
 * The part of the page that is *the edition*: front page plus desks.
 * Swapped in place when a reader prints the paper from their own sources.
 */
export function renderContent(edition) {
  const { lead, sections, stats, date } = edition;
  const filled = sections.filter((s) => s.stories.length > 0);
  const printed = stats.published ?? filled.reduce((n, s) => n + s.stories.length, 0) + (lead ? 1 : 0);
  const desksList = filled
    .map((s) => `<li><a href="#${esc(s.slug)}"><span>${esc(s.name)}</span><span class="n">${s.stories.length}</span></a></li>`)
    .join('\n          ');

  const leadHtml = lead
    ? `<article class="lead">
        <p class="kicker">${esc(lead.desk)} desk</p>
        <h2 class="lead-title"><a href="${href(lead.url)}" rel="noopener noreferrer"${embedAttrs(lead)}>${esc(lead.title)}${linkMark(lead)}</a></h2>
        ${lead.summary && lead.summary !== lead.title ? `<p class="standfirst">${esc(lead.summary)}</p>` : ''}
        ${byline(lead, date, 'byline')}
      </article>`
    : `<article class="lead"><p class="kicker">Wire silence</p><h2 class="lead-title">No dispatches reached the desk today.</h2><p class="standfirst">These feeds failed or came back empty. Try refreshing, or add another source.</p></article>`;

  return `<div class="front">
    ${leadHtml}
    <aside class="ledger" aria-label="In this edition">
      <h2 class="ledger-title">Inside</h2>
      <ul class="ledger-list">
          ${desksList}
      </ul>
      <dl class="ledger-stats">
        <div><dt>Stories</dt><dd>${printed}</dd></div>
        <div><dt>Wires</dt><dd>${stats.sources}</dd></div>
        <div><dt>Regions</dt><dd>${stats.regions.length}</dd></div>
      </dl>
      <p class="ledger-note">${esc(stats.regions.slice(0, 8).join(' · '))}</p>
    </aside>
  </div>

  <div class="desks">
    ${filled.map((s) => deskBlock(s, date)).join('\n    ')}
  </div>`;
}

const SUGGESTIONS = [
  ['The Register', 'https://www.theregister.com/headlines.atom'],
  ['GitHub Blog', 'https://github.blog/feed/'],
  ['dev.to', 'https://dev.to/feed'],
  ['Hacker News', 'https://hnrss.org/frontpage'],
];

const PERSONAL = `<section class="my-edition" id="my-edition" aria-labelledby="my-edition-title">
  <div class="my-head">
    <h2 class="desk-title" id="my-edition-title"><span>Your Sources</span><span class="count" id="my-count">0</span></h2>
    <p class="my-note">Read from sources of your own, or print a paper from them. Everything here stays on this device.</p>
  </div>

  <form class="feed-form" id="feed-form" novalidate>
    <label class="feed-label" for="feed-url">Feed URL</label>
    <input id="feed-url" name="url" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://example.com/feed.xml">
    <button type="submit" id="feed-add">Add source</button>
  </form>

  <div class="feed-suggest" id="feed-suggest">
    <span>Try one:</span>
    ${SUGGESTIONS.map(([name, url]) => `<button type="button" class="suggest" data-feed="${esc(url)}">${esc(name)}</button>`).join('\n    ')}
  </div>

  <div class="feed-bar">
    <p class="feed-status" id="feed-status" role="status" aria-live="polite">No sources yet.</p>
    <button type="button" class="feed-refresh" id="feed-refresh">Refresh all</button>
  </div>

  <ul class="feed-rows" id="feed-rows"></ul>

  <label class="paper-switch" id="paper-switch">
    <input type="checkbox" id="own-paper">
    <span>Print the whole paper from these sources</span>
  </label>
  <p class="my-hint" id="my-hint">Replaces the edition's 40 wires with yours until you switch it off.</p>

  <ol class="my-stories" id="my-stories"></ol>
</section>

`;

export function renderEdition(edition, { base = '', dates = [], number = 1, personal = false } = {}) {
  const { stats, date, generatedAt, sections } = edition;
  const filled = sections.filter((s) => s.stories.length > 0);
  const printed = stats.published;
  const editionPage = (d) => (base === '' ? `editions/${d}.html` : `${d}.html`);

  const backIssues = dates
    .slice(0, 30)
    .map((d) => `<li${d === date ? ' class="current"' : ''}><a href="${esc(editionPage(d))}">${esc(longDate(d).replace(/^\w+, /, ''))}</a></li>`)
    .join('\n            ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Tech Express — ${esc(longDate(date))}</title>
<meta name="description" content="The Tech Express, ${esc(longDate(date))}: ${printed} stories from ${stats.sources} technology wires, filed under Development, Testing, DevOps and DevSecOps.">
<meta name="color-scheme" content="light">
<link rel="stylesheet" href="${esc(base)}styles.css">
</head>
<body>
<a class="skip" href="#main">Skip to the stories</a>

<header class="masthead">
  <div class="ear">
    <span>Vol. I · No. ${number}</span>
    <span class="ear-date">${esc(longDate(date))}</span>
    <span>Final edition · ${esc(clock(generatedAt))}</span>
  </div>
  <h1 class="wordmark">The Tech Express</h1>
  <p class="tagline">All the code that&rsquo;s fit to ship</p>
  <nav class="rail" aria-label="Desks" id="rail">
    ${filled.map((s) => `<a href="#${esc(s.slug)}">${esc(s.name)}</a>`).join('\n    ')}
    ${personal ? '<a class="rail-more" href="#my-edition">Your sources</a>' : ''}
  </nav>
</header>

${personal ? `<p class="invite" id="invite" hidden>Read the paper from sources of your own. <a href="#my-edition">Add a feed &rarr;</a></p>` : ''}
<main id="main">
  ${renderContent(edition)}
</main>

${personal ? PERSONAL : ''}<footer class="colophon">
  <section class="back-issues">
    <h2>Back Issues</h2>
    <ul>
            ${backIssues}
    </ul>
  </section>
  <div class="imprint">
    <p class="imprint-mark">The Tech Express</p>
    <p>Compiled automatically from ${stats.wires} public RSS wires on ${esc(longDate(date))}. Headlines and excerpts belong to their publishers and link back to the original reporting.</p>
    <p class="small">${stats.wiresOk}/${stats.wires} wires answered the phone. ${stats.fetched} items received, ${printed} went to press.</p>
  </div>
</footer>
${personal ? `<script type="module" src="${esc(base)}app.js"></script>\n` : ''}</body>
</html>
`;
}
