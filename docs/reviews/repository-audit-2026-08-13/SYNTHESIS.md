---
kind: review
status: complete
updated: 2026-08-14
---

# Repository audit synthesis

## Verdict

**The audit portfolio is demonstrably complete for its documented rolling snapshots; the repository is demonstrably incomplete as a fully graduated system.** At closing `HEAD` `5783331a8a4403b056be8babc692436e33c4d4d6`, the official static tier is green, but one current P1 enforcement defect, eight current P2 findings, one partially established P2 dependency exposure, six current P3 findings, behavioral proof gaps, and explicitly unexecuted push/full/live tiers remain. Static success is not behavioral graduation. \[`PORTFOLIO-QA.md:3-30`; `FINAL-VERIFICATION.md:11-15,72-84`; `SYNTHESIS-HANDOFF.md:11-27`]

The strongest current release blocker is `AGENT-TOOLING-01`: the registered Bash guard authorizes commands containing an unanchored self-tool filename before its blanking and hard-floor rules run. This is a broken agent-safety boundary, not an application authentication bypass. \[`agent-tooling` / `AGENT-TOOLING-01`; `.claude/hooks/tool-guard.mjs:213,544-554,843-885`; `.claude/settings.json:3-14`; `SECURITY-VALIDATION.md:17-27`]

## Snapshot and exact coverage

| Population | Lanes | Paths | Text / binary denominator | Lines | Bytes |
| - | -: | -: | - | -: | -: |
| Frozen `MANIFEST-ALL.json` | 78 | 5,700 unique | 5,617 text + 83 binary | 936,529 text | 76,311,612 |
| Rolling selected `assignment.txt` OWNED rows | 78 | 5,704 unique | 5,621 text + 83 binary | 937,932 text | 76,427,616 |

The frozen partition and rolling selection are different denominators. Every frozen path has exactly one rolling owner; there are zero frozen omissions, duplicate owners, or lane moves. The four rolling-only additions are `docs/design/event-bus-coverage-survey.md`, `docs/design/rpg-rewind-stuck-state.md`, `docs/design/staleness-and-session-freshness.md`, and `docs/reviews/stickler/2026-08-14-staleness-diagnosis.md`. \[`PORTFOLIO-QA.md:14-30`; `ROLLING-RECONCILIATION.md:26-32`]

The assignment headers use three snapshot bases, not one immutable commit: 25 lanes at audit origin `e777c47e5860a105c114e061dcf98bcab1baa952`, 7 lanes at frozen-manifest commit `c93253a3f907fb7fd93d411c511a98ed378505db`, and 46 lanes at late-selection basis `41e18afe74afa570b67a3e670a1a38863c486a00`. The reconciliation close is later still: `5783331a8a4403b056be8babc692436e33c4d4d6`, 72 commits after origin. \[cold assignment-header count over all 78 `lanes/*/assignment.txt`; `ROLLING-RECONCILIATION.md:15-22`]

The cold phase barrier was independently rechecked before synthesis:

- 78/78 lane directories matched `LANES-ALL.json` and `MANIFEST-ALL.json`; all 312 required artifacts existed: 78 each of `assignment.txt`, `read-receipt.tsv`, `commands.md`, and `report.md`.
- Every artifact byte and every assignment/receipt TSV row was read. All 5,704 rolling OWNED paths had a receipt; the frozen 5,700-path partition reconciled with zero ownership or coverage errors.
- Mechanical admission passed 383 local links with zero unintended broken targets, zero invalid finding `Class` tokens, zero numeric scorecard `N/A` cells, zero handoff hash mismatches, `pnpm check:docs`, and audit `git diff --check`. \[`PORTFOLIO-QA.md:3-10,119-140`; `SYNTHESIS-HANDOFF.md:13-27`]

No manifest lane or selected path is incomplete. The audit output directory itself, `docs/reviews/repository-audit-2026-08-13`, is the frozen manifest's sole explicit `excludePrefixes` entry so the audit does not recursively audit its own generated evidence; each lane report separately names semantic scope outside its assignment. Binary rows are covered by bytes and SHA-256, with `N/A` only for their line value. The recorded lane bytes remain authoritative for what each lane actually read; later source movement does not corrupt those receipts or silently make them current. \[`MANIFEST-ALL.json:excludePrefixes`; `PORTFOLIO-QA.md:115-129`; `SNAPSHOT-POLICY.md`]

### Closing HEAD and worktree

The mandated final check found three commits after the earlier `572306b` reconciliation close and inventoried them rather than retargeting old evidence:

| Commit | Inventory | Audit effect |
| - | - | - |
| `2426514c5111408a2a4829259be24ea579f848ad` | W5 dead-character-id filtering and W7a per-session socket eviction across session/auth/HTTP/stream/character/test paths | New tested behavior; no pre-existing finding ID resolved or invalidated. |
| `4348f41ff5381cbb475aff1408d2be82e7ef1870` | Merge of the same wave, including the `_ct-stories.tsx` lint repair | Removes the exact prior ESLint source shape. |
| `5783331a8a4403b056be8babc692436e33c4d4d6` | 19-line workboard delta | Operational documentation only; no retained finding status change. |

The W5 and W7a source/test receipts are `packages/client/src/features/character/lib/character-library-lens.ts:48-70`, `tests/client/features/character/lib/character-library-lens.test.ts`, `tests/client/features/character/surfaces/character-library-surface.ct.tsx`, and `tests/server/transport/trpc/stream/socket-registry.test.ts`. They are not backdated into lane scorecards or manufactured into findings. \[`ROLLING-RECONCILIATION.md:59-61`]

