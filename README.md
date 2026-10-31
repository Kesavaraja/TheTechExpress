# The Tech Express

A daily technology newspaper, compiled by an agent from public wire services around the
world and typeset as a broadsheet. Every story is filed under **Development**, **Testing**,
**DevOps**, **DevSecOps**, or **Etc**.

Read the latest edition: open `public/index.html` (or the published GitHub Pages site).

## Read your own feeds

The **Your Sources** panel at the foot of the page (linked from the masthead as `Your sources`)
takes any RSS or Atom link. Nothing is uploaded and nothing is committed: the list lives in this
browser's `localStorage`, and only that reader sees it.

Each source is a row you can manage:

| Action | What it does |
| --- | --- |
| **Edit** | Change the URL or give the source a name of your own |
| **Mute** | Keep it on the list but leave it out of the paper for now |
| **Retry** | Fetch that one source again after a failure |
| **Remove** | Forget it |

Rows carry their own state — reading, ok with a story count, or the reason it failed — so a broken
URL never disappears quietly.

**Print the whole paper from these sources** turns the reader's list into the front page: the lead,
the desks and the "Inside" ledger are rebuilt by the same `select.mjs` ranking and `render.mjs`
template the daily build uses, then swapped into `<main>`. The masthead, back issues and colophon
stay. Switch it off and the daily edition comes back untouched.

- **Direct first** — the feed is fetched straight from the publisher. Only ~11 of 40 public
  wires send the CORS headers that allow this, so…
- **…then rss2json** — feeds that block browser reads go through the CORS-enabled
  [rss2json](https://rss2json.com) API. Its free tier returns the newest 10 items per feed, and
  chips marked `RSS2JSON` used that path.
- **Shareable** — `?feeds=https://a/feed.xml,https://b/feed` seeds a personal edition, so one
  reader can send another their exact mix.

The panel reuses `src/core.mjs` in the browser (`parseFeed`, `classify`, `plain`), so a personal
story is parsed and filed by exactly the same code as a printed one.

## How an edition is made

```
40 RSS/Atom wires  →  parse  →  de-duplicate  →  file by desk  →  rank  →  print
```

1. **Collect** — `src/build.mjs` fetches every feed in `src/feeds.mjs` (concurrency 8, 20s timeout). A wire that fails is recorded in the edition stats and skipped; the paper still prints.
2. **Parse** — `src/core.mjs` reads RSS 2.0 and Atom, unwraps CDATA, decodes entities, strips markup and aggregator boilerplate, and normalises dates.
3. **De-duplicate** — same normalised headline *or* same URL path is the same story, whatever wire carried it.
4. **File by desk** — weighted keyword matching: a keyword in the headline scores 3, in the summary 1. Ties go to the more specific desk (`sre` beats `infrastructure`). No match → **Etc**.
5. **Rank** — newest first within the last 7 days, max 12 stories per desk, max 4 per wire so one source cannot own the edition. The lead goes to the story that reads most like front-page news: a major wire, a real desk, actual news, and fresh — tutorials and listicles are pushed down.
6. **Print** — `src/render.mjs` writes `public/index.html`, one archive page per edition under `public/editions/`, and copies the stylesheet. No JavaScript is shipped to the reader.

Each edition is archived as JSON in `data/editions/YYYY-MM-DD.json`, then re-rendered, so
the back-issue list and older pages stay in sync.

Stories run across the page: one full-width band per desk, four headlines to a row on a wide
screen, three, two and one as it narrows.

## Run it

Requires Node 20+ (no dependencies, no API keys, no build step).

```bash
npm test          # parser, classifier, de-duplication and render self-checks
npm run build     # collect the wires and print today's edition
npm run preview   # serve public/ on http://127.0.0.1:4180
```

Then open `public/index.html` — or use `npm run preview`, which is required for the
"Your Edition" panel because browsers refuse to load ES modules from `file://`.

## Publish it daily

`.github/workflows/daily.yml` runs at **01:40 UTC (07:10 IST)** every day, and on demand:

- runs the self-checks, builds the edition, commits `data/` + `public/`, deploys `public/` to GitHub Pages.

One-time setup on GitHub: **Settings → Pages → Source: GitHub Actions**. The next scheduled
or manual run (Actions → Daily Edition → Run workflow) publishes the paper.

## Add a wire

One line in `src/feeds.mjs`:

```js
{ name: 'The Register Software', url: 'https://www.theregister.com/software/headlines.atom', region: 'Europe' },
```

`region` only prints as the dateline badge; the desk is decided by content. Sources whose
desk carries real news belong in the `TIER1` set in `src/build.mjs`, which only affects
which story leads the front page.

## Layout

| Path | What it is |
| --- | --- |
| `src/feeds.mjs` | the wire list |
| `src/core.mjs` | pure parsing, classification, de-duplication helpers |
| `src/build.mjs` | collector, selection rules, edition builder |
| `src/render.mjs` | broadsheet HTML |
| `assets/styles.css` | the paper (system serif stack, print styles, responsive) |
| `assets/app.js` | the reader's own feeds panel (browser only) |
| `tools/serve.mjs` | local preview server |
| `data/editions/` | one JSON edition per day |
| `public/` | the newspaper, ready to serve (`core.js` is copied from `src/core.mjs`) |
| `test/core.test.mjs` | `node:test` self-checks |

Headlines and excerpts belong to their publishers and link back to the original reporting.

## Every link opens in a new tab

Headlines, the lead, and stories from a reader's own sources all open in a new browser tab
(`target="_blank" rel="noopener noreferrer"`), marked with a small arrow after the title, so the
paper stays where it is.

There is no in-page reader panel. An earlier version framed the stories whose publisher allowed
it, but browsers never expose `X-Frame-Options` or `frame-ancestors` to cross-origin JavaScript,
so that decision needed a build-time header probe on every published story — roughly seven
seconds a day — and only 21 of 54 publishers agreed. It lives in the git history if it is ever
wanted back.
