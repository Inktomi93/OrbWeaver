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
import { snapFlagGrammarHelp } from "../ops/flag-grammar.ts";
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
  --scenario-summary                compact scenario output; pair with --json for full evidence
  --strict-console                  make console warnings red (errors are always red)
  --diagnostics <query>             print deduped structured browser diagnostics; JSON stays lossless.
                                      query: all | level=error,source=network,category=cors,text=foo,page=0,window=current
  --report <index|run-id|latest>    read one immutable run index; add --problems (default) or --all,
                                    then narrow with --arm/--channel/--level/--source/--category/--text/
                                    --page/--context/--window
                                    --arm perf is the public spelling for the typed interaction-perf arm.
                                    The end card and run.json group the highest-severity correlated
                                    findings as what | where | evidence | exact next command. These are
                                    display-only: producer-owned arms/thresholds still own the exit vote.
                                    Core page/capture rows are complete; failed-request summaries are a
                                    declared latest-per-URL projection, while HAR remains the event record.
  --reports [--last N] [--lane x]   list indexed runs across registered worktrees: identity, verdict, and
                                    out= / route= / arms= — what each run was FOR, so a slot maps back to
                                    the command that made it. --last N windows it (pruned runs count);
                                    --lane x keeps one lane's.
                                    Report readers never start a browser, stage, session, or run slot.
  --checkpoint                      reset __orb evidence after readiness; scope console verdicts to actions
  --include-hidden                  include attached hidden/inert DOM in map, CSS, and counts; map rows
                                    are locator-only and do not claim React Activity provenance