At synthesis close, `git rev-parse HEAD` was `5783331a8a4403b056be8babc692436e33c4d4d6`; `git log 5783331..HEAD` was empty; the tracked tree had zero staged and zero unstaged changes. `git status --short` had 15 pre-existing untracked audit/tooling entries (342 files before this synthesis was written), including this audit directory. Findings labelled CURRENT apply to committed `HEAD`; snapshot-only rows do not apply to unreviewed later bytes. \[`SYNTHESIS-HANDOFF.md:70-72`; exact closing `git` command receipt]

## System map

| Layer / path | Composition and runtime evidence | Strongest demonstrated tier and boundary |
| - | - | - |
| Package cake | `kit ← contracts ← db ← server ← client`, with sealed `kit ← ui ← client`; server direction is `entry → transport → domain → infra → foundation → kit`. | Architecture law plus package/source receipts; existence and export declarations alone remain R1/R2. \[`docs/architecture/core/AGENTS.md:35-43`; `lower-kit`; `lower-contracts`; `lower-db`] |
| Kit / contracts / DB | Kit macros have 96 resolved importer files and a 49-file/743-test receipt; contracts have 69 files/807 tests and 1,015 public-surface candidates; DB has a client, 28 schema leaves, and 26 files/274 integration tests. | R3/R4 for kit/contracts, R5 scoped DB integration; no package-wide runtime claim. \[`lower-kit/report.md:23-28`; `lower-contracts/report.md:23-28`; `lower-db/report.md:23-31`] |
| Server domain and composition | Chat is composed at `packages/server/src/entry/compose/chat.ts:432-580`; automation/plugin at `packages/server/src/entry/compose/automation-plugin.ts:92-402`; RPG at `packages/server/src/entry/compose/demo-chat-game.ts:90-201`. | R3 composition plus scoped R4/R5 unit/integration receipts; not an external-provider receipt. \[`server-chat-core`; `server-entry-compose/report.md:23-31`] |
| Server edge and transport | HTTP/auth entry is `packages/server/src/entry/app.ts:149-320` and `packages/server/src/entry/auth/seam.ts:270-335`; tRPC root is `packages/server/src/transport/trpc/router.ts:42`; streaming owns a socket registry. | Receipt-snapshot R4/R5, with post-receipt W7a changes separately reconciled. \[`server-entry-edge/report.md:21-29`; `server-transport-kit`; `ROLLING-RECONCILIATION.md:59`] |
| Sealed infrastructure | Egress re-resolves and validates every hop at `packages/server/src/infra/network/egress.ts:466-610`; ingress precedence is at `packages/server/src/infra/network/ingress.ts:27-41`; plugin host is composed at `packages/server/src/entry/compose/automation-plugin.ts:53`. | Hostile-path R4/R5 within the focused infra suite; deployed DNS/firewall and real QuickJS operation remain outside scope. \[`server-infra/report.md:21-31,47-76`] |
| Client composition | SPA composition is `packages/client/src/main.tsx:153-433`; routes are `packages/client/src/routes/router.tsx:13-37`; feature doors contribute sections, registries, queries, and surfaces. | R3 live composition and scoped CT R5; no whole-product browser graduation. \[`client-shell/report.md:21-29`; `client-shell-features`; `client-content-features`] |
| UI | UI is a sealed primitive/rendering package consumed by client; charts, layout, web-weave, code editor, and primitives have independent unit/CT evidence. | R4/R5 by component, with current `UI-RENDERING-01` proving the code-editor receipt is mixed rather than reliably green. \[`ui-rendering/report.md:23-45`; `ui-primitives-a-i`; `ui-primitives-j-r`; `ui-primitives-s-z`] |
| Test tiers | Tests mirror packages centrally. Node, integration, CT, isolated e2e smoke, and live e2e are distinct tiers; one tier cannot certify another. | Scoped lane receipts include 5 smoke assertions, 13 a11y CT tests, and 5/6 integration files/28 tests. \[`docs/architecture/core/AGENTS.md:41`; `integration-tests/report.md:31-43,46-96`] |
| Gates and verification | Descriptor loader → pass/report/render → verification registry; the current static bar runs membership, structure, imports, dependency, docs, lint, and types. | Current R5 static execution over 201 gates; it does not execute behavioral tiers. \[`verification-harness/report.md:21-29`; `FINAL-VERIFICATION.md:31-52,72-84`] |
| Operator paths | vLLM/live providers, browser probes, container composition, mutation, and paid RPG/OpenRouter probes are explicit operator surfaces. | Mostly R1–R3 or startup-only R5; live model/GPU/container/full mutation readiness is not established. \[`server-providers-runtime`; `probes-provider-rpg`; `probes-runtime`; `root-config/report.md:20-27`] |

## Independent scorecards

Scores are the lane readers' independent five-axis judgments: Implementation / Wiring / Verification / Enforcement / Operability. They are not averaged into a repository grade and are bounded to each lane's recorded bytes and commands. Later commits are not used to rerate older rows. \[`RUBRIC.md`; `SYNTHESIS-TEMPLATE.md`]

