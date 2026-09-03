import type { BakeDocument } from '../document.js';
import { useRef } from 'react';
import {
  bakeRaster,
  downloadPositionDebug,
  loadHdriFile,
  loadHdriFromWorkspace,
  runAoPass,
  runRenderPass,
  setEnvParams,
  setModelScale,
  setSettings,
} from '../store/bake.js';
import { useProject } from '../store/project.js';
import { useWorkspace } from '../store/workspace.js';
import { NumberRow, Section, SliderRow } from './controls.js';

export function SpriteProperties(props: { doc: BakeDocument }): React.JSX.Element {
  const { doc } = props;
  const hdriInput = useRef<HTMLInputElement>(null);
  const connected = useWorkspace((s) => s.state.kind) === 'connected';
  const hdris = useProject((s) => s.hdris);

  const env = doc.ptEnv;

  return (
    <>
      <Section title="Source">
        <p className="hint">
          {doc.title} —{' '}
          {doc.source?.kind === 'model'
            ? `model ${doc.source.fileName} (scale ${doc.scale})`
            : doc.source?.kind === 'primitive'
              ? `built-in ${doc.source.primitive}`
              : 'unknown (no provenance)'}
        </p>
        {doc.source?.kind === 'model' ? (
          <NumberRow
            label="Scale"
            value={doc.scale}
            min={0.01}
            max={1000}
            onChange={(v) => setModelScale(doc.docId, v)}
            disabled={doc.viewOnly}
          />
        ) : null}
        <button
          disabled={doc.viewOnly || !doc.source}
          onClick={() => bakeRaster(doc.docId)}
        >
          Re-bake raster
        </button>
      </Section>

      <Section title="Path tracing">
        <SliderRow
          label="Samples"
          value={doc.settings.samples}
          min={16}
          max={4096}
          step={16}
          onChange={(v) => setSettings(doc.docId, { samples: v })}
          disabled={doc.viewOnly}
        />
        <SliderRow
          label="Bounces"
          value={doc.settings.bounces}
          min={1}
          max={16}
          step={1}
          onChange={(v) => setSettings(doc.docId, { bounces: v })}
          disabled={doc.viewOnly}
        />
        <SliderRow
          label="Texture size"
          value={doc.settings.textureSize}
          min={256}
          max={4096}
          step={256}
          onChange={(v) => setSettings(doc.docId, { textureSize: v })}
          disabled={doc.viewOnly}
        />
        <SliderRow
          label="AO samples"
          value={doc.settings.aoSamples}
          min={4}
          max={1024}
          step={4}
          onChange={(v) => setSettings(doc.docId, { aoSamples: v })}
          disabled={doc.viewOnly}
        />
        <SliderRow
          label="AO radius"
          value={doc.settings.aoRadius}
          min={0.05}
          max={2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => setSettings(doc.docId, { aoRadius: v })}
          disabled={doc.viewOnly}
        />
      </Section>

      <Section title="Environment">
        <button disabled={doc.viewOnly} onClick={() => hdriInput.current?.click()}>
          Load HDRI file…
        </button>
        <input
          ref={hdriInput}
          type="file"
          accept=".hdr,.exr"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void loadHdriFile(doc.docId, file);
          }}
        />
        {connected ? (
          <select
            title="Workspace hdris"
            value={doc.env.kind === 'hdri' ? doc.env.fileName : ''}
            disabled={doc.viewOnly}
            onChange={(e) => {
              if (e.target.value) void loadHdriFromWorkspace(doc.docId, e.target.value);
            }}
          >
            <option value="">workspace hdris…</option>
            {hdris.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : null}
        <p className="hint">
          active: {doc.env.kind === 'hdri' ? doc.env.fileName : 'procedural sky'}
        </p>
        <SliderRow
          label="Rotate"
          value={env.rotationDeg}
          min={0}
          max={360}
          step={1}
          format={(v) => `${v}°`}
          onChange={(v) => setEnvParams(doc.docId, { rotationDeg: v })}
          disabled={doc.viewOnly}
        />
        <SliderRow
          label="Intensity"
          value={env.intensity}
          min={0}
          max={10}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => setEnvParams(doc.docId, { intensity: v })}
          disabled={doc.viewOnly}
        />
        <SliderRow
          label="Exposure"
          value={env.exposure}
          min={0.1}
          max={4}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => setEnvParams(doc.docId, { exposure: v })}
          disabled={doc.viewOnly}
        />
        <SliderRow
          label="Saturation"
          value={env.saturation}
          min={0}
          max={2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => setEnvParams(doc.docId, { saturation: v })}
          disabled={doc.viewOnly}
        />
        <button
          disabled={!doc.result || doc.viewOnly || doc.busy || !env.texture}
          title="Render the lit pass with the current environment"
          onClick={() => void runRenderPass(doc.docId)}
        >
          {doc.busy ? 'Rendering…' : doc.render ? 'Re-render pass' : 'Bake render pass'}
        </button>
        <button
          disabled={!doc.result || doc.viewOnly || doc.busy}
          title="Ambient occlusion pass"
          onClick={() => void runAoPass(doc.docId)}
        >
          {doc.ao ? 'Re-run AO pass' : 'Bake AO pass'}
        </button>
      </Section>

      <Section title="Debug">
        <button disabled={!doc.result} onClick={() => downloadPositionDebug(doc.docId)}>
          Download position debug
        </button>
      </Section>

      {doc.viewOnly ? (
        <Section title="View-only">
          <p className="hint">{doc.viewOnlyReason}</p>
        </Section>
      ) : null}
    </>
  );
}
