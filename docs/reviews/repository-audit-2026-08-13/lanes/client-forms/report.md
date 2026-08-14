## Lane identity

- Lane: `client-forms`
- Semantic scope: the shared client form factories, registered bound controls, autosave/status seams, and assigned mirrors.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00`
- Working-tree basis: all frozen assignment bytes matched at 2026-08-14 00:44 MDT.
- Assigned files read: 43 / 43.
- Assigned lines read: 3,544 / 3,544.
- Assigned bytes read: 184,092 / 184,092.
- Dirty assigned paths: 0.
- Exclusions: consumers, state/draft-store implementation, UI primitive implementation, tRPC persistence, and test harnesses belong to sibling lanes.

## Read receipt

`read-receipt.tsv` covers every `OWNED` row in `assignment.txt`: 43/43 files, 3,544/3,544 lines, and 184,092/184,092 bytes. Post-read reconciliation found no owned-path drift.

## Architecture observed

`useAppForm` is the single TanStack form-hook registration for the ten bound field components and three form chrome components (`packages/client/src/forms/use-app-form.ts:20-40`, R2). `createAutosaveEntityForm` returns a keyed boundary whose private session owns the form, save driver, draft mirror, clean-echo behavior, and teardown flush (`packages/client/src/forms/create-autosave-entity-form.tsx:111-409`, R3); `createSavedEntityForm` supplies the separately button-gated form lifecycle (`packages/client/src/forms/create-saved-entity-form.ts:48-157`, R3). The imported `#forms` alias has 101 resolved imports in 78 files (command ledger), which is live feature consumption evidence, but those consumer files are outside this lane.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Autosave boundary (1 source / 1 owned CT) | 4 | 4 | 5 | 3 | 3 | high | `packages/client/src/forms/create-autosave-entity-form.tsx:219-372`; `tests/client/forms/create-autosave-entity-form.ct.tsx:18-179`; current CT receipt 34/34 |
| Button-gated saved form and draft mirror (2 source / 3 owned tests) | 4 | 3 | 5 | 2 | 3 | high | `packages/client/src/forms/create-saved-entity-form.ts:63-156`; `tests/client/forms/create-saved-entity-form.ct.tsx:11-126`; current unit receipt 24/24 |
| Registered bound-field framework (14 source / 1 owned CT) | 4 | 4 | 4 | 2 | 3 | medium | `packages/client/src/forms/use-app-form.ts:20-40`; `packages/client/src/forms/bound-fields/use-bound-field.ts:48-63`; `tests/client/forms/bound-fields/use-bound-field.ct.tsx:24-95` |
| Save-status seam and shared status view (4 source / 3 owned CT) | 4 | 4 | 5 | 2 | 3 | high | `packages/client/src/forms/section-save-status.tsx:38-46`; `tests/client/forms/section-save-status.ct.tsx:19-46`; current CT receipt 34/34 |

## Findings

### `client-forms-01` — Autosave accepts a missing persistence operation and reports success

- Severity: P2
- Class: behavior-defect
- Confidence: high — a focused CT that instantiates the factory with neither config nor call-time `save` and asserts no draft clearing/status success would raise it to R4; current direct source establishes the behavior at R3.
- Evidence rung: R3.
- Scope denominator: the two persistence seams exposed by `AutosaveEntityBoundaryConfig.save` and `AutosaveBoundaryProps.save` in the 410-line autosave factory.
- Receipts: both persistence seams are optional (`packages/client/src/forms/create-autosave-entity-form.tsx:77-102`); the resolved save is passed into Session possibly `undefined` (`:380-404`); `onSubmit` awaits `save?.(value)` and then unconditionally re-baselines, clears the draft, and sets `saved` (`:182-189`). In contrast, the button-gated factory explicitly throws when no save is supplied (`packages/client/src/forms/create-saved-entity-form.ts:67-76`).
- Established fact: a caller can mount the public autosave boundary without either optional `save`; a dirty valid form reaches the driver (`create-autosave-entity-form.tsx:229-245`), where `await undefined` resolves and is recorded as a confirmed save.
- User or system impact: if a consumer omits both integration seams, an edit is silently discarded and its crash-survival draft is cleared while the UI says “Saved.” No audited live consumer is proved to use that invalid configuration.
- What remains unverified: no assigned test mounts this invalid configuration, and consumer ownership/presence outside this lane was not inspected.
- Suggested next check or fix: make exactly one save seam required at runtime (throw/reject before re-baselining), then add a CT proving the draft remains and the status is error when neither is present.

