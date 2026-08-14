# Lane report — docs-architecture-history-n-z

## Lane identity

- Lane: `docs-architecture-history-n-z`
- Semantic scope: 35 history/reference/spec documents from `Pain-Ledger.md` through `workloads-deferred-designs.md`; historical records are evidence, not current implementation law unless a current law explicitly adopts a fact.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00`
- Working-tree basis: all owned documents were clean and hash-identical to the assignment snapshot when read.
- Assigned files read: 35 / 35 (100%).
- Assigned lines read: 6,600 / 6,600 (100%).
- Assigned bytes read: 604,150 / 604,150 (100%).
- Dirty assigned paths: 0.
- Tests examined: 0 unit, 0 integration, 0 contract, 0 CT, 0 e2e, 0 type. This lane owns historical docs; current test imports surfaced incidentally through `pnpm ast` but were not reviewed as test content.
- Commands with tool failure: 2 incomplete multi-lens AST batches and 1 shell construction error; all credited individual AST results completed after rerun. See `commands.md`.
- Long-running AST commands: individual lenses completed in 14.0–14.7 seconds; the two 30-second grouped batches were incomplete and not used as evidence.

## Read receipt

`read-receipt.tsv` covers all 35 rows from `assignment.txt`; each current SHA-256 equals its assigned SHA-256. No binary files are in scope.

## Architecture observed

The current constitution classifies the history corpus as reference-only archeology, while directing current structural questions to `pnpm ast` and current program truth to `docs/retro-workboard.md` (`docs/architecture/core/AGENTS.md:291-302`, R3 as current-law routing). The five active `UI-Lib-*` companions are explicitly evidence/provenance mines rather than law (`docs/architecture/history/UI-Lib-TanStack-Form.md:7-11`, `UI-Lib-TanStack-Query.md:7-13`, R2); their corresponding libraries have resolved current importers, including Form (6 references), Query (197), Router (7), Virtual (5), and Zustand (13) (command receipts, R3; Form/Zustand tests imported at R4 only for the specific modules named in `commands.md`).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| History corpus provenance (35 files) | 4 | 3 | 3 | 1 | 2 | high | Full receipt; current-law routing at `docs/architecture/core/AGENTS.md:291-302`; `pnpm check:docs` exit 0. |
| Active UI library evidence mines (Form/Query/Router/Virtual/Zustand) | 4 | 3 | 2 | 1 | 4 | high | Mine disclaimers cited above; five importer lenses in `commands.md` (R3). Test importer reach is only R3, not assertion evidence. |
| Retired parity protocol | 1 | 0 | 0 | 0 | 0 | high | `docs/architecture/history/neo-orb-parity-audit.md:5-35`; current retirement routing at `docs/architecture/core/AGENTS.md:298` (R3). |

## Findings

### DARCHH-NZ-01 — Retired parity protocol still presents itself as the mandatory starting workflow

- Severity: P2
- Class: law-drift
- Confidence: high — raises from a documentation fix to a confirmed no-impact historical archive only if a maintained redirect is deliberately added and the imperative text is removed or clearly quarantined.
- Evidence rung: R3
- Scope denominator: 35 assigned documents; 1 retired protocol document with 6 absent prerequisite paths.
- Receipts: `docs/architecture/history/neo-orb-parity-audit.md:5-13` calls itself the start point and mandates AGENTS-1/2/3; `docs/architecture/history/neo-orb-parity-audit.md:24-35` directs readers to the deleted domain-doc directory and `core/Core-BUILD-PLAN.md`; all six named targets are absent by existence check. The current index calls this exact record “campaign complete, protocol retired” (`docs/architecture/core/AGENTS.md:298`, R3).
- Established fact: a cold reader who follows the document’s imperative prose gets blocked before reaching the current reading-set router; this is contradictory metadata/operational prose, not evidence that parity implementation is currently broken.
- User or system impact: a historical file can waste or misdirect a future audit agent into deleted instructions and obsolete search tooling.
- What remains unverified: whether any external bookmark or code comment intentionally points agents to this file as a workflow.
- Suggested next check or fix: preserve the record but add frontmatter/history banner that its protocol is retired and point to the current audit workflow and `docs/architecture/core/AGENTS.md` reading-set router; replace or annotate every deleted raw path.

### DARCHH-NZ-02 — Shell Chrome history claims both full closure and an unbuilt remainder

- Severity: P3
- Class: law-drift
- Confidence: high — the contradiction is in adjacent status prose and does not require inferring current UI behavior.
- Evidence rung: R2
- Scope denominator: 35 assigned documents; 1 shipped-history document.
- Receipts: the front matter and banner mark it `history`, `shipped`, and say all §E steps landed (`docs/architecture/history/shell-chrome-unification.md:1-11`); the next status block says the rail/sheet/prop-kill waves and several mechanisms remain unbuilt (`docs/architecture/history/shell-chrome-unification.md:13-34`).
- Established fact: the same document offers mutually exclusive operational states, despite saying history is not law.
- User or system impact: a reader using it for provenance cannot tell whether the later design is a historical pre-landing snapshot or a current remainder.
- What remains unverified: which historical snapshot is intended to survive verbatim.
- Suggested next check or fix: retain both records but label lines 13-34 as the pre-closure snapshot (with date/commit), or delete that stale operational preamble.

### DARCHH-NZ-03 — Stats/discovery document’s draft headline contradicts its own landed gate record

- Severity: P3
- Class: law-drift
- Confidence: high — the named gate and Tier-3 source exist, and the exported economics verb is composed into the discovery service.
- Evidence rung: R3
- Scope denominator: 35 assigned documents; 1 draft/spec historical document.
- Receipts: title and status call tiers/gate unbuilt (`docs/architecture/history/stats-discovery-seam.md:2-13`), but the same file calls `discovery-no-stats-rollups` landed and describes Tier 3 as built (`docs/architecture/history/stats-discovery-seam.md:46-60`). `scripts/check/gates/discovery-no-stats-rollups.ts` exists; `pnpm ast ident createEconomicsInsights --in packages/server/src` resolves the declaration and its composition into `domain/discovery/service.ts` (command receipt, R3).
- Established fact: the preserved design rationale is useful, but “unbuilt tiers” and the remaining-unbuilt gate statement are stale inside the current bytes.
- User or system impact: limited to misleading historical provenance; it does not establish an implementation defect.
- What remains unverified: execution of the gate’s positive control; this lane did not run gate tests.
- Suggested next check or fix: retitle/status it as a realized seam with the remaining ST-parity probe explicitly separated, or fully graduate it to a dated archaeology record.

### DARCHH-NZ-04 — Two closed D62 program records retain raw references to deleted law/build paths

- Severity: P3
- Class: law-drift
- Confidence: high — the paths are absent; the documents’ own first banner says not to work from their status tables.
- Evidence rung: R1
- Scope denominator: 35 assigned documents; 2 closed program records.
- Receipts: `docs/architecture/history/ui-polish-punchlist.md:3-9` names absent `core/Core-Path-Registry-D62.md` and `core/Core-BUILD-PLAN.md`; `docs/architecture/history/ux-flow-revamp.md:3-14` repeats both. The current registry exists but the two referenced paths do not (existence check in `commands.md`).
- Established fact: these are raw inline-code references rather than Markdown links, so the Markdown-link resolver and `pnpm check:docs` did not flag them.
- User or system impact: the documents correctly warn they are frozen, but any reader chasing their historical decision/build provenance hits deleted paths rather than the current registry/workboard.
- What remains unverified: whether old material was intentionally removed without a replacement redirect.
- Suggested next check or fix: replace the raw paths with `Core-Path-Registry.md` / `docs/retro-workboard.md` archival pointers, keeping D62/Phase-6 as historical labels.

## Proven strengths

None. The lane obtained R3 wiring evidence for the active UI library companions, but did not inspect behavioral assertions or execute a positive-controlled gate.

## Declared versus completed

| Declared surface | Strongest current evidence | Classification |
| - | - | - |
| UI library companions | R3 resolved current library imports | Useful active provenance; not law. |
| `Shared-Drawer-Dissolution-Map` custom-parameters row | R1 absence of `packages/server/src/kit/custom-parameters.ts` confirms its “NOT BUILT” path-level claim only | Historical open-row statement remains plausible; behavior was not re-audited. |
| Stats/discovery Tier 3 | R3 `createEconomicsInsights` declaration plus service composition; named gate file exists | Implementation is wired at the checked service seam; gate execution unverified. |
| Neo/orb parity protocol | R3 current law says protocol retired | Historical campaign log, not executable current workflow. |

## Tests and gates

`pnpm check:docs` passed but only checks formatting; it cannot detect deleted raw inline-code paths. The lane’s repository-relative Markdown-link resolver found 0 broken actual Markdown destinations. The stats/discovery gate was not executed, so its claimed positive control remains R0 for this lane. No behavioral suite was appropriate for a no-source-change historical documentation audit.

## Cross-lane edges

- The synthesis/current-law lane should reconcile DARCHH-NZ-01 with any repository-wide documentation policy: the current index already calls the protocol retired, but a redirect/banner decision belongs with current-law ownership.
- The UI/current-program lane should decide whether to normalize DARCHH-NZ-02 through DARCHH-NZ-04; no implementation work is implied by these documentation findings.

## Tool receipts

See `commands.md` for exact AST lenses, counts, path-existence checks, docs-format result, link-resolver result, exclusions, and incomplete command handling.

## Lane verdict

All 35 assigned documents were read at their assigned bytes and remain snapshot-clean. The corpus is mostly well-framed as history or provenance, and the active UI library mines correlate to live library use. Four stale or contradictory operational/provenance surfaces remain: a retired parity protocol that says “START HERE,” a self-contradictory shipped shell record, a stats/discovery title/remainder contradicted by its own landed account, and two frozen D62 records with deleted raw references. No current feature failure is asserted from those historical records; the largest uncertainty is unexecuted gate behavior, intentionally outside this documentation lane.
