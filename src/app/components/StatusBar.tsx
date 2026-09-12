import { useEditor } from '../store/editor.js';

export function StatusBar(): React.JSX.Element {
  const status = useEditor((s) => s.status);
  const progress = useEditor((s) => s.progress);
  const pct = progress && progress.max > 0
    ? Math.round((progress.value / progress.max) * 100)
    : 0;
  return (
    <>
      <span className="status-text">{status}</span>
      {progress ? (
        <span
          className="load-progress"
          role="progressbar"
          aria-label={progress.label}
          aria-valuemin={0}
          aria-valuemax={progress.max}
          aria-valuenow={progress.value}
          title={progress.label}
        >
          <span className="load-progress-track">
            <span
              className="load-progress-fill"
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="load-progress-label">
            {progress.value}/{progress.max}
          </span>
        </span>
      ) : null}
    </>
  );
}
