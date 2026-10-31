// The Tech Express wire service. Every source is a public RSS/Atom feed.
// `region` is only used for the dateline badge — categorisation is by content.

export const FEEDS = [
  // — North America
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', region: 'North America' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', region: 'North America' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', region: 'North America' },
  { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', region: 'North America' },
  { name: 'ZDNET', url: 'https://www.zdnet.com/news/rss.xml', region: 'North America' },
  { name: 'SD Times', url: 'https://sdtimes.com/feed/', region: 'North America' },
  { name: 'The New Stack', url: 'https://thenewstack.io/feed/', region: 'North America' },
  { name: 'Dark Reading', url: 'https://www.darkreading.com/rss.xml', region: 'North America' },
  { name: 'SecurityWeek', url: 'https://www.securityweek.com/feed/', region: 'North America' },
  { name: 'TechRepublic Developer', url: 'https://www.techrepublic.com/rssfeeds/topic/developer/', region: 'North America' },

  // — Europe
  { name: 'The Register', url: 'https://www.theregister.com/headlines.atom', region: 'Europe' },
  { name: 'The Register Security', url: 'https://www.theregister.com/security/headlines.atom', region: 'Europe' },
  { name: 'BBC Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', region: 'Europe' },
  { name: 'Tech.eu', url: 'https://tech.eu/feed/', region: 'Europe' },
  { name: 'Sifted', url: 'https://sifted.eu/feed', region: 'Europe' },
  { name: 'JetBrains Blog', url: 'https://www.jetbrains.com/rss.xml', region: 'Europe' },
  { name: 'The Pragmatic Engineer', url: 'https://blog.pragmaticengineer.com/rss/', region: 'Europe' },

  // — Asia
  { name: 'YourStory', url: 'https://yourstory.com/feed', region: 'Asia' },
  { name: 'Inc42', url: 'https://inc42.com/feed/', region: 'Asia' },

  // — Africa
  { name: 'TechCabal', url: 'https://techcabal.com/feed/', region: 'Africa' },

  // — Middle East
  { name: 'Wamda', url: 'https://www.wamda.com/feed', region: 'Middle East' },

  // — Latin America
  { name: 'Contxto', url: 'https://contxto.com/en/feed', region: 'Latin America' },

  // — Global desks (engineering practice, vendor wires, community)
  { name: 'InfoQ', url: 'https://www.infoq.com/feed/', region: 'Global' },
  { name: 'GitHub Blog', url: 'https://github.blog/feed/', region: 'Global' },
  { name: 'GitHub Changelog', url: 'https://github.blog/changelog/feed/', region: 'Global' },
  { name: 'Hacker News', url: 'https://hnrss.org/frontpage', region: 'Global' },
  { name: 'Stack Overflow Blog', url: 'https://stackoverflow.blog/feed/', region: 'Global' },
  { name: 'DEV Community', url: 'https://dev.to/feed', region: 'Global' },
  { name: 'freeCodeCamp News', url: 'https://www.freecodecamp.org/news/rss/', region: 'Global' },
  { name: 'Martin Fowler', url: 'https://martinfowler.com/feed.atom', region: 'Global' },
  { name: 'Thoughtworks', url: 'https://www.thoughtworks.com/rss/insights.xml', region: 'Global' },
  { name: 'Microsoft DevOps', url: 'https://devblogs.microsoft.com/devops/feed/', region: 'Global' },
  { name: 'AWS DevOps', url: 'https://aws.amazon.com/blogs/devops/feed/', region: 'Global' },
  { name: 'HashiCorp', url: 'https://www.hashicorp.com/blog/feed.xml', region: 'Global' },
  { name: 'Docker Blog', url: 'https://www.docker.com/blog/feed/', region: 'Global' },
  { name: 'TestGuild', url: 'https://testguild.com/feed/', region: 'Global' },
  { name: 'BrowserStack Blog', url: 'https://www.browserstack.com/blog/feed/', region: 'Asia' },
  { name: 'Kent C. Dodds', url: 'https://kentcdodds.com/blog/rss.xml', region: 'Global' },
  { name: 'Software Testing Magazine', url: 'https://www.softwaretestingmagazine.com/feed/', region: 'Europe' },
  { name: 'Playwright Releases', url: 'https://github.com/microsoft/playwright/releases.atom', region: 'Global' },
];