| Subsystem | I | W | V | E | O | Receipt boundary |
| - | -: | -: | -: | -: | -: | - |
| `@orb/kit` assigned surface | 4 | 3 | 3 | 2 | 2 | 56 source + 51 tests; 49 files/743 tests. \[`lower-kit/report.md:23-28`] |
| Contracts public surface | 3 | 3 | 3 | 0 | 1 | 94 sources; 69 files/807 tests; package-wide enforcement not run in lane. \[`lower-contracts/report.md:23-29`] |
| DB schema registry | 4 | 4 | 4 | 3 | 2 | 28 schema leaves; direct 24-file/251-test receipt. \[`lower-db/report.md:23-31`] |
| Chat composition and bus | 4 | 4 | 4 | 2 | 4 | 7 sources/13 tests; current-at-receipt integration. \[`server-chat-core/report.md:23-34`] |
| Entry chat bridge | 4 | 4 | 4 | 3 | 4 | Composition plus scoped integration. \[`server-entry-compose/report.md:23-31`] |
| HTTP/auth edge | 4 | 4 | 4 | 3 | 4 | 28 sources/29 tests; 326 unit + 52 integration passes at receipt. \[`server-entry-edge/report.md:21-29`] |
| Infra egress/ingress | 5 | 4 | 5 | 4 | 4 | Per-hop controls and hostile-path integration. \[`server-infra/report.md:21-31`] |
| Provider dispatch/contracts | 4 | 3 | 4 | 3 | 3 | 432/432 owned Vitest receipt; no live provider. \[`server-providers-runtime/report.md:23-31`] |
| vLLM lifecycle/surfaces | 4 | 3 | 4 | 2 | 2 | 24 sources/22 direct tests; no owned live-runtime receipt. \[`server-providers-runtime/report.md:23-31`] |
| SPA shell/routes | 4 | 4 | 5 | 3 | 3 | 13 runtime files; 7/7 routed CT receipt. \[`client-shell/report.md:21-29`] |
| Client content features | 4 | 4 | 5 | 3 | 3 | Databank/discovery/workloads/world-info; 115/115 assigned CT scope. \[`client-content-features/report.md:21-31`] |
| Refinery content workflow | 3 | 4 | 2 | 4 | 3 | Live surface; zero direct content-surface CT. \[`client-preset-refinery/report.md:27-45`] |
| Code editor | 3 | 3 | 3 | 3 | 3 | Mixed CT: three target failures and two passes. \[`ui-rendering/report.md:23-45`] |
| Verification harness | 5 | 4 | 5 | 5 | 4 | Registry/runner 46/46 and membership receipts. \[`verification-harness/report.md:21-29`] |
| Gates I–P | 4 | 5 | 5 | 5 | 4 | 91 descriptors + 2 baselines with fixture/conformance proof. \[`gates-i-p/report.md:23-31`] |
| Mutation quality gate | 3 | 3 | 0 | 0 | 1 | 4 targets/1,115 mutants; no threshold or final score. \[`root-config/report.md:20-27,31-55`] |
| Runtime/browser probes | 2 | 2 | 0 | 0 | 1 | Environment-backed group; failures and portability gaps below. \[`probes-runtime/report.md:21-27`] |
| Isolated test substrate | 4 | 4–5 | 4–5 | 3–4 | 4 | Five smoke, 13 a11y CT, five integration files/28 tests; exact scopes only. \[`integration-tests/report.md:31-43`] |

## Findings by severity and status

Severity ranks impact; confidence and evidence rung remain separate. Repetition across lanes is deduplicated by impact. Raw provider-minus-client counts, export candidates, and same-basename test observations are not promoted into defects.

### P0

No P0 is confirmed in the admitted evidence. This is not a proof that no P0 can exist outside the executed scopes. \[`PORTFOLIO-QA.md:119-129`; all 78 lane reports]

### P1 — current

| ID | Class / confidence / rung | Established impact | Load-bearing receipts |
| - | - | - | - |
| `AGENT-TOOLING-01` | behavior-defect / high / R5 | Any raw command containing `tool-guard.mjs`, `guard-replay.mjs`, or `transcript-census.mjs` returns self-exempt before blanking and hard-floor checks; `pass` becomes an explicit hook `allow`. Existing tests cover genuine self-tool calls but no must-bite comment, quoted-argument, or compound-stage cases. | `.claude/hooks/tool-guard.mjs:213,544-554,843-885`; `.claude/settings.json:3-14`; `tests/tooling/tool-guard.int.test.ts:219-237`; real hook-protocol `git stash # tool-guard.mjs` allow receipt in `SECURITY-VALIDATION.md:17-27`. |

### P2 — current or partial

