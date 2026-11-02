# LinkedIn post — The Tech Express

Attach a screenshot of the front page (`horizontal.png` or `newtabs.png` in `.preview/`).
Hashtags are at the end; trim to 3–5 if you prefer them lighter.

---

Every morning at 7:10, a newspaper lands on my screen. I didn't write a single word of it.

The Tech Express is a technology daily that compiles itself: 40 public RSS wires from around the
world, filed every day under five desks — Development, Testing, DevOps, DevSecOps and Etc.

It is not another AI summariser. No LLM, no API key, no database, no server.

How it actually works:

• A Node script fetches 40 feeds, de-duplicates the same story across publishers, and files each
  one by keyword weight — a hit in the headline counts 3, a hit in the body counts 1
• Editorial rules do the rest: 12 stories per desk, at most 4 from any one publisher, a 7-day
  window, and a rule that keeps "How to install X" tutorials off the front page
• A GitHub Actions cron runs it at 01:40 UTC, commits the edition as JSON, and deploys a static
  HTML broadsheet — serif type, hairline rules, a real masthead

Zero dependencies. Zero cost. About 11 seconds per edition.

The part I like most: readers aren't stuck with my sources. Paste any RSS link into "Your Sources"
and you can rename it, mute it, retry it, remove it — then flip one switch and the whole paper is
rebuilt from your feeds. Same ranking code, same layout, your mix. It stays in your browser;
nothing is uploaded.

Two decisions I would defend in a code review:

1. No in-page reader. Roughly half the publishers block iframes, and a blank frame is worse than a
   tab. Every headline opens in a new tab, with a small arrow so you know before you click.
2. Keyword filing beats an LLM here. Instant, free, deterministic — and testable. Nine tests cover
   parsing, de-duplication, desk filing and HTML escaping.

Today's edition: 54 stories from 24 wires across 5 regions.

Code: github.com/Kesavaraja/TheTechExpress

Genuine question for the engineers here: would you add more desks, or better sources?

#NodeJS #GitHubActions #WebDevelopment #RSS #OpenSource #SideProject

---

## Shorter version

Every morning at 7:10, a newspaper lands on my screen. I didn't write a word of it.

The Tech Express pulls 40 tech RSS wires from around the world and files every story under
Development, Testing, DevOps, DevSecOps and Etc — then prints itself as a broadsheet.

No LLM. No API key. No server. Zero dependencies, zero cost, ~11 seconds an edition.

Readers can paste in their own RSS links and print the whole paper from their own sources.

Node, vanilla JS, and a GitHub Actions cron.

Code: github.com/Kesavaraja/TheTechExpress

#NodeJS #RSS #SideProject
