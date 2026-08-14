## Lane identity

- Lane: `docs-proposed-a-m`
- Semantic scope: 64 proposed architecture/design documents A–M plus nine shared prerequisites. Proposed/committed design is not implementation evidence unless the current ledger or code adopts it.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00`
- Working-tree basis: current bytes; all match assignment.
- Assigned files read: 73 / 73 (OWNED 64 / 64).
- Assigned lines read: 18,804 / 18,804.
- Assigned bytes read: 1,255,920 / 1,255,920.
- Dirty assigned paths: 0.
- Exclusions: no broad sibling-owned source/test review.

## Read receipt

`read-receipt.tsv` has all 73 assignment rows, at the current matching line/byte/SHA-256 values.

## Architecture observed

This corpus is design history/proposals, with some ledger-adopted decisions. Its “active”, “committed”, “landed”, and “ready-to-build” labels are not consistently reconciled with later ledger dispositions. In particular, D59 now says crew is dead design-only, D60 says the agent-principal machinery was purged, and D61 says the hub wave is not yet built. `docs/architecture/core/Core-Path-Registry.md:140`, `docs/architecture/core/Core-Path-Registry.md:143`, `docs/architecture/core/Core-Path-Registry.md:146`.

## Subsystem scorecards

Scores describe the documents as current implementation guides, not the quality of their retained designs.

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Agent-principal set (8 docs) | 0 | 0 | 0 | 0 | 1 | high | `docs/architecture/proposed/agent-principal-design/README.md:3`; `docs/architecture/core/Core-Path-Registry.md:143`; `packages/contracts/src/identity/index.ts:15` |
| Chat-crew set (9 docs) | 0 | 0 | 0 | 0 | 1 | high | `docs/architecture/proposed/chat-crew-design/README.md:9`; `docs/architecture/core/Core-Path-Registry.md:140` |
| Hub-browse set (4 docs) | 0 | 0 | 0 | 0 | 1 | high | `docs/architecture/proposed/hub-browse-design/README.md:9`; `docs/architecture/core/Core-Path-Registry.md:146` |
| Remaining proposed corpus (43 docs) | 0 | 0 | 1 | 0 | 1 | medium | Full-read receipt; `pnpm check:docs` |

N/A: this lane did not broaden source/test review enough to score separately built or future domains. The verification 1 is formatting evidence, not feature proof.

## Findings

### DOCS-PROPOSED-AM-01 — Agent-principal “landed” state survived the purge

- Severity: P2
- Class: law-drift
- Confidence: high
- Evidence rung: R2
- Scope denominator: 8 agent-principal documents; the stale current-state declaration is in the README.
- Receipts: `docs/architecture/proposed/agent-principal-design/README.md:3`–`:6` says AP0–AP2 “LANDED” and `chat.seatAgent` is in-tree. `docs/architecture/core/Core-Path-Registry.md:143` says AP0–AP2 were purged and lists the absent pieces. `packages/contracts/src/identity/index.ts:15`–`:21` is human-only. `pnpm ast ident provisionAgentPrincipal --max 20` returned no result; literal `rg` found no implementation.
- Established fact: D60 retains the design, not the described implementation.
- Impact: A builder can plan against nonexistent auth/roster behavior and mistake dormant DDL for a live containment system.
- Unverified: No future AP rebuild behavior was tested.
- Suggested fix: Replace the top build-state banner with the D60 truth rider; retain the July triage only as dated history.

### DOCS-PROPOSED-AM-02 — Crew is marked active/committed despite D59’s dead-design disposition

- Severity: P3
- Class: law-drift
- Confidence: high
- Evidence rung: R1
- Scope denominator: 9 chat-crew documents.
- Receipts: `docs/architecture/proposed/chat-crew-design/README.md:2`–`:3` is `kind: spec` / `status: active`; `docs/architecture/proposed/chat-crew-design/README.md:9`–`:21` calls it committed and ready to build. `docs/architecture/core/Core-Path-Registry.md:140` says “crew DEAD” and design-only. `pnpm ast exports packages/server/src/domain/crew --max 1` plus tracked-path check found no source surface.
- Established fact: The design is retained but its own top-level state hides that it is non-live.
- Impact: Search results read as active product work; the corpus contains 45 `status: active` documents.
- Unverified: Whether crew should be revived.
- Suggested fix: Mark it parked/historical-design using sanctioned vocabulary and link D59 at the top.

### DOCS-PROPOSED-AM-03 — Databank README gives incompatible completion states

- Severity: P3
- Class: law-drift
- Confidence: high
- Evidence rung: R2
- Scope denominator: 10 databank-design documents; contradiction in the README state banner.
- Receipts: `docs/architecture/proposed/databank-design/README.md:9` says document-RAG “IS built”; `docs/architecture/proposed/databank-design/README.md:17` says “READY-TO-BUILD” with DB3 onward unlanded. `pnpm ast exports packages/server/src/domain/databank --max 12` found 84 exports in 35 files, proving a declared surface but not whole delivery.
- Established fact: The same header presents incompatible present-tense build states.
- Impact: Triage cannot tell shipped behavior from future chunks without decoding stale prose.
- Unverified: Individual databank behavioral completion.
- Suggested fix: Maintain one dated as-built matrix (built / partial / future) and remove the stale ready-to-build banner.

## Proven strengths

None claimed. `pnpm check:docs` passed and the 64-file local-link scan found zero broken targets, but neither is R4/R5 behavioral evidence; the link scan lacked a positive control.

## Declared versus completed

| Surface | Strongest evidence | Classification |
| - | - | - |
| Agent principals / AP0–AP4 | R2: human-only tuple; D60 says AP0–AP2 purged | design of record, not implemented |
| Chat crew | R1: D59 design-only; no domain path | retained dead proposal |
| Hub browse | R1: D61 says wave not yet built; no domain path | future proposal |
| Databank | R2: 84 exports across 35 domain files | code surface exists; not credited as whole-feature complete |
| Automation, imagery, connections, mini-specs | R0–R2 depending on narrow checks | proposal or separate work; no completion credit from prose |

## Tests and gates

No behavioral suite applies to this no-change documentation lane. `pnpm check:docs` passed for formatting only. No documentation-status enforcement was identified in scope. The local Markdown-reference check found zero broken local links across 64 OWNED docs but had no positive control.

## Cross-lane edges

- `docs-core-law`: reconcile proposal labels with D59/D60/D61; receipts `docs/architecture/core/Core-Path-Registry.md:140`, `:143`, `:146`.
- `server-identity-domains` and `server-chat-*`: DOCS-PROPOSED-AM-01 is a documentation-drift finding, not an implementation-defect claim.
- `server-content-domains`: databank has a declared export surface, but this lane makes no behavioral-completion claim.

## Tool receipts

`pnpm ast` exit 0; native structural tool used for targeted code claims. `pnpm ast ident provisionAgentPrincipal` found no result and was paired with literal cross-check. `pnpm ast exports` found no crew/hub source surface and declaration surfaces for automation/databank/imagery. `pnpm check:docs` exit 0. No tool failure or long-running AST command.

## Lane verdict

All 64 proposed documents and nine prerequisites were read and hash-reconciled.
Treat the corpus as proposals/design history, not live implementation evidence.
Agent-principal state is materially stale; crew is explicitly dead design despite active framing; databank’s header contradicts itself.
Formatting and local references are clean but do not prove feature delivery.