| ID | Status / class / confidence | Deduplicated finding | Load-bearing receipts |
| - | - | - | - |
| `client-forms-01` | CURRENT / behavior-defect / high | Both autosave persistence seams are optional; `save?.` is followed by unconditional rebaseline, draft clear, and “saved”, so invalid configuration can discard edits while reporting success. No audited live consumer is proved to omit both seams. | `packages/client/src/forms/create-autosave-entity-form.tsx:77-102,182-189,380-404`; \[`client-forms/report.md:32-43`] |
| `UI-RENDERING-01` | CURRENT / behavior-defect / high | Code-editor completion acceptance is nondeterministic: five target executions produced three failures and two passes; repeat-each=3 ended 43 pass/2 fail. Root cause is not assigned. | `packages/ui/src/code-editor/code-editor.tsx:167-174`; `tests/ui/code-editor/code-editor.ct.tsx:192-216`; \[`ui-rendering/report.md:35-46`] |
| `RC-01` | CURRENT / gate-blind-spot / high | The named mutation gate cannot fail on score because `thresholds.break` is `null`; it generated 1,115 mutants across four targets but never yielded a final score/exit receipt. | `stryker.gate.config.json:59-60`; `scripts/verify/registry.ts:379-383`; `package.json:83-86`; `lefthook.yml:111-114`; \[`root-config/report.md:31-42`] |
| `client-preset-refinery-01` | CURRENT / test-quality / high | The live refinery content surface joins three reads and five write paths, but the assigned 2 TS + 9 TSX refinery tests have zero code references to the surface; later bus CT work still does not mount it. | `packages/client/src/features/refinery/lib/refinery-section.tsx:83`; `packages/client/src/features/refinery/surfaces/refinery-content-surface.tsx:100,131,219,358`; `tests/client/features/refinery/_ct-stories.tsx:254`; \[`ROLLING-RECONCILIATION.md:49`] |
| `PROBES-RUNTIME-02` | CURRENT / operability-gap / high | Both golden-demo scripts suppress meaningful reference-capture failures and then continue to comparison, allowing stale/incomplete evidence to appear fresh. | `scripts/probes/st-goldens/run-demo-complex.sh:46,95,98-101`; `run-demo-goldens.sh:61,66-67`; `generate-goldens.ts:97-100`; \[`probes-runtime/report.md:44-55`] |
| `PPR-01` | CURRENT / operability-gap / high | Eight RPG probe entry points hard-code one developer checkout for `.env`, making ordinary clones/worktrees non-reproducible without edits. | `card-teach-probe.ts:42-50`; `effort-ladder-native-vs-or.ts:33`; `effort-reasoning-probe.ts:35`; `replay-toolround.ts:16-23`; `run.ts:221-231`; `run-coverage.ts:285-306`; `steer-probe-real.ts:19-29`; `steer-probe.ts:42-50`; \[`probes-provider-rpg/report.md:34-45`] |
| `DEPLOCK-02` | CURRENT / operability-gap / high | Locked ESLint and TypeScript versions violate two declared peer ranges; `pnpm peers check` exits 1. | `pnpm-lock.yaml:5005,5045,3912-3972,7097`; \[`dependency-lock/report.md:42-53`] |
| `GA-H-01` | CURRENT / gate-blind-spot / high | Two controlled ratchets allow current debt. The closing count is 276 sites: 224 density-tier + 52 finding-overload-provenance. Green means “no growth above budget,” not “no debt.” | `scripts/check/gates/density-tier.ts:19,363`; `finding-overload-provenance.ts:297`; `FINAL-VERIFICATION.md:47,52`; prior 278-site lane snapshot at `gates-a-h/report.md:33-44`. |
| `DEPLOCK-01` | PARTIAL / operability-gap / high inventory, medium/low exploit confidence | Online audit has 32 records, including 12 high, collapsing to seven families/ten GHSAs. Current evidence supports two bounded upgrade candidates: authenticated untrusted images reach `sharp@0.34.5`; untrusted PDFs reach server-side `pdfjs-dist@6.1.200`. It does **not** prove twelve exploits, XSS, SSRF, RCE, or compromise. | `packages/server/src/entry/http/upload.ts:90-148`; `packages/server/src/infra/image/index.ts:115-136`; `packages/server/src/infra/extraction/loaders/pdf.ts:65-88`; `SECURITY-VALIDATION.md:29-44`. Cold-reader current run: upload/image/PDF four files, 42/42 tests passed; normal wiring, not exploit proof. |

### P3 — current

| ID | Class / confidence / rung | Established impact and receipts |
| - | - | - |
| `DEPLOCK-03` | architecture-drift / high / R5 | `pnpm dedupe --check --offline` exits 1 for the `enhanced-resolve` 5.24.2/5.24.3 split. `pnpm-lock.yaml:4901,4905,7028,11304`; \[`dependency-lock/report.md:55-66`] |
| `GA-H-03` | gate-blind-spot / high / R4 | `bounded-list-limit` checks only exact property name `limit`; its own passing controls preserve named-schema and `topN` bypasses. `scripts/check/gates/bounded-list-limit.ts:61,64,110`; \[`gates-a-h/report.md:59-70`] |
| `client-preset-refinery-02` | architecture-drift / high / R3 | Story prose says no production surface exists, while the live section mounts it. `tests/client/features/refinery/_ct-stories.tsx:3`; `packages/client/src/features/refinery/lib/refinery-section.tsx:83`; \[`client-preset-refinery/report.md:50-61`] |
| `PROBES-RUNTIME-01` | behavior-defect / high / R4 | `parseViewport` promises non-positive rejection but truthiness admits negative width/height; its focused test file covers other helpers, not viewport. `scripts/probes/_kit/flags.ts:35-42`; `tests/tooling/snap-flags.test.ts:6,11-47`; \[`probes-runtime/report.md:31-42`] |
| `RC-02` | operability-gap / high / R5 startup | Stryker scans a gitignored foreign SillyTavern HTML runtime despite a four-file mutation target; 7,707 project files, 4 targets, 1,115 mutants, and an irrelevant parse warning. `stryker.gate.config.json:27-46`; \[`root-config/report.md:44-55`] |
| `PPR-02` | law-drift / high / R3 | OpenRouter README says five default probes; code runs seven and results contain the two omitted modules, creating a paid-batch documentation mismatch. `scripts/probes/openrouter/README.md:3,9-15`; `run.ts:13-25`; `RESULTS.md:18-19`; \[`probes-provider-rpg/report.md:47-58`] |

