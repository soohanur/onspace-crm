/** Classify a URL into a social platform. Mirrors apps/scraper/scraper/yellowpages.py:classify_social. */
const HOSTS: { key: string; hosts: string[] }[] = [
  { key: 'facebook', hosts: ['facebook.com', 'fb.com', 'fb.me'] },
  { key: 'linkedin', hosts: ['linkedin.com'] },
  { key: 'twitter', hosts: ['twitter.com', 'x.com'] },
  { key: 'instagram', hosts: ['instagram.com', 'instagr.am'] },
  { key: 'youtube', hosts: ['youtube.com', 'youtu.be'] },
  { key: 'tiktok', hosts: ['tiktok.com'] },
  { key: 'pinterest', hosts: ['pinterest.com', 'pinterest.co'] },
  { key: 'yelp', hosts: ['yelp.com', 'yelp.to'] },
  { key: 'threads', hosts: ['threads.net'] },
  { key: 'snapchat', hosts: ['snapchat.com'] },
  { key: 'whatsapp', hosts: ['wa.me', 'whatsapp.com'] },
  { key: 'telegram', hosts: ['t.me', 'telegram.me'] },
  { key: 'github', hosts: ['github.com'] },
];

export function classifySocial(url: string): string | null {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes('/share?') || u.includes('intent/tweet') || u.includes('/sharer')) return null;
  for (const { key, hosts } of HOSTS) {
    for (const host of hosts) {
      if (u.includes('//' + host) || u.includes('.' + host) || u.startsWith(host)) return key;
    }
  }
  return null;
}

export function groupSocials(urls: string[]): { key: string; urls: string[] }[] {
  const groups: Record<string, string[]> = {};
  for (const url of urls) {
    const k = classifySocial(url) ?? 'other';
    if (!groups[k]) groups[k] = [];
    if (!groups[k].includes(url)) groups[k].push(url);
  }
  return Object.entries(groups).map(([key, urls]) => ({ key, urls }));
}
