# Chrome Web Store — Privacy Practices (copy/paste)

Paste these into the Chrome Developer Dashboard → MarkSyncr → **Privacy practices** tab
to clear the "Publish condition not met" gate that is blocking v0.8.35.

Extension ID: `hjcjjcpialiakkalcgadnfnoomdaegjg` (unchanged by this update).

---

## Single purpose

> MarkSyncr keeps a user's own bookmarks in sync across their browsers using a
> storage backend they choose (GitHub, Dropbox, Google Drive, or MarkSyncr
> Cloud), and includes an optional on-device ad/tracker blocker to protect the
> browsing experience. Both features serve one purpose: giving users private,
> user-controlled management of their own browsing data.

## Permission justifications

**bookmarks**
> Core function. Reads the user's browser bookmarks and writes synced changes
> back so their bookmarks stay consistent across devices.

**storage**
> Stores the user's settings, sync state, signed-in session, and the adblocker
> on/off preference locally in the browser. No browsing data is stored.

**alarms**
> Schedules periodic background bookmark synchronization and proactive refresh
> of the auth token at the user's configured interval.

**identity**
> Used only for the OAuth sign-in flow (launchWebAuthFlow) so the user can
> connect their Google Drive or MarkSyncr Cloud account for bookmark storage.
> No profile data is read beyond the storage scope the user authorizes.

**declarativeNetRequest**
> Powers the optional built-in ad/tracker blocker. Static rulesets derived from
> EasyList and EasyPrivacy are applied by the browser to block advertising and
> tracking network requests. All blocking happens locally on the device; the
> extension does not read, collect, log, or transmit the contents, URLs, or
> metadata of any request. The user can turn it on or off at any time.

**tabs (optional)**
> Requested only to open the extension's own settings/dashboard pages
> (chrome.tabs.create / openOptionsPage). Not used to read tab contents,
> URLs, or browsing history.

**Host permissions** (api.github.com, *.dropboxapi.com, www.googleapis.com,
*.supabase.co, marksyncr.com)
> Network access limited to the storage backends the user explicitly connects
> (GitHub, Dropbox, Google Drive, MarkSyncr Cloud/Supabase) to upload and
> download the user's own bookmark file, plus marksyncr.com for account and
> auth. Requests are made only to these services and only to sync the user's
> own bookmarks. (Note: the adblocker does NOT use host permissions — network
> blocking is done by declarativeNetRequest static rules, which need no host
> access.)

## Data usage / disclosures

Data the extension handles:
- **Authentication information** — the user's MarkSyncr Cloud login/session,
  used solely to authenticate the user and sync their bookmarks. Transmitted
  over HTTPS to marksyncr.com / Supabase.
- **User bookmarks** — transferred, at the user's direction, to the storage
  provider the user connects, so the user can access their own bookmarks on
  other devices. Not shared with anyone else.

The adblocker collects **no** data: it neither reads request contents nor sends
anything off-device.

Required certifications — check all three:
- ✅ I do not sell or transfer user data to third parties, outside of the
  approved use cases.
- ✅ I do not use or transfer user data for purposes unrelated to my item's
  single purpose.
- ✅ I do not use or transfer user data to determine creditworthiness or for
  lending purposes.

Data handling:
- ✅ Data is encrypted in transit (HTTPS/TLS).

---

⚠️ Possible review note: Chrome's "single purpose" policy can flag bundling an
adblocker with a bookmark-sync tool as two purposes. If a reviewer pushes back,
the fallback is to frame the adblocker as a user-optional privacy feature of the
same browsing-management product (as worded above), or split it into a separate
listing. Keep the blurb above on file for future version submissions.
