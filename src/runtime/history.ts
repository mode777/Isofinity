/**
 * Undo/redo history for editor documents: a stack of command pairs with
 * do/undo inverses. Framework-agnostic and in-memory only — it never
 * reaches a saved file (ADR 0006: history is editor-session state).
 */
export interface HistoryCommand {
  /** Human-readable name (status-bar/debug use). */
  label: string;
  /** Re-apply the change (returns the world to the post-command state). */
  redo(): void;
  /** Take the change back (returns the world to the pre-command state). */
  undo(): void;
}

export class HistoryStack {
  private past: HistoryCommand[] = [];
  private future: HistoryCommand[] = [];

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Record a just-applied command; anything redoable is dropped. */
  push(cmd: HistoryCommand): void {
    this.past.push(cmd);
    this.future.length = 0;
  }

  /** Take the last command back; returns it, or null when nothing to undo. */
  undo(): HistoryCommand | null {
    const cmd = this.past.pop();
    if (!cmd) return null;
    cmd.undo();
    this.future.push(cmd);
    return cmd;
  }

  /** Re-apply the most recently undone command; null when nothing to redo. */
  redo(): HistoryCommand | null {
    const cmd = this.future.pop();
    if (!cmd) return null;
    cmd.redo();
    this.past.push(cmd);
    return cmd;
  }

  clear(): void {
    this.past.length = 0;
    this.future.length = 0;
  }
}
