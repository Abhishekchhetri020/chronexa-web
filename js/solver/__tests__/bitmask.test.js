import { describe, it, expect } from "vitest";
import { wordsNeeded, alloc, set, clear, test as testBit, popcount32 } from "../bitmask.js";

describe("bitmask primitives", () => {
  it("wordsNeeded rounds up to 32-bit words", () => {
    expect(wordsNeeded(1)).toBe(1);
    expect(wordsNeeded(32)).toBe(1);
    expect(wordsNeeded(33)).toBe(2);
    expect(wordsNeeded(64)).toBe(2);
    expect(wordsNeeded(65)).toBe(3);
  });

  it("set / test / clear round-trip across word boundaries", () => {
    const m = alloc(70);
    for (const idx of [0, 31, 32, 63, 64, 69]) {
      expect(testBit(m, idx)).toBe(false);
      set(m, idx);
      expect(testBit(m, idx)).toBe(true);
    }
    clear(m, 32);
    expect(testBit(m, 32)).toBe(false);
    expect(testBit(m, 31)).toBe(true);
    expect(testBit(m, 33)).toBe(false);
  });

  it("popcount32 counts set bits", () => {
    expect(popcount32(0)).toBe(0);
    expect(popcount32(1)).toBe(1);
    expect(popcount32(0b1011)).toBe(3);
    expect(popcount32(0xffffffff)).toBe(32);
    expect(popcount32(0x80000000)).toBe(1);
    // brute-force cross-check on arbitrary values
    for (const v of [12345, 0xdeadbeef >>> 0, 0x0f0f0f0f]) {
      const brute = v.toString(2).split("").filter((c) => c === "1").length;
      expect(popcount32(v)).toBe(brute);
    }
  });
});
