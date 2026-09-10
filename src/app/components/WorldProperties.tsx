import { useRef } from 'react';
import type { ViewSlot } from '../../shared/iso.js';
import type { WorldDocument } from '../document.js';
import {
  POINT_LIGHT_TOOL_ID,
  SELECT_TOOL_ID,
  brushDirections,
  clearSelection,
  patchMesh,
  patchSprite,
  removeLight,
  selectGroundMaterial,
  selectGroundMaterialFile,
  selectLight,
  setBrushDir,
  setGroundTileScale,
  setHeightLevel,
  setLight,
  setLightPlacement,
  setShadowLevel,
  setSun,
  setWorldEnv,
  setWorldEnvFile,
} from '../store/world.js';
import { useProject } from '../store/project.js';
import { useWorkspace } from '../store/workspace.js';
import { CheckRow, ColorRow, NumberRow, PreciseNumberRow, Section, SliderRow } from './controls.js';

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
    doc.selection?.kind === 'light' ? doc.world.lightAt(doc.selection.id) : null;
  const selectedSprite =
    doc.selection?.kind === 'sprite' ? doc.world.placementAt(doc.selection.id) : null;
  const selectedMesh =
    doc.selection?.kind === 'mesh' ? doc.world.meshAt(doc.selection.id) : null;
  const placedLights = doc.world.listLights();

  const brushDirs = brushDirections(doc, doc.tool);
  const multiView = brushDirs.length > 1;
  const dirValue = brushDirs.includes(doc.brushDir) ? doc.brushDir : brushDirs[0] ?? 'n';
  const noBrush =
    doc.tool === '' ||
    doc.tool === 'eraser' ||
    doc.tool === SELECT_TOOL_ID ||
    doc.tool === POINT_LIGHT_TOOL_ID;

  return (
    <>
      <Section title="Brush">
        {noBrush ? (
          <p className="hint">no placement brush active — pick one in the toolbar</p>
        ) : (
          <p className="hint">brush: {doc.tool}</p>
        )}
        {doc.surfaceSnap ? (
          <label className="row">
            <span className="row-label">Height (snap)</span>
            <input
              className="value-input"
              type="text"
              aria-label="Placement height (surface snap)"
              value={(doc.snappedHeight ?? doc.heightLevel).toFixed(2)}
              readOnly
              tabIndex={-1}
            />
          </label>
        ) : (
          <PreciseNumberRow
            label="Height"
            value={doc.heightLevel}
            onCommit={(v) => setHeightLevel(doc.docId, v)}
          />
        )}
        <SliderRow
          label="Shadow"
          value={doc.shadowLevel}
          min={0}
          max={1}
          step={0.01}
          format={(v) => v.toFixed(2)}
          onChange={(v) => setShadowLevel(doc.docId, v)}
        />
        <label className="row">
          <span className="row-label">Direction</span>
          <select
            aria-label="Brush direction"
            title="Brush direction — which way the brush faces; E cycles the available directions"
            value={dirValue}
            disabled={!multiView}
            onChange={(e) => {
              e.currentTarget.blur();
              setBrushDir(doc.docId, e.target.value as ViewSlot);
            }}
          >
            {(brushDirs.length > 0 ? brushDirs : ['n' as ViewSlot]).map((slot) => (
              <option key={slot} value={slot}>
                {slot.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <p className="hint">
          height and shadow apply to the next placements; direction needs a
          multi-view sprite
        </p>
      </Section>

      {selectedSprite ? (
        <Section title="Sprite">
          <p className="hint">
            {selectedSprite.primId}
            {selectedSprite.dir !== 'n' ? ` (${selectedSprite.dir.toUpperCase()})` : ''}
          </p>
          <NumberRow
            label="Position x"
            value={Number(selectedSprite.x.toFixed(3))}
            min={-999}
            max={999}
            onChange={(v) => patchSprite(doc.docId, selectedSprite.id, { x: v })}
          />
          <NumberRow
            label="Position z"
            value={Number(selectedSprite.z.toFixed(3))}
            min={-999}
            max={999}
            onChange={(v) => patchSprite(doc.docId, selectedSprite.id, { z: v })}
          />
          <PreciseNumberRow
            label="Height"
            value={Number(selectedSprite.y.toFixed(3))}
            onCommit={(v) => patchSprite(doc.docId, selectedSprite.id, { y: v })}
          />
          <SliderRow
            label="Shadow"
            value={selectedSprite.shadow}
            min={0}
            max={1}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchSprite(doc.docId, selectedSprite.id, { shadow: v })}
          />
          <button onClick={() => clearSelection(doc.docId)}>Deselect</button>
        </Section>
      ) : null}

      {selectedMesh ? (
        <Section title="Character">
          <NumberRow
            label="Position x"
            value={Number(selectedMesh.x.toFixed(3))}
            min={-999}
            max={999}
            onChange={(v) => patchMesh(doc.docId, selectedMesh.id, { x: v })}
          />
          <NumberRow
            label="Position z"
            value={Number(selectedMesh.z.toFixed(3))}
            min={-999}
            max={999}
            onChange={(v) => patchMesh(doc.docId, selectedMesh.id, { z: v })}
          />
          <PreciseNumberRow
            label="Height"
            value={Number(selectedMesh.y.toFixed(3))}
            onCommit={(v) => patchMesh(doc.docId, selectedMesh.id, { y: v })}
          />
          <button onClick={() => clearSelection(doc.docId)}>Deselect</button>
        </Section>
      ) : null}

      <Section title="Point lights">
        {placedLights.length === 0 ? (
          <p className="hint">none placed — pick the Light tool and click the world</p>
        ) : (
          placedLights.map((l) => (
            <div
              key={l.id}
              style={{ display: 'flex', gap: 4, alignItems: 'stretch' }}
            >
              <button
                style={{ flex: 1, textAlign: 'left' }}
                className={
                  doc.selection?.kind === 'light' && doc.selection.id === l.id ? 'active' : ''
                }
                title="Select this light (edits below, highlight ring in the viewport)"
                onClick={() => selectLight(doc.docId, l.id)}
              >
                ({(l.x + 0.5).toFixed(1)}, {l.y.toFixed(1)}, {(l.z + 0.5).toFixed(1)})
                {' · r'}{l.radius.toFixed(1)}
              </button>
              <button
                title="Delete this light"
                onClick={() => removeLight(doc.docId, l.id)}
              >
                ×
              </button>
            </div>
          ))
        )}
      </Section>

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
            max={40}
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
          <p className="hint">pick a light above or click one in the viewport with the Light tool</p>
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
