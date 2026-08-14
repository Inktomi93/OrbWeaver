# Portfolio admission QA

## Verdict: READY for cold Sol synthesis

This is admission control, not repository synthesis. I fully read the audit controls (`README.md`,
`RUBRIC.md`, `REPORT-TEMPLATE.md`, `SNAPSHOT-POLICY.md`, and `SYNTHESIS-TEMPLATE.md`), both JSON
controls, and all four artifacts for all 78 lanes. The required lane artifact barrier and the prior
receipt/report admission corrections now pass. Receipt bytes remain authority for their recorded
rolling audit snapshots under `SNAPSHOT-POLICY.md`; later checkout changes are disclosed below as a
rolling-range caveat, not used to invalidate completed reads.

## Exact inventory and coverage

| Population | Lanes | Paths | Text lines | Bytes |
| - | -: | -: | -: | -: |
| Frozen `MANIFEST-ALL.json` | 78 | 5,700 | 936,529 | 76,311,612 |
| Rolling `assignment.txt` OWNED rows | 78 | 5,704 | 5,621 text + 83 binary | 937,932 text lines; 76,427,616 total bytes |
| Required lane artifacts present | 78 | 78 assignments + 78 receipts + 78 commands + 78 reports | — | — |

The frozen manifest has 5,700 unique paths. Every frozen path appears exactly once among rolling
OWNED assignments: zero omissions, duplicate owners, or lane moves. The four allowed post-manifest
additions are:

- `docs/design/event-bus-coverage-survey.md` (`docs-design-a-f`)
- `docs/design/rpg-rewind-stuck-state.md` and `docs/design/staleness-and-session-freshness.md` (`docs-design-n-s`)
- `docs/reviews/stickler/2026-08-14-staleness-diagnosis.md` (`docs-reviews-n-z`)

Synthesis must preserve both denominators. The 5,704 rolling selection is not the 5,700-file frozen
manifest. It must state the rolling audit range and must not equate a later HEAD with a completed
receipt snapshot.

## Resolved admission corrections

The following previously blocking artifact defects were corrected and rechecked:

- `client-chat-lib` now has a real tab-delimited header and 86 parseable receipt rows
  ([`read-receipt.tsv:1`](lanes/client-chat-lib/read-receipt.tsv:1)).
- `verification-harness` now has all 64 assigned paths with path, current lines, bytes, full SHA-256,
  and `full` read status; its current aggregate is 13,154 lines / 723,871 bytes
  ([`read-receipt.tsv:1`](lanes/verification-harness/read-receipt.tsv:1),
  [`report.md:5`](lanes/verification-harness/report.md:5)).
- `root-config` restores the 64-character `knip.ts` hash; its 31 rows parse and reconcile to the
  stated rolling receipt basis ([`read-receipt.tsv:18`](lanes/root-config/read-receipt.tsv:18)).
- The specified report repairs now use exact rubric classes, lowercase confidence, complete finding
  fields, numeric scorecards, and proper R4/R5-only strengths. This includes the corrected candidate
  containment in `server-discovery-automation` and `client-shell-features`
  ([`server-discovery-automation/report.md:234`](lanes/server-discovery-automation/report.md:234),
  [`client-shell-features/report.md:39`](lanes/client-shell-features/report.md:39)).
- No numeric scorecard table cell contains `N/A`.

The amended UI evidence is correctly non-deterministic rather than a deterministic target failure:
the one-file rerun passed, while repeat-each=3 produced 43 passes and 2 failures
([`ui-rendering/commands.md:8`](lanes/ui-rendering/commands.md:8),
[`ui-rendering/report.md:56`](lanes/ui-rendering/report.md:56)). `DEPLOCK-01` is correctly bounded
as one P2 supply-chain upgrade candidate, not twelve independently reachable P1 exploits
([`dependency-lock/report.md:29`](lanes/dependency-lock/report.md:29),
[`SECURITY-VALIDATION.md:32`](SECURITY-VALIDATION.md:32)).

## Closing-state caveat — later current-tree changes

At current `HEAD` `2f0dcae49ccac1aba576efd7aa292973c36d338a`, mechanical re-hash/re-byte comparison of
every assigned non-binary path found 218 differences across 38 lanes. These are post-receipt rolling
changes, not receipt corruption: the valid recorded receipt remains the byte authority for what its
lane read. Each table receipt is the first affected data row in that lane; its count covers every
affected path in the lane. Sol must name this range rather than describe the result as an all-current-
HEAD audit.

