import { useState } from 'react';
import type { ReactNode } from 'react';

/** Label + range slider + editable value field, the workhorse control of both panels. */
export function SliderRow(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
}): React.JSX.Element {
  const { label, value, min, max, step, format, onChange, disabled } = props;
  const [editing, setEditing] = useState<string | null>(null);

  const commit = (): void => {
    if (editing === null) return;
    const text = editing.trim().replace(',', '.');
    setEditing(null);
    if (text === '') return;
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return;
    onChange(Math.min(max, Math.max(min, parsed)));
  };

  return (
    <label className="row">
      <span className="row-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        className="value-input"
        type="text"
        inputMode="decimal"
        aria-label={label}
        disabled={disabled}
        value={editing ?? (format ? format(value) : String(value))}
        onFocus={() => setEditing(String(value))}
        onChange={(e) => setEditing(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            setEditing(null);
          }
        }}
      />
    </label>
  );
}

export function NumberRow(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}): React.JSX.Element {
  const { label, value, min, max, onChange, disabled } = props;
  return (
    <label className="row">
      <span className="row-label">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
    </label>
  );
}

/**
 * Shared relative slider band for the world editor's height rows
 * (world-unit offsets from the value at drag start).
 */
export const HEIGHT_SLIDER_MIN = -2;
export const HEIGHT_SLIDER_MAX = 2;
export const HEIGHT_SLIDER_STEP = 0.1;

/**
 * Label + precise numeric text field using the editor's commit
 * conventions: Enter/focus-loss applies the entered finite value
 * (optionally clamped to `min`/`max`, negative values allowed), empty or
 * non-numeric input reverts, Escape cancels editing. With `slider`, a
 * range track sits between label and field acting as a relative offset:
 * the thumb rests centered (no offset), a drag commits `drag-start value
 * + thumb offset` per step tick, and releasing (or leaving) the slider
 * recenters it — the next drag re-anchors on the value current then, so
 * repeated drags compound. Typed values apply exactly and are never
 * clamped by the slider band.
 */
export function PreciseNumberRow(props: {
  label: string;
  value: number;
  format?: (v: number) => string;
  min?: number;
  max?: number;
  slider?: { min: number; max: number; step: number };
  onCommit: (v: number) => void;
}): React.JSX.Element {
  const { label, value, format, min, max, slider, onCommit } = props;
  const [editing, setEditing] = useState<string | null>(null);
  const [sliderBase, setSliderBase] = useState<number | null>(null);
  const [sliderOffset, setSliderOffset] = useState(0);
  const recenterSlider = (): void => {
    setSliderBase(null);
    setSliderOffset(0);
  };
  const commit = (): void => {
    if (editing === null) return;
    const text = editing.trim().replace(',', '.');
    setEditing(null);
    if (text === '') return;
    let parsed = Number(text);
    if (!Number.isFinite(parsed)) return;
    if (min !== undefined) parsed = Math.max(min, parsed);
    if (max !== undefined) parsed = Math.min(max, parsed);
    onCommit(parsed);
  };
  return (
    <label className="row">
      <span className="row-label">{label}</span>
      {slider ? (
        <input
          type="range"
          min={slider.min}
          max={slider.max}
          step={slider.step}
          value={sliderOffset}
          aria-label={`${label} slider`}
          title={`relative adjust ±${Math.abs(slider.max - slider.min) / 2}`}
          onPointerDown={() => setSliderBase(value)}
          onChange={(e) => {
            const offset = Number(e.target.value);
            if (sliderBase === null) setSliderBase(value);
            onCommit((sliderBase ?? value) + offset);
            setSliderOffset(offset);
          }}
          onPointerUp={recenterSlider}
          onPointerCancel={recenterSlider}
          onBlur={recenterSlider}
        />
      ) : null}
      <input
        className="value-input"
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={editing ?? (format ? format(value) : String(value))}
        onFocus={() => setEditing(String(value))}
        onChange={(e) => setEditing(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            setEditing(null);
          }
        }}
      />
    </label>
  );
}

export function ColorRow(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <label className="row">
      <span className="row-label">{props.label}</span>
      <input
        type="color"
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}

export function CheckRow(props: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}): React.JSX.Element {
  return (
    <label className="row">
      <span className="row-label">{props.label}</span>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
    </label>
  );
}

export function Section(props: { title: string; children: ReactNode }): React.JSX.Element {
  return (
    <section className="panel-section">
      <h2>{props.title}</h2>
      {props.children}
    </section>
  );
}
