/**
 * Same-origin redirect targets only.
 *
 * Returns `next` when it is a relative path on this site ("/dashboard",
 * "/invites?x=1"), otherwise `fallback`. Rejects absolute URLs
 * ("https://evil.example"), protocol-relative ("//evil.example"), the
 * backslash forms browsers normalise to "//" ("/\\evil.example", "\\/x"),
 * any control character or whitespace (tab/newline are stripped by URL
 * parsers, turning "/\t/evil" into "//evil"), and anything that does not
 * start with a single "/".
 *
 * @param {string|null|undefined} next
 * @param {string} [fallback='/dashboard']
 * @returns {string}
 */
export function safeNextPath(next, fallback = '/dashboard') {
  if (typeof next !== 'string' || next.length === 0 || next.length > 2048) return fallback;
  if (next[0] !== '/') return fallback;
  if (next[1] === '/' || next[1] === '\\') return fallback;
  if (next.includes('\\')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000- \u007f]/.test(next)) return fallback;
  // Final check: resolving against a dummy origin must stay on it.
  try {
    const base = 'https://same-origin.invalid';
    const resolved = new URL(next, base);
    if (resolved.origin !== base) return fallback;
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return fallback;
  }
}
