import { useRef } from 'react';
import type { ViewSlot } from '../../shared/iso.js';
import type { WorldDocument } from '../document.js';
import {
  PAINT_HARDNESS_MAX,
  PAINT_HARDNESS_MIN,
  PAINT_HARDNESS_STEP,
  PAINT_OPACITY_MAX,
  PAINT_OPACITY_MIN,
  PAINT_OPACITY_STEP,
} from '../document.js';
import {
  POINT_LIGHT_TOOL_ID,
  SELECT_TOOL_ID,
  TERRAIN_PAINT_TOOL_ID,
  brushDirections,
  clearGroundMaterial,
  clearSelection,
  eraseRef,
  patchMesh,
  patchSprite,
  removeLight,
  selectGroundMaterial,
  selectGroundMaterialFile,
  selectLight,
  setBrushDir,
  setGroundSize,
  setGroundTileScale,
  setHeightLevel,
  setLight,
  setLightPlacement,
  setPaintBrush,
  setShadowLevel,
  setSpriteDir,
  setSun,
  setWorldEnv,
  setWorldEnvFile,
} from '../store/world.js';
import { useProject } from '../store/project.js';
import { useWorkspace } from '../store/workspace.js';
import {
  CheckRow,
  ColorRow,
  HEIGHT_SLIDER_MAX,
  HEIGHT_SLIDER_MIN,
  HEIGHT_SLIDER_STEP,
  NumberRow,
  PreciseNumberRow,
  Section,
  SliderRow,
} from './controls.js';

