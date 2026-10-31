// Renders an edition as a broadsheet page. Pure template — no I/O here.

const esc = (value = '') =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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

function storyItem(story, editionDate) {
  const dek = story.summary && story.summary !== story.title ? `<p class="story-dek">${esc(story.summary)}</p>` : '';
  return `<li class="story">
        <h3 class="story-title"><a href="${esc(story.url)}" rel="noopener noreferrer">${esc(story.title)}</a></h3>
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

export function renderEdition(edition, { base = '', dates = [], number = 1 } = {}) {
  const { lead, sections, stats, date, generatedAt } = edition;
  const editionPage = (d) => (base === '' ? `editions/${d}.html` : `${d}.html`);
  const filled = sections.filter((s) => s.stories.length > 0);
  const printed = stats.published;
  const desksList = filled
    .map((s) => `<li><a href="#${esc(s.slug)}"><span>${esc(s.name)}</span><span class="n">${s.stories.length}</span></a></li>`)
    .join('\n          ');

  const leadHtml = lead
    ? `<article class="lead">
        <p class="kicker">${esc(lead.desk)} desk</p>
        <h2 class="lead-title"><a href="${esc(lead.url)}" rel="noopener noreferrer">${esc(lead.title)}</a></h2>
        ${lead.summary && lead.summary !== lead.title ? `<p class="standfirst">${esc(lead.summary)}</p>` : ''}
        ${byline(lead, date, 'byline')}
      </article>`
    : `<article class="lead"><p class="kicker">Wire silence</p><h2 class="lead-title">No dispatches reached the desk today.</h2><p class="standfirst">Every feed failed or came back empty. Tomorrow's edition will retry.</p></article>`;

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
  <nav class="rail" aria-label="Desks">
    ${filled.map((s) => `<a href="#${esc(s.slug)}">${esc(s.name)}</a>`).join('\n    ')}
  </nav>
</header>

<main id="main">
  <div class="front">
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
      <p class="ledger-note">${esc(stats.regions.join(' · '))}</p>
    </aside>
  </div>

  <div class="desks">
    ${filled.map((s) => deskBlock(s, date)).join('\n    ')}
  </div>
</main>

<footer class="colophon">
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
</body>
</html>
`;
}
