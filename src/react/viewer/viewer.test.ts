import { describe, expect, it } from "vitest";
import { pageGeometry } from "./geometry.js";
import { RenderQueue } from "./render-queue.js";

describe("pageGeometry", () => {
  it.each([
    [0, 600, 800, "none"],
    [90, 600, 450, "translate(600px, 0) rotate(90deg)"],
    [180, 600, 800, "translate(600px, 800px) rotate(180deg)"],
    [270, 600, 450, "translate(0, 450px) rotate(270deg)"],
  ] as const)(
    "lays out a 600 × 800 page rotated %i° at 600 px",
    (rotation, width, height, transform) => {
      const geometry = pageGeometry({ width: 600, height: 800 }, rotation, 600);
      expect(geometry).toMatchObject({ width, height, transform });
      expect(geometry.pageWidth / geometry.pageHeight).toBeCloseTo(600 / 800);
    },
  );

  it("maps the unrotated page's corners to where a 90° page shows them", () => {
    const { width, pageWidth, pageHeight } = pageGeometry({ width: 600, height: 800 }, 90, 600);
    // translate(width, 0) rotate(90deg) maps (x, y) to (width - y, x).
    const map = (x: number, y: number) => [width - y, x];
    // The top-left corner goes to the top right, as when a page turns clockwise,
    expect(map(0, 0)).toEqual([600, 0]);
    // and the bottom-right corner to the bottom left.
    expect(map(pageWidth, pageHeight)).toEqual([0, pageWidth]);
  });
});

describe("RenderQueue", () => {
  const gate = () => {
    let open: () => void = () => {};
    const promise = new Promise<void>((resolve) => {
      open = resolve;
    });
    return { promise, open };
  };

  it("runs at most its limit at once, newest first", async () => {
    const queue = new RenderQueue(2);
    const started: string[] = [];
    const gates = new Map<string, ReturnType<typeof gate>>();
    for (const id of ["a", "b", "c", "d"]) {
      const g = gate();
      gates.set(id, g);
      queue.schedule(async () => {
        started.push(id);
        await g.promise;
      });
    }
    // a runs at once; b starts too, then c and d wait, newest first.
    expect(started).toEqual(["a", "b"]);
    gates.get("a")?.open();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual(["a", "b", "d"]);
  });

  it("cancels a waiting render before it starts, and aborts a running one", async () => {
    const queue = new RenderQueue(1);
    const started: string[] = [];
    let signal: AbortSignal | undefined;
    const running = queue.schedule(async (s) => {
      signal = s;
      started.push("running");
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    const waiting = queue.schedule(async () => {
      started.push("waiting");
    });
    waiting.cancel();
    running.cancel();
    expect(signal?.aborted).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(started).toEqual(["running"]);
  });
});
