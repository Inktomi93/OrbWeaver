---
kind: review
status: active
updated: 2026-09-04
---

# Agent `__orb`, selector, and choreography census

## Outcome

Agents did not need a bigger generic evaluator. They repeatedly needed five legible journeys:

1. section → bridge read;
2. chat → bridge read;
3. chat → context tab → bridge read;
4. config surface → click/wait → bridge read;
5. multi-page action/eval with `@N`.

The highest-use bridge reads were `shell()` (167), `motion()` (117), `queries()` (88), `renders()`
(47), `animations()` (35), and `flags()` (35). The most-used navigation methods were
`nav.contextTab()` (97), `nav.section()` (79), and `nav.openChat()` (56). RPG was already real usage,
not speculative tooling: `seed.game()` appeared 23 times, `seed.richGame()` 6, and `rpg()` 9.

Current #1304 is directionally correct. It adds the discoverable `rpg-game` scenario and actionable
`capabilities()` / `rings()` / `nav.capabilities()` help instead of adding `--seed` and `--rpg` aliases.
The transcript snapshot contains no actual post-#1304 discovery or scenario invocation, so there is not
yet enough evidence to judge adoption. Pre-fix history shows six `nav.capabilities()` calls and zero
top-level `capabilities()` or `rings()` calls.

The residual gap is selector guidance. Bare wait targets were exposed to parent-command failure in
106/235 uses, while `data-slot` waits were 14/145 and test-id waits 17/155. Failed role clicks were most
often retried with an aria-label or aria-label+visible selector. Snap's map/report should rank stable
machine handles first and print copy-paste action/assertion spellings; more selector flags would make the
surface worse.

Machine aggregate: [`2026-09-04-agent-orb-selector-choreography-census.json`](2026-09-04-agent-orb-selector-choreography-census.json).

## Corpus and evidence boundary

Snapshot: 2026-09-04T04:34:47Z.

| account | JSONL files | bytes | records | parse errors during live pass |
| - | -: | -: | -: | -: |
| Claude A | 855 | 1,690,301,741 | 398,314 | 0 |
| Claude B | 697 | 1,604,142,908 | 344,097 | 24 |
| **total** | **1,552** | **3,294,444,649** | **742,411** | **24** |

The 24 malformed lines were transient partial writes in the live append-only Claude-B corpus; the prior
quiescent rescan found zero. Counts are snapshot-bound.

The pass inspected 223,583 actual tool-use blocks and reduced them to 221,824 unique ids, removing 1,759
nested/progress copies. It paired 221,814 results; 10 calls were unpaired and 5 duplicated result ids had
different variants. None of the 25 reported bridge-method rows was unpaired.

Counted sources:

- 5,259 executed `pnpm snap` invocations;
- 5,358 Snap `--eval` expressions;
- 318 Chrome/owner-browser JavaScript evaluations;
- 603 relevant scripts written by a `Write` tool and later proven executed by a Bash call.

Prose, briefs, source edits, tool results quoting a command, and unexecuted heredocs did not count. A
heredoc body counted only when the same Bash command executed its target afterward. Arguments and
selectors were classified structurally; user text, titles, ids, selector values, result bodies, URLs,
and owner data were discarded.

## Observed bridge methods

Success/failure belongs to the enclosing tool call. A Bash command containing several selectors/evals
can fail for a different member, so these are failure-exposure counts, not proof the named method caused
the exit.

