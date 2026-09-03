// The operator contract is large prose, not parser machinery. Keeping it outside ops/parse.ts gives the
// validator headroom while still deriving every advertised vocabulary from its owning constants.
//
// EVERY ARM'S BLOCK IS DERIVED (`armHelp`, docs/design/1208-instrument-substrate.md §6). `ArmDef.help` is
// a REQUIRED member, so an arm cannot ship without its operator row, and the row lives beside the flags it
// documents rather than in a list that drifts away from them — `--no-deadcss` had no help row at all for
// its whole life, and nothing could have caught that while this file was hand-maintained. `armHelp` THROWS
// on an unknown arm and `remainingArmHelp()` prints every arm this file did not place, so an arm added to
// `ARMS` shows up in `--help` without an edit here.
import { appearanceHelpBlock } from "../../_shared/appearance-flags.ts";
import { panelPresetHelpBlock } from "../../_shared/panel-flags.ts";
import { themeHelpBlock } from "../../_shared/theme.ts";
import { SHOT_PIXEL_BUDGET } from "../lib/shot-scale.ts";
import { NETWORK_PROFILE_SPELLINGS } from "../lib/throttle.ts";
import { armHelp, remainingArmHelp } from "../ops/arms/help.ts";
import { SNAP_SCENARIO_PRESET_NAMES } from "./scenario-presets.ts";

export const SNAP_HELP = `snap — one browser run, many pieces of UI evidence

Usage:
  pnpm snap [route] [flags]
  pnpm snap --file <html> [flags]

Cheap evidence:
${armHelp("aria")}
${armHelp("map")}
${armHelp("eval")}
${armHelp("contrast")}
${armHelp("cascade")}
${armHelp("dead-css")}

Assertions and reports:
${armHelp("assert")}
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
${armHelp("lighthouse")}
${armHelp("requests")}

Pixels:
${armHelp("shot")}
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
  --stage-down [--owner <checkout> --force]
                          tear down this checkout's stages; name an owner and --force for deliberate,
                          per-band cross-checkout teardown (it kills that checkout's run — measured, #447)
  --stage-sweep           reap a stage nothing has used past the idle TTL + prune orphan dirs
  --scenario <json|preset> sequential checkpoints in one browser lifetime
                           presets: ${SNAP_SCENARIO_PRESET_NAMES.join(" | ")}

Stateful sessions (ONE browser per lane, kept between calls — docs/design/1208-instrument-substrate.md):
  --session <name> [where] [environment] [app settings] <route>   boot + first call: a niced daemon holds
                          the browser (headless; --vnc to watch) behind <main>/.cache/snap-session/<name>.sock
  --session <name> [--goto …|--click …|--eval …|--text|--map|--contrast …]   later calls drive the LIVE
                          page (no route = no re-navigation); a route or --file navigates. Browser-lifetime
                          flags (--base/--isolated/--viewport/--mobile/--dark/--appearance/--theme/--ls/
                          --pages/--cpu-throttle/…) belong to the BOOT call and are refused later (exit 3).
                          Every call is its own run slot; every call after the first is an evidence window.
                          A session keeps no Playwright trace/HAR — --session-export carries its rings.
  --session-ttl <min>     boot only: idle TTL (default 30; env ORB_SESSION_TTL_MIN). Cap 3 live sessions per
                          box (env ORB_SESSION_CAP); the next boot exits 2 naming the live ones.
  --session-status [<name>]   every session of this repo: owner · pid · live/DEAD · idle · binding · endpoint
  --session-close <name> [--force]   close a live session (a LIVE one owned by another checkout needs --force)
                          or reap a dead one
  --session-sweep         reap dead + idle-past-TTL sessions and orphan registry entries; live ones reported
  --session-export <name> [--out <base>]   copy the console/page-error/request rings into this run's slot,
                          published as reports/sessions/<name>/…
  A call on a DEAD session (daemon gone) prints SESSION DEAD naming the op it died in and exits 2 — never a
  silently-resolving pointer. A call from another checkout is refused naming the owner (F4). One request at
  a time: a second caller mid-call gets SESSION BUSY (exit 2). --session-daemon <name> is the daemon's own
  entry — spawned by snap, never typed. --session refuses --scenario/--contexts/--as; --matrix runs each
  rated cell in a disposable context inside the session's one browser.
  --matrix                rated 16-cell representative run derived from the live 36-axis Appearance
                          carrier contract plus authenticated theme/device/media capabilities; includes
                          both OS/app polarity directions and strict R1-R7 CSS/pixel/geometry accounting
                          (requires --isolated/--dirty/--ref; never mutates the shared account). With
                          --scenario, applies those derived environment/Appearance cells to every JSON
                          checkpoint; R1-R7 are explicitly N/A because the scenario owns its drive.

Always on:
${armHelp("perf")}
${remainingArmHelp()}
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
