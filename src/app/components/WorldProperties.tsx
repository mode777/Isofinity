import type { WorldDocument } from '../document.js';
import { setLight, setSun } from '../store/world.js';
import { CheckRow, ColorRow, Section, SliderRow } from './controls.js';

function formatHour(v: number): string {
  const h = Math.floor(v);
  const m = Math.round((v - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function WorldProperties(props: { doc: WorldDocument }): React.JSX.Element {
  const { doc } = props;

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
    </>
  );
}
