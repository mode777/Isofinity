import { useRef } from 'react';
import type { WorldDocument } from '../document.js';
import {
  selectGroundMaterial,
  selectGroundMaterialFile,
  setGroundTileScale,
  setLayerShadowStrength,
  setLight,
  setSun,
  setWorldEnv,
  setWorldEnvFile,
} from '../store/world.js';
import { useProject } from '../store/project.js';
import { useWorkspace } from '../store/workspace.js';
import { CheckRow, ColorRow, NumberRow, Section, SliderRow } from './controls.js';

function formatHour(v: number): string {
  const h = Math.floor(v);
  const m = Math.round((v - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function WorldProperties(props: { doc: WorldDocument }): React.JSX.Element {
  const { doc } = props;
  const materials = useProject((s) => s.materials);
  const hdris = useProject((s) => s.hdris);
  const connected = useWorkspace((s) => s.state.kind) === 'connected';
  const materialInput = useRef<HTMLInputElement>(null);
  const hdriInput = useRef<HTMLInputElement>(null);

  const setSunHour = (hour: number): void => {
    setSun(doc.docId, { hour });
  };

  return (
    <>
      <Section title="Key light">
        <CheckRow
          label="Dynamic light"
          checked={doc.light.enabled}
          onChange={(v) => setLight(doc.docId, { enabled: v })}
        />
        <SliderRow
          label="Azimuth"
          value={doc.light.azimuthDeg}
          min={0}
          max={360}
          step={1}
          format={(v) => `${v}°`}
          onChange={(v) => setLight(doc.docId, { azimuthDeg: v })}
        />
        <SliderRow
          label="Elevation"
          value={doc.light.elevationDeg}
          min={5}
          max={85}
          step={1}
          format={(v) => `${v}°`}
          onChange={(v) => setLight(doc.docId, { elevationDeg: v })}
        />
        <SliderRow
          label="Intensity"
          value={doc.light.intensity}
          min={0}
          max={3}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => setLight(doc.docId, { intensity: v })}
        />
        <ColorRow
          label="Color"
          value={doc.light.colorHex}
          onChange={(v) => setLight(doc.docId, { colorHex: v })}
        />
        <ColorRow
          label="Ambient"
          value={doc.light.ambientHex}
          onChange={(v) => setLight(doc.docId, { ambientHex: v })}
        />
      </Section>

      <Section title="Sun position">
        <SliderRow
          label="Time of day"
          value={doc.sun.hour}
          min={0}
          max={24}
          step={0.25}
          format={formatHour}
          onChange={setSunHour}
        />
        <SliderRow
          label="Day of year"
          value={doc.sun.day}
          min={1}
          max={365}
          step={1}
          onChange={(v) => setSun(doc.docId, { day: v })}
        />
        <SliderRow
          label="Latitude"
          value={doc.sun.lat}
          min={-66}
          max={66}
          step={1}
          format={(v) => `${v}°`}
          onChange={(v) => setSun(doc.docId, { lat: v })}
        />
        <p className="hint">
          sun now: {Math.round(doc.light.azimuthDeg)}° / {Math.round(doc.light.elevationDeg)}°
        </p>
      </Section>

      <Section title="Environment">
        <button onClick={() => hdriInput.current?.click()}>Load HDRI file…</button>
        <input
          ref={hdriInput}
          type="file"
          accept=".hdr,.exr"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void setWorldEnvFile(file, doc.docId);
          }}
        />
        {connected ? (
          <select
            title="Workspace hdris"
            value={doc.userEnv?.kind === 'hdri' ? doc.userEnv.fileName : ''}
            onChange={(e) => setWorldEnv(doc.docId, e.target.value || null)}
          >
            <option value="">(inherit from sprites)</option>
            {hdris.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : null}
        <p className="hint">
          ambient:{' '}
          {doc.userEnv
            ? doc.userEnv.kind === 'hdri'
              ? doc.userEnv.fileName
              : 'procedural sky'
            : doc.env
              ? doc.env.kind === 'hdri'
                ? `${doc.env.fileName} (from sprites)`
                : 'procedural sky (from sprites)'
              : 'procedural sky'}
        </p>
      </Section>

      <Section title="Ground">
        {connected ? (
          <select
            title="Workspace materials"
            value={doc.ground.material ?? ''}
            onChange={(e) => {
              const name = e.target.value;
              if (name) void selectGroundMaterial(name, doc.docId);
            }}
          >
            <option value="">(checkerboard)</option>
            {materials.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : (
          <>
            <button onClick={() => materialInput.current?.click()}>
              Load material file…
            </button>
            <input
              ref={materialInput}
              type="file"
              accept=".material,.zip"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void selectGroundMaterialFile(file, doc.docId);
              }}
            />
          </>
        )}
        <NumberRow
          label="Tile scale"
          value={Number(doc.ground.tileScale.toFixed(4))}
          min={0.01}
          max={100}
          onChange={(v) => setGroundTileScale(doc.docId, v)}
          disabled={!doc.ground.maps}
        />
        {doc.ground.material ? (
          <p className="hint">material: {doc.ground.material}</p>
        ) : (
          <p className="hint">
            pick a .material zip from materials/ — diffuse required (diff or
            diffuse), normal and AO optional
          </p>
        )}
      </Section>

      {doc.layers.length > 0 ? (
        <Section title="Grounding shadows">
          {doc.layers.map((layer) => (
            <SliderRow
              key={layer.id}
              label={layer.id}
              value={doc.shadowStrength[layer.id] ?? 1}
              min={0}
              max={1}
              step={0.05}
              format={(v) => (v === 0 ? 'off' : `${Math.round(v * 100)}%`)}
              onChange={(v) => setLayerShadowStrength(doc.docId, layer.id, v)}
            />
          ))}
          <p className="hint">
            per-sprite strength of the baked grounding shadow — 0 turns it
            off; per-document, not saved
          </p>
        </Section>
      ) : null}
    </>
  );
}
