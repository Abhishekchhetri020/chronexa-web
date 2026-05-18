// Uint32Array bitmask helpers.
//
// JS analogue of Kotlin LongArray bitmask. We use 32-bit words because JS
// bitwise ops are 32-bit. Each bit in a word corresponds to one period (or
// any 0-based index). For typical school schedules (periodsPerDay <= 12)
// one word per day is more than enough; for general bitmask use this file
// exposes word-array helpers too.
//
// Conventions
//   word index   = floor(idx / 32)
//   bit position = idx & 31
//   bits stored unsigned (use `>>> 0` everywhere to defend against the
//   `1 << 31 -> -2147483648` trap).
//
// Exports a tiny ESM module. No deps, no build step.

/** Number of 32-bit words needed to store `bits` flags. */
export function wordsNeeded(bits) {
  return (bits + 31) >>> 5;
}

/** Allocate a zeroed bitmask large enough for `bits` flags. */
export function alloc(bits) {
  return new Uint32Array(wordsNeeded(bits));
}

/** Set bit `idx` (mutates). Returns the same array for chaining. */
export function set(arr, idx) {
  arr[idx >>> 5] = (arr[idx >>> 5] | (1 << (idx & 31))) >>> 0;
  return arr;
}

/** Clear bit `idx`. */
export function clear(arr, idx) {
  arr[idx >>> 5] = (arr[idx >>> 5] & ~(1 << (idx & 31))) >>> 0;
  return arr;
}

/** Test bit `idx`. Returns true/false. */
export function test(arr, idx) {
  return ((arr[idx >>> 5] >>> (idx & 31)) & 1) === 1;
}

/** Population count across the whole array. */
export function popcount(arr) {
  let n = 0;
  for (let i = 0; i < arr.length; i++) {
    n += popcount32(arr[i]);
  }
  return n;
}

/** popcount for a single 32-bit word. */
export function popcount32(x) {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return ((x * 0x01010101) >>> 24) & 0xff;
}

/** index of lowest set bit (count of trailing zeros). 32 if word is 0. */
export function ctz32(x) {
  if (x === 0) return 32;
  let n = 0;
  if ((x & 0x0000ffff) === 0) { n += 16; x >>>= 16; }
  if ((x & 0x000000ff) === 0) { n += 8; x >>>= 8; }
  if ((x & 0x0000000f) === 0) { n += 4; x >>>= 4; }
  if ((x & 0x00000003) === 0) { n += 2; x >>>= 2; }
  if ((x & 0x00000001) === 0) { n += 1; }
  return n;
}

/** count of leading zeros for 32-bit word. */
export function clz32(x) {
  if (x === 0) return 32;
  let n = 0;
  if ((x & 0xffff0000) === 0) { n += 16; x <<= 16; }
  if ((x & 0xff000000) === 0) { n += 8; x <<= 8; }
  if ((x & 0xf0000000) === 0) { n += 4; x <<= 4; }
  if ((x & 0xc0000000) === 0) { n += 2; x <<= 2; }
  if ((x & 0x80000000) === 0) { n += 1; }
  return n;
}

/** Bitwise AND into a fresh array. */
export function and(a, b) {
  const len = Math.min(a.length, b.length);
  const out = new Uint32Array(len);
  for (let i = 0; i < len; i++) out[i] = (a[i] & b[i]) >>> 0;
  return out;
}

/** Bitwise OR into a fresh array. */
export function or(a, b) {
  const len = Math.max(a.length, b.length);
  const out = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = (((i < a.length ? a[i] : 0) | (i < b.length ? b[i] : 0))) >>> 0;
  }
  return out;
}

/** Bitwise NOT (masked to `bits`); fresh array. */
export function not(arr, bits) {
  const out = new Uint32Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = (~arr[i]) >>> 0;
  if (bits !== undefined) {
    const tail = bits & 31;
    if (tail !== 0 && out.length > 0) {
      const mask = ((1 << tail) - 1) >>> 0;
      out[out.length - 1] = (out[out.length - 1] & mask) >>> 0;
    }
  }
  return out;
}

/** True if no bit is set. */
export function isEmpty(arr) {
  for (let i = 0; i < arr.length; i++) if (arr[i] !== 0) return false;
  return true;
}

/** Set every bit from 0..bits-1. Used to seed availability "all open". */
export function fill(bits) {
  const out = alloc(bits);
  const full = bits >>> 5;
  for (let i = 0; i < full; i++) out[i] = 0xffffffff;
  const tail = bits & 31;
  if (tail !== 0) {
    out[full] = ((1 << tail) - 1) >>> 0;
  }
  return out;
}