## Proven strengths

- `proven-strength` (R5): the keyed session boundary protects entity-switch, reseed discard, array-operation autosave, clean echo, debounce churn, teardown flush, and stale-draft healing with live CT assertions (`packages/client/src/forms/create-autosave-entity-form.tsx:213-327`; `tests/client/forms/create-autosave-entity-form.ct.tsx:18-179`; current exact CT receipt: 34 passed, 0 unexpected/flaky/skipped).
- `proven-strength` (R5): the save-status host keeps one aggregate status while preserving a local failure/retry affordance (`packages/client/src/forms/save-status-seam.ts:25-32`; `packages/client/src/forms/section-save-status.tsx:38-46`; `tests/client/forms/save-status-seam.ct.tsx:22-43`; `tests/client/forms/section-save-status.ct.tsx:19-46`).
- `proven-strength` (R5): the bound wrapper propagates dirty/touched state through realistic text, select, color, toggle, and switch interactions and detects unnamed rendered controls (`packages/client/src/forms/bound-fields/use-bound-field.ts:48-63`; `tests/client/forms/bound-fields/use-bound-field.ct.tsx:24-95`).

## Declared versus completed

The public form registration and both factory lifecycles are implemented and live-consumed (R3); the assigned unit and browser mirrors give current behavioral proof for their main lifecycle paths (R5). The factory's “save at one of two optional seams” declaration is not enforced, producing the P2 configuration path above. The assigned browser test asserts five representative bound control kinds, not all ten registered control components; that is a test-scope limitation, not a repository-wide absence claim.

## Tests and gates

Six owned unit/suite files passed 24/24 tests. Eight owned CT files passed 34/34, with 0 failed, flaky, or skipped in the immediate command summary and JSON read. The shared JSON was overwritten by a concurrent lane before final recheck, so its later contents are not attributed here (command ledger). The CTs have meaningful positive/negative controls: for example the form-identity suite plants an unidentifiable input before asserting real surfaces (`tests/client/forms/form-identity.suite.ct.tsx:87-105`), and the stale-draft CT asserts both correct server healing and zero phantom saves (`tests/client/forms/create-autosave-entity-form.ct.tsx:164-179`). No integration, contract, e2e, or gate source is assigned.

## Cross-lane edges

- The actual `EntityDraftStore` validation/persistence semantics and `SAVE_LIFECYCLE_STATES` ownership are in `#state`; this lane verifies only its form-side ports (`packages/client/src/forms/entity-form-base.ts:38-55`; `packages/client/src/forms/create-autosave-entity-form.tsx:34-38`).
- Consumers must supply a persistence operation through one of the two public seams. The missing-save P2 is a framework boundary defect; consumer lanes should confirm their concrete factories pass a save function.

## Tool receipts

See `commands.md`. Structural import evidence came from `pnpm ast`; the orphan lens was completed but is not used for a negative claim because it supplied no scanned-file denominator. Literal negative claims are not made.

## Lane verdict

The assigned snapshot is fully read and byte-stable: 43 files, 3,544 lines, 184,092 bytes. The shared form factory and status framework have substantial current unit and CT proof (24/24 unit; 34/34 CT). One P2 remains: an omitted autosave persistence operation is silently treated as a successful save and clears the recovery draft. The largest remaining uncertainty is whether any feature consumer actually omits both save seams, plus behavior in unassigned UI/state implementations.
