---
kind: research
status: active
updated: 2026-09-04
---

# Agent browser-escape workflow census

## Judgment

There is no evidence-backed new Snap arm to build. The observed headless-DevTools and shell-browser work maps to current Snap capabilities; the material residual is documentation and enforcement: make the Snap-first boundary explicit for repository-owned rendered work, with the owner-profile Chrome exception stated just as explicitly.

The corpus contains **3,388 actual separate-browser events** (2,450 shell Playwright/Puppeteer/CDP/Chromium commands, 826 headless Chrome DevTools MCP calls, and 112 logged-in Chrome calls). All had paired results: 2,870 success and 518 error (84.7% success). This is an event census, not a claim that every event was an intentional abandonment of Snap.

The conservative paired-workflow rule found **3,028 candidate escape events**: 1,018 occurred after a Snap command in the same transcript's preceding 12 browser-tool ordinals, and 2,010 had no such nearby Snap command but performed a job that current Snap help/source covers. 471/3,028 (15.6%) ended in an error result, so the recovery cost is substantial rather than hypothetical. A window contains event-level pairs, not one unique human task: a long DevTools or Playwright sequence contributes several events.

Logged-in Chrome is a legitimate separate-browser case even when it visits a local Orbweaver page: it owns an existing profile, authenticated state, and pre-existing tabs. Keep it out of Snap. The current browser census recorded 112 of those calls; only 10 fall inside the deliberately conservative proximity rule, so they must not be read as product gaps.

## Scope and method

Snapshot: 2026-09-04T04:50:38Z. The append-only corpus was live during the pass.

The script streamed every `*.jsonl` under the two account project stores whose path contained `orbweaver`: 855 Claude-A files and 699 Claude-B files, 3,296,816,209 bytes in total. It saw 223,687 top-level tool uses. Fourteen Claude-B JSONL lines were malformed during the live pass and were disclosed rather than silently skipped.

Only top-level assistant `tool_use` blocks and exact later top-level `tool_result` blocks were counted. Pairing is `account + tool_use_id`; 122 duplicate use copies were removed. Prompts, prose, tool-result quotations, source text, selectors, URLs, paths, cookies, tokens, and result bodies are not retained. Browser events were exact DevTools/Chrome tool names or Bash commands actually naming Playwright, Puppeteer, Chrome Remote Interface, or Chromium. The companion script records aggregate categories only.

The existing CLI/artifact, MCP/recovery, and selector/choreography censuses were read first and supply the broad rendered-tool denominators, result conventions, corpus layout, and redaction policy. This pass deliberately adds only same-transcript pairing and cross-tool escape classification.

## Candidate escape jobs

| job (event-level) | candidates | current Snap coverage | disposition |
| - | -: | - | - |
| precise DOM / JavaScript evaluation | 1,326 | `--eval` | Document Snap-first; do not add evaluator aliases. |
| mobile/device/load emulation | 389 | `--mobile`, `--viewport`, `--network`, `--cpu-throttle` | Keep current environment arm and reset/ownership receipts. |
| multi-tab/page work | 322 | `--pages` with `@N` action targets | Document one multi-page recipe. |
| network/HAR/request inspection | 301 | `--requests`, session export/HAR, `--diagnostics` | Point agents at report readers, not raw DevTools. |
| console/issues/a11y | 248 | `--strict-console`, `--diagnostics`, `--aria`, `--map` | Document verdict-bearing report fields. |
| map/navigation discovery | 201 | `--goto`, `--map`, `__orb` navigation | Use map/capabilities first. |
| Lighthouse/perf/React/heap | 96 | `--lighthouse`, profiling arms, `--react-profile`, heap arms | Existing Snap arms own this; separate explicit passes where composition refuses contamination. |
| file chooser / drag-and-drop | 82 | `--upload`, `--drop-files` | Keep chooser and real DataTransfer paths distinct. |
| authenticated owner profile | 10 in proximity rule; 112 total logged-in Chrome calls | intentionally outside Snap | Keep a documented separate authority boundary. |
| other / unclassifiable | 53 | not asserted | No capability recommendation from this bucket. |

The high shell-browser count is not proof of a missing product capability. It includes actual Bash browser automation, but the redacted classifier deliberately does not retain command semantics beyond the category. Treat it as documentation/enforcement pressure, not proof that Snap lacks a particular feature.

## Historical versus current

The 826 headless DevTools calls span 2026-07-27 through 2026-09-02; the sibling MCP census independently establishes that its heavy jobs were evaluation, navigation, screenshots, Lighthouse, input, and emulation. Those are pre-unification history or already-retired tool choice, not a basis for reviving DevTools MCP. Current Snap evidence is in [`tooling/src/snap/contract/help.ts`](../../../tooling/src/snap/contract/help.ts): file actions at lines 62-67, multi-page state at 124-126, report/diagnostic and console evidence at 29-45, environment emulation at 84-102, and its explicit session ownership contract at 151-178. The arm declarations additionally establish heap, filmstrip, React, Lighthouse, map, and ARIA support.

The logged-in Chrome window is 2026-07-29..30 in the sibling census. Its browser/profile authority remains valid regardless of that age; it is not an obsolete headless-instrument path.

## Recommendations

1. Add one Snap-driving recipe titled **“When not to escape Snap”**: repository-owned page navigation, DOM evaluation, screenshots, ARIA/map, console/diagnostics, requests/HAR, Lighthouse, load/mobile, upload/drop, React/heap, and multi-page work start in Snap. Include the one-line current replacement for each category above.
2. In the same recipe, state the hard boundary: use logged-in Chrome only for owner-authorized authenticated profile state, pre-existing tabs, or external cross-site work. Never copy that state into Snap evidence.
3. Keep the existing `--pages`/`@N` and report-reader examples prominent. Their presence is implemented; this census shows agents still choose separate browser paths frequently enough that discoverability, not another arm, is the viable residual work.
4. Do not restore headless DevTools MCP or add speculative dialog, PWA, generic drag, or new JS-evaluator commands. No paired escape evidence establishes an unmet capability after current Snap coverage is considered.

## Limits

- Same-transcript proximity is evidence of a workflow transition, not intent. Calls may be independent tasks in a busy lane.
- One Bash result covers a whole command; error counts are exposure, not attribution to one classified browser operation.
- The shell classifier recognizes actual browser-runtime spellings; it cannot prove whether every shell browser action was avoidable without retaining sensitive command text, which this census deliberately refuses to do.
- `other` stays unclassified rather than being inflated into a feature request.

## Reproduce

```bash
node scripts/research/agent-browser-escape-workflow-census.ts \
  --out docs/reviews/research/2026-09-04-agent-browser-escape-workflow-census.json
```