Interaction (steps, __orb nav flags AND --eval run in ONE queue in TRUE argv order — anything written
mid-chain runs mid-chain; --map/--aria/--contrast/--expect-* observe the settled surface afterwards):
  --click <selector>      --dom-click <selector>   DOM el.click(); bypass Playwright actionability
  --force-click <selector> real pointer force-click for hover-revealed/overlaid controls
  --tap <selector>        a REAL touch tap (Input.dispatchTouchEvent) — requires --mobile, and is the only
                            verb that answers "what does a finger get here". --click is a MOUSE dispatch
                            even under --mobile, so it fires pointerenter/mouseover and opens a hover-only
                            tooltip no thumb can open; --tap fires none of those.
  --fill <selector=value>  --key <selector=Key> | --key <Key>
                            bare --key Tab walks focus (no re-focus); the selector= form re-anchors
  --hover <selector>      --wait-for <selector|text=phrase>    --goto <target>
  --wait <selector>       after page/app readiness, require this selector to become visible
  --upload <selector>=<path[,path...]>   choose file(s) through a direct/descendant input or a trigger's
                            Playwright filechooser. A single directory path is accepted only when the
                            resolved input is webkitdirectory (for example "Import a folder…").
  --drop-files <selector>=<path[,path...]>   dispatch dragenter/dragover/drop with a genuine DataTransfer;
                            regular files only. This exercises a dropzone's distinct drop feeder.
  Both file actions resolve real paths inside this repo or the OS tmp scratch root only, preflight the
  complete batch, and print a bounded identity/count/tree receipt; refusals red the run.
  --open-chat <id|title|latest|current>   --open-character <id|name>   --context-tab <tab>
    latest = the chat list's top row; current = the room open right now (no list query — the one to
    use after creating a room, since a fresh room is unlisted until the list refetches)
  SPA state: --goto/--open-chat/--context-tab drive client state through __orb; they are not URL paths.
    --expect-url checks only the browser URL (normally / or /login), never a section, room, tab or modal.
  --panel <name>=<docked|overlay|collapsed>   drive the shell's panel layout — also the docked↔collapsed
                            FLIP transition (use-list-track-flip.ts + shell.css's shell-main-flip)
  --focus <on|off>          the shell's zen/focus-mode toggle
  --panels <preset>         reach a NAMED panel configuration in one flag (see Panel state below)
  --watch <totalMs> [--every <ms>]  poll evals and optional screenshots over time
  --stream-settle <seconds> fixed post-drive settle for a streaming surface
  --idle                   bounded network-idle settle instead of the default fixed mount settle
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
  --probe                 deterministic pixels: seed probe mode and floor animation/transition from first
                          paint. This invalidates motion/CLS evidence; take those receipts without --probe.
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
  --pages <N>             tabs in ONE BrowserContext: shared cookie/localStorage identity, independent DOM;
                          @N targets a tab and screenshots use -pN. No user identity is implied.
  --contexts <N>          isolated fixture users (owner/member BrowserContexts, -uN artifacts; no
                          watch/baseline/diff). @N targets one context/user for one-direction comparison.
  --as <handle>           one named fixture user
  --isolated | --dirty    warm isolated stage from HEAD or working tree
  --ref <sha|branch|tag>  pin the isolated stage to a commit instead of HEAD (survives a merge train)
  --fresh                 force a full re-stage even when the stage is warm (implies --isolated)
  --stage-status          what holds the stage band, how long since it was used
  --stage-down [--stage-owner <checkout> --force]
                          tear down this checkout's stages; name an owner and --force for deliberate,
                          per-band cross-checkout teardown (it kills that checkout's run — measured, #447)
  --stage-sweep           reap a stage nothing has used past the idle TTL + prune orphan dirs

  STAGE DB: the stage serves its OWN db — a FRESH stage sha copies the dev db at boot; a stage dir that
  already exists KEEPS the db it had (possibly older/thinner than dev). A corpus-dependent finding, or its
  absence, is a claim about THAT db, not about the app: verify provenance before treating it as a verdict.
  This is the ONE place that caveat is stated (it moved here from the retired design-audit help at #1315,
  where it was already load-bearing for the --design-audit arm and for every rendered receipt beside it).

  --scenario <json|preset> sequential checkpoints in one browser lifetime
                           presets: ${SNAP_SCENARIO_PRESET_NAMES.join(" | ")}

Developer harness inputs:
  --debug-token <token>   seed orb:debug-token before navigation for token-gated development routes
  --fixture-server <origin>  developer fixture stack server origin (health + authentication; env fallback)
  --fixture-base <origin>    developer fixture stack Vite origin (browser navigation; env fallback)
  pnpm snap --eval 'window.__orb?.capabilities()'      discover callable development capabilities
  pnpm snap --eval 'window.__orb?.rings()'             discover retained evidence rings
  pnpm snap --eval 'window.__orb?.nav.capabilities()'  discover SPA navigation targets and methods

Stateful sessions (ONE browser per lane, kept between calls — docs/design/1208-instrument-substrate.md):
  --session <name> [where] [environment] [app settings] <route>   boot + first call: a full-priority daemon holds
                          the browser (headless; --vnc to watch) behind <main>/.cache/snap-session/<name>.sock
  --session <name> [--goto …|--click …|--eval …|--text|--map|--contrast …]   later calls drive the LIVE
                          page (no route = no re-navigation); a route or --file navigates. Browser-lifetime
                          flags (--base/--isolated/--viewport/--mobile/--dark/--appearance/--theme/--local-storage/
                          --pages/--cpu-throttle/…) belong to the BOOT call and are refused later (exit 3).
                          Every call is its own run slot; every call after the first is an evidence window.
                          Session trace/HAR retention is on by default; --session-export carries it with the rings.
  --session-ttl <min>     boot only: idle TTL (default 30; env ORB_SESSION_TTL_MIN). Cap 3 live sessions per
                          box (env ORB_SESSION_CAP); the next boot exits 2 naming the live ones.
  --session-status [<name>]   every session of this repo: owner · pid · live/DEAD · idle · binding · endpoint
  --session-close <name> [--force]   close a live session (a LIVE one owned by another checkout needs --force)
                          or reap a dead one
  --session-sweep         reap dead + idle-past-TTL sessions and orphan registry entries; live ones reported
  --session-export <name> [--out <base>]   copy console/page-error/request rings plus retained trace/HAR into this run's slot,
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
                          Matrix contexts vary device/theme/media, never user identity. None of these modes
                          is a global actor scheduler: alternating multi-human choreography belongs in E2E
                          with explicit browser actors; Snap compares or observes one direction per target.

Always on:
${armHelp("app-snapshot")}
${armHelp("motion")}
${armHelp("interaction-perf")}
${armHelp("cpu-profile")}
${armHelp("boot-trace")}
${armHelp("react-profile")}
${remainingArmHelp()}
Maintainers:
  --materialize-devtools-assets   regenerate the pinned official DevTools cascade SDK closure; networked
                                  update operation, never used by normal Snap/CT runs

Failure evidence:
  Red runs retain a Playwright trace under reports/traces/. Use
  --no-failure-evidence only when the trace cost is explicitly unwanted.

Complete accepted flag grammar (generated from the executable registry; @N marks page-targetable flags):
${snapFlagGrammarHelp()}

Reading a run (the terminal shape — #1345):
  A run prints what the argv asked for, then the end card, and nothing else inline: the run slot, then
  the action blocks (EVAL / CONTRAST / MAP / ASSERT), then one SUMMARY line per arm that measured
  something, then RESULT, the FINDING rows, PROVENANCE and EVIDENCE. Console messages and the CSS census
  live in the run's artifacts behind ONE 'console errors=… warnings=… → <run.json>' line — console
  ERRORS always print inline, and everything else is one browser-free read away:
      pnpm snap --report <run.json> --all --channel console
  A failed step, nav or wait is its own FINDING row, ranked above every console annotation, naming the
  flag and selector to correct (#1344). --json stays lossless.

Artifacts:
  Every run writes inside its own slot (reports/runs/snap/<runId>/, printed as the run's first
  line) and publishes reports/snaps/<name>.png, reports/traces/… etc. as pointers into it when it
  finishes, so a concurrent snap cannot overwrite yours (#1164). --baseline is the exception: a
  golden lands in reports/baselines/ directly, because a later --diff reads it.
  A slot is retained at least 24h; after that the newest 10 per instrument survive and the rest are
  listed by 'pnpm snap --reports' as PRUNED.

Run pnpm snap --help (or -h) from the repository for this contract; the source header contains the full cookbook.`;