| method | A | B | total | success | failure | first..last |
| - | -: | -: | -: | -: | -: | - |
| `shell` | 89 | 78 | 167 | 148 | 19 | Jul 27..Sep 2 |
| `motion` | 49 | 68 | 117 | 107 | 10 | Jul 27..Sep 2 |
| `nav.contextTab` | 32 | 65 | 97 | 86 | 11 | Jul 27..Aug 30 |
| `queries` | 56 | 32 | 88 | 80 | 8 | Jul 27..Sep 2 |
| `nav.section` | 45 | 34 | 79 | 75 | 4 | Aug 7..Sep 2 |
| `nav.openChat` | 44 | 12 | 56 | 48 | 8 | Jul 27..Aug 30 |
| `renders` | 8 | 39 | 47 | 42 | 5 | Aug 8..Sep 2 |
| `animations` | 6 | 29 | 35 | 34 | 1 | Jul 28..Sep 2 |
| `flags` | 3 | 32 | 35 | 34 | 1 | Aug 9..Sep 2 |
| `nav.closeModal` | 27 | 0 | 27 | 16 | 11 | Aug 17..29 |
| `seed.game` | 21 | 2 | 23 | 22 | 1 | Jul 28..Aug 25 |
| `nav.openConfig` | 0 | 12 | 12 | 12 | 0 | Sep 2 |
| `nav.openSettings` | 11 | 1 | 12 | 11 | 1 | Aug 8..29 |
| `perf` | 1 | 11 | 12 | 12 | 0 | Aug 8..Sep 2 |
| `resetEvidence` | 3 | 9 | 12 | 7 | 5 | Aug 18..31 |
| `nav.openModal` | 9 | 1 | 10 | 9 | 1 | Aug 7..24 |
| `snap` | 7 | 3 | 10 | 10 | 0 | Aug 7..30 |
| `rpg` | 8 | 1 | 9 | 9 | 0 | Aug 17..30 |
| `nav.capabilities` | 3 | 3 | 6 | 6 | 0 | Aug 16..24 |
| `seed.richGame` | 6 | 0 | 6 | 6 | 0 | Jul 28..Aug 16 |
| `resetFlags` | 0 | 3 | 3 | 3 | 0 | Aug 9 |
| `bus` | 1 | 1 | 2 | 2 | 0 | Aug 16..Sep 2 |
| legacy callable `nav` | 2 | 0 | 2 | 2 | 0 | Jul 29 |
| `nav.openCharacter` | 2 | 0 | 2 | 2 | 0 | Aug 8 |
| `durableLocalUserId` | 0 | 1 | 1 | 1 | 0 | Aug 30 |

`nav.openSettings` is historical vocabulary replaced by current `nav.openConfig`; its presence is a
migration receipt, not a request to restore it. The two bare callable-`nav` uses are likewise old bridge
shape. Transcript absence is never a dead-code verdict.

All method calls above had a paired result. Semantic result consumption cannot be counted safely without
retaining assistant reasoning and user/page content. Direct conversion is reported only where a later
artifact or action establishes it; no proximity-based "consumed" percentage is fabricated.

### Known positive: `cb-config-eye-2`

The config-surface side-eye lane contains actual executed calls to `motion()` three times, `shell()`
once, `nav.openConfig()` once, `nav.section()` once, and `renders()` once. Those reads fed the durable
config-surface review written later in the same lane. This proves the parser sees both MCP JavaScript and
executed Snap scripts rather than merely finding bridge names in source.

## Discovery after #1304

\#1304 was created at 2026-09-04T02:02:06Z. The corpus has no relevant invocation after that point.

| discovery door | historical calls | post-#1304 calls |
| - | -: | -: |
| `__orb.capabilities()` | 0 | 0 |
| `__orb.rings()` | 0 | 0 |
| `__orb.nav.capabilities()` | 6 | 0 |
| `pnpm snap --scenario rpg-game` | 0 | 0 |

This is a short observation window, not evidence that agents ignored the new affordance. The current
help, bridge console hint, README, and scenario are discoverable. Re-run this census after enough cold
agents have actually started from the new help before adding another discovery layer.

## Declared surface versus observed surface

Current source was read from `agent-bridge.ts`, `agent-bridge-handles.ts`, and the agent-tools README.

### Observed and still declared

- overview/evidence: `snap`, `queries`, `bus`, `shell`, `perf`, `renders`, `motion`, `animations`,
  `flags`, `resetEvidence`, `resetFlags`, `durableLocalUserId`;
- navigation: `nav.capabilities`, `section`, `openModal`, `openConfig`, `contextTab`, `openChat`,
  `openCharacter`, `closeModal`;
- RPG: `seed.game`, `seed.richGame`, `rpg`.

### Discoverable but unobserved

- top level: `ready`, `isReady`, `consoleErrors`, `motionFlaggersSettled`, `motionFlaggersDrain`,
  `appearanceMatrixContract`, `setMotionAuditDropTrackingPaused`, `pluginLog`, `css.read/reset`,
  `automationFires`, `capabilities`, `rings`, `resetRing`;
- navigation: `panel`, `focus`.

