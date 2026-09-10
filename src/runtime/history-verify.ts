/**
 * Node-runnable self-check for the undo/redo history stack (run via
 * `npm run verify:history`). Covers push/undo/redo ordering, canUndo/
 * canRedo flags, redo invalidation on a new command, and clear().
 */
import { HistoryStack, type HistoryCommand } from './history.js';

let failures = 0;
const check = (name: string, ok: boolean): void => {
  if (!ok) {
    failures++;
    console.error(`FAIL: ${name}`);
  } else {
    console.log(`ok: ${name}`);
  }
};

/** A command that appends/removes its name from a shared log. */
const makeCmd = (log: string[], name: string): HistoryCommand => ({
  label: name,
  redo: () => void log.push(name),
  undo: () => {
    const k = log.lastIndexOf(name);
    if (k >= 0) log.splice(k, 1);
  },
});

{
  const log: string[] = [];
  const h = new HistoryStack();
  check('fresh stack: cannot undo/redo', !h.canUndo && !h.canRedo);
  check('undo on empty stack is null', h.undo() === null);
  check('redo on empty stack is null', h.redo() === null);

  h.push(makeCmd(log, 'a'));
  h.push(makeCmd(log, 'b'));
  h.push(makeCmd(log, 'c'));
  log.push('a', 'b', 'c');
  check('after 3 pushes: can undo, cannot redo', h.canUndo && !h.canRedo);

  check('undo returns the last command', h.undo()?.label === 'c');
  check('undo reverted the last append', log.join(',') === 'a,b');
  check('after undo: can redo', h.canRedo);

  check('redo re-applies', h.redo()?.label === 'c');
  check('redo restored the append', log.join(',') === 'a,b,c');
  check('back at the tip: cannot redo', !h.canRedo);

  h.undo();
  h.undo();
  check('two undos unwind in order', log.join(',') === 'a');
  h.push(makeCmd(log, 'd'));
  log.push('d');
  check('new command drops the redo stack', !h.canRedo && h.canUndo);
  check('redone commands cannot come back', h.redo() === null);

  h.undo();
  h.undo();
  h.undo();
  check('undo to empty', log.length === 0 && !h.canUndo);

  h.push(makeCmd(log, 'x'));
  h.clear();
  check('clear empties both stacks', !h.canUndo && !h.canRedo);
}

if (failures > 0) {
  throw new Error(`${failures} check(s) failed`);
}
console.log('history-verify: all checks passed');
