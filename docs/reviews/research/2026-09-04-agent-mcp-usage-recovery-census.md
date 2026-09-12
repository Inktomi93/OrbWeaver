---
kind: review
status: active
updated: 2026-09-04
---

# Agent browser/MCP usage recovery census

## Outcome

The retired headless Chrome DevTools MCP was used heavily, but narrowly: 826 unique calls across both
Claude accounts, concentrated in script evaluation, navigation, screenshots, Lighthouse, input, and
emulation. Snap now owns every load-bearing Orbweaver use found in that corpus, including the later heap,
request/HAR, diagnostics, Lighthouse, performance, screenshot, file chooser/drop, and session work. The
current `chrome-devtools-mcp@1.8.0` exposes 58 tools; only 20 ever appeared in an Orbweaver tool-use block.
Nothing in the 38-tool unused remainder justifies restoring the retired headless MCP.

The owner's logged-in Chrome MCP is separate. It had 112 calls in one 2026-07-29..30 window, including
browser selection, tab context, coordinate input, JavaScript, console, and network reads. Snap must not
try to replace authenticated owner-profile state, existing personal tabs, or non-Orbweaver web sessions.

The principal operational gap is recovery, not another analyzer: a page-bound tool can recommend
`list_pages` even when that verb is absent from the agent's exposed tool set. The confirmed
`cb-config-eye-2` incident spent four failed calls before escalating, then recovered only after control
outside the lane changed. A browser recipe must preflight page ownership and make recovery verbs
available as one set.

Machine-readable aggregate: [`2026-09-04-agent-mcp-usage-recovery-census.json`](2026-09-04-agent-mcp-usage-recovery-census.json).

## Corpus and method

Snapshot: 2026-09-04T04:16:49Z.

| account | JSONL files | bytes | JSONL records | all tool uses | all tool results |
| - | -: | -: | -: | -: | -: |
| Claude A | 855 | 1,690,301,741 | 398,314 | 123,407 | 123,402 |
| Claude B | 696 | 1,602,481,798 | 343,558 | 100,099 | 100,098 |
| **total** | **1,551** | **3,292,783,539** | **741,872** | **223,506** | **223,500** |

Scope was every Orbweaver project JSONL below both account stores, including main sessions, subagents,
and the two Claude-B worktree project dirs. A call counted only when an assistant content block had
`type: tool_use` and an exact MCP tool name. Prose, prompts, source strings, tool output mentioning a
tool, and imported instructions did not count. Results were paired by `tool_use_id`.

The pass removed 108 duplicate copies of an already-seen tool-use id. All 938 unique relevant calls had
a result; zero were unpaired and zero paired ids had conflicting result variants. The first streaming
pass observed 24 malformed lines while an active Claude-B transcript was being appended; an immediate
quiescent rescan found zero malformed lines. Counts are therefore a point-in-time census, not a claim
that the live append-only corpus stopped changing.

Arguments were reduced to key names and non-sensitive categories. URLs are only `orb-local`, `file`,
`external-redacted`, or `non-url-redacted`. Page content, selectors containing user data, cookies,
tokens, personal browsing, report paths, and external origins are not retained here.

## Family totals

| account / family | window | calls | success | error | unpaired |
| - | - | -: | -: | -: | -: |
| Claude A / chrome-devtools | 2026-07-27..2026-09-02 | 500 | 476 | 24 | 0 |
| Claude B / chrome-devtools | 2026-08-08..2026-09-02 | 326 | 295 | 31 | 0 |
| Claude A / claude-in-chrome | 2026-07-29..30 | 112 | 109 | 3 | 0 |
| Claude B / claude-in-chrome | none | 0 | 0 | 0 | 0 |
| any other browser/computer MCP | none | 0 | 0 | 0 | 0 |

No Playwright, browserless, generic-computer, or third browser MCP produced an actual Orbweaver tool-use
block in the corpus.

## Historical 176-call planted control

The historical retirement document recorded 176 Chrome DevTools calls for `timestamp >= 2026-08-19`.
Re-derivation now finds 234. This is extension, not a broken historical table: every historical tool row
except three remains exact, and the delta is exactly 58 later calls.

| tool | historical | current Aug-19+ | delta |
| - | -: | -: | -: |
| Lighthouse | 41 | 69 | +28 |
| evaluate script | 39 | 54 | +15 |
| navigate page | 29 | 44 | +15 |
| click/fill/press/fill-form/hover/wait | 34 | 34 | 0 |
| snapshot | 7 | 7 | 0 |
| emulate | 6 | 6 | 0 |
| upload | 3 | 3 | 0 |
| screenshot | 3 | 3 | 0 |
| network list/get | 3 | 3 | 0 |
| console list | 1 | 1 | 0 |
| performance trace start | 1 | 1 | 0 |
| page list/new/close | 9 | 9 | 0 |
| **total** | **176** | **234** | **+58** |

The original 176-row scratch TSV is gone, so its exact file snapshot cannot be replayed. The unchanged
rows plus the three-category delta are the planted control: the current parser reproduces the original
classification and exposes subsequent transcript growth rather than forcing the live corpus back to 176.

