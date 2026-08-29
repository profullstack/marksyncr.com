/**
 * Warning page shown when the shield stops a top-level navigation.
 *
 * The blocked URL arrives in this page's fragment, put there by the redirect
 * rule's `regexSubstitution` (`#\0` is the whole matched URL). A fragment is
 * never sent to a server, and this page is packaged inside the extension, so
 * the address the user tried to visit stays on the device.
 */

/** Extension API, whichever name this browser uses. */
function getExtApi() {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) return chrome;
  if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) return browser;
  return null;
}

/**
 * The URL that was blocked, read from our own fragment.
 * @returns {string}
 */
export function blockedUrlFromHash(hash = window.location.hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return '';
  // Only ever surface a real http(s) URL — never reflect arbitrary text into
  // the page or into a link target.
  try {
    const url = new URL(decodeURIComponent(raw));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.href;
  } catch {
    return '';
  }
}

/**
 * Hostname of the blocked URL, or '' when there isn't a usable one.
 * @param {string} url
 */
export function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function init() {
  const blockedUrl = blockedUrlFromHash();
  const host = hostnameOf(blockedUrl);

  const siteEl = document.getElementById('site');
  // textContent, never innerHTML — this string comes from a hostile page's URL.
  siteEl.textContent = blockedUrl || 'the site you requested';

  document.getElementById('back').addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else window.location.replace('about:blank');
  });

  const confirmEl = document.getElementById('confirm');
  document.getElementById('reveal').addEventListener('click', () => {
    confirmEl.classList.toggle('hidden');
  });

  const proceedBtn = document.getElementById('proceed');
  if (!host) {
    // Without a hostname there is nothing to exempt, so don't offer to.
    proceedBtn.disabled = true;
    return;
  }

  proceedBtn.addEventListener('click', async () => {
    proceedBtn.disabled = true;
    proceedBtn.textContent = 'Allowing…';

    const api = getExtApi();
    try {
      await api.runtime.sendMessage({
        type: 'ADD_SECURITY_BYPASS',
        payload: { domain: host },
      });
      // The exemption is a dynamic rule; give the browser a moment to install
      // it before navigating back into the site, or the redirect fires again.
      setTimeout(() => window.location.replace(blockedUrl), 300);
    } catch {
      proceedBtn.disabled = false;
      proceedBtn.textContent = 'Could not allow — try again';
    }
  });
}

if (typeof document !== 'undefined' && document.getElementById('site')) {
  init();
}
