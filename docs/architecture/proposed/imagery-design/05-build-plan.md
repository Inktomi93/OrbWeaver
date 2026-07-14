---
kind: spec
status: active
updated: 2026-07-03
---

# 05 — Build plan: chunks, checkpoints, test plans

> **Status: COMMITTED (D49 item 1) — prescriptive design.** Honest sizes (S ≈ half a day, M ≈ one
> to two days for a competent agent), explicit dependencies, and the per-chunk test plan (the
> comprehensive-coverage bar of AGENTS-1 — every persistence verb, contract, and load-bearing
> invariant asserted; determinism via injected clock/ids throughout).

---

## The dependency picture

```
I0 contracts+providers (born-compliant; Phase 4-adjacent passes / pre-baseline-freeze)
 └─→ I1 the leaf (Phase 7)
      ├─→ I2 runner translation (can land with I0's widening; tests need I1's fixtures)
      ├─→ I3 reuse gate + provenance persistence (needs the I0 DDL)
      └─→ I4 chat + automation + tool wiring (needs Phase-5 chat + domain/automation)
            └─→ I5 client (Phase 6 surfaces; render itself is already free)
```

External prerequisites (all committed, none owned here): `assets` store/`"generated"` kind (D21 /
D49), the D45 vision-caption op (multimodal modes), Phase-5 chat (the shaper op + the caller verb),
`domain/automation` (the arm), the D48 tool registry (the tool projection).

---

## I0 — Born-compliant contracts + DDL (S)

The `domains/imagery.md` (gutted — the code is the doc; git history) §7 list, finalized by this design set:

1. `ImageGenerateRequest` widening — `negativePrompt`/`size`/`edit{image,mask,references}`
   (doc 01 §4). Additive; existing text→image callers byte-identical.
2. `ASSET_KINDS` gains `"generated"` (today `["card","avatar","export"]` — verified) — the db
   `assets.kind` CHECK derives from the same tuple (D34).
3. `@orb/contracts/imagery`: the committed §6.1 shapes + `MODE_TRIGGERS`, `sizePresetSchema`,
   `generateImageActionArgsSchema` (doc 01 §6). ID prefix `imagery_generation`.
4. `ModelCapability.input.imageEdit` (doc 01 §5) + capability synthesis rows for the known hosted
   image models.
5. `WARNING_CODES` + `"image_edit_dropped"` (doc 03 §2 — lands WITH its I2 runner emit site if the
   passes are separated; never code-without-site).
6. `imagery_generations` DDL into `0000_baseline` (doc 03 §4.1 — the pre-launch squash, D58
   precedent).

**Checkpoint:** `pnpm check` green; no runtime imagery code exists yet.
**Tests:** tuple↔db-enum mirror tests (mode CHECK derives from `PROMPT_TEMPLATE_MODES`; asset-kind
CHECK includes `generated`); zod round-trips for every new schema (`generatePictureRequestSchema`
refinements: free-requires-prompt, portrait-requires-subject); capability-schema parse accepts
`input.imageEdit` and old descriptors without it; FK behavior tests on `imagery_generations`
(asset delete cascades the row; chat delete SET NULLs; character delete SET NULLs).

## I1 — The leaf (M)

`domain/imagery/` complete per doc 01 §1: substrate (templates, caption instructions, size
presets, DEFAULT_NEGATIVE, processReply, identity-hash, mode helpers), the four verbs, context,
service, contract, errors. All cross-feature ops are context fakes in tests — the leaf builds
before any consumer exists.

**Checkpoint:** the full orchestration runs green against fakes: fake shaper → fake generate →
fake store → provenance row in a test db → blocks returned.
**Tests:**
- **Template goldens:** each `PROMPT_TEMPLATES`/`CAPTION_INSTRUCTIONS` member snapshot-asserted
  (drift in the "Begin your reply with" prefixes breaks `ensurePrefix` + size defaults — the
  golden is the tripwire).
- **`processReply` pure table tests:** one row per doc 02 §7 step — wrapping quotes (all three
  quote styles; NOT inner quotes), newline-runs→commas, NFD + diacritic strip (é/ü/ñ), whitelist
  filter (parens/brackets/colons/markdown bullets dropped), comma-debris collapse, the 2000-cap
  cutting at a term boundary, case preserved, empty-in→empty-out.
- **Orchestration order:** a recording-fake context asserts the exact doc 02 §1 sequence, incl.
  reuse-gate-before-resolveRole and store-before-provenance-insert.
- **Prompt-source matrix:** free/override→user (no shaper call), multimodal→caption (fallback to
  extraction when no avatar), template modes→extract.
