## Lane identity

- Lane: `docs-design-a-f`
- Semantic scope: fourteen `docs/design/` documents, actions through event-bus coverage.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00`
- Working-tree basis: all assigned document hashes match `assignment.txt`; the repository HEAD is later/different, so current code was used only to test claims expressly made by the documents.
- Assigned files read: 14 / 14
- Assigned lines read: 5,487 / 5,487
- Assigned bytes read: 413,160 / 413,160
- Dirty assigned paths: 0
- Exclusions: no source, tests, configuration, mocks, or sibling-lane artifacts were changed. This is a documentary and reachability audit, not a live visual-fidelity review.

## Read receipt

`read-receipt.tsv` covers 100% of `assignment.txt`: 14 owned paths, 5,487 lines, and 413,160 bytes. The final SHA-256 recheck matches the assigned snapshot for every path.

## Architecture observed

The client’s composition root registers feature contributions in `packages/client/src/main.tsx`: Config is built from the collection registry at lines 229–246 and Databank is a section, home tile, and modal contribution at lines 213–260. The Databank feature has a sealed front door exporting those three contributions (`packages/client/src/features/databank/index.ts:1-17`). This is R3 reachability for the shell registration, not evidence of visual quality.

The character default-card pack is an authored source consumed by the seeder’s one sequential card walk (`packages/server/src/domain/character/seeder/cards.ts:28-57`; `packages/server/src/domain/character/seeder/seed.ts:73-81,166-191`). The render-policy preview seam calls the shared contract resolver (`packages/client/src/features/character/hooks/use-preview-render-policy.ts:16-24`) and is consumed by both editor and hero-band surfaces (AST receipt below).

The current tree contains the container artifacts that the August 8 design snapshot said did not exist: `Dockerfile`, `docker-compose.yaml`, `.dockerignore`, and `docker/entrypoint.sh`. Presence alone is R1; this lane did not build or run an image.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - |
| Design-document status and current-state accuracy | 2 | 2 | 2 | 1 | 2 | high | Findings DDAF-01–04 |
| Databank client surface observed from the current tree | 4 | 5 | 2 | 3 | 2 | high | `main.tsx:213-260`; AST importers: 44 hits / 16 files |
| Default-character pack and seeding | 5 | 5 | 5 | 4 | 4 | high | `cards.ts:28-57`; `seed.ts:73-81,166-191`; 8 integration tests passed |
| Draft-trust preview-policy seam | 4 | 5 | 4 | 3 | 3 | high | `use-preview-render-policy.ts:16-24`; AST refs; 15 contract tests passed |
| Container deployment documentation | 2 | 1 | 1 | 1 | 1 | high | `containerize-prod-image-spec.md:10,18-26`; artifact inventory |

## Findings

### DDAF-01 — Databank spec still says the shipped client is absent

- Severity: P2
- Class: law-drift
- Confidence: high
- Evidence rung: R3
- Scope denominator: 2 mutually reinforcing “client is zero / nothing built” claims in one status block; one registered current client feature, 44 AST importer hits across 16 files.
- Receipts: `docs/design/databank-surface-spec.md:9-18`; `packages/client/src/main.tsx:213-260`; `packages/client/src/features/databank/index.ts:1-17`.
- Established fact: the spec says nothing in §§3–10 is built, the client is at zero, and the legacy Databank tree was never ported. The current client imports its Databank front door, registers `databankSection`, contributes the Documents home tile, and registers the Add Document modal.
- User or system impact: roadmap readers can size duplicate work or treat a live Documents surface as missing; its explicit “zero callers” diagnosis is no longer a valid design premise.
- What remains unverified: no live-browser or end-to-end test was run, so this does not claim all specified interactions or visual fidelity are complete.
- Suggested next check or fix: replace the opening snapshot with a dated completion ledger: identify which §3–§10 outcomes now ship, then retain only the genuinely unbuilt per-chat-rack stage as a proposal.

### DDAF-02 — Production-container spec’s “today” starting fact is false

- Severity: P2
- Class: law-drift
- Confidence: high
- Evidence rung: R1
- Scope denominator: 1 asserted starting fact, checked against 4 current container artifacts.
- Receipts: `docs/design/containerize-prod-image-spec.md:10-11,18-26`; `Dockerfile:1`; `docker-compose.yaml:1`; `docker/entrypoint.sh:1`; `.dockerignore:1`.
- Established fact: the spec calls itself read against today’s tree and says no production app Dockerfile exists. The current repository has the Dockerfile, Compose file, entrypoint shim, and Docker ignore file the later active build plan describes.
- User or system impact: a builder beginning from this spec is told to rediscover or recreate artifacts that already exist, and may mistake a post-build tree for the pre-build design baseline.
- What remains unverified: artifact presence is not an image-build, GPU, startup, security, or deployment verification.
- Suggested next check or fix: turn §0 into a dated historical baseline or replace it with a current artifact matrix pointing to the existing Dockerfile/Compose and their tests or build receipts.

### DDAF-03 — Default roster remains labeled unwired after the v2 pack shipped

- Severity: P3
- Class: law-drift
- Confidence: high
- Evidence rung: R4
- Scope denominator: 1 delivery-state assertion; one v2 pack definition with 10 cards and one exercised seed path.
- Receipts: `docs/design/default-character-roster.md:3-6`; `packages/server/src/domain/character/seeder/cards.ts:1-15,28-57`; `packages/server/src/domain/character/seeder/seed.ts:73-81,166-191`; `tests/server/domain/character/seeder/seed.int.test.ts` (8 passing tests).
- Established fact: the document says its roster is merely ready to transplant and “nothing here is wired yet.” The current source calls it the v2 authored source of truth, declares `CARD_PACK_VERSION = 2`, and the seeder iterates `DEFAULT_CHARACTER_CARDS` on the fresh-seed path.
- User or system impact: a maintainer can mistakenly schedule already-shipped seed wiring or edit the document assuming it has no production consequence.
- What remains unverified: this lane did not byte-compare every one of the 1,788 document lines against `cards.ts`; it establishes the delivery-state contradiction, not exact content parity.
- Suggested next check or fix: change the opening to “shipped v2 source of truth; edit here first, then transplant,” and link the seed migration/test receipt.

### DDAF-04 — Context-panel findings mix closed work with open-gap prose

- Severity: P3
- Class: law-drift
- Confidence: high
- Evidence rung: R2
- Scope denominator: 4 contradictory status cues in one document: “none fixed,” Preview “REBUILT,” “ALL ANSWERED,” and four still-open decision prompts.
- Receipts: `docs/design/context-panel-fidelity-findings.md:3,52-55,94-125`; `packages/client/src/features/chat/components/assembly-preview-panel.tsx:128-145`.
- Established fact: the document header says “findings, none fixed,” while its Preview row calls the gap closed and §4 says all D-1…D-4 are answered. The immediately following bullets nevertheless phrase D-1…D-4 as unresolved owner questions. Current code contains the documented `SegmentBar` composition seam, but no visual conclusion follows from that.
- User or system impact: the side-eye lane cannot tell which items need reproduction, owner decision, or archival; it invites duplicate design decisions and invalid “still open” work.
- What remains unverified: live appearance, keyboard behavior, and the residual fidelity list require the document’s own `:5173` live review protocol.
- Suggested next check or fix: split the document into a dated historical findings section and a current punch list; remove or mark superseded question text after the resolved-decision ledger.

## Proven strengths

- The default-character pack is not just declared: the source’s v2 pack is consumed by the fresh-seed loop, and `tests/server/domain/character/seeder/seed.int.test.ts` passed 8 integration tests (R4).
- The documented shared roster render-policy resolver passed all 15 contract tests in `tests/contracts/chat/roster.contract.test.ts` (R4). The preview hook resolves with that same shared resolver, and AST found its two production consumers (R3 for the preview surfaces).

## Declared versus completed

| Declared surface | Documentation posture | Strongest current evidence | Assessment |
| - | - | - | - |
| Actions-tab IA | BUILT | Preset feature reaches the shell; AST reports 171 importers in 61 files, including the named Actions CT | R3 structure; no live UI claim made |
| Config rail | R1+R2 BUILT | Config collection registry and Config section are assembled in the client root | R3 structure |
| Databank client | DRAFT / client zero | Feature exports, shell registrations, CT-story imports | R3; status is stale |
| Default roster | authoring only / unwired | v2 pack, seed loop, passing seed integration test | R4; status is stale |
| Container image | DRAFT / no Dockerfile | Four container artifacts exist | R1; status is stale, runtime unverified |
| Draft trust seam | ARM 1 BUILT | shared hook’s two production consumers and passing resolver contract test | R4 for resolver, R3 for UI consumers |
| Context Preview | partly marked rebuilt | `SegmentBar` use in assembly-preview panel | R3 structure only; document status is internally inconsistent |
| Event-bus survey | active proposal/audit | exact-literal check confirmed `rulesChanged` is declared but found no server emit literal | R1/R2 evidence consistent with its stated blind spot; no new bus implementation inferred |

The remaining documents are explicitly research, owner direction, or future build material: boot-loader options, Config IA thinking, demo-seeding rebuild, density pass, Docker research, and the portions of the container spec that remain proposed. Their labels appropriately prevent this lane from treating them as shipped behavior.

## Tests and gates

- `pnpm check:docs` passed: 104 files formatted. This checks Markdown formatting, not link resolution, factual currency, or behavior.
- `pnpm exec vitest run tests/contracts/chat/roster.contract.test.ts` passed: 15 contract tests. It supports the resolver claim, not live preview rendering.
- `pnpm exec vitest run tests/server/domain/character/seeder/seed.int.test.ts` passed: 8 integration tests. It supports seed-path behavior.
- No container build, browser/CT run, or event-bus coverage gate was run: those would not be proportionate proof for a read-only documentation audit, and the respective status claims are separated above.

## Cross-lane edges

- Client-feature and visual-review lanes should use DDAF-01 only to correct the Databank document’s premise; this lane does not certify the Databank surface’s usability or complete §3–§10 coverage.
- Any deployment/container lane should reconcile DDAF-02 before treating `containerize-prod-image-spec.md` as a current implementation baseline.
- Any panel side-eye lane should reconcile DDAF-04 before accepting its task list; its live-review requirement remains valid.

## Tool receipts

- Read barrier: all assigned documents and `scripts/codemods/ast.ts` were fully read before structural queries; bare `pnpm ast` printed its supported-verbs usage.
- Structural scans: Databank importers (44 hits / 16 files); Config importers (17 / 10); Preset importers (171 / 61); `usePreviewRenderPolicy` refs (5 / 3); `DEFAULT_CHARACTER_CARDS` refs (7 / 4); `VLLM_ENGINE_HOST` identifiers (3 / 3); `SegmentBar` refs (2 / 1).
- Literal cross-check: `AutomationBusEvent|rulesChanged` across `packages`, `tests`, and `scripts` found the declaration and transport/comment references but no server emit literal; this is recorded as corroboration only, not a completeness proof.
- Artifact inventory found `Dockerfile`, `docker-compose.yaml`, `.dockerignore`, and `docker/entrypoint.sh`.
- Full command text and outputs are in `commands.md`.

## Lane verdict

All 14 assigned documents were read and their snapshot hashes revalidated.

Four documentation-state defects are evidenced: Databank’s client-zero premise, the container spec’s no-Dockerfile premise, the roster’s unwired label, and the context panel’s contradictory completion ledger.

Current-code evidence demonstrates shell wiring for Databank and shared resolver/seed behavior, but does not prove UI fidelity, container startup, GPU behavior, or the event-bus survey’s complete negative inventory.

The highest-value follow-up is a small documentation reconciliation pass that preserves dated historical analysis while clearly marking current shipped surfaces.
