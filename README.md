# The Tech Express

A daily technology newspaper, compiled by an agent from public wire services around the
world and typeset as a broadsheet. Every story is filed under **Development**, **Testing**,
**DevOps**, **DevSecOps**, or **Etc**.

Read the latest edition: open `public/index.html` (or the published GitHub Pages site).

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

## Run it

Requires Node 20+ (no dependencies, no API keys, no build step).

```bash
npm test          # parser, classifier, de-duplication and render self-checks
npm run build     # collect the wires and print today's edition
```

Then open `public/index.html`.

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
| `data/editions/` | one JSON edition per day |
| `public/` | the newspaper, ready to serve |
| `test/core.test.mjs` | `node:test` self-checks |

Headlines and excerpts belong to their publishers and link back to the original reporting.