## Chrome DevTools MCP calls

| tool | calls | success | error | observed job |
| - | -: | -: | -: | - |
| `evaluate_script` | 315 | 310 | 5 | `__orb`, DOM/geometry, computed style/motion, interaction, performance |
| `navigate_page` | 147 | 133 | 14 | app/stage/file navigation and recovery |
| `take_screenshot` | 86 | 79 | 7 | current-frame visual evidence |
| `lighthouse_audit` | 82 | 80 | 2 | accessibility, best-practices, SEO, agentic receipts |
| `press_key` | 65 | 65 | 0 | keyboard walking and dialog/menu operation |
| `emulate` | 43 | 33 | 10 | viewport/device/touch, CPU/network, color scheme |
| `click` | 25 | 23 | 2 | UI drive |
| `take_snapshot` | 15 | 13 | 2 | accessibility tree |
| `wait_for` | 12 | 10 | 2 | readiness/text waits |
| `list_pages` | 10 | 5 | 5 | recovery/housekeeping |
| `upload_file` | 5 | 3 | 2 | media/file input |
| `fill` | 4 | 4 | 0 | form input |
| `list_console_messages` | 4 | 4 | 0 | console triage |
| `new_page` | 4 | 3 | 1 | recovery/housekeeping |
| `list_network_requests` | 3 | 3 | 0 | request inventory |
| `performance_start_trace` | 2 | 1 | 1 | boot/navigation trace |
| `close_page` | 1 | 0 | 1 | housekeeping; selected page already closed |
| `fill_form` | 1 | 1 | 0 | form input |
| `get_network_request` | 1 | 1 | 0 | one request/body inspection |
| `resize_page` | 1 | 0 | 1 | viewport operation |

The 55 Chrome errors classify as 26 timeouts, 6 selected-page-closed failures, and 23 other runtime/tool
errors. No policy refusal was observed. Script categories are multi-label: 275 DOM/geometry, 123
`__orb`, 99 interaction, 92 computed-style/motion, 26 performance, 6 network, 3 storage, and 2 React.

Navigation inputs were 101 local app origins, 17 files, 23 redacted external origins, and 6 calls whose
input had no URL field. The external category is intentionally not further resolved.

## `cb-config-eye-2`: selected-page failure and recovery

The known positive is confirmed in Claude B's 2026-09-02 side-eye lane.

| time UTC | tool | result |
| - | - | - |
| 07:38:38 | navigate | selected page closed |
| 07:38:43 | navigate retry | selected page closed |
| 07:38:49 | Lighthouse | selected page closed |
| 07:38:56 | snapshot | selected page closed |
| 07:39:05 | lane escalation | reports that `list_pages` is not exposed and recovery is impossible in-lane |
| 07:39:19..57 | fallback | writes/runs the in-house design-audit sweep while blocked |
| 07:40:03 | navigate | succeeds without an in-lane page-list/select call |
| 07:40:11 | evaluate | succeeds |
| 07:40:20 | Lighthouse desktop | succeeds, report pair emitted |
| 07:40:28 | Lighthouse mobile | succeeds, report pair emitted |

Cost: four failed calls over 18 seconds; 81 seconds from the first failed call to the first successful
navigate. The lane did the correct thing after the fourth failure: it messaged the orchestrator and
continued with an independent instrument. Recovery itself came from outside the exposed lane tool set.

Across the whole corpus, page housekeeping was not robust enough to be a recovery protocol:
`list_pages` succeeded 5/10, `new_page` 3/4, and `close_page` 0/1; `select_page` was never called. The
error text's proposed remedy was therefore unavailable in the exact incident that needed it.

## Shared-browser emulation leaks

Emulation was the least trustworthy frequently reused stateful capability: 43 calls, 10 timeouts. The
corpus contains explicit resets because agents knew state leaked across later work:

- mobile/touch/DPR arms followed by desktop viewport resets;
- CPU throttling raised for a probe and later restored to 1;
- color scheme restored to `auto`;
- network profiles reset to a fast/default profile or through an empty emulation call.

Three sessions ended with their last successful viewport still mobile. Three network-emulation sessions
ended with `Offline` or `Slow 4G` as the last requested network profile; their reset attempts timed out,
so the final browser state is unknowable from the result contract. A timeout cannot prove an emulation
mutation did not partially apply.

This is the shared-tab leak class the in-house browser substrate eliminates: Snap owns a context,
declares the requested environment, reads it back, and disposes or reasserts it at the ownership
boundary. A logged-in shared Chrome recipe still needs `try/finally` reset plus read-back.

## Artifacts and conversion

Eighty of 82 Lighthouse calls completed and emitted both JSON and HTML. Only 26/80 had a later tool use
that referenced an exact report path (always through Bash): Claude A 7/21, Claude B 19/59. This does not
mean the other 54 results were ignored—the MCP returned an inline audit summary—but their full artifacts
were not reopened or parsed in the same transcript.