### Resolved at closing HEAD

| ID | Status | Proof and limit |
| - | - | - |
| `DEVRT-01` | RESOLVED | `6abe255...` uses the shared positive-integer spawn-lock parser. Source R3 + shared real-filesystem R4; no direct GPU launcher/live-fleet receipt. `scripts/dev/engines.ts:188-210`; `scripts/dev/_kit/spawn-lock.ts:63-89`; `tests/tooling/spawn-lock.int.test.ts:74-122`. |
| `DEVRT-02` | RESOLVED | `f18314e...` adds the terminal newline; current file is 331 `wc -l` lines. Prior receipt remains pre-fix history. |
| `GA-H-02` | RESOLVED | `2b729cd...` adds per-gate candidate/scanned/skipped counts and makes zero effective scans a tool error. `scripts/check/pass.ts:20-41,583-600`; `scripts/check/report.ts:87-92`; `scripts/check/render.ts:38-57`. Dedicated tests were not successfully rerun during reconciliation, so the fix is not restated as new R5 behavior. |
| `SID-01` | RESOLVED | `0fd1279...` probes custom endpoints and returns `unchecked` for unsupported providers; focused current integration is 10/10. `test-health.ts:85-136`; `credentials.ts:59-64`. |

\[`ROLLING-RECONCILIATION.md:34-43`; `SYNTHESIS-HANDOFF.md:59-68`]

### Invalidated and candidate-only

| Observation | Classification | Why it is not a defect |
| - | - | - |
| `client-chat-components-01` | candidate-only | Same-basename test-companion absence does not establish missing behavior. |
| `SPR-01` | candidate-only | No owned vLLM live receipt is a proof gap, not proof that the provider is broken. |
| `SERVER-SEARCH-REFINERY-01` | candidate-only, current observation | `regex.getScript` has no proved client consumer, but no product requirement was established. |
| `STK-01` | candidate-only | 33 procedure reachability observations require client/product-intent reconciliation. |
| `server-discovery-automation` provider-minus-client set | INVALIDATED / excluded | Ten procedures are server-composed; no browser-product requirement was proven. Provider-minus-client is not provider-minus-product. |

\[`SYNTHESIS-HANDOFF.md:49-57`; `ROLLING-RECONCILIATION.md:42-43,65-67`]

### Snapshot-only / unknown

These remain facts about lane receipt snapshots, not closing-HEAD defects. “Unknown” does not mean false, fixed, or current. \[`ROLLING-RECONCILIATION.md:63-67`]

| Severity | Deduplicated family | Exact lane IDs |
| - | - | - |
| P2 snapshot-only | Runtime/test proof gaps | `CC-01`, `CLIENT-SHELL-02`, `LOWER-DB-02`, `LOWER-KIT-01`, `UI-AI-01`, `UI-SZ-01` |
| P2 snapshot-only | Tooling/codemod gaps | `CMD-01`, `platform-tooling-01`, `scripts-misc-01` |
| P2 snapshot-only | Current/design/law drift | `DARCHH-NZ-01`, `DOCS-CORE-SPINES-01`, `DOCS-CORE-UI-01`, `DOC-CUR-01`, `DOC-CUR-02`, `DDAF-01`, `DDAF-02`, `DOCS-DESIGN-G-M-01`–`03`, `DOCS-DESIGN-T-Z-02`, `DOCS-PROPOSED-AM-01`, `DOCS-PROPOSED-N-Z-01`, `AM-01`–`03` |
| P3 snapshot-only | Runtime/test/gate facts | `LOWER-DB-01`, `LC-01`, `client-lib-01`, `GQZ-01`, `SCD-01`, `SAPB-01`, `SCA-02`, `SF-01` |
| P3 snapshot-only | Active/design/history drift | `DARCHH-NZ-02`–`04`, `DAHM-01`–`03`, `DHA-01`–`02`, `DHNZ-01`–`03`, `DCL-01`–`04`, `DDAF-03`–`04`, `DDESNS-01`–`02`, `DOC-CUR-03`, `DOCREV-NZ-01`, `DOCS-CORE-SPINES-02`, `DOCS-CORE-UI-02`–`03`, `DOCS-DESIGN-G-M-04`, `DOCS-DESIGN-T-Z-01`, `DOCS-PROPOSED-AM-02`–`03`, `DOCS-PROPOSED-N-Z-02` |
| P3 snapshot-only | Vendored reference usability/provenance | `docs-vendor-vite-guide-01`–`02`, `docs-vendor-vite-rest-01`–`02`, `docs-vendor-baseui-a-m-01`–`02`, `docs-vendor-baseui-n-z-01`, `docs-vendor-baseui-rest-01`–`02` |
| P3 snapshot-only | Design mock drift | `DOCS-DESIGN-MOCKS-OTHER-01`–`02`, `docs-design-mocks-panel-01`–`04` |
| Candidate/audit-state | Provider receipt and snapshot drift | `SPR-01`, `SPR-02`, `STK-01` |

Repeated stale-document findings are maintenance families, not multiple product outages. Revalidate the specific record before acting; do not mass-edit historical evidence or use an old review as current law.

## Declared versus proven

