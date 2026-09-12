---
kind: research
status: active
updated: 2026-09-04
---

# Agent CLI and artifact-usage census

## Executive judgment

Snap is the only rendered instrument with enough observed use to justify a broad public CLI: **4,623 actual invocations**, 91% successful, across both Claude accounts. `design-audit` also earns its separate surface: 381 invocations and substantial JSON consumption. The historical `motion-audit` and `perf-meter` commands should stay retired into Snap arms exactly as the current substrate ruling requires. Record's useful capability is the click-strip/contact sheet, not its separate CLI or animation media: six successful product calls produced media and agents opened **four click-strip PNGs but zero GIFs or WebMs**.

**Owner disposition after this census — Board #1310:** retire the separate `pnpm record` CLI, fold click-strip/contact-sheet capture into Snap filmstrip, and kill GIF/WebM generation by default. Implementation is in progress. The historical counts below remain evidence for that ruling; they are not a recommendation to preserve the old command. `pnpm record` should end as a loud refusal that prints the exact Snap filmstrip replacement.

The largest adoption failure is not a missing analyzer. It is evidence consumption. No agent invoked Snap's report reader despite 4,623 Snap calls. Successful Snap results listed HAR output in 172 invocations and ZIP output in 175, but the transcripts contain zero subsequent HAR or ZIP opens/parses/citations. Scenario and matrix use was also tiny—19 and 18 flag uses—next to thousands of hand-written `--eval`, `--click`, `--goto`, and `--out` actions.

The durable aggregate is [`2026-09-04-agent-cli-artifact-usage-census.json`](./2026-09-04-agent-cli-artifact-usage-census.json). The reusable, read-only parser is [`scripts/research/agent-cli-artifact-census.ts`](../../../scripts/research/agent-cli-artifact-census.ts). Neither file contains transcript text, commands, routes, URLs, user prose, tokens, cookies, or artifact paths.

## Scope and method

Snapshot time: **2026-09-04T04:28:47Z**. The corpus was live while scanned, so this is a timestamped observation rather than a locked archive.

Every `*.jsonl` whose path contained `orbweaver` was streamed from:

- `~/.claude/projects/`, including main and subagent transcripts;
- `~/.claude-b/projects/`, including main, subagent, and named Orbweaver worktree project directories.

The parser counted only top-level assistant `tool_use` blocks. Bash prose, prompts, briefs, tool results quoting commands, source edits containing CLI strings, grep searches, heredoc bodies, and nested/progress copies did not count. Multiple real commands inside one Bash block were split with quote- and heredoc-aware shell segmentation. Product aliases and direct entry-point execution were recognized separately.

Each use was paired to a later top-level `tool_result` by `account + tool_use_id`. Duplicate IDs were counted once. Outcome classification used the paired result only:

- `success`: paired result with no established misuse, policy violation, timeout, interruption, or non-zero exit;
- `misuse`: result explicitly established an argv, usage, navigation, or required-value failure;
- `tool-error`: result established a timeout, interruption, or non-zero tool exit without a more specific misuse;
- `violation`: result explicitly said policy/hook refusal;
- unpaired calls remained unclassified.

Some invocations were deliberate negative tests. The census can prove the command ran and the result refused it, but it does not infer whether the caller intended the refusal. Accordingly, the misuse totals are behavioral results, not accusations about agent intent.

Artifact tracing began only after the producer result. A later tool use counted as consumption when it referenced an exact artifact path, an output prefix, or a uniquely matching result-listed artifact stem. The categories are:

- `opened`: `Read` or an image-view tool;
- `parsed`: `jq`, `cat`, `file`, `identify`, `ffprobe`, Node/Python parsing, or equivalent;
- `listed`: `ls`, `find`, `stat`, or `du` without reading contents;
- `cited`: an exact path reference without a reader/parser;
- report reader: an actual `pnpm snap --report/--reports` invocation.

Downstream report, issue, fix, and commit links require the tool input itself to reference the artifact path/stem. They are conservative lower bounds; prose claims were not used to manufacture causality.

## Corpus and pairing controls

| Account | Files | Bytes | Lines | Top-level tool uses | Bash uses | Top-level results | Paired results | Parse errors |
| - | -: | -: | -: | -: | -: | -: | -: | -: |
| Claude | 855 | 1,690,301,741 | 398,314 | 123,407 | 69,820 | 123,402 | 121,673 | 0 |
| Claude-b | 697 | 1,603,885,494 | 343,958 | 100,160 | 61,573 | 100,159 | 100,125 | 14 |
| **Total** | **1,552** | **3,294,187,235** | **742,272** | **223,567** | **131,393** | **223,561** | **221,798** | **14** |