const HEIGHT_SLIDER = {
  min: HEIGHT_SLIDER_MIN,
  max: HEIGHT_SLIDER_MAX,
  step: HEIGHT_SLIDER_STEP,
};

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
  const selectActive = doc.tool === SELECT_TOOL_ID;
  const selectedSprite =
    selectActive && doc.selection?.kind === 'sprite'
      ? doc.world.placementAt(doc.selection.id)
      : null;
  const selectedMesh =
    selectActive && doc.selection?.kind === 'mesh'
      ? doc.world.meshAt(doc.selection.id)
      : null;
  const placedLights = doc.world.listLights();

  const brushDirs = brushDirections(doc, doc.tool);
  const multiView = brushDirs.length > 1;
  const dirValue = brushDirs.includes(doc.brushDir) ? doc.brushDir : brushDirs[0] ?? 'n';
  const spriteDirs = selectedSprite ? brushDirections(doc, selectedSprite.primId) : [];
  const noBrush =
    doc.tool === '' ||
    doc.tool === 'eraser' ||
    doc.tool === SELECT_TOOL_ID ||
    doc.tool === POINT_LIGHT_TOOL_ID ||
    doc.tool === TERRAIN_PAINT_TOOL_ID;

  return (
    <>
      {doc.tool === TERRAIN_PAINT_TOOL_ID ? (
        <Section title="Paint">
          <p className="hint">
            {doc.ground.materials[doc.paintSlot]
              ? `active slot ${doc.paintSlot + 1}: ${doc.ground.materials[doc.paintSlot]}`
              : `active slot ${doc.paintSlot + 1} has no material`}
          </p>
          <SliderRow
            label="Radius"
            value={doc.paintRadius}
            min={0.25}
            max={16}
            step={0.05}
            format={(v) => `${v.toFixed(2)} u`}
            onChange={(v) => setPaintBrush(doc.docId, { radius: v })}
          />
          <SliderRow
            label="Hardness"
            value={doc.paintHardness}
            min={PAINT_HARDNESS_MIN}
            max={PAINT_HARDNESS_MAX}
            step={PAINT_HARDNESS_STEP}
            format={(v) => v.toFixed(4)}
            onChange={(v) => setPaintBrush(doc.docId, { hardness: v })}
          />
          <SliderRow
            label="Opacity"
            value={doc.paintOpacity}
            min={PAINT_OPACITY_MIN}
            max={PAINT_OPACITY_MAX}
            step={PAINT_OPACITY_STEP}
            format={(v) => v.toFixed(2)}
            onChange={(v) => setPaintBrush(doc.docId, { opacity: v })}
          />
          <CheckRow
            label="Accumulate"
            checked={doc.paintAccumulate}
            onChange={(v) => setPaintBrush(doc.docId, { accumulate: v })}
          />
          <p className="hint">
            {doc.paintAccumulate
              ? 'accumulate: dabs build up as you keep painting'
              : 'opacity caps a single stroke; enable Accumulate to build up'}
          </p>
          <label className="row">
            <span className="row-label">Slot</span>
            <select
              aria-label="Paint material slot"
              title="The material slot the brush paints"
              value={doc.paintSlot}
              onChange={(e) => {
                e.currentTarget.blur();
                setPaintBrush(doc.docId, { slot: Number(e.target.value) });
              }}
            >
              {doc.ground.materials.map((m, slot) => (
                <option key={slot} value={slot}>
                  {`Slot ${slot + 1}${m ? `: ${m}` : ' (none)'}`}
                </option>
              ))}
            </select>
          </label>
          {!doc.ground.materials.some((m) => !!m) ? (
            <p className="hint">bind a material in the Ground section first</p>
          ) : null}
        </Section>
      ) : null}

      {!noBrush ? (
        <Section title="Brush">
          <p className="hint">brush: {doc.tool}</p>
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
              slider={HEIGHT_SLIDER}
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
      ) : null}

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
            slider={HEIGHT_SLIDER}
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
          {spriteDirs.length > 0 ? (
            <label className="row">
              <span className="row-label">Direction</span>
              <select
                aria-label="Sprite direction"
                title="Facing — the placement's baked view; E also cycles it"
                value={selectedSprite.dir}
                disabled={spriteDirs.length < 2}
                onChange={(e) => {
                  e.currentTarget.blur();
                  setSpriteDir(doc.docId, selectedSprite.id, e.target.value as ViewSlot);
                }}
              >
                {spriteDirs.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              style={{ flex: 1 }}
              onClick={() => clearSelection(doc.docId)}
            >
              Deselect
            </button>
            <button
              style={{ flex: 1 }}
              title="Delete this sprite placement (undoable)"
              onClick={() =>
                eraseRef(doc.docId, { kind: 'sprite', id: selectedSprite.id })
              }
            >
              Delete
            </button>
          </div>
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
            slider={HEIGHT_SLIDER}
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
          <PreciseNumberRow
            label="Height"
            value={Number(selectedLight.y.toFixed(3))}
            slider={HEIGHT_SLIDER}
            onCommit={(v) => setLightPlacement(doc.docId, selectedLight.id, { y: v })}
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
        <PreciseNumberRow
          label="Width"
          value={doc.ground.width}
          min={1}
          max={128}
          onCommit={(v) => setGroundSize(doc.docId, v, doc.ground.depth)}
        />
        <PreciseNumberRow
          label="Depth"
          value={doc.ground.depth}
          min={1}
          max={128}
          onCommit={(v) => setGroundSize(doc.docId, doc.ground.width, v)}
        />
        <p className="hint">
          ground plane size in world units (1–128); resizing keeps the
          origin corner and never removes placements
        </p>
        {connected ? (
          <>
            {doc.ground.materials.map((name, slot) => (
              <label className="row" key={slot}>
                <span className="row-label">{`Material ${slot + 1}`}</span>
                <select
                  title={`Workspace material for slot ${slot + 1}`}
                  value={name ?? ''}
                  onChange={(e) => {
                    const picked = e.target.value;
                    if (picked) void selectGroundMaterial(picked, doc.docId, slot);
                    else clearGroundMaterial(doc.docId, slot);
                  }}
                >
                  <option value="">(none)</option>
                  {materials.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </>
        ) : (
          <>
            <button onClick={() => materialInput.current?.click()}>
              Load material file… (slot 1)
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
          disabled={!doc.ground.maps.some((m) => !!m)}
        />
        <p className="hint">
          {doc.ground.materials.some((m) => !!m)
            ? 'paint extra coverage with the terrain-paint tool; seams blend by displacement maps'
            : 'pick a .material zip from materials/ for any slot — diffuse required (diff or diffuse), normal/AO/displacement optional'}
        </p>
      </Section>
    </>
  );
}