| Lane | Stale path count | First hard-failure receipt |
| - | -: | - |
| lower-contracts | 6 | [read-receipt.tsv:24](lanes/lower-contracts/read-receipt.tsv:24) |
| server-chat-core | 1 | [read-receipt.tsv:110](lanes/server-chat-core/read-receipt.tsv:110) |
| server-rpg | 6 | [read-receipt.tsv:14](lanes/server-rpg/read-receipt.tsv:14) |
| server-discovery-automation | 22 | [read-receipt.tsv:30](lanes/server-discovery-automation/read-receipt.tsv:30) |
| server-identity-domains | 10 | [read-receipt.tsv:6](lanes/server-identity-domains/read-receipt.tsv:6) |
| server-content-domains | 25 | [read-receipt.tsv:45](lanes/server-content-domains/read-receipt.tsv:45) |
| server-search-refinery | 27 | [read-receipt.tsv:7](lanes/server-search-refinery/read-receipt.tsv:7) |
| server-world-workloads | 1 | [read-receipt.tsv:155](lanes/server-world-workloads/read-receipt.tsv:155) |
| server-foundation | 2 | [read-receipt.tsv:4](lanes/server-foundation/read-receipt.tsv:4) |
| server-providers-runtime | 12 | [read-receipt.tsv:4](lanes/server-providers-runtime/read-receipt.tsv:4) |
| server-infra | 3 | [read-receipt.tsv:33](lanes/server-infra/read-receipt.tsv:33) |
| server-entry-compose | 9 | [read-receipt.tsv:3](lanes/server-entry-compose/read-receipt.tsv:3) |
| server-entry-edge | 2 | [read-receipt.tsv:28](lanes/server-entry-edge/read-receipt.tsv:28) |
| server-transport-kit | 7 | [read-receipt.tsv:43](lanes/server-transport-kit/read-receipt.tsv:43) |
| client-chat-components | 3 | [read-receipt.tsv:2](lanes/client-chat-components/read-receipt.tsv:2) |
| client-chat-runtime | 5 | [read-receipt.tsv:12](lanes/client-chat-runtime/read-receipt.tsv:12) |
| client-preset-refinery | 5 | [read-receipt.tsv:82](lanes/client-preset-refinery/read-receipt.tsv:82) |
| client-rpg-settings | 5 | [read-receipt.tsv:23](lanes/client-rpg-settings/read-receipt.tsv:23) |
| client-shell-features | 3 | [read-receipt.tsv:59](lanes/client-shell-features/read-receipt.tsv:59) |
| client-identity-features | 10 | [read-receipt.tsv:15](lanes/client-identity-features/read-receipt.tsv:15) |
| client-content-features | 12 | [read-receipt.tsv:3](lanes/client-content-features/read-receipt.tsv:3) |
| client-components | 1 | [read-receipt.tsv:3](lanes/client-components/read-receipt.tsv:3) |
| client-data | 10 | [read-receipt.tsv:8](lanes/client-data/read-receipt.tsv:8) |
| client-lib | 2 | [read-receipt.tsv:15](lanes/client-lib/read-receipt.tsv:15) |
| client-state | 5 | [read-receipt.tsv:19](lanes/client-state/read-receipt.tsv:19) |
| client-shell | 3 | [read-receipt.tsv:14](lanes/client-shell/read-receipt.tsv:14) |
| ui-primitives-j-r | 3 | [read-receipt.tsv:23](lanes/ui-primitives-j-r/read-receipt.tsv:23) |
| gates-a-h | 4 | [read-receipt.tsv:19](lanes/gates-a-h/read-receipt.tsv:19) |
| gates-i-p | 1 | [read-receipt.tsv:90](lanes/gates-i-p/read-receipt.tsv:90) |
| gates-q-z | 2 | [read-receipt.tsv:2](lanes/gates-q-z/read-receipt.tsv:2) |
| codemods | 1 | [read-receipt.tsv:3](lanes/codemods/read-receipt.tsv:3) |
| developer-runtime | 2 | [read-receipt.tsv:7](lanes/developer-runtime/read-receipt.tsv:7) |
| integration-tests | 3 | [read-receipt.tsv:56](lanes/integration-tests/read-receipt.tsv:56) |
| docs-core-law | 1 | [read-receipt.tsv:7](lanes/docs-core-law/read-receipt.tsv:7) |
| docs-core-spines | 1 | [read-receipt.tsv:8](lanes/docs-core-spines/read-receipt.tsv:8) |
| docs-design-a-f | 1 | [read-receipt.tsv:15](lanes/docs-design-a-f/read-receipt.tsv:15) |
| docs-design-n-s | 1 | [read-receipt.tsv:27](lanes/docs-design-n-s/read-receipt.tsv:27) |
| docs-current | 1 | [read-receipt.tsv:9](lanes/docs-current/read-receipt.tsv:9) |

Two `client-identity-features` assignments were additionally removed from the later current tree;
their complete rolling receipt rows remain valid and this is handed to rolling reconciliation:

- [`assignment.txt:15`](lanes/client-identity-features/assignment.txt:15) — `packages/client/src/features/character/lib/filter-characters.ts`
- [`assignment.txt:106`](lanes/client-identity-features/assignment.txt:106) — `tests/client/features/character/lib/filter-characters.test.ts`

All 83 binary receipt rows were excluded from line-count comparison because their sanctioned line
value is `N/A`; this is not a numeric-scorecard exception. There were no byte/hash-equal but
line-only mismatches after applying each receipt's declared counting convention.

## Other admission checks

- Each assigned OWNED path has a receipt entry; duplicate receipt rows that also record SHARED scope
  were accepted only when an exact OWNED/current receipt exists.
- Incomplete, blocked, pending, CT-tool-state, and unsafe-extra-`--` command attempts are not
  credited. The four historical unsafe CT invocations remain explicitly uncredited and each has a
  later sanctioned terminal receipt.
- Proven strengths with explicit rungs are R4/R5 and omit severity. Candidate observations are not
  counted as confirmed P0–P3 findings.
- Official nonzero evidence is tied to a named canonical artifact or explicitly says that no such
  artifact exists. No report may infer current HEAD from its older receipt bytes.

## Rolling-reconciliation handoff

1. Name the rolling snapshot range in synthesis; do not silently relabel receipt bytes as the later
   `2f0dcae49ccac1aba576efd7aa292973c36d338a` checkout.
2. Have rolling reconciliation inventory the 218 later path changes and resolve/reassign the two
   removed character-filter paths before a subsequent audit refresh.
3. Re-read/retest only if a new audit elects to cover that later checkout; this completed portfolio
   is cleared for synthesis on its documented receipt range.

Admission barrier satisfied: **READY** for cold Sol synthesis.