Pairing/schema disclosures:

- 221,808 unique use IDs and 221,800 unique result IDs remained after deduplication.
- 1,759 duplicate top-level use IDs and 1,761 duplicate result IDs were removed. These were primarily parent/subagent or progress copies.
- 30,235 lines contained nested/progress `tool_use` shapes but no top-level invocation and were excluded.
- Ten top-level uses remained unpaired and two results had no retained use. Every rendered-tool invocation reported below was paired.
- Result content appeared as both strings and arrays; the sibling `toolUseResult` appeared as object, string, array, or absent. All observed variants were handled.
- The one-megabyte result-inspection ceiling truncated **zero** paired result bodies. The 14 malformed Claude-b JSONL lines were disclosed as parse errors rather than silently skipped.
- The negative controls excluded 330 prose-only mentions and 1,040 Bash searches/edits that contained a target spelling but did not execute it.
- Worktree project directories were included. No qualifying rendered-tool call survived the top-level/dedupe controls from those worktree-specific directories in this snapshot.

## Planted/known controls

All required positives were re-derived:

- Snap actual calls were abundant: 4,623.
- The latest known successful product Record call was recovered at `2026-09-02T09:15:48.674Z`.
- Earlier Record argv misuse was recovered.
- Prose-only and Bash-search mentions were present and excluded.
- Successful product Record calls had **four click-strip PNG opens** and **zero GIF/WebM opens or parses**.

The supplied seven-call Record receipt was one call short. The exhaustive pass found **eight** actual `pnpm record` invocations: **six successes and two misuse results**. The additional invocation was a top-level, multi-line Bash call on 2026-08-22; it paired to a successful result listing WebM and GIF artifacts, and its click-strip PNG was subsequently opened. It was not a prose mention, nested copy, grep, source edit, or heredoc body. This is exactly why the census split multiple commands within one Bash block.

The broader Record family also includes three direct `tooling/src/screen-record/cli.ts` executions: 11 total calls, seven successes, and four argv misuse results.

## Invocation census

| Family | Calls | Success | Misuse | Tool error | Violation | First use | Last use | Package alias | Direct entry point |
| - | -: | -: | -: | -: | -: | - | - | -: | -: |
| Snap | 4,623 | 4,199 | 96 | 328 | 0 | 2026-07-27T01:10:33Z | 2026-09-03T13:42:11Z | 4,212 | 411 |
| design/ui-audit | 381 | 289 | 39 | 53 | 0 | 2026-07-27T03:08:10Z | 2026-09-03T13:41:45Z | 352 | 29 |
| motion-audit | 87 | 49 | 13 | 25 | 0 | 2026-08-09T07:06:18Z | 2026-09-03T13:28:49Z | 79 | 8 |
| perf-meter/cpu-profile | 65 | 48 | 10 | 7 | 0 | 2026-08-08T11:11:00Z | 2026-09-03T12:28:11Z | 54 | 11 |
| record/screen-record | 11 | 7 | 4 | 0 | 0 | 2026-08-18T21:08:59Z | 2026-09-03T12:28:11Z | 8 | 3 |

Direct Snap execution separates into 271 historical `scripts/probes/snap.ts` calls and 140 current `tooling/src/snap/cli.ts` calls. No product calls used `pnpm ui-audit`, `pnpm cpu-profile`, or `pnpm screen-record`; those names appeared only as implementation lineage/direct homes, while package aliases were `design-audit`, `perf-meter`, and `record` (`package.json:20,28-30`).

### By account

| Account/family | Calls | Success | Misuse | Tool error | First | Last | Retries | Corrected retries |
| - | -: | -: | -: | -: | - | - | -: | -: |
| Claude / Snap | 2,415 | 2,196 | 48 | 171 | 2026-07-27 | 2026-09-03 | 181 | 83 |
| Claude-b / Snap | 2,208 | 2,003 | 48 | 157 | 2026-08-08 | 2026-09-03 | 178 | 84 |
| Claude / design-audit | 137 | 104 | 14 | 19 | 2026-07-27 | 2026-09-02 | 23 | 11 |
| Claude-b / design-audit | 244 | 185 | 25 | 34 | 2026-08-09 | 2026-09-03 | 32 | 11 |
| Claude / motion-audit | 22 | 14 | 3 | 5 | 2026-08-22 | 2026-09-02 | 3 | 2 |
| Claude-b / motion-audit | 65 | 35 | 10 | 20 | 2026-08-09 | 2026-09-03 | 11 | 5 |
| Claude / perf-meter | 19 | 13 | 5 | 1 | 2026-08-08 | 2026-09-02 | 5 | 5 |
| Claude-b / perf-meter | 46 | 35 | 5 | 6 | 2026-08-18 | 2026-09-03 | 5 | 3 |
| Claude / record | 4 | 3 | 1 | 0 | 2026-08-22 | 2026-09-02 | 0 | 0 |
| Claude-b / record | 7 | 4 | 3 | 0 | 2026-08-18 | 2026-09-03 | 1 | 1 |

