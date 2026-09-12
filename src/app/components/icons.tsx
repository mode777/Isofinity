import type { ReactNode } from 'react';

/** Inline-SVG icon glyphs for icon-only editor buttons (currentColor). */
function icon(children: ReactNode): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Floppy disk. */
export function IconSave(): React.JSX.Element {
  return icon(
    <>
      <path d="M2.5 2.5h8.6l2.4 2.4v8.6h-11z" />
      <path d="M5 2.5v4h6v-4" />
      <path d="M5 13.5V9.5h6v4" />
    </>,
  );
}

/** Floppy disk with a pencil (save under a new name/folder). */
export function IconSaveAs(): React.JSX.Element {
  return icon(
    <>
      <path d="M2 2h7.2l2.3 2.3V12H2z" />
      <path d="M4 2v3h4.5V2" />
      <path d="M4 12V8.5h4.5V12" />
      <path d="M10.2 12.9l.5-1.8 2.9-2.9 1.3 1.3-2.9 2.9z" />
    </>,
  );
}

/** Curved arrow pointing left (counter-clockwise). */
export function IconUndo(): React.JSX.Element {
  return icon(
    <>
      <path d="M6 3 3 6l3 3" />
      <path d="M3 6h6.2a3.8 3.8 0 0 1 3.8 3.8v2.7" />
    </>,
  );
}

/** Curved arrow pointing right (clockwise). */
export function IconRedo(): React.JSX.Element {
  return icon(
    <>
      <path d="M10 3l3 3-3 3" />
      <path d="M13 6H6.8A3.8 3.8 0 0 0 3 9.8v2.7" />
    </>,
  );
}

/** Pointer arrow (filled). */
export function IconSelect(): React.JSX.Element {
  return icon(
    <path
      d="M4.5 2 12 8.2l-3.6.7 2 4-1.7.8-2-4L4.5 12z"
      fill="currentColor"
      stroke="none"
    />,
  );
}

/** Pencil. */
export function IconPencil(): React.JSX.Element {
  return icon(
    <>
      <path d="M3 13l.9-3.2 7-7 2.3 2.3-7 7z" />
      <path d="M9.7 4l2.3 2.3" />
    </>,
  );
}

/** Light bulb. */
export function IconLight(): React.JSX.Element {
  return icon(
    <>
      <path d="M8 2a4 4 0 0 1 2.3 7.3V11H5.7V9.3A4 4 0 0 1 8 2z" />
      <path d="M6.3 13h3.4" />
      <path d="M7 14.8h2" />
    </>,
  );
}

/** Eraser block. */
export function IconEraser(): React.JSX.Element {
  return icon(
    <>
      <path d="M9.5 2.5l4 4-6.5 6.5H4.2l-1.6-1.6 6.9-8.9z" />
      <path d="M6.3 5.7l4.5 4.5" />
    </>,
  );
}

/** Play triangle (render the lit pass). */
export function IconRender(): React.JSX.Element {
  return icon(<path d="M5.5 3.5v9l7-4.5z" />);
}

/** Stacked layers (bake all view slots). */
export function IconBakeAll(): React.JSX.Element {
  return icon(
    <>
      <path d="M8 2.5l5.5 3-5.5 3-5.5-3z" />
      <path d="M2.5 8.2l5.5 3 5.5-3" />
      <path d="M2.5 11l5.5 3 5.5-3" />
    </>,
  );
}

/** Stacked layers (viewport layer visibility). */
export function IconLayers(): React.JSX.Element {
  return icon(
    <>
      <path d="M8 2.5l5.5 3-5.5 3-5.5-3z" />
      <path d="M2.5 8.2l5.5 3 5.5-3" />
      <path d="M2.5 11l5.5 3 5.5-3" />
    </>,
  );
}

/** Square with an × (discard the active view's baked passes). */
export function IconRemoveView(): React.JSX.Element {
  return icon(
    <>
      <path d="M2.5 2.5h11v11h-11z" />
      <path d="M5.7 5.7l4.6 4.6M10.3 5.7l-4.6 4.6" />
    </>,
  );
}

/** Horseshoe magnet (surface snap). */
export function IconSnap(): React.JSX.Element {
  return icon(
    <>
      <path d="M5 2.5v6a3 3 0 0 0 6 0v-6" />
      <path d="M3.2 5.5h2.4" />
      <path d="M10.4 5.5h2.4" />
    </>,
  );
}

/** Trash can (delete a placement). */
export function IconDelete(): React.JSX.Element {
  return icon(
    <>
      <path d="M3 4.5h10" />
      <path d="M6.5 4.5V3h3v1.5" />
      <path d="M4.5 4.5l.7 8.5h5.6l.7-8.5" />
      <path d="M6.8 7v3.7" />
      <path d="M9.2 7v3.7" />
    </>,
  );
}
