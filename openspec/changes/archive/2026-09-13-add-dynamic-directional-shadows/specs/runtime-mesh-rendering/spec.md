## ADDED Requirements

### Requirement: Meshes cast and receive directional shadows

Placed character meshes SHALL participate in the world's directional shadow
system: their animated geometry SHALL contribute to the reconstructed
occluder each frame, and their shaded surfaces SHALL lose the key directional
contribution wherever the reconstructed occluder blocks the key light. A mesh
SHALL receive the same per-pixel visibility a sprite at the same world
position receives, and its cast shadow SHALL merge with sprite shadows as one
region rather than being drawn as a separate overlay. With no mesh placed,
the mesh shadow path SHALL add nothing to the frame.

#### Scenario: Character receives a sprite's cast shadow

- **WHEN** a character stands where a placed sprite occludes the key light
- **THEN** the character's key-lit surfaces darken in the same region the
  sprite's shadow covers, with no separate shadow geometry drawn for it

#### Scenario: Character casts onto the ground and other surfaces

- **WHEN** a character stands on the ground with the key light to one side
- **THEN** its animated silhouette casts a shadow along the light direction
  onto the ground and onto any sprite surface behind it

#### Scenario: No character placed adds no cost or artifact

- **WHEN** a world contains no mesh placements
- **THEN** the mesh shadow contribution is empty and the frame is unchanged
  from a world rendered without this capability
