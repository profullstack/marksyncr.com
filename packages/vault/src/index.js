/**
 * @marksyncr/vault — end-to-end encrypted vault core.
 *
 * Shared by the web app and the extension. Every value that reaches the server
 * has already passed through this package; nothing here sends anything anywhere,
 * which is what makes "the server cannot read the vault" a property of the code
 * rather than a promise in the marketing copy.
 *
 * Typical use:
 *
 *   const { meta, userKey, recoveryKey } = await createVault(password);
 *   //  POST meta  ->  /api/vault/meta          (safe to send)
 *   //  show recoveryKey to the user, exactly once
 *
 *   const item = createItem('login', { name: 'GitHub', login: { username, password } });
 *   const row  = await encryptItem(userKey, item);
 *   //  POST row   ->  /api/vault/items         (ciphertext only)
 */

export {
  IV_BYTES,
  KEY_BYTES,
  randomBytes,
  utf8Encode,
  utf8Decode,
  toBase64,
  fromBase64,
  toHex,
  fromHex,
  timingSafeEqual,
  pbkdf2,
  hkdf,
  aesGcmEncrypt,
  aesGcmDecrypt,
} from './primitives.js';

export {
  KDF,
  DEFAULT_KDF_PARAMS,
  MIN_PBKDF2_ITERATIONS,
  INFO_WRAP,
  INFO_AUTH,
  INFO_RECOVERY,
  assertUsableKdfParams,
  deriveMasterKey,
  deriveWrapKey,
  deriveAuthHash,
  deriveAll,
} from './kdf.js';

export {
  SALT_BYTES,
  RECOVERY_KEY_BYTES,
  formatRecoveryKey,
  parseRecoveryKey,
  createVault,
  unlockVault,
  unlockWithRecoveryKey,
  rewrapUserKey,
  resetRecoveryKey,
} from './vault-key.js';

export {
  ITEM_TYPE,
  ITEM_TYPE_NAME,
  ITEM_SCHEMA_VERSION,
  MAX_HISTORY_ENTRIES,
  createItem,
  assertGroupsMatchType,
  recordPasswordChange,
  encryptItem,
  decryptItem,
  decryptItems,
} from './items.js';

export {
  OPENCREDS_VERSION,
  OPENCREDS_EXTENSION,
  OPENCREDS_MEDIA_TYPE,
  NAMESPACE as OPENCREDS_NAMESPACE,
  buildManifest,
  verifyManifest,
  isOpenCredsDatabase,
  readOpenCredsHeader,
  parseOpenCredsDatabase,
  openOpenCredsDatabase,
  exportOpenCredsDatabase,
  exportPlaintextOpenCredsDatabase,
} from './opencreds.js';

export {
  LOWERCASE,
  UPPERCASE,
  DIGITS,
  SYMBOLS,
  WORDS,
  DEFAULT_OPTIONS as DEFAULT_GENERATOR_OPTIONS,
  generatePassword,
  generatePassphrase,
  passwordEntropyBits,
  passphraseEntropyBits,
} from './generator.js';

export {
  IMPORT_SOURCES,
  parseCsv,
  rowsToObjects,
  detectSource,
  parseImport,
  detectImportKind,
  inspectOpenCredsFile,
  parseOpenCredsImport,
  importFile,
} from './import.js';
