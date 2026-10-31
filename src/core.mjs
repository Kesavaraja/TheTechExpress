// Pure functions: turn feed XML into stories, and file each story under a desk.
// No network, no filesystem — every export is testable on its own.

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };

const safeCodePoint = (n) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '');

/** Decode CDATA wrappers and HTML entities. */
export function decode(input = '') {
  return String(input)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED[name.toLowerCase()] ?? match);
}

/** Strip markup, decode entities, collapse whitespace. CDATA first — its body is not markup. */
export function plain(input = '') {
  const unwrapped = String(input).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return decode(unwrapped.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

/** First non-empty text value among `<name>…</name>` tags inside a block. */
export function field(block, ...names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
    if (match) {
      const value = plain(match[1]);
      if (value) return value;
    }
  }
  return '';
}

/** RSS `<link>url</link>`, Atom `<link rel="alternate" href="url"/>`, then `<guid isPermaLink>` . */
export function linkOf(block) {
  const inline = field(block, 'link');
  if (/^https?:\/\//i.test(inline)) return inline;

  const links = [...block.matchAll(/<link\b([^>]*?)\/?>/gi)].map((m) => m[1]);
  const alternate = links.find((attrs) => {
    const rel = attrs.match(/rel\s*=\s*["']([^"']+)/i)?.[1] ?? 'alternate';
    return /alternate/i.test(rel) && /href\s*=\s*["'][^"']+["']/i.test(attrs);
  });
  const href = (alternate ?? links.find((a) => /href\s*=/i.test(a)))?.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
  if (href) return decode(href).trim();

  const guid = field(block, 'guid');
  return /^https?:\/\//i.test(guid) ? guid : '';
}

/** First parseable date among the usual suspects, normalised to ISO. */
export function dateOf(block) {
  for (const name of ['pubDate', 'published', 'updated', 'issued', 'dc:date', 'date']) {
    const value = field(block, name);
    if (!value) continue;
    const time = Date.parse(value);
    if (!Number.isNaN(time)) return new Date(time).toISOString();
  }
  return '';
}

// hnrss (and a few aggregators) append machine boilerplate to every description.
const BOILERPLATE = /(?:^|\s)(?:Article URL|Comments URL|Points|# Comments)\s*:\s*\S+/gi;

/** Parse an RSS 2.0 or Atom document into flat stories. */
export function parseFeed(xml) {
  const blocks = [...String(xml).matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]);
  const stories = [];
  for (const block of blocks) {
    const title = field(block, 'title');
    const url = linkOf(block);
    if (!title || !url) continue;
    const summary = plain(field(block, 'description', 'summary', 'content:encoded', 'content'))
      .replace(BOILERPLATE, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    stories.push({
      title: title.replace(/\s+/g, ' ').slice(0, 180),
      url,
      summary: summary.length > 260 ? `${summary.slice(0, 257).replace(/[\s,;:.-]+\S*$/, '')}…` : summary,
      publishedAt: dateOf(block),
    });
  }
  return stories;
}

// Desks are matched in this order when scores tie: the more specific desk wins.
export const DESKS = ['Development', 'Testing', 'DevOps', 'DevSecOps'];
const TIE_ORDER = ['DevSecOps', 'DevOps', 'Testing', 'Development'];

const KEYWORDS = {
  DevSecOps: [
    'security', 'secure', 'vulnerability', 'vulnerabilities', 'exploit', 'zero day', 'malware', 'ransomware',
    'breach', 'breached', 'threat', 'phishing', 'supply chain', 'sbom', 'sast', 'dast', 'penetration test',
    'zero trust', 'encryption', 'secrets', 'leaked', 'leak', 'authentication', 'oauth', 'csrf', 'xss',
    'sql injection', 'soc 2', 'iso 27001', 'compliance', 'bug bounty', 'cyber', 'cyberattack', 'hacker',
    'hacked', 'cve', 'patch tuesday', 'botnet', 'ddos', 'backdoor', 'rgpd', 'gdpr', 'iam', 'passkey',
  ],
  Testing: [
    'test', 'tests', 'testing', 'qa', 'quality assurance', 'playwright', 'cypress', 'selenium', 'jest',
    'vitest', 'pytest', 'junit', 'mocha', 'test coverage', 'coverage', 'regression', 'flaky', 'flakiness',
    'e2e', 'end to end', 'test automation', 'test suite', 'tdd', 'bdd', 'assertion', 'load test',
    'fuzz', 'fuzzing', 'mutation testing', 'unit test', 'integration test', 'smoke test', 'sdet',
  ],
  DevOps: [
    'devops', 'ci cd', 'cicd', 'ci/cd', 'pipeline', 'kubernetes', 'k8s', 'docker', 'container',
    'containers', 'terraform', 'ansible', 'helm', 'observability', 'sre', 'reliability', 'deploy',
    'deployment', 'gitops', 'argocd', 'jenkins', 'github actions', 'monitoring', 'prometheus', 'grafana',
    'incident', 'postmortem', 'uptime', 'on call', 'serverless', 'infrastructure', 'platform engineering',
    'nomad', 'pulumi', 'cloud', 'ops', 'provisioning', 'blue green', 'canary',
  ],
  Development: [
    'developer', 'developers', 'programming', 'programmer', 'code', 'coding', 'coder', 'javascript',
    'typescript', 'python', 'rust', 'golang', 'java', 'kotlin', 'swift', 'php', 'ruby', 'elixir', 'zig',
    'compiler', 'framework', 'react', 'nextjs', 'node', 'api', 'library', 'open source', 'sdk', 'ide',
    'editor', 'frontend', 'backend', 'full stack', 'database', 'sql', 'postgres', 'sqlite', 'release',
    'refactor', 'monorepo', 'wasm', 'webassembly', 'linter', 'lint', 'npm', 'git', 'refactoring',
    'software', 'engineer', 'engineering', 'codebase', 'app', 'feature', 'toolchain', 'runtime',
  ],
};

// Word-boundary regexes, compiled once.
const MATCHERS = Object.entries(KEYWORDS).map(([desk, words]) => [
  desk,
  words.map((word) => ({ weight: 1, re: new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') })),
]);

/**
 * File a story under one desk. Title hits weigh 3, summary hits weigh 1;
 * ties go to the more specific desk (`sre` beats `infrastructure`).
 */
export function classify(title, summary = '') {
  let best = { desk: 'Etc', score: 0 };
  for (const [desk, matchers] of MATCHERS) {
    let score = 0;
    for (const { re } of matchers) {
      if (re.test(title)) score += 3;
      else if (summary && re.test(summary)) score += 1;
    }
    if (score === 0) continue;
    const better = score > best.score || (score === best.score && TIE_ORDER.indexOf(desk) < TIE_ORDER.indexOf(best.desk));
    if (better) best = { desk, score };
  }
  return best.desk;
}

/** Normalised headline — syndicated copies of one story usually share it. */
export function titleKey(title) {
  return String(title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Normalised URL path, ignoring scheme, host, query, hash and trailing slash. */
export function urlKey(url) {
  return String(url).replace(/^https?:\/\/[^/]+/i, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
}
