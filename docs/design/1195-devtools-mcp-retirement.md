---
kind: design
status: active
updated: 2026-09-03
---

# 1195 — retiring the chrome-devtools MCP: what it was used for, and the arms that replace it

> **Status: complete (owner-directed 2026-09-02; verified 2026-09-03).** The owner asked whether the chrome-devtools MCP is still
> needed now that the in-house instruments answer most questions, then ruled: "check our transcripts for the
> last two weeks between both accounts, parse tool calls, find every instance of what we used the MCP for,
> and then we build those capabilities." This is that census and the build list. The MCP leaves the fleet
> only after every load-bearing row below has an in-house arm with a planted positive control.

## 1. The census (receipts)

Method: every `tool_use` block in both accounts' transcripts (`~/.claude/projects/…orbweaver/**/*.jsonl`
and `~/.claude-b/…`, main sessions AND subagent transcripts — 719 files) whose tool name starts with the
chrome-devtools MCP prefix, window `timestamp ≥ 2026-08-19`. 176 calls. The script and its TSV live in the
session scratchpad (`p-mcp-usage.py`, `p-mcp-usage.tsv`); re-derive with the same method when this is
re-judged.

| Tool | Calls | Who | What it was actually used for | In-house arm today | Verdict |
| - | - | - | - | - | - |
| `lighthouse_audit` | 41 | side-eye, both accounts | snapshot mode 32 (desktop 18, mobile 14), navigation 9. Findings only it produced: axe `label-content-name-mismatch` (3 nodes on plugins, 22 on the bracket drive), `target-size`; a11y / best-practices / SEO scores used as SHIP receipts in four reviews | none (snap's vendored devtools-frontend serves the CSS cascade SDK, not Lighthouse) | **GAP — build** |
| `evaluate_script` | 39 | side-eye, main | `__orb` bridge reads (`shell()`, `nav.section` / `openSettings` / `openChat`), app-ready polls, DOM probes for labels and cards | `--eval` (repeatable), `--goto`, `--open-chat`, `--context-tab`, `--wait-for`, `--idle` | covered |
| `navigate_page` | 29 | all | `:5173/` (21), the stage `:5273/` (3), one section route | every snap run | covered |
| `click` · `fill` · `press_key` · `fill_form` · `hover` · `wait_for` | 34 | side-eye | drive a settings pane, open a dialog, Escape / ArrowDown / Enter, type into a field | `--click`, `--fill`, `--key`, `--hover`, `--wait-for` | covered |
| `take_snapshot` | 7 | side-eye | the a11y tree of a surface | `--map`, `--aria` (`--text`) | covered |
| `emulate` | 6 | side-eye, main | `430x932x3,mobile,touch` (2), desktop resets (2), `colorScheme` (2) — the leak class | `--mobile`, `--viewport`, the appearance and theme arms | covered (the shared-tab leak is why this program exists) |
| `upload_file` | 3 | main | a video file into the media dropzone | `--upload` | covered |
| `take_screenshot` | 3 | side-eye | a jpeg of the current page | the primary shot, `--shot-of` | covered |
| `list_network_requests` · `get_network_request` | 3 | main | which requests a surface made, one body | none (`--network` is the THROTTLE arm) | **gap — small, build** |
| `list_console_messages` | 1 | main | console errors | every run prints `console-errors` / `page-errors` | covered |
| `performance_start_trace` | 1 | main | one trace for a long-task attribution | `perf-meter` (a CPU profile per step), `motion-audit` | covered |
| `list_pages` · `new_page` · `close_page` | 9 | main | tab housekeeping on the shared browser | n/a — the shared browser is what retires | n/a |

Before the window (2026-07-28..30, 274 calls) the same shape held with `navigate_page` + `take_screenshot`
dominating — the period before snap grew its drive arms.

## 2. The build list

1. **A Lighthouse arm on snap** (`--lighthouse <desktop|mobile>`, mode `snapshot` by default because every
   surface under review is client state, `navigation` on request): the `lighthouse` package — the engine the
   MCP wraps — against the settled stage page over Playwright's CDP endpoint; categories accessibility +
   best-practices + seo; `report.json` + `report.html` written into the run slot
   (`UNIFIED-VERIFICATION-DESIGN.md` §3.3b); prints the category scores and EVERY failed audit with its node
   count and first three selectors; refuses (exit 2) when the page is not `data-app-ready` or the run
   truncates. Planted positive control in `tests/tooling/snap/…`: a fixture carrying a
   `label-content-name-mismatch` node must be reported; a clean fixture prints `failed-audits=0` with the
   audited count. The mobile arm rides the existing `--mobile` device (touch, coarse pointer, DPR 3).

   **BUILT (#1198).** `tooling/src/snap/ops/lighthouse.ts` (the arm + the liftable `auditSettledPage`),
   `lib/lighthouse-report.ts` (the pure LHR readers + the accounting block), `contract/lighthouse.ts`.
   THE SEAM: snap's own chromium is launched with `--remote-debugging-port`, puppeteer-core attaches to
   THAT browser and hands Lighthouse the handle for the exact target Playwright is driving (matched by CDP
   target id) — one browser, one page, one device story. Findings RED the run (exit 1) like `--contrast`;
   a not-ready page, a Lighthouse throw or a truncated report REFUSE with exit 2. Pins:
   `tests/tooling/snap/ops/arms/lighthouse.int.test.ts` (planted `label-content-name-mismatch` reported by name

   - clean twin at `failed-audits=0` over `audited=19` + the not-ready refusal),
     `tests/tooling/snap/lib/lighthouse-report.test.ts`. Live receipt (isolated stage, plugins pane,
     2026-09-02): desktop `audited=36 failed-audits=1`, the ONE failed audit
     `label-content-name-mismatch` with 4 nodes and their selectors — the same finding §1 records the MCP
     producing; mobile `audited=33 failed-audits=0`.
     TWO MEASURED TRAPS, both closed with an A/B: puppeteer's `connect()` applies its OWN 800x600
     `defaultViewport` to a page it did not create (it replaced the emulated device mid-run —
     `defaultViewport: null` is load-bearing), and Lighthouse's full-page-screenshot gatherer resizes the
     viewport and restores it "best effort" (`disableFullPageScreenshot: true`). Snap's environment contract
     is read AFTER the arm, so a future leak REDs instead of hiding.
2. **A request-log arm on snap** (`--requests [url-substring]` for method, url, status, type, size and
   timing per request of the run; `--request-body <url-substring>` for one response body), from
   Playwright's request events, printed and written into the run slot. Small; the three uses were "which
   reads did this surface issue" questions that `__orb.queries()` half-answers.

   **BUILT (#1199).** `tooling/src/snap/ops/request-log.ts` (the recorder, wired to every page BEFORE the
   first navigation), `lib/request-log.ts` (filter, body cap, block), `contract/request-log.ts`. It is a
   SECOND, ordered log rather than a widening of `_shared/browser-capture.ts`'s URL-keyed map: the question
   is "which reads did this surface issue", and a re-read of the same route is the answer. An undeclared
   `content-length` prints `size=unknown` and an unfinished request `ms=unfinished` — never 0. Pins:
   `tests/tooling/snap/ops/arms/requests.int.test.ts` (a fixture whose requests are known by name, the filter
   arm, the no-match arms, and a body cut at `truncatedAt=16384`),
   `tests/tooling/snap/lib/request-log.test.ts`. Live receipt (same stage run): `requests=2445`, 18 of them
   matching `--requests trpc`, with per-request status/size/timing and the aborted vite-dep re-reads shown
   as `size=unknown ms=unfinished`.
3. **Retire:** remove the MCP tools from `side-eye.md` (`agent-authoring` skill), drop the plugin from the
   main session, delete the `chrome-mcp-headless-patch` ritual from the memory store, and re-point the
   side-eye skill's Lighthouse row (its §4 instrument table, row 5) at the snap arm. The rule
   `reaching-for-chrome-devtools-means-snap-has-a-gap` survives as the standing test for any future "we
   need the MCP back" claim: name the gap, build the arm.

   **RETIRED IN THE REPO (#1255, a122096ee).** `side-eye.md` holds `tools: Bash, Read, Grep, Glob,
   SendMessage` and nothing else; the six `.claude/settings.json` permission grants are deleted; the skill's
   §4 row 5 is re-pointed at `pnpm snap <route> --lighthouse desktop|mobile` with the arm's real contract
   (snapshot default, exit-1 findings vs exit-2 refusal, the `--mobile` device-slot collision, the
   `--cascade` exclusion) read out of `snap/contract/help.ts`; `.codex/agents/side-eye.toml` regenerated via
   `pnpm agents:sync`. Coverage re-derived at the fold with a planted positive control in the same
   invocation: `git grep --fixed-strings 'mcp__plugin_chrome-devtools'` over the tracked tree returns
   exactly ONE hit, `1208-instrument-substrate.md:83`, which is the line SPECIFYING the gate below. History
   was not sanitised: dated reviews citing the MCP as their era's instrument stand as written.

   The third sub-item, deleting the `chrome-mcp-headless-patch` memory, was already done before this lane:
   neither the topic file nor its `MEMORY.md` index line exists in the store.

   **THE RETIREMENT IS COMPLETE, and the two residues this entry named at the fold both closed the same
   evening (2026-09-03).** They are recorded here because the next reader will otherwise go looking for
   them. (a) "Drop the plugin from the main session" was never the repo's to do —
   `chrome-devtools-mcp@claude-plugins-official` lived in the owner's user-global
   `~/.claude/settings.json`, and an agent's request is not authorization to edit a user's global config.
   **The owner uninstalled it.** Verified: the key is absent from `~/.claude/settings.json` (which
   `~/.claude-b/settings.json` symlinks), so no session boots the server. (b) The entry originally said this
   retirement stays prose-enforced until an `agent-def-no-browser-mcp` fs gate lands. **The owner ruled that
   gate out and #1279 is Parked** — with the plugin uninstalled and the grants deleted, a gate policing a
   string nobody can grant is enforcement theatre, and `1208:83`'s proposal is superseded by that ruling
   rather than pending. What survives as the real control is the standing rule above: reaching for a browser
   MCP means snap has a gap, so name the gap and build the arm.

## 3. What this does NOT decide

The `claude-in-chrome` MCP (the owner's logged-in Chrome — 112 calls in the same window, Reddit threads and
owner-session drives) is a different tool with a different reason to exist and is untouched here.
