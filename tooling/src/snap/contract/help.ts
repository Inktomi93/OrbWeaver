// The operator contract is large prose, not parser machinery. Keeping it outside ops/parse.ts gives the
// validator headroom while still deriving every advertised vocabulary from its owning constants.
import { appearanceHelpBlock } from "../../_shared/appearance-flags.ts";
import { panelPresetHelpBlock } from "../../_shared/panel-flags.ts";
import { themeHelpBlock } from "../../_shared/theme.ts";
import { LIGHTHOUSE_DEVICE_SPELLINGS, LIGHTHOUSE_MODE_SPELLINGS } from "../lib/lighthouse-report.ts";
import { SHOT_PIXEL_BUDGET } from "../lib/shot-scale.ts";
import { NETWORK_PROFILE_SPELLINGS } from "../lib/throttle.ts";
import { SNAP_SCENARIO_PRESET_NAMES } from "./scenario-presets.ts";

export const SNAP_HELP = `snap — one browser run, many pieces of UI evidence

Usage:
  pnpm snap [route] [flags]
  pnpm snap --file <html> [flags]

Cheap evidence:
  --text [selector]       ARIA tree, no primary screenshot
  --map [selector]        interactive roles, names, and selectors
  --eval <expression>     in-page JSON result (repeatable)
  --contrast <selector>   rendered WCAG contrast check (repeatable)
  --cascade <selector=property>  Chromium's computed value + official Active/Overloaded declarations

Assertions and reports:
  --expect-visible <selector>       require a rendered, visible element
  --expect-text <selector=text>     require rendered text to contain a value
  --expect-count <selector=N>       require N rendered matches
  --expect-url <url-or-path>        require the final URL
  --expect-no-overflow [selector]   scroll bounds must fit client bounds AND no descendant's box may
                                    exit the clip on any side (left/top too — scrollWidth cannot see
                                    a justify-end spill); a scrolling axis is not judged
  --expect-focus <selector>         require the active element to match
  --json                            write a machine-readable run manifest
  --summary                         compact scenario output; pair with --json for full evidence
  --strict-console                  make console warnings red (errors are always red)
  --checkpoint                      reset __orb evidence after readiness; scope console verdicts to actions
  --include-hidden                  include Activity/hidden DOM in map, CSS, and counts

Interaction (steps, __orb nav flags AND --eval run in ONE queue in TRUE argv order — anything written
mid-chain runs mid-chain; --map/--aria/--contrast/--expect-* observe the settled surface afterwards):
  --click <selector>      --fill <selector=value>  --key <selector=Key> | --key <Key>
                            bare --key Tab walks focus (no re-focus); the selector= form re-anchors
  --hover <selector>      --wait-for <selector|text=phrase>    --goto <target>
  --upload <selector>=<path[,path...]>   attach local file(s) to a file input — drills a wrapper
                            selector (a decorative dropzone div) down to the real <input type="file">
                            automatically. PATH BOUNDARY: every path must resolve inside this repo or the
                            OS tmp dir (agent scratchpads) — anything else is refused loudly, never
                            silently skipped. Does not reach a surface with no backing <input> at all
                            (the chat composer's raw drag/paste listener).
  --open-chat <id|title|latest|current>   --open-character <id>     --context-tab <tab>
    latest = the chat list's top row; current = the room open right now (no list query — the one to
    use after creating a room, since a fresh room is unlisted until the list refetches)
  --panel <name>=<docked|overlay|collapsed>   drive the shell's panel layout — also the docked↔collapsed
                            FLIP transition (use-list-track-flip.ts + shell.css's shell-list-push-in)
  --focus <on|off>          the shell's zen/focus-mode toggle
  --panels <preset>         reach a NAMED panel configuration in one flag (see Panel state below)
  --watch <totalMs> [--every <ms>]  poll evals and optional screenshots over time
  Add @N to a page-targeted flag with --pages N, for example --click@1.
  Every selector is CSS unless prefixed: a bare phrase ("choose who speaks next") is a type-selector
  chain for tags that cannot exist, so snap REFUSES it. For rendered text write text=<phrase>.

Load emulation (CDP; applied to EVERY page BEFORE it navigates, so boot is measured under the arm):
  --cpu-throttle <n>      Emulation.setCPUThrottlingRate — 1 = off, 4 = the standard "under load" arm
  --network <profile>     Network.emulateNetworkConditions with DevTools' own presets:
                          ${NETWORK_PROFILE_SPELLINGS.join(" | ")}
  WHY: a layout shift within 500ms of a real click carries hadRecentInput and is EXCLUDED from CLS, so
  an unthrottled measurement of a "settles after you click it" surface reports 0.000 paid and says
  nothing about the margin. 4x CPU is what reveals it.
  A declared load arm WIDENS the drive budgets (nav 90s / readiness 60s, lib/throttle.ts driveBudgets):
  the un-throttled 10s readiness ceiling refused every network run outright, on the prod build too, and
  read as "the app never settled" (#836).
  MEASURED LIMIT: the DEV build (~250 unbundled ESM resources) still cannot reach data-app-ready under a
  3G/4G profile — throttle CPU alone against :5173. The network arm is for a PROD build; the recipe for
  serving one off-band is in .claude/skills/side-eye-design-review/SKILL.md.

${panelPresetHelpBlock()}

${appearanceHelpBlock()}

${themeHelpBlock()}

Audit and network (the two arms that retired the chrome-devtools MCP):
  --lighthouse <${LIGHTHOUSE_DEVICE_SPELLINGS.join("|")}>
                          run Lighthouse (accessibility + best-practices + seo) against the SETTLED page
                          of this very run — same browser, same tab, same device. Prints the category
                          scores and EVERY failed audit with its node count and first three selectors,
                          and writes report.json + report.html into the run slot. Findings RED the run
                          (exit 1), like --contrast and --deadcss. A page that never signalled
                          data-app-ready, a Lighthouse throw, or a truncated report REFUSE with exit 2 —
                          a refusal is never a finding. \`--lighthouse mobile\` fills the SAME device slot
                          --mobile does (touch, coarse pointer, DPR 3), so it does not combine with a
                          later --desktop/--viewport/--wide, and --lighthouse desktop does not combine
                          with --mobile. Not combinable with --cascade (both want the debugging endpoint).
  --lighthouse-mode <${LIGHTHOUSE_MODE_SPELLINGS.join("|")}>
                          DEFAULT snapshot: audit the page as the drive queue left it, because every
                          surface under review here is client state. navigation RELOADS the URL first, so
                          it measures a freshly-booted page and loses whatever you drove to.
  --requests [url-substring]
                          the ORDERED log of every request this run's pages issued — method, url, status,
                          resource type, declared size, timing — printed and written into the run slot.
                          The optional value narrows what is PRINTED; the artifact is always complete and
                          the block states both counts. It is a plain case-insensitive URL SUBSTRING, not
                          a selector and not a regex.
  --request-body <url-substring>
                          one matching response body, capped and truncation-accounted (the block says
                          \`truncatedAt=<bytes>\` when it cut). Implies --requests.

Pixels:
  --no-shot               skip the primary PNG
  --shot-of <selector>    capture one element
  --crop <WxH+X+Y>        capture a bounded region
  --baseline | --diff     save or compare a visual baseline (mutually exclusive)
  --scale <css|device|n>  image pixels per CSS pixel. DEFAULT css, and that default is DELIBERATE: one
                          image pixel per CSS pixel HALVES the pixel count on a hi-dpi context, so an
                          agent pays ~half the image tokens to read the PNG. Raise it only when a HUMAN
                          is the reader — a committed design-mock render, which is a durable visual
                          record. \`device\` uses the context's own DPR (1 desktop, 3 under --mobile);
                          a number raises the context DPR and does not combine with --mobile. Over the
                          ${SHOT_PIXEL_BUDGET}px image budget the run REFUSES instead of writing a huge
                          PNG, and the RESULT line's \`scale=\` states what it actually produced.

Sessions:
  --pages <N>             shared-context tabs
  --contexts <N>          isolated fixture users (no watch/baseline/diff)
  --as <handle>           one named fixture user
  --isolated | --dirty    warm isolated stage from HEAD or working tree
  --ref <sha|branch|tag>  pin the isolated stage to a commit instead of HEAD (survives a merge train)
  --fresh                 force a full re-stage even when the stage is warm (implies --isolated)
  --stage-status          what holds the stage band, how long since it was used
  --stage-down [--force]  tear down the active stage; --force is required for a LIVE stage owned by
                          another checkout (it kills that checkout's run — measured, #447)
  --stage-sweep           reap a stage nothing has used past the idle TTL + prune orphan dirs
  --scenario <json|preset> sequential checkpoints in one browser lifetime
                           presets: ${SNAP_SCENARIO_PRESET_NAMES.join(" | ")}
  --matrix                rated 16-cell representative run derived from the live 36-axis Appearance
                          carrier contract plus authenticated theme/device/media capabilities; includes
                          both OS/app polarity directions and strict R1-R7 CSS/pixel/geometry accounting
                          (requires --isolated/--dirty/--ref; never mutates the shared account). With
                          --scenario, applies those derived environment/Appearance cells to every JSON
                          checkpoint; R1-R7 are explicitly N/A because the scenario owns its drive.

Maintainers:
  --materialize-devtools-assets   regenerate the pinned official DevTools cascade SDK closure; networked
                                  update operation, never used by normal Snap/CT runs

Failure evidence:
  Red runs retain a Playwright trace under reports/traces/. Use
  --no-failure-evidence only when the trace cost is explicitly unwanted.

Artifacts:
  Every run writes inside its own slot (reports/runs/snap/<runId>/, printed as the run's first
  line) and publishes reports/snaps/<name>.png, reports/traces/… etc. as pointers into it when it
  finishes, so a concurrent snap cannot overwrite yours (#1164). --baseline is the exception: a
  golden lands in reports/baselines/ directly, because a later --diff reads it.

Run pnpm snap --help from the repository for this contract; the source header contains the full cookbook.`;
