/**
 * Password and passphrase generation.
 *
 * Two rules the whole file exists to hold: entropy comes from
 * `crypto.getRandomValues` and never from `Math.random`, and the selection is
 * free of modulo bias. `bytes[i] % alphabet.length` looks harmless and quietly
 * favours the first characters of the alphabet whenever 256 is not a multiple
 * of the alphabet size — which it almost never is.
 */

import { randomBytes } from './primitives.js';

export const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
export const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const DIGITS = '0123456789';
export const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?';

/**
 * Characters a human reliably mistypes when reading a password aloud or off a
 * screen: 0/O, 1/l/I. Excluded when `avoidAmbiguous` is set.
 */
const AMBIGUOUS = new Set(['0', 'O', 'o', '1', 'l', 'I']);

export const DEFAULT_OPTIONS = Object.freeze({
  length: 20,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: false,
});

/**
 * Pick one element uniformly at random, rejecting values that would bias the
 * result rather than folding them back in with a modulo.
 * @param {string} alphabet
 * @returns {string}
 */
function pick(alphabet) {
  return alphabet[pickIndex(alphabet.length)];
}

/**
 * Build the alphabet for a set of options.
 * @param {typeof DEFAULT_OPTIONS} options
 * @returns {{ alphabet: string, required: string[] }}
 */
function buildAlphabet(options) {
  const groups = [];
  if (options.lowercase) groups.push(LOWERCASE);
  if (options.uppercase) groups.push(UPPERCASE);
  if (options.digits) groups.push(DIGITS);
  if (options.symbols) groups.push(SYMBOLS);

  const filtered = groups
    .map((group) =>
      options.avoidAmbiguous
        ? [...group].filter((c) => !AMBIGUOUS.has(c)).join('')
        : group
    )
    .filter((group) => group.length > 0);

  return { alphabet: filtered.join(''), required: filtered };
}

/**
 * Generate a random password.
 *
 * Guarantees at least one character from every enabled group — many sites
 * reject a password that happens to contain no digit, and "generate again until
 * it is accepted" is a worse experience than making it true up front.
 *
 * @param {Partial<typeof DEFAULT_OPTIONS>} [options]
 * @returns {string}
 */
export function generatePassword(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { alphabet, required } = buildAlphabet(opts);

  if (required.length === 0) {
    throw new Error('Select at least one character type');
  }
  if (!Number.isInteger(opts.length) || opts.length < required.length) {
    throw new Error(`Length must be at least ${required.length} for the selected character types`);
  }

  // One from each enabled group first, then fill from the whole alphabet.
  const chars = required.map((group) => pick(group));
  while (chars.length < opts.length) chars.push(pick(alphabet));

  // Fisher-Yates, so the guaranteed characters are not always at the front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = pickIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

/**
 * Unbiased random integer in [0, n).
 *
 * Draws as many bytes as the range needs, then rejects any draw in the ragged
 * tail above the largest whole multiple of n. A single byte is not enough: for
 * n > 256 the largest multiple of n below 256 is zero, so a one-byte version
 * rejects every draw and spins forever — which is exactly what happens when
 * shuffling a password longer than 256 characters.
 *
 * @param {number} n
 * @returns {number}
 */
function pickIndex(n) {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error('Range must be a positive integer');
  }
  if (n === 1) return 0;

  const bytesNeeded = Math.ceil(Math.log2(n) / 8);
  const range = 2 ** (bytesNeeded * 8);
  const limit = Math.floor(range / n) * n;

  for (;;) {
    const bytes = randomBytes(bytesNeeded);
    let value = 0;
    for (const byte of bytes) value = value * 256 + byte;
    if (value < limit) return value % n;
  }
}

/**
 * Shannon entropy of a generated password, in bits, given the alphabet it was
 * drawn from. Reported to the user because "20 characters" means very different
 * things with and without symbols.
 * @param {Partial<typeof DEFAULT_OPTIONS>} [options]
 * @returns {number}
 */
export function passwordEntropyBits(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { alphabet } = buildAlphabet(opts);
  if (alphabet.length === 0) return 0;
  return Math.round(opts.length * Math.log2(alphabet.length));
}

/**
 * A small, deliberately plain word list for passphrases.
 *
 * Short and common on purpose: a passphrase is for the things a person has to
 * type by hand or read off a screen, where an obscure word is a liability. With
 * 256 words each adds 8 bits, so the default of six words is ~48 bits — stated
 * plainly by passphraseEntropyBits rather than implied.
 */
export const WORDS = Object.freeze(
  (
    'able acid aged also area army away baby back ball band bank base bath bear beat been beer bell ' +
    'belt bend bike bill bird blue boat body bone book boot born boss both bowl bulk burn bush busy ' +
    'cake call calm came camp card care case cash cast cell chat chip city club coal coat code cold ' +
    'come cook cool cope copy core corn cost crew crop dark data date dawn days dead deal dear debt ' +
    'deck deep deny desk dial diet dirt dish disk does done door dose down draw drew drop drug drum ' +
    'dual duck dust duty each earn ease east easy edge else even ever exit face fact fail fair fall ' +
    'farm fast fate fear feed feel feet fell felt file fill film find fine fire firm fish five flat ' +
    'flew flow foam fold folk food foot ford form fort four free from fuel full fund gain game gate ' +
    'gave gear gift girl give glad goal goes gold golf gone good gray grew grid grow gulf hair half ' +
    'hall hand hang hard harm hate have head heal hear heat held hell help herb here hero hide high ' +
    'hill hint hire hold hole holy home hope horn host hour huge hunt hurt idea inch into iron item ' +
    'jack jane jazz join jump jury just keen keep kept kick kind king knee knew know lack lady laid ' +
    'lake lamp land lane last late lead leaf lean left lend less life lift like limb line link lion ' +
    'list live load loan lock long look loop lord'
  ).split(/\s+/)
);

/**
 * Generate a passphrase.
 * @param {{ words?: number, separator?: string, capitalize?: boolean, includeNumber?: boolean }} [options]
 * @returns {string}
 */
export function generatePassphrase(options = {}) {
  const { words = 6, separator = '-', capitalize = false, includeNumber = false } = options;

  if (!Number.isInteger(words) || words < 3) {
    throw new Error('A passphrase needs at least 3 words');
  }

  const chosen = Array.from({ length: words }, () => WORDS[pickIndex(WORDS.length)]).map((word) =>
    capitalize ? word[0].toUpperCase() + word.slice(1) : word
  );

  if (includeNumber) {
    const at = pickIndex(chosen.length);
    chosen[at] += String(pickIndex(10));
  }

  return chosen.join(separator);
}

/**
 * Entropy of a passphrase in bits, ignoring the optional digit.
 * @param {{ words?: number }} [options]
 */
export function passphraseEntropyBits({ words = 6 } = {}) {
  return Math.round(words * Math.log2(WORDS.length));
}
