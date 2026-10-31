import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, classify, decode, cleanSummary } from '../src/core.mjs';
import { renderEdition, renderContent } from '../src/render.mjs';
import { select } from '../src/select.mjs';

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Wire</title><link>https://example.com/</link>
<item>
  <title><![CDATA[Rust 2.0 ships &amp; breaks things]]></title>
  <link>https://example.com/rust</link>
  <description><![CDATA[<p>The compiler team said <b>no</b>.</p>]]></description>
  <pubDate>Fri, 30 Oct 2026 12:00:00 GMT</pubDate>
</item>
<item>
  <title>Writing a Playwright suite that isn't flaky</title>
  <link>https://example.com/tests</link>
  <description>Unit test coverage went up.</description>
  <pubDate>Thu, 29 Oct 2026 08:30:00 GMT</pubDate>
</item>
<item><title>Dropped: no link</title></item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
  <title>HashiCorp ships Terraform 2</title>
  <link rel="alternate" href="https://example.com/tf"/>
  <summary>Pipeline changes for everyone.</summary>
  <updated>2026-10-30T09:00:00Z</updated>
</entry>
</feed>`;

test('parses RSS items and decodes CDATA/entities', () => {
  const stories = parseFeed(RSS);
  assert.equal(stories.length, 2, 'item without a link is dropped');
  assert.equal(stories[0].title, 'Rust 2.0 ships & breaks things');
  assert.equal(stories[0].summary, 'The compiler team said no.');
  assert.equal(stories[0].publishedAt, '2026-10-30T12:00:00.000Z');
});

test('parses Atom entries with self-closing links', () => {
  const [story] = parseFeed(ATOM);
  assert.equal(story.url, 'https://example.com/tf');
  assert.equal(story.publishedAt, '2026-10-30T09:00:00.000Z');
});

test('files stories under the right desk', () => {
  assert.equal(classify('Critical CVE in OpenSSH allows remote exploit'), 'DevSecOps');
  assert.equal(classify('Playwright 2.0 makes flaky tests easier to debug'), 'Testing');
  assert.equal(classify('Kubernetes 1.34 lands with a new scheduler'), 'DevOps');
  assert.equal(classify('TypeScript 6.0 released'), 'Development');
  assert.equal(classify('Apple unveils new iPhone colours'), 'Etc');
  assert.equal(classify('Weekly roundup', 'A look at sre and observability tooling'), 'DevOps');
});

test('strips aggregator boilerplate from descriptions', () => {
  const [story] = parseFeed(`<rss><channel><item>
    <title>Enlightenment 0.28 Released</title><link>https://e.test/enl</link>
    <description>Article URL: https://e.test/enl Comments URL: https://e.test/c Points: 79 # Comments: 7</description>
  </item></channel></rss>`);
  assert.equal(story.summary, '');
  // The browser's rss2json path reuses the same cleanup, so it needs the same guarantee.
  assert.equal(cleanSummary('Article URL: https://e.test/x Points: 3'), '');
  assert.equal(cleanSummary('Playwright adds a trace viewer'), 'Playwright adds a trace viewer');
});

test('decodes stray entities without throwing', () => {
  assert.equal(decode('a &amp; b &#8212; c &#x1F600; &bogus;'), 'a & b — c 😀 &bogus;');
});

test('dedupes, caps per source, and pulls the lead out of its desk', () => {
  const story = (n, source, desk = 'Development') => ({
    title: `Story ${n}`, url: `https://wire.test/${source}/${n}`, summary: '',
    publishedAt: `2026-10-30T${String(23 - n).padStart(2, '0')}:00:00.000Z`, source, region: 'Global', desk,
  });
  const stories = [story(1, 'Wire A'), story(2, 'Wire A'), story(3, 'Wire A'), story(4, 'Wire A'), story(5, 'Wire A'),
    { ...story(6, 'Wire B'), url: 'https://wire.test/Wire A/1' }, story(7, 'Wire B', 'Testing')];

  const { lead, sections, total } = select(stories);
  const dev = sections.find((s) => s.name === 'Development').stories;

  assert.equal(lead.title, 'Story 1', 'newest story leads the paper');
  assert.ok(!dev.some((s) => s.title === 'Story 1'), 'lead is not repeated in its desk');
  assert.equal(dev.length, 3, 'per-source cap is 4 including the lead; duplicate is dropped');
  assert.equal(sections.find((s) => s.name === 'Testing').stories.length, 1);
  assert.equal(total, 5);
});

test('drops stories whose link is not a real web URL', () => {
  const stories = parseFeed(`<rss><channel>
    <item><title>Bad</title><link>javascript:alert(1)</link></item>
    <item><title>Good</title><link>https://e.test/good</link></item>
  </channel></rss>`);
  assert.equal(stories.length, 1);
  assert.equal(stories[0].title, 'Good');
});

test('renderContent is the swappable half of the page and refuses javascript: links', () => {
  const html = renderContent({
    date: '2026-10-30',
    stats: { sources: 1, regions: ['Your feed'] },
    lead: { title: 'Bad lead', url: 'javascript:alert(1)', summary: '', source: 'Mine', region: 'Your feed', desk: 'Etc' },
    sections: [
      { name: 'Development', slug: 'development', stories: [
        { title: 'Fine story', url: 'https://e.test/ok', summary: 'Ship it.', source: 'Mine', region: 'Your feed', desk: 'Development', publishedAt: '2026-10-30T10:00:00.000Z' },
      ] },
      { name: 'Testing', slug: 'testing', stories: [] },
    ],
  });

  assert.ok(html.includes('href="#"'), 'unsafe lead becomes a dead link');
  assert.ok(!html.includes('javascript:'), 'no javascript: URL is printed');
  assert.ok(html.includes('https://e.test/ok'));
  assert.ok(html.includes('Fine story'));
  assert.ok(!html.includes('<main'), 'content does not include the page shell');
});

test('renders a page that links every story and escapes markup', () => {
  const html = renderEdition({
    date: '2026-10-30',
    generatedAt: '2026-10-30T18:00:00.000Z',
    stats: { wires: 3, wiresOk: 3, fetched: 9, published: 2, sources: 2, regions: ['Europe', 'Asia'], failures: [] },
    lead: { title: 'A <script> lead', url: 'https://e.test/lead', summary: 'Big news & more.', source: 'Wire', region: 'Europe', publishedAt: '2026-10-30T17:00:00.000Z', desk: 'DevOps' },
    sections: [
      { name: 'Development', slug: 'development', stories: [{ title: 'Dek story', url: 'https://e.test/d', summary: 'Ship it.', source: 'Wire', region: 'Asia', publishedAt: '2026-10-30T16:00:00.000Z', desk: 'Development' }] },
      { name: 'Testing', slug: 'testing', stories: [] },
    ],
  }, { base: '', dates: ['2026-10-29', '2026-10-30'], number: 2 });

  assert.match(html, /The Tech Express/);
  assert.ok(html.includes('https://e.test/d'), 'story link is printed');
  assert.ok(!html.includes('<script>'), 'headline markup is escaped');
  assert.ok(html.includes('editions/2026-10-29.html'), 'back issues link to archives');
  assert.ok(!html.includes('id="testing"'), 'empty desks are omitted');
});
