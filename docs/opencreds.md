# OpenCreds in the MarkSyncr vault

The MarkSyncr vault implements **OpenCreds 0.1** — the open standard for
credential records and portable vaults. Specification:
<https://logicsrc.com/opencreds>.

What that buys a person: they can leave. A vault exports as one encrypted file
that another conforming implementation reads, with password history, TOTP seeds,
folders, custom fields, URI match rules and every item type intact — rather than
a CSV that writes every secret to disk in the clear and drops whatever it has no
column for.

## What this vault implements

| Part of the spec | Status |
| --- | --- |
| Six item types (`login`, `card`, `identity`, `note`, `key`, `account`) | Yes |
| Item envelope, AES-256-GCM with the id bound as AAD | Yes |
| Key hierarchy: PBKDF2 → HKDF → wrapped random user key | Yes |
| Recovery key | Yes |
| Portable database, encrypted form — read and write | Yes |
| Portable database, plaintext form — read and write | Yes, opt-in |
| Manifest verification on import | Yes |
| CSV importers (Bitwarden, 1Password, Chrome) | Yes |
| `user` profile | Yes |
| `team` profile | No — this is a personal vault |

## Namespace

This vault declares the namespace **`marksyncr`**.

Every domain-separation label in OpenCreds is prefixed by the vault's namespace,
and a label is compiled into the additional authenticated data of every
ciphertext a vault has ever written. Editing one does not migrate a vault; it
makes it undecryptable.

MarkSyncr's vault shipped before OpenCreds existed, with `marksyncr:vault:*`
labels already in every ciphertext. So the specification carries the prefix as a
declared per-vault property rather than mandating one string, `marksyncr` is a
registered namespace, and not one existing vault had to be re-encrypted to
become conformant.

Item type codes 1–4 are likewise the ones this vault already used. OpenCreds
fixed them there and added 5 (`key`) and 6 (`account`).

## Importing

The Import control accepts a CSV export from another manager, or an OpenCreds
database.

```
vault.opencreds   an OpenCreds database (encrypted by default)
export.csv        Bitwarden, 1Password or Chrome
```

An OpenCreds file is a whole vault rather than a table of logins. When it is
encrypted — the default — its header is still readable, and authenticated, so
the passphrase prompt names the real item count before anyone types anything.

Import fails, and writes nothing, when:

- the passphrase is wrong;
- the file was altered after export — the header is bound as additional
  authenticated data over the payload, so a restated item count fails the tag;
- the manifest disagrees with the payload — a dropped item, a truncated file, or
  a re-ordered payload.

That last one is the difference from a CSV. A CSV truncated at 3,000 rows
imports 3,000 rows and reports success. There is no state in which this
implementation reports a complete import of an incomplete file.

## Exporting

```js
import { exportOpenCredsDatabase } from '@marksyncr/vault';

const db = await exportOpenCredsDatabase({ folders, items }, { passphrase });
```

The export is encrypted under a key derived from the **export passphrase**, not
the vault's own user key — a file encrypted under the user key would only open
inside the vault it came from, which is the opposite of portable.

The plaintext form exists because the products people move *to* frequently read
nothing else. It requires `acknowledged: true` in code, writes
`"protected": false` into its own header, and is never a default.

## API

```js
import {
  // reading
  detectImportKind,        // 'opencreds' | 'csv' | 'unknown'
  inspectOpenCredsFile,    // the header, without the passphrase
  parseOpenCredsImport,    // decrypt + verify + return items and folders
  importFile,              // one entry point for either kind

  // writing
  exportOpenCredsDatabase,
  exportPlaintextOpenCredsDatabase,

  // pieces
  buildManifest,
  verifyManifest,
  openOpenCredsDatabase,
  readOpenCredsHeader,
  OPENCREDS_VERSION,
  OPENCREDS_NAMESPACE,
} from '@marksyncr/vault';
```

Nothing in this module touches the network. The CSV path touches no crypto at
all; the OpenCreds path decrypts the file it was handed and nothing else. Both
produce plain item objects, and the caller encrypts them into the vault.

## Verifying interoperability

`packages/vault/__tests__/opencreds-interop.test.js` drives this implementation
against the OpenCreds reference implementation (`@logicsrc/opencreds`) when that
package is present, in both directions, and asserts the item records come back
byte-identical. It skips itself when the reference implementation is not
installed, so it never turns CI red on a machine that simply does not have it.