| Rung | What it can establish | Repository examples | What it cannot establish |
| - | - | - | - |
| R1 | Path/text exists | Archived boards, proposals, copied vendor pages, configuration prose | Implementation, wiring, correctness, or current truth |
| R2 | Symbol/config/schema is declared or exported | Contract tuples, service factories, provider adapters, probe scripts, container files | Production reachability or behavior |
| R3 | Resolved import/caller/composition reaches a live path | Server entry composition, client `main.tsx`, tRPC routers, refinery live mount | Correct behavior, adequate tests, or user requirement for every provider procedure |
| R4 | Focused behavior is meaningfully asserted | Kit macros, contract schemas, provider dispatch, pure client helpers, gate fixture controls | Integration with environment, browser, deployment, or external providers |
| R5 | Current integration/CT/e2e or positive-controlled enforcement works in a named denominator | DB integration, attack-path infra tests, scoped CT, isolated smoke, current 201-gate static run | Whole-repository behavioral graduation outside the named denominator |

The repository has substantial R3 composition and R4/R5 islands, but it is not one R5 system. The default static run proves its 14 stages only. \[`RUBRIC.md`; `FINAL-VERIFICATION.md:31-52,72-84`]

Later work must not be backdated. Session freshness/recovery (`tests/client/data/session-freshness.test.ts:1`, `session-resume.test.ts:1`, `use-session-recovery.ct.tsx:1`), user-bus automation/databank/corpus emit/invalidation assertions, W5 dead-id behavior, and W7a socket eviction are real post-receipt R3/R4 work, but they resolve no named lane finding and do not upgrade older scorecards. \[`ROLLING-RECONCILIATION.md:47-61`]

## Proven R4/R5 strengths

These strengths are limited to their named current-at-receipt scopes; no severity is attached.

| Area | Rung | Demonstrated strength and denominator |
| - | - | - |
| Kit macro grammar | R4 | 96 resolved importer files and focused grammar/DoS/parity tests within the 49-file/743-test kit receipt. \[`lower-kit/report.md:23-28`] |
| DB | R5 scoped | 26 files/274 integration tests cover client lifecycle, 28 schema leaves, and DB-kit error classification. \[`lower-db/report.md:23-31`] |
| Server composition | R5 scoped | Entry composition tests cover chat, asset/background/imagery, automation/plugin, and RPG; the RPG group reports 67 current tests at receipt. \[`server-entry-compose/report.md:23-31`] |
| Server edge | R4/R5 scoped | HTTP/auth has 326 unit + 52 integration passes at receipt, including import/export round trips. \[`server-entry-edge/report.md:21-29`] |
| Infrastructure belts | R4/R5 scoped | Auth/crypto failure arms, zip-slip/bomb staging, per-hop SSRF defense, ingress anti-spoofing, and plugin escape/lifecycle paths are asserted; direct suite 44 files/435 tests. \[`server-infra/report.md:21-31,47-76`] |
| Client autosave lifecycle | R5 scoped | 34/34 CT covers entity switch, reseed discard, autosave churn, teardown flush, and stale-draft healing; it does not cover the invalid no-save configuration. \[`client-forms/report.md:45-49`] |
| Isolated smoke | R5 scoped | Five Playwright assertions prove health, debug refusal/token success, tRPC transport, and SPA mount in the isolated stack. \[`integration-tests/report.md:46-57`] |
| Accessibility | R5 scoped | 13/13 CT cases include planted nameless, duplicate, unnamed-landmark, and Label-in-Name positive controls before accepting ten story surfaces. \[`integration-tests/report.md:58-69`] |
| Integration substrate | R5 scoped | Five of six files/28 tests cover libSQL rollback, chat/provider failure, membership concealment, and tRPC auth/admin/cross-user arms. \[`integration-tests/report.md:70-81`] |
| Assets | R4/R5 scoped | Vite copied 20/20 declared public images with zero hash mismatch; 11 boot avatars reached real storage in a 13-assertion integration run. \[`binary-assets/report.md:21-41,44-61`] |
| Lock integrity | R4/R5 scoped | All seven workspace importers and all 1,419 resolved packages parse; all integrity records are SHA-512; frozen offline install succeeds. \[`dependency-lock/report.md:21-25,68-79`] |
| Verification harness | R5 static | Registry/runner 46/46, current membership closures, 201 active gates, and current static execution are observable; positive controls exist for descriptor discovery and fixture bite. \[`verification-harness/report.md:21-29`; `FINAL-VERIFICATION.md:35-52`] |

## Gate-to-behavior matrix

