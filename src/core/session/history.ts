import type { PdfCommand } from "../operations/commands.js";

/** One undoable step: the commands it ran, and the commands that undo them. */
export interface HistoryStep {
  readonly commands: readonly PdfCommand[];
  readonly inverses: readonly PdfCommand[];
}

/**
 * Undo and redo stacks of command steps (ADR 0010). Steps are small plain
 * data, because edits change the plan, not bytes (docs/adr/0003). The
 * session drops steps when the documents they refer to need too much memory
 * (docs/adr/0004).
 *
 * @internal
 */
export class History {
  #past: HistoryStep[] = [];
  #future: HistoryStep[] = [];
  #trimmed = false;

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  /** Whether steps were dropped to save memory since the history was cleared. */
  get trimmed(): boolean {
    return this.#trimmed;
  }

  /** Every step, undoable and redoable. */
  get steps(): readonly HistoryStep[] {
    return [...this.#past, ...this.#future];
  }

  /**
   * The order steps are dropped in to save memory, so the steps that remain
   * can always still be applied: first the redo steps, from the one redo
   * would reach last, then the undo steps, oldest first.
   */
  get dropOrder(): readonly HistoryStep[] {
    // Both stacks keep their far end, the step reached last, at index 0.
    return [...this.#future, ...this.#past];
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

  /** Drops the first `count` steps of {@link History.dropOrder}. */
  drop(count: number): void {
    if (count <= 0) return;
    const fromFuture = Math.min(count, this.#future.length);
    this.#future.splice(0, fromFuture);
    this.#past.splice(0, count - fromFuture);
    this.#trimmed = true;
  }

  clear(): void {
    this.#past = [];
    this.#future = [];
    this.#trimmed = false;
  }
}
