/**
 * Sync-source token sealing (seal v2) — isomorphic WebCrypto.
 *
 * GitHub / Dropbox / Google Drive tokens used to sit in sync_sources in
 * PLAINTEXT. Now each user has a "sync key": an ECDH P-256 key pair whose
 * private half is encrypted under their vault user key (so it opens only in
 * their unlocked extension), and whose public half the server stores in the
 * clear. The server seals every token to the public key (OAuth callback,
 * Dropbox refresh) and can never read one back. When the extension syncs, it
 * opens the tokens locally and sends them with that one sync request; the
 * server uses them for that request only.
 *
 * Sealed value: "v2:" + base64(JSON { e, c, i, t }) — ephemeral public key,
 * AES-256-GCM ciphertext, iv, tag. Key = HKDF-SHA256(ECDH, salt = e,
 * info = "marksyncr/box/v2/<userId>/<field>"), AAD binds user + field.
 * apps/web/lib/sealed-tokens.js is the node:crypto twin (server seals).
 */

import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  fromBase64,
  toBase64,
  utf8Decode,
  utf8Encode,
} from './primitives.js';

export const SEALED_PREFIX = 'v2:';
const subtle = () => globalThis.crypto.subtle;

function aad(userId, field) {
  return utf8Encode(`marksyncr:v2:${userId}:${field}`);
}

/** Vault unlocked -> a new sync key record ({ public_key, private_sealed }). */
export async function createSyncKey(userKey, userId) {
  const pair = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const pub = new Uint8Array(await subtle().exportKey('raw', pair.publicKey));
  const pkcs8 = new Uint8Array(await subtle().exportKey('pkcs8', pair.privateKey));
  const { iv, ciphertext } = await aesGcmEncrypt(userKey, pkcs8, aad(userId, 'sync_private_key'));
  pkcs8.fill(0);
  return {
    public_key: toBase64(pub),
    private_sealed: { iv: toBase64(iv), ciphertext: toBase64(ciphertext) },
  };
}

/** Vault unlocked + record -> the private CryptoKey (non-extractable). */
export async function openSyncPrivateKey(userKey, record, userId) {
  const pkcs8 = await aesGcmDecrypt(
    userKey,
    fromBase64(record.private_sealed.iv),
    fromBase64(record.private_sealed.ciphertext),
    aad(userId, 'sync_private_key')
  );
  try {
    return await subtle().importKey('pkcs8', pkcs8, { name: 'ECDH', namedCurve: 'P-256' }, false, [
      'deriveBits',
    ]);
  } finally {
    pkcs8.fill(0);
  }
}

async function boxKey(shared, epk, userId, field) {
  const base = await subtle().importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: epk,
      info: utf8Encode(`marksyncr/box/v2/${userId}/${field}`),
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function isSealedToken(v) {
  return typeof v === 'string' && v.startsWith(SEALED_PREFIX);
}

/** Seal to a public key (tests; the server uses its node twin). */
export async function sealToSyncKey(publicKeyB64, plaintext, userId, field) {
  const recipient = await subtle().importKey(
    'raw',
    fromBase64(publicKeyB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const eph = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const shared = new Uint8Array(
    await subtle().deriveBits({ name: 'ECDH', public: recipient }, eph.privateKey, 256)
  );
  const epk = new Uint8Array(await subtle().exportKey('raw', eph.publicKey));
  const key = await boxKey(shared, epk, userId, field);
  shared.fill(0);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(
    await subtle().encrypt(
      { name: 'AES-GCM', iv, additionalData: aad(userId, field), tagLength: 128 },
      key,
      utf8Encode(plaintext)
    )
  );
  const body = {
    e: toBase64(epk),
    c: toBase64(sealed.slice(0, sealed.length - 16)),
    i: toBase64(iv),
    t: toBase64(sealed.slice(sealed.length - 16)),
  };
  return SEALED_PREFIX + btoa(JSON.stringify(body));
}

/** Extension: open one sealed token with the private sync key. */
export async function openSealedToken(privateKey, sealedValue, userId, field) {
  if (!isSealedToken(sealedValue)) throw new Error('not a sealed v2 value');
  const body = JSON.parse(atob(sealedValue.slice(SEALED_PREFIX.length)));
  const epk = fromBase64(body.e);
  const pub = await subtle().importKey(
    'raw',
    epk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const shared = new Uint8Array(
    await subtle().deriveBits({ name: 'ECDH', public: pub }, privateKey, 256)
  );
  const key = await boxKey(shared, epk, userId, field);
  shared.fill(0);
  const ct = fromBase64(body.c);
  const tag = fromBase64(body.t);
  const joined = new Uint8Array(ct.length + tag.length);
  joined.set(ct, 0);
  joined.set(tag, ct.length);
  const out = await subtle().decrypt(
    { name: 'AES-GCM', iv: fromBase64(body.i), additionalData: aad(userId, field), tagLength: 128 },
    key,
    joined
  );
  return utf8Decode(new Uint8Array(out));
}