Subagents drove almost all rendered tools: 4,319/4,623 Snap calls, 373/381 design-audit calls, 85/87 motion calls, 63/65 perf calls, and all 11 Record-family calls.

### ISO-week windows, both accounts combined

| Week | Family | Calls | Success | Misuse | Tool error |
| - | - | -: | -: | -: | -: |
| 2026-W31 | Snap | 466 | 414 | 16 | 36 |
| 2026-W31 | design-audit | 5 | 5 | 0 | 0 |
| 2026-W32 | Snap | 880 | 807 | 15 | 58 |
| 2026-W32 | design-audit | 10 | 9 | 0 | 1 |
| 2026-W32 | motion-audit | 3 | 0 | 0 | 3 |
| 2026-W32 | perf-meter | 1 | 0 | 0 | 1 |
| 2026-W33 | Snap | 294 | 260 | 3 | 31 |
| 2026-W33 | design-audit | 13 | 13 | 0 | 0 |
| 2026-W34 | Snap | 1,749 | 1,620 | 27 | 102 |
| 2026-W34 | design-audit | 128 | 103 | 8 | 17 |
| 2026-W34 | motion-audit | 53 | 35 | 3 | 15 |
| 2026-W34 | perf-meter | 47 | 38 | 5 | 4 |
| 2026-W34 | record | 5 | 4 | 1 | 0 |
| 2026-W35 | Snap | 938 | 876 | 11 | 51 |
| 2026-W35 | design-audit | 79 | 60 | 7 | 12 |
| 2026-W35 | motion-audit | 11 | 3 | 2 | 6 |
| 2026-W35 | perf-meter | 11 | 8 | 2 | 1 |
| 2026-W35 | record | 2 | 1 | 1 | 0 |
| 2026-W36 | Snap | 296 | 222 | 24 | 50 |
| 2026-W36 | design-audit | 146 | 99 | 24 | 23 |
| 2026-W36 | motion-audit | 20 | 11 | 8 | 1 |
| 2026-W36 | perf-meter | 6 | 2 | 3 | 1 |
| 2026-W36 | record | 4 | 2 | 2 | 0 |

The W36 failure increase coincides with the unified-instrument migration and its negative/refusal testing. The result counts prove refusals occurred; they do not let this redacted pass separate intentional contract tests from operational mistakes.

## Argv frequencies

Top actual flag spellings:

| Family | Most-used flags |
| - | - |
| Snap | `--eval` 4,366; `--click` 2,801; `--goto` 2,237; `--out` 2,202; `--no-shot` 1,668; `--wait-for` 1,283; `--open-chat` 1,242; `--idle` 1,027; `--key` 904; `--contrast` 862; `--isolated` 516; `--jsclick` 510; `--map` 500; `--context-tab` 495; `--aria` 377 |
| design-audit | `--goto` 178; `--click` 103; `--out` 82; `--mobile` 79; `--open-chat` 63; `--fail-on` 56; `--isolated` 53; `--ref` 43; `--help` 37; `--context-tab` 33 |
| motion-audit | `--goto` 44; `--selector` 20; `--help` 14; `--full-motion` 13; `--window` 9; `--open-chat` 5; `--os-reduced-motion` 4 |
| perf-meter | `--click` 53; `--goto` 31; `--out` 18; `--cycles` 14; `--pause` 12; `--help` 9; `--settle` 7; `--open-chat` 6; `--cpuprofile` 4 |
| record | `--click` 11; `--out` 7; `--pause` 7; `--goto` 3 |

Rare rejected/test spellings also occurred in real invocations, including Snap's `--full-page` ×5, `--watch-every`, `--name`, `--deadcss`, `--fullpage`, `--width`, and arbitrary negative-control flags. Motion's `--selector`, `--window`, `--os-reduced-motion`, and `--os-full-motion`, plus perf's `--cpuprofile`, are the historical dialect split the current convergence program removes. These counts include deliberate refusal tests and therefore should drive explicit error/help recipes, not compatibility aliases.

