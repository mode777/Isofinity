import { useRef } from 'react';
import type { WorldDocument } from '../document.js';
import {
  selectGroundMaterial,
  selectGroundMaterialFile,
  selectLight,
  setGroundTileScale,
  setLight,
  setLightPlacement,
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

  const selectedLight =
    doc.selectedLightId !== null ? doc.world.lightAt(doc.selectedLightId) : null;

  return (
    <>
      {selectedLight ? (
        <Section title="Point light">
          <SliderRow
            label="Radius"
            value={selectedLight.radius}
            min={0.5}
            max={16}
            step={0.1}
            format={(v) => `${v.toFixed(1)} u`}
            onChange={(v) => setLightPlacement(doc.docId, selectedLight.id, { radius: v })}
          />
          <SliderRow
            label="Energy"
            value={selectedLight.energy}
            min={0}
            max={4}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={(v) => setLightPlacement(doc.docId, selectedLight.id, { energy: v })}
          />
          <ColorRow
            label="Color"
            value={selectedLight.colorHex}
            onChange={(v) => setLightPlacement(doc.docId, selectedLight.id, { colorHex: v })}
          />
          <NumberRow
            label="Position x"
            value={Number((selectedLight.x + 0.5).toFixed(3))}
            min={-99}
            max={99}
            onChange={(v) => setLightPlacement(doc.docId, selectedLight.id, { x: v - 0.5 })}
          />
          <NumberRow
            label="Position z"
            value={Number((selectedLight.z + 0.5).toFixed(3))}
            min={-99}
            max={99}
            onChange={(v) => setLightPlacement(doc.docId, selectedLight.id, { z: v - 0.5 })}
          />
          <NumberRow
            label="Height"
            value={Number(selectedLight.y.toFixed(3))}
            min={-99}
            max={99}
            onChange={(v) => setLightPlacement(doc.docId, selectedLight.id, { y: v })}
          />
          <button onClick={() => selectLight(doc.docId, null)}>Deselect</button>
          <p className="hint">light tool: click a light to select, elsewhere to place</p>
        </Section>
      ) : null}

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
    </>
  );
}
