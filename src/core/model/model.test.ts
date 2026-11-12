import { describe, expect, it } from "vitest";
import { assertPageIndex, copyBytes } from "./bytes.js";
import { addRotation } from "./geometry.js";

describe("addRotation", () => {
  it.each([
    [0, 90, 90],
    [270, 180, 90],
    [90, -90, 0],
    [0, -90, 270],
    [180, 720, 180],
  ] as const)("%i + %i is %i", (rotation, angle, expected) => {
    expect(addRotation(rotation, angle)).toBe(expected);
  });

  it.each([45, 1.5, Number.NaN])("rejects %s", (angle) => {
    expect(() => addRotation(0, angle)).toThrow(RangeError);
  });
});

describe("copyBytes", () => {
  it("copies exactly the view's bytes into a buffer of their own", () => {
    const heap = new Uint8Array([9, 9, 1, 2, 3, 9]);
    const copy = copyBytes(heap.subarray(2, 5));
    expect([...copy]).toEqual([1, 2, 3]);
    expect(copy.buffer.byteLength).toBe(3);
    copy[0] = 7;
    expect(heap[2]).toBe(1);
  });

  it("copies an ArrayBuffer without detaching it", () => {
    const buffer = new Uint8Array([1, 2]).buffer;
    const copy = copyBytes(buffer);
    expect(copy.buffer).not.toBe(buffer);
    expect(buffer.byteLength).toBe(2);
  });
});

describe("assertPageIndex", () => {
  it("accepts indexes inside the document", () => {
    expect(() => assertPageIndex(0, 1)).not.toThrow();
    expect(() => assertPageIndex(2, 3)).not.toThrow();
  });

  it.each([-1, 3, 1.5, Number.NaN])("rejects %s in a 3-page document", (index) => {
    expect(() => assertPageIndex(index, 3)).toThrow(RangeError);
  });
});