| Enforcement family | What it prevents | Current or receipt denominator | Positive control / bite proof | Blind spots |
| - | - | - | - | - |
| Test type membership | TS test files falling outside all type programs | Current 1,868 files / 4 nonempty programs | Membership integration controls; clean current stage | Membership is not execution or assertion quality. \[`FINAL-VERIFICATION.md:43`] |
| Test execution membership | Runner-suffixed tests falling outside all runner views | Current 1,699 files / 3 nonempty views; union 1,699 | Execution-membership controls; clean current stage | A listed file may still be skipped, filtered, flaky, or weak. \[`FINAL-VERIFICATION.md:44`] |
| Structural gates A–Z | Architecture/import/schema/UI/test syntax and cross-file completeness constraints | Current 201 gates; 4,817-file universe. Lane snapshots had 58 A–H, 91 I–P, and 51 Q–Z descriptors. | `check-gates` 3/3 plus conformance 2/2 at lane receipt; every descriptor declares must-flag/must-pass | Static patterns cannot prove runtime semantics; descriptor-specific gaps include `GA-H-03` and snapshot-only `GQZ-01`. \[`gates-a-h/report.md:23-28`; `gates-i-p/report.md:23-31`; `gates-q-z/report.md:1-15`; `FINAL-VERIFICATION.md:47,52`] |
| Per-gate observability | Silent zero scans or accidental predicate shrinkage | Current artifact has candidate/scanned/skipped per gate; `query-freshness-coverage` scanned 940/4,817 | Zero effective scan is a tool error after `GA-H-02` | A nonzero syntactic scan still does not prove semantic completeness. \[`ROLLING-RECONCILIATION.md:40`; `FINAL-VERIFICATION.md:67`] |
| Density/provenance ratchets | New debt above per-file budgets and stale baseline entries | 276 admitted sites: 224 density + 52 provenance | Stale/excess baseline controls and current clean structure run | Existing debt is deliberately green; “clean” is not zero. \[`GA-H-01`; `FINAL-VERIFICATION.md:52`] |
| Import boundaries | Forbidden package/tier edges | Receipt: 2,967 modules / 16,659 edges | 54 dependency-cruiser assertions observed; native command clean | Only configured/resolved import shapes are covered; runtime loading and product behavior are not. \[`root-config/report.md:20-25`; `FINAL-VERIFICATION.md:48`] |
| Lock/install integrity | Malformed lock graph, missing integrity, non-frozen install | 7 workspaces / 1,419 resolutions | Strict parser + frozen offline install | Does not make peer, dedupe, or vulnerability health green (`DEPLOCK-01`–`03`). \[`dependency-lock/report.md:21-25`] |
| Mutation quality | Surviving mutants in four selected high-stakes files | 4 targets / 1,115 mutants; 7,707 project files seen at startup | None for a score rejection; run unfinished | `break:null` means no score can fail; foreign runtime is scanned. \[`RC-01`; `RC-02`] |
| E2E target ownership | Accidental use of the wrong server/mode | One guard + mode config; 11 unit tests | Refusal and explicit override arms | Does not prove non-smoke specs or live-provider behavior. \[`integration-tests/report.md:31-43,82-96`] |

A no-match is not an absence claim without a denominator and a second method. The reconciliation's `refineryChanged` caller lens returned 0 over 5,006 scanned files because the token is a discriminant/property rather than a called function; literal/source receipts establish the path. Provider-minus-client and export-liveness outputs remain candidates for the same reason. \[`ROLLING-RECONCILIATION.md:69-74`; `lower-contracts` / `LC-01`; `server-transport-kit` / `STK-01`]

## Test reality

### Current official verification

The current official `pnpm verify` at `5783331` is **GREEN for the static tier only**: 14/14 stages passed, including lint, four type stages, two membership stages, DB/drizzle structure, 201-gate structure, dependency-cruiser, Knip, and docs format. The captured `reports/verify.json` is 3,807 bytes, timestamped 03:21:53 MDT, SHA-256 `2fe09cec708b8e08a7f6780640864bd1c84434d693999a1eff980f823e8bc043`. A concurrent push-tier runner could later overwrite the shared report path, so this captured hash is the receipt. \[`FINAL-VERIFICATION.md:11-15,31-70`]

The earlier `572306b` static barrier was RED on two ESLint errors at `tests/client/data/_ct-stories.tsx:785-786`. Commit `4348f41ff` replaced the dependency-less synchronous effect with interval/cleanup, and the fresh current run supersedes that red receipt. The still-earlier `__g_*` membership/structure failures were transient positive-control contamination; fixtures were absent before and after both clean reruns. \[`FINAL-VERIFICATION.md:13,19-29,54-70`; `ROLLING-RECONCILIATION.md:59-61`]

### What actually ran, and what did not

| Scope | Receipt | What it proves | What it does not prove |
| - | - | - | - |
| Current default static | 14/14 green at `5783331` | Syntax/types/membership/structure/import/dependency/docs bar | Node behavior, CT, E2E, providers, GPU, full mutation |
| Lane isolated e2e smoke | 5/5 | Named single-user health/auth/transport/UI-mount path at lane receipt | Other 26 specs, mode groups, live e2e |
| Lane a11y CT | 13/13 | Named surfaces plus predicate positive controls | Whole UI/a11y or subjective copy quality |
| Lane node integration substrate | 5/6 files, 28 tests | Named transaction/auth/provider-failure paths | Live backend matrix |
| UI rendering | Five target executions: 3 fail / 2 pass | Real nondeterminism | Root cause or reliable code-editor graduation |
| Current DEPLOCK-focused cold run | 4 files / 42 tests, no type errors | Upload/image/PDF normal wiring still passes after the closing commit | Advisory exploitability or mitigation |

The default static run did **not** execute `tests:node`, component tests as a tier, `browser:e2e-smoke`, `deps:orphan-ratchet`, `quality:cpd`, `tests:parity`, `deps:knip-prod`, full `browser:e2e`, or `quality:mutation-gate`. No external-provider, live-model, GPU, or live-e2e conclusion is admitted. A separately started push-tier process was still live at capture and is not counted here. \[`FINAL-VERIFICATION.md:72-84`]

## Contradictions and unknowns