The strongest recipe signal is the disparity between raw action use and reusable composition: Snap saw `--eval` 4,366 times, but `--scenario` only 19, `--matrix` 18, and `--file` 52. Agents are repeatedly rebuilding tapes by hand.

## Failure, refusal, and retry clusters

Only clusters established by result text are listed.

| Family | Failed/misused | Classified clusters | Retry attempts | Corrected retries |
| - | -: | - | -: | -: |
| Snap | 424 | selector 60; argv 50; timeout 32; navigation 26; instrumentation 9; environment 1 | 359 | 167 |
| design-audit | 92 | argv 32; selector 31; navigation 6; instrumentation 2; environment 1 | 55 | 22 |
| motion-audit | 38 | argv 13; instrumentation 10; selector 6; timeout 2 | 14 | 7 |
| perf-meter | 17 | argv 10; timeout 6; instrumentation 1 | 10 | 8 |
| record | 4 | argv 4 | 1 | 1 |

Common operational shapes:

1. **Stale or wrong selectors** dominate the classified Snap/design failures. A recipe must lead with `--map`/`--aria` and the same-session selector reuse, not another catalog of selector guesses.
2. **Five historical flag dialects** produced argv refusals and corrected retries. One canonical spelling plus named refusal is the right fix; aliases would preserve the failure source.
3. **Timeouts are concentrated in Snap/perf**, not Record. Current load receipts and withheld-rate behavior address the false-red class; recipes must show the load/result fields rather than recommending blind timeout inflation.
4. **Direct entry-point use** occurred 462 times across the five families. Agent docs should teach package aliases only. Direct paths are implementation homes, not a second public contract.

No paired rendered-tool result established a hook/policy violation.

## Artifact creation and consumption

“Result-listed success” below means a successful invocation's paired result named at least one artifact of that extension. It is not a filesystem inventory. Consumption counts are later exact path/stem references and can exceed invocation counts when multiple artifacts were read.

| Family | Result-listed success artifacts | Opened | Parsed | Listed | Cited | Consumption by extension |
| - | - | -: | -: | -: | -: | - |
| Snap | PNG 1,056; MD 451; JSON 293; ZIP 175; HAR 172; HTML 32; TXT 12 | 457 | 282 | 9 | 118 | PNG 709; JSON 44; HTML 24; MD 16; TXT 13; directory 60; **HAR 0; ZIP 0** |
| design-audit | JSON 175; PNG 3; HTML 3 | 2 | 71 | 1 | 23 | JSON 82; HTML 4; PNG 4; directory 7 |
| motion-audit | JSON 2 | 0 | 1 | 0 | 0 | directory 1 |
| perf-meter | JSON 39 | 1 | 17 | 0 | 3 | JSON 18; directory 3 |
| record | WebM 7; GIF 6; PNG 1 | 5 | 4 | 0 | 0 | PNG 8; directory 1; **GIF 0; WebM 0** |

The hard conclusions:

- Agents consume images and structured JSON. Those formats justify first-class paths and readers.
- No agent opened, parsed, listed, or cited a Snap HAR or ZIP after its producing invocation. Retain them as forensic bundle members if the run contract needs them, but do not present them as primary agent outputs.
- No agent opened or parsed any Record GIF or WebM. Four product-success click strips were opened; across product plus direct Record calls, five click strips were opened. Board #1310 converts that evidence into the implementation now in progress: filmstrip/contact-sheet capture moves under Snap, while GIF/WebM die by default.
- Snap's `--report`/`--reports` reader had **zero actual invocations**. The current end card already prints `READ pnpm snap --report ... --problems` (`docs/design/1208-instrument-substrate.md:1037-1055`); the next census should determine whether that new prompt changes consumption before anyone proposes deleting the reader.

### Explicit downstream evidence links

| Producer | Report | Fix | Issue | Commit |
| - | -: | -: | -: | -: |
| Snap | 23 | 17 | 1 | 0 |
| design-audit | 6 | 2 | 0 | 0 |
| perf-meter | 3 | 0 | 0 | 0 |
| motion-audit | 0 | 0 | 0 | 0 |
| record | 0 | 0 | 0 | 0 |

These require an explicit artifact reference inside the downstream tool input. They prove real consumption chains but undercount prose-mediated reasoning and commits whose messages omit artifact paths. Zero is “no explicit trace,” not proof the evidence had no influence.

