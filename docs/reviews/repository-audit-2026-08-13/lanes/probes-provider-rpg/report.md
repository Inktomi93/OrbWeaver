# Provider and RPG probe corpora audit

## Lane identity

- Lane: `probes-provider-rpg`
- Semantic scope: standalone paid-provider wire probes, their committed raw observations, and archived RPG extraction spike corpora.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00`
- Working-tree basis: current bytes; all 39 owned SHA-256 values match the frozen assignment.
- Assigned files read: 39 / 39 (100%).
- Assigned lines read: 7,571 / 7,571 frozen logical lines (100%). `wc -l` is 7,567 only because four JSON files have no trailing newline, while bytes and hashes match.
- Assigned bytes read: 481,657 / 481,657 (100%).
- Dirty assigned paths: 0 by SHA-256.
- Exclusions: production consumers, the unassigned design writeups, live OpenRouter/Anthropic calls (documented paid external operations), and unconfigured local vLLM.

## Read receipt

`read-receipt.tsv` covers every `OWNED` row in `assignment.txt`; coverage is 100%. Shared prerequisites were read but are deliberately not duplicated in the owned receipt.

## Architecture observed

The OpenRouter batch composes seven probe modules in a direct CLI entry point (`scripts/probes/openrouter/run.ts:13-25`; R3). It refuses to fire without a key, skips only already-verdict-complete probe JSONL, then awaits each selected module (`scripts/probes/openrouter/run.ts:28-47`; R3). Its shared kit resolves credentials from process environment first and then walks upward for the repository `.env`, avoiding worktree-local configuration assumptions (`scripts/probes/openrouter/_kit.ts:129-159`; R2).

The RPG corpus is explicitly a spike/archive rather than a production surface: its README marks the pre-R2R3 captures and matching harnesses as not runnable against current contracts (`scripts/probes/rpg-extraction/README.md:6-10`; R2). It nevertheless retains an executable, no-spend card-teach assembly path (`scripts/probes/rpg-extraction/card-teach-probe.ts:413-425`; current 0.4-second receipt, R5 for that branch only). Current paid provider behavior is not claimed: raw JSONL and `RESULTS.md` are historical R4 evidence until remeasured.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| OpenRouter standing wire batch (19 owned files) | 4 | 3 | 2 | 1 | 3 | medium | `scripts/probes/openrouter/run.ts:13-47`; `_kit.ts:129-159`; committed raw rows; no current paid run. |
| RPG extraction/card probes and archived captures (20 owned files) | 3 | 2 | 1 | 0 | 1 | high | `scripts/probes/rpg-extraction/README.md:6-20`; `card-teach-probe.ts:413-425`; PPR-01. |

## Findings

### PPR-01 — Eight RPG probe entry points are pinned to one developer checkout path

- Severity: P2
- Class: operability-gap
- Confidence: high — a checkout at any other absolute path reaches a different/nonexistent `.env` before the documented live call can authenticate.
- Evidence rung: R2
- Scope denominator: 20 assigned RPG TypeScript files; 8 embed `/home/inktomi/inktomi-stack/development/orbweaver`, while the OpenRouter kit uses upward discovery.
- Receipts: `scripts/probes/rpg-extraction/card-teach-probe.ts:42-50`; `effort-ladder-native-vs-or.ts:33`; `effort-reasoning-probe.ts:35`; `replay-toolround.ts:16-23`; `run.ts:221-231`; `run-coverage.ts:285-306`; `steer-probe-real.ts:19-29`; `steer-probe.ts:42-50`. The corpus's documented direct runner invocation is `README.md:17-20`.
- Established fact: these eight scripts read the absolute checkout's `.env`; moving or cloning the repository means they do not use the invoking checkout's credentials. `run.ts` and `run-coverage.ts` also present this path as their only credential source.
- User or system impact: a developer working from a worktree or ordinary clone outside Nate's directory cannot reproduce these probe measurements without source edits or manually arranging credentials at the original absolute path.
- What remains unverified: no relocated-copy execution was made because every affected path is a live-provider probe and can spend money; the deterministic path construction is sufficient to establish the portability failure.
- Suggested next check or fix: share the OpenRouter kit's upward `.env` resolver (or derive the repository root from `import.meta.url`) across the RPG probe scripts, then run a no-spend resolver test from a temporary relocated tree.

### PPR-02 — OpenRouter README describes five probes while the default batch runs seven

- Severity: P3
- Class: law-drift
- Confidence: high
- Evidence rung: R3
- Scope denominator: 7 modules in the default `ALL` dispatch array.
- Receipts: `scripts/probes/openrouter/README.md:3,9-15` calls the corpus “Five standing wire probes” and lists only F4, F4a, F5, OR-5, and OR-7; `scripts/probes/openrouter/run.ts:13-25` imports and defaults to seven modules including OR-5b and OR-7b; `scripts/probes/openrouter/RESULTS.md:18-19` records both omitted probes.
- Established fact: the documented no-argument command defaults to seven modules, while the README's inventory and cost framing omit two of them.
- User or system impact: an operator can invoke a larger paid batch than the README represents and will not discover the later controls from its stated inventory.
- What remains unverified: the exact present-day charge, which varies by provider and was intentionally not remeasured.
- Suggested next check or fix: make the README derive or at least mirror `ALL`, list OR-5b/OR-7b, and update the stated full-batch estimate.

## Proven strengths

- The OpenRouter batch avoids cross-run cache contamination by requiring probe-complete JSONL verdict rows before skip behavior and by placing the selected execution behind one CLI loop (`scripts/probes/openrouter/run.ts:24-47`; R3); the committed raw-result corpus records every listed arm (for example `scripts/probes/openrouter/results/or7b.jsonl:1-26`; historical R4).
- The card-teach harness has an explicit no-spend positive-control path and it currently exits before provider execution (`scripts/probes/rpg-extraction/card-teach-probe.ts:419-425`; current command receipt, R5 for this branch).

## Declared versus completed

| Declared surface | Strongest evidence | Status |
| - | - | - |
| Seven-module OpenRouter cache/reasoning probe batch | R3 direct CLI dispatch; historical R4 raw JSONL | Implemented and historically measured; no current live rerun. |
| One-call RPG extraction coverage/method matrix | R2 archived source and captures | Explicitly archived against retired vocabulary; not a current-contract verification surface. |
| Card-teach copy assembly | R5 current no-spend branch | Assembly currently runs; hosted model/scoring outcomes remain historical. |
| Local 8B vehicle comparison | R2 standalone source | Requires an unproven local endpoint; no runnable receipt in this lane. |

## Tests and gates

The owned corpus contains 0 unit, 0 integration, 0 contract, 0 CT, 0 e2e, and 0 type-test files (two independent file inventories; 20 TypeScript files scanned). The repository AST instrument excludes standalone `scripts/probes/**` roots, so its zeroes were not used to make code-absence claims. The only current behavioral command was the declared `CARD_DRY` positive control; no static gate positive control or current paid-provider run is credited. The historical raw result artifacts provide meaningful probe design and historical observations, not current external-service proof.

## Cross-lane edges

- `PPR-01` should be reconciled by the scripts/tooling owner if this archive is expected to remain reproducible; the OpenRouter corpus already contains the portable resolver pattern.
- The provider-runtime and server-RPG lanes own any product conclusions cited by historical `RESULTS.md`; this lane does not assert that the live provider or current RPG contracts retain those results.
- The audit-control owner should standardize the final-unterminated-line convention: four JSON rows differ from `wc -l` by one each despite matching assignment bytes and SHA-256.

## Tool receipts

`pnpm ast` was read and invoked before structural analysis. It completed three commands but scans zero standalone script files, which is logged as an instrument boundary rather than a clean negative. Literal scans covered all 20 assigned TypeScript files and were used only for positive hard-coded-path/key-control claims. Complete commands, timings, exclusions, and the no-spend run are in `commands.md`.

## Lane verdict

All 39 assigned files were read and hash-reconciled with the frozen snapshot.  
The OpenRouter batch is directly wired and has detailed historical raw evidence, but current live proof was correctly not bought.  
Eight RPG probe scripts are not checkout-portable because they hard-code the original `.env` path (PPR-01).  
The OpenRouter README omits two modules the default paid batch actually runs (PPR-02).  
The RPG extraction corpus declares itself archived; it must not be treated as current-contract validation.  
The only current behavioral receipt is the safe card-teach dry branch.
