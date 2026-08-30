# Chrome Web Store: Privacy practices

Chrome invalidates the permission justifications on the store listing whenever
the manifest's permission set changes. Until they are re-filled, the publish API
refuses to submit the uploaded draft:

> Publish condition not met: To publish your item, you must provide mandatory
> privacy information in the new Developer Dashboard.

The upload still succeeds, so the version sits as an unsubmitted draft. This is
what happened to v0.8.37 and again to v0.8.39.

**Only a human can clear it.** Re-running the release workflow will not.

## Clearing it

1. Open <https://chrome.google.com/webstore/devconsole>
2. Select **MarkSyncr** (item `hjcjjcpialiakkalcgadnfnoomdaegjg`)
3. Go to the **Privacy practices** tab
4. Fill the single purpose, the justification for every permission below, and
   the data-usage disclosures
5. **Save draft**, then **Submit for review**

Then confirm it actually shipped — the dashboard and CI both lie about this:

```
curl -s "https://clients2.google.com/service/update2/crx?response=updatecheck&prodversion=140.0&acceptformat=crx2,crx3&x=id%3Dhjcjjcpialiakkalcgadnfnoomdaegjg%26uc"
```

The `version="..."` attribute is what real browsers get handed. The daily
`Verify Published Versions` workflow runs the same check.

## Drafts to paste

These are drawn from `apps/extension/src/manifest.chrome.json` at v0.8.39.
**Read each one before pasting it** — they have to be true of the build you are
submitting, and Google rejects justifications that overstate or understate what
the code does.

### Single purpose

> MarkSyncr keeps a user's browser bookmarks synchronised across browsers and
> devices, using a storage backend the user chooses: their own GitHub
> repository, Dropbox, Google Drive, or MarkSyncr Cloud.

### Permission justifications

| Permission | Justification |
| --- | --- |
| `bookmarks` | Read and write the user's bookmarks. This is the extension's core function: bookmarks are read to upload them to the chosen backend, and written to apply changes synced from another device. |
| `storage` | Store the user's sync settings, the selected storage provider, and locally cached sync state. Vault entries are stored only as ciphertext. |
| `alarms` | Schedule the periodic background sync and the vault auto-lock timer. Alarms are used rather than timers so both survive the service worker being shut down. |
| `notifications` | Tell the user the outcome of a background sync they cannot see — a completed sync, a sync conflict, or a failed upload — and notify when a site is blocked. |
| `identity` | Run the OAuth sign-in flow for the storage backends (GitHub, Dropbox, Google Drive) via `chrome.identity.launchWebAuthFlow`, so credentials are never typed into the extension. |
| `declarativeNetRequest` | Apply the bundled static rulesets that block advertising and tracking requests, and block known phishing and malware domains. Declarative rules are used so no browsing data is exposed to the extension. |
| `activeTab` | Read the title and URL of the current tab, and only when the user clicks the MarkSyncr toolbar button, so that page can be bookmarked. |

### Host permission justifications

| Host | Justification |
| --- | --- |
| `https://api.github.com/*` | Read and write the user's bookmark file in their own GitHub repository, when GitHub is the selected backend. |
| `https://api.dropboxapi.com/*`, `https://content.dropboxapi.com/*` | Read and write the user's bookmark file in Dropbox, when Dropbox is the selected backend. |
| `https://www.googleapis.com/*` | Read and write the user's bookmark file in Google Drive, when Drive is the selected backend. |
| `https://*.supabase.co/*` | MarkSyncr Cloud's backend: account authentication, bookmark sync, and storage of end-to-end encrypted vault ciphertext. |
| `https://marksyncr.com/*` | The MarkSyncr web app, for the sign-in handoff and account management. |
| `https://hole.cert.pl/*` | Download the CERT Polska phishing domain list used by the phishing blocker. |
| `https://raw.githubusercontent.com/*` | Download filter-list updates (EasyList, EasyPrivacy) for the ad and tracker blocker. |

`http://localhost:3000/*` appears in the source manifest for development and is
stripped by `scripts/build.js` before packaging, so it is not in the submitted
ZIP and needs no justification. Confirm this in the build log — it prints
`Stripped 1 localhost host permission(s)`.

### Data usage

Check these against the code rather than against this table; the disclosures are
a legal statement, not a formality.

- **Authentication information** — collected. OAuth tokens for the chosen
  backend, and MarkSyncr Cloud session tokens.
- **Personally identifiable information** — collected. The account email address,
  for MarkSyncr Cloud accounts.
- **Website content** — collected. Bookmark titles and URLs, which are the thing
  being synced.
- **Not** collected: health, financial, location, personal communications, web
  browsing activity (the blockers are declarative and observe no browsing).

Also tick the three certifications: data is not sold to third parties, is not
used for purposes unrelated to the single purpose above, and is not used to
determine creditworthiness or for lending.

## A standing risk worth naming

The listing now bundles three things a reviewer may not read as one purpose:
bookmark sync, a credential vault, and an ad/phishing blocker. Chrome's
single-purpose policy is enforced unevenly, but this shape is the kind that
draws a rejection. If review starts bouncing, splitting the blocker or the vault
into its own listing is the usual remedy.
