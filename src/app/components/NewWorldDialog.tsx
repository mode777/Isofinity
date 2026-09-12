import { useState } from 'react';
import { clampGroundSize, DEFAULT_GROUND_DEPTH, DEFAULT_GROUND_WIDTH } from '../document.js';

/**
 * The new-world ground-size dialog: two whole-unit fields (1–128 per
 * axis, defaults 12 × 12), clamped on accept; blank or non-numeric input
 * falls back to the field's default. Accepting creates the world;
 * cancelling, closing, or pressing Escape creates nothing.
 */
export function NewWorldDialog(props: {
  onCreate: (width: number, depth: number) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [width, setWidth] = useState(String(DEFAULT_GROUND_WIDTH));
  const [depth, setDepth] = useState(String(DEFAULT_GROUND_DEPTH));

  const clampField = (value: string, fallback: number): number =>
    clampGroundSize(value.trim() === '' ? NaN : Number(value), fallback);

  const accept = (): void => {
    props.onCreate(clampField(width, DEFAULT_GROUND_WIDTH), clampField(depth, DEFAULT_GROUND_DEPTH));
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') props.onClose();
      }}
    >
      <div className="new-world-dialog" role="dialog" aria-label="New world">
        <div className="file-dialog-head">
          <span>New world</span>
          <button className="file-dialog-close" aria-label="Close" onClick={props.onClose}>
            ×
          </button>
        </div>
        <div className="new-world-body">
          <label className="row">
            <span className="row-label">Width</span>
            <input
              type="number"
              min={1}
              max={128}
              step={1}
              autoFocus
              aria-label="Ground width (world units)"
              title="Ground plane extent along +x, in world units (1–128)"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') accept();
              }}
            />
          </label>
          <label className="row">
            <span className="row-label">Depth</span>
            <input
              type="number"
              min={1}
              max={128}
              step={1}
              aria-label="Ground depth (world units)"
              title="Ground plane extent along +z, in world units (1–128)"
              value={depth}
              onChange={(e) => setDepth(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') accept();
              }}
            />
          </label>
          <p className="hint">ground plane size in world units (1–128)</p>
          <div className="new-world-actions">
            <button onClick={props.onClose}>Cancel</button>
            <button onClick={accept}>Create</button>
          </div>
        </div>
      </div>
    </div>
  );
}
