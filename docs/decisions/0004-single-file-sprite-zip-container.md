# 0004 — Single-file `.sprite` zip container

Status: Accepted (2026-09; bundles themselves date to format `/2`)

## Decision

All bake parts ship as one deflate zip named `<id>.sprite` — the bytes are
an ordinary zip, the extension exists so operating systems (macOS in
particular) do not auto-extract it on download.

- Container is pure transport: entry names are exactly the file names the
  manifest's `passes`/`views` tables reference, and the parts are
  byte-identical to the loose passes — any zip tool opens it and each pass
  stays individually diffable.
- Entries carry a fixed mtime so re-baking the same primitive with the
  same settings yields identical bytes.
- Written with fflate (three's vendored copy — no extra dependency);
  `parseBake()` (`src/bake/bundle.ts`) is the matching reader: unzip,
  validate the `format` prefix by name, resolve entries via the manifest,
  never by extension or convention.
- Legacy `<id>-bake.zip` files keep loading: the parser never looked at
  extensions.

## Consequences

- The container format has never needed a version of its own; format
  evolution lives entirely in the manifest's `format` field.
- G-buffer EXRs deflate well (raw float + zero padding); render PNGs are
  stored uncompressed inside the zip.

## Rejected alternatives

- One zip per view slot (multi-view): four files per sprite, provenance
  and quarantine pain, no consumer for it.
- A custom binary container: no diffability with standard tools, no
  benefit over zip.
