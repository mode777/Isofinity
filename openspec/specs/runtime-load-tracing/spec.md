## Purpose

An opt-in, in-memory diagnostics facility that reports how long each phase of
sprite-bundle and ground-material loading takes, so the dominant bottleneck can
be identified from real browser measurements before any optimization is chosen.

## Requirements

### Requirement: Tracing is opt-in
The system SHALL emit load traces only when tracing is enabled. Tracing SHALL be
enabled by default in development builds and SHALL be disabled by default in
production builds, where it is enabled on demand by a documented activation
mechanism (a URL flag and/or a global toggle). When tracing is disabled, the
system SHALL produce no trace console output and SHALL retain no trace records.

#### Scenario: Disabled by default
- **WHEN** a production build loads a sprite or material without the activation flag or global toggle
- **THEN** no `[loadtrace]` console output is emitted and the trace accumulator stays empty

#### Scenario: Enabled explicitly
- **WHEN** the user enables tracing before or during a load, then loads a sprite or material
- **THEN** trace records for the instrumented phases are produced

### Requirement: Each instrumented phase records one structured span
The system SHALL record one span per instrumented load phase. A span SHALL carry
a stable phase tag, a duration in milliseconds, and phase-specific metadata
(asset/file identity, view slot or slot index, and pixel dimensions where
applicable). Spans SHALL be appended in completion order.

#### Scenario: Sprite phase spans
- **WHEN** a sprite bundle's north view is loaded with tracing enabled
- **THEN** spans are recorded for bundle read, manifest parse, g-buffer inflate, EXR decode, depth-range scan, render PNG decode, layer padding, and sprite texture upload, each tagged with the asset and the view dimensions

#### Scenario: Material phase spans
- **WHEN** a ground material is parsed with tracing enabled
- **THEN** spans are recorded for zip inflate, EXR diffuse decode, each image-map decode, linear-to-sRGB conversion, canvas resample, default-layer build, and texture-array upload/mipmap generation, each tagged with the material file name

#### Scenario: World-open spans and rebuild count
- **WHEN** a world is opened with tracing enabled
- **THEN** spans and counters are recorded for the total open duration, each asset's north load, the number of on-demand direction resolutions, and the number of renderer reconstructions

### Requirement: Traces are readable and copyable from the browser console
The system SHALL expose the accumulated spans on a global accumulator and SHALL
provide summary and clear helpers. Each completed span SHALL also be logged as a
single line beginning with a stable prefix, so the user can copy raw output.

#### Scenario: Copy raw output
- **WHEN** a traced load completes
- **THEN** the console contains one prefixed line per span that can be copied as-is

#### Scenario: Summarize and reset
- **WHEN** the user calls the summary helper
- **THEN** it returns spans grouped by tag with a count and total milliseconds, and the clear helper empties the accumulator without affecting subsequent loads

### Requirement: Tracing never alters load results or persists
Enabling tracing SHALL NOT change which layers, maps, or materials load, nor
their decoded contents. Trace records, counters, and the accumulator SHALL be
in-memory diagnostics only and SHALL NOT be written into sprite bundles, world
files, material archives, presets, or any other persisted format (ADR 0006).

#### Scenario: Same results with tracing on and off
- **WHEN** the same world and bundle are loaded once with tracing enabled and once with it disabled
- **THEN** the loaded layers, dimensions, origins, and materials are identical

#### Scenario: Nothing persisted
- **WHEN** a world or bundle is saved after a traced load
- **THEN** the saved bytes contain no trace records or counters

### Requirement: Span aggregation is pure and Node-verifiable
The record-shape and aggregation logic SHALL be a pure function of the recorded
spans, independent of the DOM and of timing, so it can be exercised by a
Node-runnable verifier.

#### Scenario: Aggregate a known set of spans
- **WHEN** the pure aggregator is given a fixed array of spans
- **THEN** it returns deterministic per-tag counts and totals, and clearing yields an empty accumulator