## Hard recommendations

### Keep

1. **Keep Snap as the sole broad public rendered-instrument CLI.** Its use is an order of magnitude above every sibling. The 2026-09-03 ruling already converges motion/performance into Snap arms and hard-refuses the old commands (`docs/design/1208-instrument-substrate.md:1396-1402`). This census strongly supports that shape.
2. **Keep design-audit separate.** It has 381 calls, 289 successes, and 82 downstream JSON path references. Its rendered-surface census is not a synonym for selective Snap arms.
3. **Keep filmstrip/contact-sheet capture as a first-class Snap capability.** The visible evidence agents actually opened was the PNG strip; Board #1310 places that capability under Snap rather than preserving Record's front door.
4. **Keep structured JSON and PNG outputs first-class.** They are the only consistently consumed artifact formats across families.

### Fold/retire

1. **Keep `motion-audit` and `perf-meter` retired as public commands; fold capabilities into Snap arms.** Historical motion calls failed or misused 38/87 times; perf failed or misused 17/65. The current program preserves analyzer engines behind Snap instead of preserving parser dialects. Do not add aliases for `--selector`, `--window`, `--os-reduced-motion`, or `--cpuprofile`.
2. **Retire `pnpm record` under Board #1310.** It must hard-refuse with the exact Snap filmstrip replacement; no compatibility alias or quiet delegation. The command retirement and Snap filmstrip build are implementation-in-progress at this report's update.
3. **Retire direct CLI paths from all agent recipes.** The 462 direct calls include 271 retired `scripts/probes/snap.ts` executions. Package aliases must be the only documented door.
4. **Do not promote HAR or ZIP as primary response artifacts.** No downstream consumption was observed. Keep them inside the immutable evidence slot only where forensic completeness requires them.
5. **Kill GIF and WebM generation by default.** Historical Record evidence shows zero consumption. Snap filmstrip/contact-sheet PNGs are the primary replacement; temporal media should exist only behind an explicit future need, not as default output.

### Missing recipes and feedback loops

1. **Report-reader recipe:** every Snap success should end with the exact `--report ... --problems` command, and the driving skill should require using it before raw `jq`/`cat` when the question is finding-oriented. Re-census after adoption; zero historical use is an onboarding defect, not yet a deletion verdict.
2. **Scenario/matrix recipe:** publish one route × appearance × viewport example and one stateful scenario example. Thousands of manual actions versus 37 scenario/matrix flag uses is the clearest repeated-work signal in the corpus.
3. **Selector-recovery recipe:** `--map`/`--aria` → choose stable selector → act in the same session → assertion. This directly targets the largest classified failure cluster.
4. **Artifact-consumption recipe:** identify the verdict-bearing file by kind: PNG for rendered proof, JSON/report reader for structured findings, trace/HAR only for a specific network/performance question, video only when temporal playback matters.
5. **Refusal recipe:** named legacy-spelling errors must print the exact Snap replacement. The current one-spelling/no-alias ruling (`docs/design/1208-instrument-substrate.md:239`) already resolves the compatibility question.
6. **Retry telemetry:** retain “failed call → corrected call” pairing in future censuses. This run found 359 Snap retries but only 167 corrected-command successes, which is a stronger recipe signal than raw error counts.

## Coverage and limitations

- The scan covered all Orbweaver-named project directories visible to both accounts at the snapshot time. It did not scan unrelated project directories for commands that happened to target Orbweaver remotely.
- The live corpus grew during the investigation. Counts are internally tied to the final aggregate timestamp; a rerun will differ.
- Fourteen malformed Claude-b lines were unreadable. No rendered-tool invocation was left unpaired because of them, but their content is unknown.
- Result classification is conservative and pattern-based. It does not reinterpret a paired success because surrounding prose later complained, and it does not infer success from prose when the tool result failed.
- Exact downstream path/stem matching intentionally misses causal chains expressed only in prose. No transcript prose was committed or quoted.
- “Created” is result-established on successful invocations, not a post-run filesystem existence check. Run-slot pruning may remove artifacts after the transcript records them.
- Retired command counts are historical usage, not proof those commands remain accepted at the current checkout. Current executable behavior and the substrate ruling win.

## Reproduction

```bash
node scripts/research/agent-cli-artifact-census.ts \
  --out docs/reviews/research/2026-09-04-agent-cli-artifact-usage-census.json
```

The script writes aggregate JSON only. Raw transcript content and diagnostic scratch output are never written beside the report.
