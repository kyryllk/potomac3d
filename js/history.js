// Undo/redo history. Each command stores the before/after snapshots of just the
// object ids it touched, so undo/redo is surgical (multiplayer-safe) and replays
// through the editor's normal apply path.
const COALESCE_MS = 600;

export class History {
  constructor(apply, onChange = () => {}) {
    this.apply = apply;          // (objs, ids) => void  — restore those ids to `objs`
    this.onChange = onChange;    // called whenever the stacks change (updates buttons)
    this.undoStack = [];
    this.redoStack = [];
    this.limit = 150;
  }

  record({ op, ids, before, after, coalesce = false }) {
    const top = this.undoStack[this.undoStack.length - 1];
    const sameOne = top && top.op === op && top.ids.length === 1 && ids.length === 1 && top.ids[0] === ids[0];
    if (coalesce && sameOne && Date.now() - top.t < COALESCE_MS) {
      top.after = after; top.t = Date.now();          // keep original `before`, extend `after`
    } else {
      this.undoStack.push({ op, ids, before, after, t: Date.now() });
      if (this.undoStack.length > this.limit) this.undoStack.shift();
    }
    this.redoStack.length = 0;
    this.onChange();
  }

  undo() {
    const c = this.undoStack.pop();
    if (!c) return;
    this.apply(c.before, c.ids);
    this.redoStack.push(c);
    this.onChange();
  }

  redo() {
    const c = this.redoStack.pop();
    if (!c) return;
    this.apply(c.after, c.ids);
    this.undoStack.push(c);
    this.onChange();
  }

  clear() { this.undoStack.length = 0; this.redoStack.length = 0; this.onChange(); }
  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }
}