The historical census records direct conversion evidence: Lighthouse uniquely produced
`label-content-name-mismatch` and target-size findings and supplied ship receipts in four reviews. The
recovered `cb-config-eye-2` pair fed the durable config-surface side-eye report written later in the same
lane. Transcript JSONL has no typed `finding -> issue -> fix` relation, so no numeric issue-conversion
rate is claimed; inferring one from nearby `Write`, `gh`, or work-item calls would overcount unrelated
work.

Snap's improvement here is not merely owning the analyzer. It files artifacts under one immutable run
identity and prints a browser-free `READ` command, so an agent sees where the complete result lives
without reverse-engineering a temporary Lighthouse directory.

## Logged-in Chrome: separate capability

Claude-in-Chrome occurred only on Claude A, 2026-07-29..30.

| tool | calls | errors |
| - | -: | -: |
| JavaScript | 47 | 2 |
| computer input/screenshot | 38 | 1 invalid-argument error |
| console reads | 12 | 0 |
| navigate | 9 | 0 |
| tab context | 2 | 0 |
| browser list/select | 2 | 0 |
| find | 1 | 0 |
| network read | 1 | 0 |

All nine explicit navigations were local Orbweaver origins. The distinction still matters: browser
selection and tab-context calls act on an owner's profile and pre-existing tabs, including sessions the
headless harness cannot and should not inherit. Keep this MCP for owner-authorized authenticated browsing
and cross-site/tab work. Do not treat it as an Orbweaver rendered-verification dependency.

## Current 1.8.0 surface versus observed use

The installed source at tag `chrome-devtools-mcp-v1.8.0` registers 58 non-slim tools. Twenty were used;
38 were not. The repository history does not support calling heap, screencast, PWA, or extensions
"post-window additions": extension tools landed in January 2026, heap and screencast in February, WebMCP
in April, third-party developer tools in May, PWA on August 10, heap-query expansion on August 17, and
1.8.0 released August 25. They were available by the end of the measured window but unused.

| unused family | tools | Orbweaver judgment |
| - | -: | - |
| heap/memory | 13 | meaningful problem, already built as Snap heap capture/compare/retainer evidence |
| PWA install/launch/state | 4 | no transcript demand; possible future installability e2e, not a Snap default arm |
| extension install/list/action | 5 | irrelevant to the app unless an extension integration becomes product scope |
| screencast | 2 | covered by `pnpm record` / screen-record |
| WebMCP and third-party developer | 4 | dynamic external surfaces; no Orbweaver evidence or approved trust contract |
| performance stop/analyze | 2 | covered by Snap boot trace and analyzer receipts |
| page identity/select | 2 | useful only as MCP recovery plumbing; Snap owns its page/session identity |
| dialog | 1 | no observed use; add only when a real alert/confirm/prompt workflow appears |
| console detail | 1 | covered by structured diagnostics and browser-free report filters |
| input variants | 4 | `click_at`, generic drag, hover, type-text; selector actions and file drop/chooser cover observed work |

No new in-house arm is recommended from the unused surface. The PWA family has a legitimate wake
condition: an owner request to verify OS installation/launch state rather than web-manifest/Lighthouse
quality. Browser dialogs have a similar wake condition: a real product flow using alert, confirm, or
prompt.

## Recommendations

1. **Keep headless DevTools retired.** Snap now replaces every observed Orbweaver rendered-verification
   use: browser ownership, navigation/actions, screenshots/recording, ARIA/map, structured console and
   inspector issues, requests/bodies/HAR, Lighthouse, performance/boot/CPU/React, emulation, upload/drop,
   and heap analysis.
2. **Keep logged-in Chrome explicitly separate.** Its authority is the owner's authenticated profile and
   existing tabs. Never hand its cookies or personal browsing state to Snap artifacts.
3. **Make recovery verbs atomic.** Any future MCP lane that can receive selected-page errors must also
   expose list/select/new/close. Preflight once; do not burn four page-bound retries on the same dead
   selection.
4. **Reset shared Chrome in `finally` and verify the reset.** Viewport/device/touch, CPU, network, color
   scheme, UA, timezone, locale, and geolocation are state, not one-call options. A timed-out reset is an
   unknown state and should end the shared-browser run.
5. **Point at full artifacts, do not dump them.** Preserve the inline summary, but always return one run
   identity and one copy-paste reader command. The 26/80 reopen rate is evidence that paths alone are not
   enough.
6. **No speculative arm for PWA/extensions/WebMCP/dialogs.** Open work only on the wake conditions above.

## Limits

- The corpus is append-only and was live during the scan; denominators are tied to the snapshot time.
- Pairing is exact by tool-use id. A tool implementation that performed hidden internal retries appears
  as one call because the transcript exposes one call.
- Error categories are result-text classes, not MCP protocol status codes. `other runtime/tool error`
  intentionally avoids retaining sensitive output.
- Exact URL, page content, selectors, cookies, tokens, personal tabs, and owner data were discarded.
- Artifact consumption means a later tool input referenced the exact emitted path. Reading the inline
  summary, visually inspecting an image block, or using a report from another session is not counted.
- Finding-to-issue conversion is reported only where transcript/design evidence names the connection; no
  proximity-based conversion rate is fabricated.
