## 1. Slot matcher

- [x] 1.1 In `src/app/groundMaterial.ts`: extend `SLOT_RE` to `(diffuse|diff|arm|nor_gl)`, normalize `diffuse` → `diff` when building the slot key, and update the module doc comment, error message, and the `MaterialSlot` docs to name both spellings. Verify: `npm run build` passes.

## 2. Precedence

- [x] 2.1 In `matchMaterialMaps`, sort the `diff` slot candidates so exact-`diff` names win over `diffuse` names regardless of zip entry order, keeping the duplicate-note behavior for the loser. Verify: covered by 3.1 fixture cases.

## 3. Verification fixtures

- [x] 3.1 In `src/bake/scratch-verify.ts`: extend the material fixture cases to cover (a) a zip with only a `<name>_diffuse_*.png` diffuse map accepted, (b) mixed `diff` + `diffuse` resolving to the `diff` map with a duplicate note in both entry orders, (c) a zip with neither spelling rejected. Verify: `npm run dev` → `/scratch-verify.html` shows the new cases passing (user runs the browser part); matcher cases also run under any Node-runnable path used by the harness.

## 4. User-facing text and docs

- [x] 4.1 Update `src/app/components/WorldProperties.tsx` hint text to mention both `diff` and `diffuse` spellings. Verify: visible in the ground properties panel during `npm run dev`.
- [x] 4.2 Update `docs/glossary.md` material-slot entry (and `docs/recipes.md` material touchpoint if it pins the pattern) to state `diff` with `diffuse` alias and `diff` precedence. No roadmap entry needed for this size. Verify: docs read consistently; no format-history change required.

## 5. Gates

- [x] 5.1 Run `npm run build` and `npm run verify:bundles` clean. Verify: both pass with no type or regression errors.
