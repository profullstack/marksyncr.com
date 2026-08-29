/**
 * Dynamic declarativeNetRequest rule id and priority allocation.
 *
 * Two independent features now write dynamic rules — the per-site ad-blocking
 * allowlist and the security shield — and `updateDynamicRules` replaces rules
 * by id across the whole extension. Each owner must therefore remove only ids
 * in its own band, or one feature silently deletes the other's rules. That is
 * exactly the bug this file exists to prevent, so keep the bands disjoint.
 */

/** Per-site "disable blocking here" allow rules. */
export const ALLOWLIST_RULE_ID_START = 1;
export const ALLOWLIST_RULE_ID_END = 9999;

/** Security shield block + interstitial redirect rules. */
export const SECURITY_RULE_ID_START = 10_000;
export const SECURITY_RULE_ID_END = 19_999;

/** "Proceed anyway" exemptions the interstitial creates. */
export const SECURITY_BYPASS_RULE_ID_START = 20_000;
export const SECURITY_BYPASS_RULE_ID_END = 29_999;

/**
 * Rule priorities. Higher wins; for equal priority declarativeNetRequest
 * resolves by action, where `allow` beats `block` beats `redirect`.
 *
 * The ordering that matters:
 *  - Security blocking sits ABOVE the ad-blocking allowlist, so "disable
 *    blocking on this site" turns off ads and trackers without also turning
 *    off phishing protection.
 *  - The interstitial redirect sits above the security block, so a top-level
 *    navigation reaches the warning page instead of dying as a network error.
 *  - A bypass the user granted from that warning page outranks both.
 */
export const PRIORITY = {
  /** Static ads/privacy block rules (declared in the generated rulesets). */
  staticBlock: 1,
  /** Per-site ad-blocking allowlist. */
  allowlist: 2,
  /** Security shield: block subresource requests to known-bad domains. */
  securityBlock: 3,
  /** Security shield: send top-level navigations to the warning page. */
  securityRedirect: 4,
  /** User chose "proceed anyway" for this site. */
  securityBypass: 5,
};
