/**
 * The pit.world network footer, fetched on the server from pit.world and
 * cached for an hour. It is the last thing in <body> on every page. Any
 * failure (timeout, non-200, network) renders nothing, never a broken page.
 */
const PIT_FOOTER_URL = 'https://pit.world/snippets/footer.html?site=marksyncr.com';

export default async function PitFooter() {
  try {
    const res = await fetch(PIT_FOOTER_URL, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (!html.includes('data-pit-footer')) return null;
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  } catch {
    return null;
  }
}
