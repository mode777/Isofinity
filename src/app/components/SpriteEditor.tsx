import { useEffect, useRef, useState } from 'react';
import type { BakeDocument } from '../document.js';
import {
  rgbaBytesToCanvas,
  rgbaToCanvas,
} from '../../bake/export.js';
import { depthRange } from '../../bake/iso.js';
import type { Vec3 } from '../../shared/iso.js';
import { placeInWorld } from '../store/world.js';
import { runAoPass, runRenderPass, saveSprite } from '../store/bake.js';
import { useEditor } from '../store/editor.js';
import { EditorToolbar } from './EditorToolbar.js';

type GBufferMode = 'normal' | 'depth';

/** Blit a computed source canvas into a sized display canvas. */
function blit(canvas: HTMLCanvasElement | null, src: HTMLCanvasElement): void {
  if (!canvas) return;
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, src.width, src.height);
  ctx.drawImage(src, 0, 0);
}

export function SpriteEditor(props: { doc: BakeDocument }): React.JSX.Element {
  const { doc } = props;
  const [mode, setMode] = useState<GBufferMode>('normal');
  const setStatus = useEditor((s) => s.setStatus);
  const albedoRef = useRef<HTMLCanvasElement>(null);
  const gbufferRef = useRef<HTMLCanvasElement>(null);
  const renderRef = useRef<HTMLCanvasElement>(null);
  const aoRef = useRef<HTMLCanvasElement>(null);

  const result = doc.result;

  const onSave = (): void => {
    const raw = window.prompt('Save sprite as', doc.title);
    if (raw === null) return;
    const name = raw.trim();
    if (!name) {
      setStatus('Sprite needs a name');
      return;
    }
    void saveSprite(doc.docId, name);
  };

  useEffect(() => {
    if (!result) return;
    blit(
      albedoRef.current,
      rgbaToCanvas(result.albedo, result.width, result.height, (r, g, b, a) => [r, g, b, a]),
    );
  }, [result]);

  useEffect(() => {
    if (!result) return;
    blit(
      gbufferRef.current,
      rgbaToCanvas(result.gbuffer, result.width, result.height, (r, g, b, a) => {
        const cov = Math.min(1, Math.sqrt(r * r + g * g + b * b));
        if (mode === 'depth') {
          const [lo, hi] = depthRange(result.size as Vec3);
          const t = (a - lo) / (hi - lo);
          return [t, t, t, cov];
        }
        return [r * 0.5 + 0.5, g * 0.5 + 0.5, b * 0.5 + 0.5, cov];
      }),
    );
  }, [result, mode]);

  useEffect(() => {
    if (!doc.render) return;
    blit(renderRef.current, rgbaBytesToCanvas(doc.render.rgba, doc.render.width, doc.render.height));
  }, [doc.render]);

  useEffect(() => {
    if (!doc.ao) return;
    blit(aoRef.current, rgbaBytesToCanvas(doc.ao.rgba, doc.ao.width, doc.ao.height));
  }, [doc.ao]);

  return (
    <div className="sprite-editor">
      <EditorToolbar>
        <button
          disabled={!doc.result}
          title="Save to the workspace's sprites/ folder — downloads the bundle when no workspace is connected"
          onClick={onSave}
        >
          Save
        </button>
        <button
          disabled={!doc.result || !doc.render}
          title="Place this sprite into a world document (in memory)"
          onClick={() => placeInWorld(doc.docId)}
        >
          Place in world
        </button>
      </EditorToolbar>
      {doc.viewOnly ? (
        <p className="viewonly">View-only — {doc.viewOnlyReason}</p>
      ) : null}
      <div className="passes">
        <figure>
          <canvas ref={albedoRef} />
          <figcaption>albedo</figcaption>
        </figure>
        <figure>
          <canvas ref={gbufferRef} />
          <figcaption>
            g-buffer (
            <button
              className={mode === 'normal' ? 'active' : ''}
              onClick={() => setMode('normal')}
            >
              normal
            </button>
            <button
              className={mode === 'depth' ? 'active' : ''}
              onClick={() => setMode('depth')}
            >
              depth
            </button>
            )
          </figcaption>
        </figure>
        <figure>
          <canvas ref={renderRef} className={doc.render ? '' : 'empty'} />
          <figcaption>
            render{' '}
            <button
              disabled={!result || doc.viewOnly || doc.busy || !doc.ptEnv.texture}
              title="Path-traced lit render pass"
              onClick={() => void runRenderPass(doc.docId)}
            >
              {doc.busy ? 'rendering…' : doc.render ? 're-render' : 'bake'}
            </button>
          </figcaption>
        </figure>
        <figure>
          <canvas ref={aoRef} className={doc.ao ? '' : 'empty'} />
          <figcaption>
            ao{' '}
            <button
              disabled={!result || doc.viewOnly || doc.busy}
              title="Path-traced ambient occlusion pass"
              onClick={() => void runAoPass(doc.docId)}
            >
              {doc.ao ? 're-run' : 'bake'}
            </button>
          </figcaption>
        </figure>
      </div>
      {doc.notes.length > 0 ? <p className="hint">skipped: {doc.notes.join(', ')}</p> : null}
    </div>
  );
}