| Tension | Resolution |
| - | - |
| Frozen 5,700 paths vs rolling 5,704 | Both are correct and must remain named; four post-manifest additions explain the delta. |
| One audit vs three assignment bases and a later HEAD | The portfolio is a rolling range, not one commit. Lane bytes support lane claims; closing reconciliation supports only named CURRENT/RESOLVED rows. |
| Old RED verification vs current GREEN | RED is historical at `572306b`; the captured official static run at `5783331` is green. Neither receipt proves behavioral tiers. |
| `__g_*` failures vs clean membership/structure | The first failures were positive-control fixture contamination; the fixture-free current run is authoritative. |
| 278 ratchet sites in the lane vs 276 current | Two sites burned down after the lane receipt; current `FINAL-VERIFICATION` count wins for HEAD. |
| 200 lane-snapshot descriptors vs 201 current gates | A post-receipt descriptor changed the closing registry; scorecards remain snapshot-bounded while current gate totals come from the final artifact. |
| Green structure vs existing debt | Ratchets intentionally admit 276 sites; green means no excess/stale budget, not no debt. |
| Provider procedure exists but client match is absent | Existence/wiring is not a browser-product requirement. Candidate observations stay candidates. |
| `pnpm ast` zero match | A zero is not absence without the scanned-file denominator and a second method; property/discriminant shapes can evade caller lenses. |
| Static report path can be overwritten | The captured static JSON hash in `FINAL-VERIFICATION.md` is authoritative; later shared-path writes are not silently substituted. |
| Snapshot-only IDs | No closing-HEAD reread was performed; their current status is unknown, not false/fixed/current. |

## Right-sized action order

1. **Repair `AGENT-TOOLING-01` first.** Remove the global raw-string early return; blank/parse before exemption; exempt only a sole invocation of an approved self-tool. Add must-bite comment, quoted-argument, and earlier-`&&` cases plus one genuine must-pass invocation, then rerun `tests/tooling/tool-guard.int.test.ts` through the real hook protocol. \[`SECURITY-VALIDATION.md:17-27`]
2. **Capture a clean behavioral bar on the stable HEAD.** Let one non-racing push-tier run complete, preserve its tier-specific artifact, read the result, and only then state node/CT/smoke/parity readiness. Do not jump to full/live until push is green. \[`FINAL-VERIFICATION.md:70-84`]
3. **Upgrade the two bounded decoder candidates.** Raise `sharp` and `pdfjs-dist` to fixed floors, regenerate the lock, rerun the 42 focused upload/image/PDF tests and online audit, and assess compatibility. Do not spend time “proving” twelve exploits that the evidence does not support. \[`SECURITY-VALIDATION.md:29-44`]
4. **Make autosave failure honest.** Require exactly one persistence seam or reject before rebaseline/draft clear; add a CT proving missing persistence retains the draft and reports error. \[`client-forms-01`]
5. **Turn mutation into a gate or stop calling it one.** Finish one clean four-target run, set a calibrated non-null break threshold, exclude the foreign ST runtime, and run a deliberate low-threshold positive control. \[`RC-01`; `RC-02`]
6. **Close the highest-value UI proof gaps.** Trace and stabilize code-editor completion; mount the real refinery content surface in one routed CT covering load, view-back, rewrite decision/apply, and terminal result; fix the stale story header in the same small change. \[`UI-RENDERING-01`; `client-preset-refinery-01`; `client-preset-refinery-02`]
7. **Make probe evidence fail closed and portable.** Replace hard-coded checkout paths with one repository-root resolver; stop suppressing golden-capture failures; validate fresh output; add positive/zero/negative viewport tests; synchronize the seven-probe README. \[`PPR-01`; `PROBES-RUNTIME-01`; `PROBES-RUNTIME-02`; `PPR-02`]
8. **Take dependency/gate hygiene as maintenance, not incident work.** Align peer ranges, apply the one dedupe lift, keep burning the 276-site ratchets, and expand `bounded-list-limit` only when a real `topN`/named-schema escape warrants the added complexity. \[`DEPLOCK-02`; `DEPLOCK-03`; `GA-H-01`; `GA-H-03`]
9. **Revalidate documentation and snapshot-only rows only when touched.** Repair active-law/current-record contradictions before archive cosmetics; preserve history intentionally; batch vendor/mocks link/provenance work. Do not boil the ocean or infer current defects from old report prose. \[`ROLLING-RECONCILIATION.md:67`]

## Final demonstrability conclusion

**Demonstrably complete:** the cold audit read/admission barrier for 78 lanes; frozen partition coverage of 5,700 unique paths; rolling assignment coverage of 5,704 OWNED paths; all 312 required lane artifacts; exact receipt ownership; status reconciliation through `5783331`; and the current official 14-stage static tier. \[`PORTFOLIO-QA.md:14-30,119-140`; `FINAL-VERIFICATION.md:11-15,35-52`]

**Demonstrably incomplete:** the agent command-guard boundary; two bounded dependency upgrades; autosave invalid-configuration handling; code-editor reliability; refinery primary-surface proof; mutation enforcement; probe portability/fail-closed behavior; peer/dedupe hygiene; and controlled gate debt. The repository therefore cannot be called fully graduated or release-proven from this audit. \[current P1/P2/P3 tables above]

**Not yet knowable from this evidence:** current status of every snapshot-only lane finding; whole node/CT/e2e behavior at closing HEAD; external-provider, live-model, GPU, container, and live-e2e readiness; final push/full/mutation outcomes; and whether candidate provider-minus-client observations correspond to intended product requirements. \[`ROLLING-RECONCILIATION.md:63-74`; `FINAL-VERIFICATION.md:72-84`]