Several are instrument-internal coordination seams, recently added, or durable/server-runtime reads.
Nothing here is called dead.

### Historical or uncertain

- `nav.openSettings` and callable `nav` are observed old shapes superseded by current vocabulary.
- Dynamic `__orb[key]()` cannot be assigned a method name. Dynamic calls are reported as unknown rather
  than guessed; none entered the 25 named rows.

## Selector vocabulary

The pass classified 8,675 selector-bearing flag uses into overlapping structural families. A selector
can count in more than one family—for example role + aria-label + visible.

| flag / family | uses | parent success | parent failure | failure exposure |
| - | -: | -: | -: | -: |
| click / aria-label | 1,466 | 1,256 | 210 | 14.3% |
| click / role | 1,128 | 901 | 227 | 20.1% |
| key / CSS-or-handle | 1,063 | 1,025 | 38 | 3.6% |
| wait / text | 674 | 551 | 123 | 18.2% |
| contrast / data-slot | 420 | 400 | 20 | 4.8% |
| old jsclick / aria-label | 344 | 307 | 37 | 10.8% |
| wait / bare CSS-or-handle | 235 | 129 | 106 | 45.1% |
| map / bare CSS-or-handle | 219 | 185 | 34 | 15.5% |
| click / visible modifier | 203 | 167 | 36 | 17.7% |
| fill / aria-label | 173 | 143 | 30 | 17.3% |
| click / text | 170 | 139 | 31 | 18.2% |
| wait / test id | 155 | 138 | 17 | 11.0% |
| wait / data-slot | 145 | 131 | 14 | 9.7% |
| click / data-slot | 32 | 30 | 2 | 6.3% |

The strongest observed retry corrections were:

- failed click role → aria-label: 31;
- failed click role → aria-label+visible: 16;
- failed bare wait → text wait: 8;
- failed click role → text: 5;
- failed click aria-label → role: 5.

Same-family retries were also common and usually mean timing/state changed rather than selector spelling:
90 aria-label click retries, 84 role click retries, and 66 text-wait retries.

These numbers do not prove selector causality: one Bash invocation may contain several selectors and an
unrelated failing arm. They do show where agents spent retry effort.

### Brittle and stable families

- Bare CSS/handle waits are the clearest brittle family.
- Text and role selectors are human-readable but churn with copy and ambiguous duplicates.
- `nth` and `visible` are usually disambiguation after a broader selector, not stable identity.
- `data-slot` and test-id handles have the lowest useful failure exposure and survive copy changes.
- aria-label is a good semantic fallback, but role+name queries frequently needed refinement.
- The old `--jsclick` appears in 55 repeated `goto>jsclick>eval` journeys; #1298 correctly retired the
  spelling in favor of `--dom-click` rather than preserving another alias.

Snap map output should continue to prefer stable selector handles in this order: data-slot/test-id,
unique role+name or aria-label, structural attribute/class, text, then nth/visible as last-resort
disambiguation. Every printed selector should be copy-pasteable into an action and assertion.

## Choreography

Top normalized single-call shapes:

| shape | calls | success | failure |
| - | -: | -: | -: |
| route → goto → eval | 396 | 383 | 13 |
| route → eval | 349 | 308 | 41 |
| route → goto | 171 | 156 | 15 |
| route → open-chat → eval | 129 | 120 | 9 |
| route → goto → map | 125 | 107 | 18 |
| route → goto → eval → eval | 99 | 97 | 2 |
| route → goto → click → eval | 81 | 71 | 10 |
| route → open-chat → click → eval | 61 | 52 | 9 |
| route → open-chat → click → context-tab | 56 | 53 | 3 |
| route → old-jsclick → eval | 55 | 55 | 0 |
| route → open-chat → context-tab → eval | 52 | 48 | 4 |
| route → open-chat → wait → eval | 47 | 47 | 0 |
| route → goto → wait → eval | 43 | 35 | 8 |

Repeated adjacent calls show agents reopening the same journey rather than composing one tape: 55
open-chat→eval repeats, 31 open-chat→click→eval repeats, 28 open-chat→click→context-tab repeats, and 22
open-chat→context-tab→eval repeats. This is the evidence for named scenarios and complete ordered tapes.

