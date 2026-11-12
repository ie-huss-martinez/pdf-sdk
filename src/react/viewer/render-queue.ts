/** A queued render; cancelling it stops it, whether it's waiting or running. */
export interface QueuedRender {
  cancel(): void;
}

type Task = (signal: AbortSignal) => Promise<void>;

/**
 * Runs at most `limit` page renders at once. The page asked for last starts
 * first, because it's usually the one the user just scrolled to, and a page
 * that scrolls away is cancelled, whether it's waiting or running.
 */
export class RenderQueue {
  readonly #limit: number;
  #running = 0;
  readonly #waiting: { task: Task; controller: AbortController }[] = [];

  constructor(limit = 2) {
    this.#limit = Math.max(1, limit);
  }

  schedule(task: Task): QueuedRender {
    const entry = { task, controller: new AbortController() };
    this.#waiting.push(entry);
    this.#next();
    return {
      cancel: () => {
        const index = this.#waiting.indexOf(entry);
        if (index >= 0) this.#waiting.splice(index, 1);
        entry.controller.abort();
      },
    };
  }

  #next(): void {
    while (this.#running < this.#limit && this.#waiting.length > 0) {
      const entry = this.#waiting.pop() as { task: Task; controller: AbortController };
      this.#running += 1;
      void entry
        .task(entry.controller.signal)
        .catch(() => {})
        .finally(() => {
          this.#running -= 1;
          this.#next();
        });
    }
  }
}
