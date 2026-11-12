import type { PdfCommand } from "../operations/commands.js";

/** One undoable step: the commands it ran, and the commands that undo them. */
export interface HistoryStep {
  readonly commands: readonly PdfCommand[];
  readonly inverses: readonly PdfCommand[];
}

/**
 * Undo and redo stacks of command steps (ADR 0010). Steps are small plain
 * data, because edits change the plan, not bytes (docs/adr/0003).
 *
 * @internal
 */
export class History {
  #past: HistoryStep[] = [];
  #future: HistoryStep[] = [];

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  /** Records a new step. Anything that could be redone is dropped. */
  push(step: HistoryStep): void {
    this.#past.push(step);
    this.#future = [];
  }

  /** The step to undo, moved to the redo stack, if there is one. */
  undo(): HistoryStep | undefined {
    const step = this.#past.pop();
    if (step) this.#future.push(step);
    return step;
  }

  /** The step to redo, moved back to the undo stack, if there is one. */
  redo(): HistoryStep | undefined {
    const step = this.#future.pop();
    if (step) this.#past.push(step);
    return step;
  }

  /** Puts a step back after it failed to apply. */
  restore(direction: "undo" | "redo"): void {
    if (direction === "undo") {
      const step = this.#future.pop();
      if (step) this.#past.push(step);
    } else {
      const step = this.#past.pop();
      if (step) this.#future.push(step);
    }
  }

  clear(): void {
    this.#past = [];
    this.#future = [];
  }
}
