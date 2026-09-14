## ADDED Requirements

### Requirement: Rendered passes upload without a CPU readback

When a sprite bundle's render pass is decoded, the runtime SHALL retain it as
a GPU-uploadable bitmap (`ImageBitmap`) and upload that bitmap directly into
the sprite render texture array. It SHALL NOT copy the decoded pixels back to
CPU memory (no 2D-canvas `drawImage` + `getImageData`) only to re-upload
them. Boot-baked passes, which are produced as CPU byte buffers, MAY continue
to upload from those buffers. The displayed result SHALL be pixel-identical
to uploading CPU bytes.

#### Scenario: A bundle render pass uploads from its decoded bitmap

- **WHEN** a sprite bundle is loaded into a world
- **THEN** its render pass is uploaded from the decoded bitmap and no
  render-pass canvas pixel readback (`getImageData`) phase runs for it

#### Scenario: Display is unchanged

- **WHEN** the same render content is loaded as a bundle (bitmap upload) and
  as a boot-baked primitive (byte upload)
- **THEN** the composited sprite pixels are identical
