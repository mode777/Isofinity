import type { BakeDocument } from '../document.js';
import { useRef, useState } from 'react';
import { MAX_SPRITE_PX, PAD_PX, PX_PER_UNIT } from '../../bake/bake.js';
import { projectBoxFrame } from '../../bake/iso.js';
import {
  applyWorkspacePreset,
  bakeRaster,
  deletePreset,
  downloadPositionDebug,
  importPresetFile,
  loadHdriFile,
  loadHdriFromWorkspace,
  runRenderPass,
  savePreset,
  setEnvParams,
  setModelHeight,
  setModelScale,
  setSettings,
} from '../store/bake.js';
import { useProject } from '../store/project.js';
import { useWorkspace } from '../store/workspace.js';
import { NumberRow, Section, SliderRow } from './controls.js';

function PresetsSection(props: { doc: BakeDocument }): React.JSX.Element {
  const { doc } = props;
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const presets = useProject((s) => s.presets);

  const save = (): void => {
    void savePreset(doc.docId, name);
    setName('');
  };
  const importFiles = (files: FileList | null): void => {
    const file = files?.[0];
    if (file) void importPresetFile(doc.docId, file);
  };

  return (
    <Section title="Presets">
      <div
        className="preset-drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          importFiles(e.dataTransfer.files);
        }}
      >
        <div className="preset-save">
          <input
            type="text"
            placeholder="preset name…"
            aria-label="Preset name"
            value={name}
            disabled={doc.viewOnly}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) save();
            }}
          />
          <button disabled={doc.viewOnly || !name.trim()} onClick={save}>
            Save preset
          </button>
        </div>
        <select
          title="Workspace presets"
          value={selected}
          disabled={doc.viewOnly}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">
            {presets.length > 0 ? 'workspace presets…' : 'no presets in the workspace'}
          </option>
          {presets.map((n) => (
            <option key={n} value={n}>
              {n.replace(/\.json$/i, '')}
            </option>
          ))}
        </select>
        <div className="preset-actions">
          <button
            disabled={doc.viewOnly || !selected}
            onClick={() => void applyWorkspacePreset(doc.docId, selected)}
          >
            Apply
          </button>
          <button
            disabled={!selected}
            onClick={() => {
              void deletePreset(selected);
              setSelected('');
            }}
          >
            Delete
          </button>
          <button disabled={doc.viewOnly} onClick={() => fileInput.current?.click()}>
            Import file…
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const files = e.target.files;
            e.target.value = '';
            importFiles(files);
          }}
        />
        <p className="hint">
          presets store samples, bounces and the environment — texture size stays per-document
        </p>
      </div>
    </Section>
  );
}

export function SpriteProperties(props: { doc: BakeDocument }): React.JSX.Element {
  const { doc } = props;
  const hdriInput = useRef<HTMLInputElement>(null);
  const connected = useWorkspace((s) => s.state.kind) === 'connected';
  const hdris = useProject((s) => s.hdris);

  const env = doc.ptEnv;

  const modelExtent = doc.source?.kind === 'model' ? (doc.gltf?.extent ?? null) : null;
  const spritePx = modelExtent
    ? projectBoxFrame(
        [
          modelExtent[0] * doc.scale,
          modelExtent[1] * doc.scale,
          modelExtent[2] * doc.scale,
        ],
        PX_PER_UNIT,
        PAD_PX,
      )
    : null;
  const overCap =
    spritePx !== null &&
    (spritePx.width > MAX_SPRITE_PX || spritePx.height > MAX_SPRITE_PX);
  const fmt = (v: number): string => String(Number(v.toFixed(3)));

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
          <>
            <NumberRow
              label="Scale"
              value={Number(doc.scale.toFixed(4))}
              min={0.01}
              max={1000}
              onChange={(v) => setModelScale(doc.docId, v)}
              disabled={doc.viewOnly}
            />
            {modelExtent && spritePx ? (
              <>
                <NumberRow
                  label="Height (m)"
                  value={Number((doc.scale * modelExtent[1]).toFixed(4))}
                  min={0.01}
                  max={1000}
                  onChange={(v) => setModelHeight(doc.docId, v)}
                  disabled={doc.viewOnly}
                />
                <p className="hint">
                  native size {fmt(modelExtent[0])} x {fmt(modelExtent[1])} x{' '}
                  {fmt(modelExtent[2])} file units — bakes to {spritePx.width} x{' '}
                  {spritePx.height} px
                </p>
                {overCap ? (
                  <p className="hint">
                    sprite {spritePx.width} x {spritePx.height} px exceeds the{' '}
                    {MAX_SPRITE_PX} px cap — lower the height
                  </p>
                ) : null}
              </>
            ) : null}
          </>
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
      </Section>

      <PresetsSection doc={doc} />

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
