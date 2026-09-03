import type { ReactNode } from 'react';

/** Label + range slider + readout, the workhorse control of both panels. */
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
      <output>{format ? format(value) : String(value)}</output>
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