Navigation retry controls confirm prior defects and their recoveries: all 11 failed `contextTab` calls
had a later same-session success; 10/11 `closeModal` failures, 5/8 `openChat` failures, and 1/4 section
failures likewise recovered. Unknown ids, premature context-tab publication, and wrong-room assumptions
are historical retry classes now addressed by loud `NavResult`, awaited context publication, and
capability vocabularies.

Multi-page targeting is real but uncommon: 41 `@N` suffixes. Keep one obvious help/skill recipe showing
`--pages N` with interleaved `--click@N`, `--eval@N`, map/ARIA, and per-page result attribution. Do not
invent per-tab aliases.

## Raw expression/probe pressure

The most repeated redacted expression shapes were:

- animation/motion census: 25;
- one query-selector shape: 20;
- one combined query + geometry + computed-style + text + ARIA audit loop: 15;
- repeated query/text audit loops: 14, 10, 9, 8, and 7.

These are not requests for more raw eval documentation. They point to structured outputs:

- shell panel geometry/visibility and relation should live in map/shell report fields;
- focus/tab-order walks should use ordered key actions plus focus assertions;
- computed style, contrast, motion, performance, and animation checks belong to their existing arms;
- DOM text/role inventories belong to map/ARIA;
- query/render/motion detail should be available from the run report without reopening browser state.

## RPG and config journeys

RPG history already exercised seed and read methods, but agents manually composed them. Current
`rpg-game` correctly turns the common path into one scenario: seed through production APIs, open the
returned chat id, traverse published context tabs, map/assert the context pane, and read `rpg()` at each
checkpoint. No transcript after #1304 has run it yet. Do not add `--seed`, `--rpg`, or a flag per tab.

Config history likewise repeated `goto/openConfig → click/wait → shell/motion/render reads`. Existing
appearance/config scenarios and matrix arms are the right home. Add a new named scenario only when a
stable journey repeats after the current scenario set, not from pre-scenario history alone.

## Artifact/finding conversion

The `cb-config-eye-2` method sequence led to a durable config-surface review. Numerous side-eye scripts
also wrote PNGs/reports and then read those exact artifacts, but JSONL has no typed eval→finding→issue→fix
edge. This report therefore names only direct same-lane conversions and does not manufacture a rate from
nearby `Write`, `SendMessage`, or work-item calls.

## Recommendations

1. **Let #1304 breathe.** The discovery doors and RPG scenario have zero post-landing transcript calls;
   re-measure cold-agent adoption before changing them.
2. **Make map selectors action-ready.** Rank data-slot/test-id first and print one copy-paste action plus
   assertion spelling per node. Mark text/nth/visible selectors as fallback quality.
3. **Put bridge summaries in the browser-free report.** Shell, query census, render heat, motion, flags,
   and animation populations dominated eval usage. App-snapshot already captures the overview; the
   report/card should expose the useful aggregate and point to detailed evidence.
4. **Keep nav failures loud and vocabulary-backed.** The retry data validates awaited context-tab
   publication and `nav.capabilities()`. Unknown navigation must remain `{ok:false,reason}`.
5. **Preserve ordered choreography as scenarios, not aliases.** Chat/context and config journeys should be
   one tape. The old `jsclick`, `press`, and other cute spellings should stay retired.
6. **Keep the `@N` recipe visible.** Forty-one uses are enough to justify a concise multi-page example,
   not another mode.
7. **Do not call unobserved bridge methods dead.** Discovery, reset, durable, plugin, CSS, and internal
   coordination methods have source/import contracts beyond transcript frequency.

## Limits

- Bash exit is attached to the whole tool call. Method/selector failure counts are exposure, not causal
  attribution when one command ran multiple Snap invocations.
- Shell tokenization covers normal quoting and executed heredocs. Exotic shell expansion, `eval`, or a
  script generated and executed through an untracked indirection may be missed.
- Simple aliases like `const orb = window.__orb; orb.shell()` are resolved. Destructuring, higher-order
  aliases, and dynamic property calls are not guessed.
- Exact expression/selector values and result bodies are discarded, so semantic result consumption is
  unknown except for direct same-lane action/artifact evidence.
- Current source establishes declared/discoverable surface. Absence from transcript use establishes only
  unobserved status.
- The corpus was live and append-only; denominators are tied to the snapshot timestamp.
