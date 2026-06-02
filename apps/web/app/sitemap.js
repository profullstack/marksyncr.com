export default function sitemap() {
  const base = 'https://marksyncr.com';
  const lastModified = '2026-06-02';

  return [
    { url: base, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/docs`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/pricing`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/signup`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/login`, lastModified, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${base}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${base}/contact`, lastModified, changeFrequency: 'yearly', priority: 0.4 },
  ];
}