- **Error paths:** unconfigured role → `ImageryNotConfiguredError`; empty extraction →
  `PromptExtractionFailedError`; zero images → `GenerationFailedError`; `editImage` on a
  no-imageEdit capability → `ImageEditUnsupportedError`.
- **Capability-gate drop test:** `useAvatarReference` + no-imageEdit ⇒ request carries NO `edit`,
  result carries the `image_edit_dropped` warning, generation still ran.
- **Cost sum:** null-propagation (any component null ⇒ total null); both components present ⇒ sum.
- **Determinism:** injected clock/ids; no `Date.now`/`Math.random` (the gate).

## I2 — Runner translation (S)

The openrouter image runner honors the widened request (doc 03 §2.3): edit/references →
`image_url` content parts (clamped 4), negative folded as the trailing "Do not include:" line,
size passthrough where supported, the strip-and-warn belt.

**Checkpoint:** translation goldens committed; the belt emits.
**Tests:** request-translation goldens per shape (text-only unchanged — the additive guarantee;
edit+mask; references clamp at 4; negative fold; size map); the belt test (edit payload +
no-capability profile ⇒ stripped + `ResolvedWarning{image_edit_dropped}`, never a throw).

## I3 — Reuse gate + provenance persistence (S)

`persistence/queries.ts` (the ONE writer + the reuse lookup joining `assets` on owner) wired into
the I1 orchestrator's step 2/10.

**Checkpoint:** the reuse round-trip works on a real test db.
**Tests (the reuse-gate suite):** same subject+mode+contentHash ⇒ short-circuit (fake generate op
asserts ZERO calls; `reused:true`; blocks rebuilt — an n=3 prior generation returns 3 blocks);
changed `contentHash` ⇒ regenerates + new row; `reuse:"never"` ⇒ bypass; prompt override ⇒ bypass;
scenario/background/free/edit ⇒ `identity_hash` null + never matched; cross-owner isolation (user
B's identical hash never returns user A's asset — the owner join test); newest-row-wins.

## I4 — Chat + automation + tool wiring (M — Phase 5/7 seam work)

`chat.generateImage` (doc 04 §2.1) + the chat-side `extractQuiet` shaper op + the automation
`generate_image` arm + the D48 tool projection + `assets`-side obligations (the `readAsset` op
provider; the ref-registry addition).

**Checkpoint:** an end-to-end fake-provider run posts one message with n media blocks; /imagine-
shaped action args round-trip into the same message.
**Tests:** `requireParticipant` enforced (non-member 404s); `quiet:true` ⇒ no message,
`messageId:null`; n=3 ⇒ ONE message, 3 media blocks (the Q5 contract); authorship = initiating
principal (`authorUserId`/`triggeredBy` both the caller); warnings map to the chat `warning`
event; the arm's arg→param mapping golden (defaults applied; `quiet` consumed, not forwarded);
extraction spend lands in stats attributed to `triggeredBy` with NO message row (the Q1 contract);
assets registry introspection test now sees `imagery_generations.asset_id` (the GC-safety flag).

## I5 — Client (M — Phase 6)

The /imagine command (MODE_TRIGGERS parse → the action invocation), the compose-time mode picker +
generate button (calls `chat.generateImage`; `extractPrompt` powers the preview-then-edit flow),
the regenerate affordance (provenance prompt + `reuse:"never"`), the "set as background" theme-
token action (doc 04 §6 Q4 — client-only). Render ships free (`MessageMedia`).

**Checkpoint:** the full user loop in the real app — /imagine face → image in chat → lightbox →
regenerate.
**Tests:** command-parse table (`/imagine you`/`face`/`scene`/`background`/free text → args);
preview flow state (extract → edit → generate uses the edited prompt as `prompt`, which bypasses
the reuse gate); regenerate sends `reuse:"never"`; a11y/render cases ride the existing
`MessageMedia` suite (no new render tests beyond the n-blocks message snapshot).

---

## The hard parts (name them so nobody discovers them mid-chunk)

1. **The shaper seam is chat-owned** (I4): `extractQuiet` needs chat's history windowing + macro
   context — build it as a chat verb-adjacent shaper next to summarize, NOT inside imagery
   (doc 02 §2 WHY).
2. **The GC registry addition** (I4) is easy to forget and silent when missed — the introspection
   test in I4 is the tripwire; land it in the SAME commit as the first `"generated"` store call.
3. **Capability synthesis for image models** (I0/I2): `input.imageEdit` rows must exist for the
   models users actually resolve, or the gate drops references everywhere and B3 looks broken —
   curate the known set with the D45 vision rows.
4. **Baseline freeze ordering** (I0): `imagery_generations` must ride `0000_baseline` before the
   squash window closes; missing it means a real migration (the D58 rpg-tables precedent applies
   now, not later).
