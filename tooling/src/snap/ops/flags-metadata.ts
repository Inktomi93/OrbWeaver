// The NON-ARM half of the flag summary/group registry (#1329). An arm flag carries its `summary`/`group`
// on its own `ArmFlagSpec` row (contract/arms.ts) — required there, so tsc refuses a new arm flag with no
// summary. The flags dispatched by `ops/flags-handlers.ts`/`ops/flags-session.ts`/`ops/flags-stage.ts` are
// plain `Record<string, Handler>` tables (house style for a hand-listed dispatch family), which gives no
// literal-key union to hang a compile-time completeness check on without reshaping three established
// tables. This module is therefore the closest available REQUIRED shape: a single flat map, completeness
// asserted at runtime by `nonArmFlagMeta()` below (thrown before any row is produced) and pinned by a
// committed test that fails the instant a new non-arm flag ships without an entry here — the same "cannot
// ship without its row" guarantee `ArmDef.help` gives arms. That test is
// `tests/tooling/snap/ops/cli-truth.suite.int.test.ts` ("descriptor-owned help grammar covers every public
// accepted spelling exactly once"): it calls `snapFlagDescriptors()`, which this module's completeness
// throw runs inside. Corrected 2026-09-12 — this line cited `tests/tooling/snap/ops/flag-grammar.test.ts`,
// a path that has never existed on the tree, so the "it is pinned" claim pointed at nothing.
//
// `group` names match the section headings in `.claude/skills/snap-driving/reference/flags.md` (the ONE
// vocabulary a flag's group is drawn from); `summary` is one line, ≤160 chars, no trailing period.
//
// `summary` IS MARKDOWN, because its only render is a table cell in that generated index (#2178). Code-ish
// tokens therefore take CODE SPANS — ``​`__orb`​``, ``​`selector=path[,path]`​`` — and that is load-bearing, not
// decoration: inside a code span `_` and `[` are literal, so the docs formatter leaves them alone. Written
// bare they are correctly escaped to `\_\_orb` / `path\[,path]`, which renders identically and is
// GREP-DEAD, and `__orb` is 255 tracked files' worth of vocabulary (measured on `main`) in the document a
// lane reads to LEARN it. That escape is why the index sat outside `check:docs` until this row.
//
// THE `--help` BLOCK IS A DIFFERENT SURFACE AND IS DELIBERATELY NOT KEPT IDENTICAL. `contract/help.ts` is a
// terminal render where a backtick is noise, and the two already diverge on their own terms — measured
// 2026-09-12: of the four flags this note is about, only `--checkpoint` reads the same in both, while
// `--upload`/`--drop-files` carry a fuller grammar there (`<selector>=<path[,path...]>`) and `--goto` has no
// row of its own at all. So they are two renders of one fact, not a copy and its stale twin, and the
// `--checkpoint` coincidence is a coincidence. A pin asserting the two agree was CONSIDERED AND REFUSED:
// it would assert a property that is already false for three of the four. What a MEANING change owes is
// both surfaces — the flag spellings and grammar codes are what `cli-truth.suite.int.test.ts` holds.
import { GOTO_TARGET_GRAMMAR } from "../../_shared/argv.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { armFlags } from "./arms/registry.ts";
import { OPTIONAL_NAME_FLAGS, REQUIRED_VALUE_FLAGS } from "./flags-classes.ts";
import { FLAG_HANDLERS } from "./flags-handlers.ts";
import { SESSION_FLAG_HANDLERS } from "./flags-session.ts";
import { STAGE_FLAG_HANDLERS } from "./flags-stage.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --help");

export interface NonArmFlagMeta {
  readonly group: string;
  readonly summary: string;
}

/** Every flag NOT owned by an arm — the union of the three hand-listed dispatch tables. */
const NON_ARM_FLAG_SUMMARIES: Readonly<Record<string, NonArmFlagMeta>> = {
  "--help": { group: "Maintainers only", summary: "print the contract and exit 0" },
  "-h": { group: "Maintainers only", summary: "print the contract and exit 0" },
  "--materialize-devtools-assets": {
    group: "Maintainers only",
    summary: "regenerate the pinned DevTools cascade SDK closure (networked; never in a normal run)",
  },
  "--scenario": {
    group: "Reach",
    summary: "sequential checkpoints in ONE browser lifetime (json file or a named preset)",
  },
  "--matrix": {
    group: "Environment",
    summary: "rated pairwise appearance-invariant matrix (requires --isolated/--dirty/--ref)",
  },
  "--json": { group: "Pixels", summary: "write the machine-readable run manifest (the lossless console)" },
  "--scenario-summary": { group: "Reach", summary: "one CHECKPOINT name PASS/FAIL line per checkpoint (pair with --json)" },
  "--no-failure-evidence": { group: "Pixels", summary: "skip the Playwright trace a red run retains under reports/traces/" },
  "--strict-console": { group: "Look", summary: "console warnings go red too (errors are always red)" },
  "--diagnostics": { group: "Look", summary: "print deduped structured browser diagnostics" },
  "--checkpoint": { group: "Reach", summary: "reset `__orb` evidence after readiness; scope console verdicts to actions" },
  "--include-hidden": { group: "Look", summary: "widen --map/CSS/counts to attached hidden/inert DOM" },
  "--vnc": { group: "Stateful sessions", summary: "boot only: watch the daemon's browser" },
  "--wait": { group: "Where", summary: "after app readiness, require this selector to become visible before anything else runs" },
  "--stream-settle": { group: "Reach", summary: "fixed post-drive settle for a streaming surface" },
  "--base": { group: "Where", summary: "an already-running origin (a private stack, a stage you booted)" },
  "--debug-token": { group: "Where", summary: "seed orb:debug-token before navigation for token-gated development routes" },
  "--click": { group: "Reach", summary: "real Playwright click (actionability-checked); flakes on virtualized list rows" },
  "--tap": { group: "Reach", summary: "a REAL touch tap (no mouseover, so a hover-only tooltip stays shut); requires --mobile or another touch device" },
  "--dom-click": { group: "Reach", summary: "in-page el.click(), bypasses actionability — the click for virtualized/composite rows" },
  "--force-click": { group: "Reach", summary: "hover-then-forced pointer click for hover-revealed/overlaid controls" },
  "--hover": { group: "Reach", summary: "synthetic hover (loses :hover on any list re-render)" },
  "--local-storage": { group: "Where", summary: "key=json — seed localStorage before navigation (the FIRST = splits; the value is JSON)" },
  "--fill": { group: "Reach", summary: "selector=value — type into a field; the selector may be an engine form" },
  "--key": { group: "Reach", summary: "Key or selector=Key — the bare form walks focus without re-focusing; the selector form focuses then presses" },
  "--wait-for": { group: "Reach", summary: "selector or text=phrase — wait for a selector to become visible, or for rendered text" },
  "--upload": { group: "Reach", summary: "`selector=path[,path]` — choose file(s) through an input or a trigger's filechooser" },
  "--drop-files": { group: "Reach", summary: "`selector=path[,path]` — dispatch dragenter/dragover/drop with a real DataTransfer" },
  "--goto": {
    group: "Reach",
    // DERIVED, NEVER RE-SPELLED (#2482): the one home is `_shared/argv.ts`'s GOTO_TARGET_GRAMMAR, the same
    // string `parseGotoTarget` refuses with. The hand-spelled copy this replaced promised "a dotted settings
    // address group.sub.setting", a form the parser has never accepted (and whose `settings` word retired at
    // #2447), and a lane that followed it lost the time to the section arm's unrelated refusal.
    summary: `SPA navigation through \`__orb.nav\` — ${GOTO_TARGET_GRAMMAR}`,
  },
  "--open-chat": { group: "Reach", summary: "open a room by id, exact title, latest, or current" },
  "--open-character": { group: "Reach", summary: "Characters section + select by id or name" },
  "--context-tab": { group: "Reach", summary: "switch the context panel's tab" },
  "--panel": { group: "Reach", summary: "name=mode — drive one shell pane's layout mode (also the docked <-> collapsed FLIP)" },
  "--focus": { group: "Reach", summary: "the shell's zen/focus-mode toggle" },
  "--panels": { group: "Reach", summary: "a named pane configuration in one flag (composes over --panel)" },
  "--pages": { group: "Reach", summary: "N tabs in ONE browser context (shared cookies, independent DOM)" },
  "--contexts": { group: "Reach", summary: "N isolated fixture users in separate contexts (one-direction comparison)" },
  "--as": { group: "Reach", summary: "one named fixture user" },
  "--fixture-server": { group: "Where", summary: "the multi-user fixture stack's server origin (env fallback)" },
  "--fixture-base": { group: "Where", summary: "the multi-user fixture stack's vite origin (env fallback)" },
  "--file": { group: "Where", summary: "render a local HTML file (a committed mock) instead of a dev-stack route" },
  "--watch": { group: "Reach", summary: "per-tick screenshot and re-run of every --eval over a total window (page 0 only)" },
  "--every": { group: "Reach", summary: "ms — the tick interval for --watch" },
  "--dark": { group: "Environment", summary: "emulate the OS colour-scheme media query: dark" },
  "--light": { group: "Environment", summary: "emulate the OS colour-scheme media query: light" },
  "--reduced-motion": { group: "Environment", summary: "emulate the OS prefers-reduced-motion media query (not the app's own setting)" },
  "--appearance": { group: "Environment", summary: "deep-merge appearance keys over the real settings response; nothing is written" },
  "--appearance-preset": { group: "Environment", summary: "a curated appearance profile" },
  "--full-motion": { group: "Environment", summary: "render with the app's own reduce-motion setting OFF" },
  "--theme": { group: "Environment", summary: "render as if that theme were selected; none = no selection" },
  "--idle": { group: "Reach", summary: "bounded network-idle settle instead of the default fixed mount settle" },
  "--scale": { group: "Pixels", summary: "image pixels per CSS pixel (default css halves the token cost)" },
  "--probe": { group: "Pixels", summary: "deterministic pixels: seeded probe mode, animations floored from first paint" },
  "--baseline": { group: "Pixels", summary: "save a visual baseline (mutually exclusive with --diff)" },
  "--diff": { group: "Pixels", summary: "compare against a saved visual baseline (mutually exclusive with --baseline)" },
  "--out": { group: "Pixels", summary: "name the run's published artifacts" },
  "--wide": { group: "Environment", summary: "1920x1080 viewport" },
  "--viewport": { group: "Environment", summary: "explicit WxH viewport (default 1280x800); under --mobile it WINDOWS the device, keeping touch/DPR/UA" },
  "--mobile": { group: "Environment", summary: "iPhone 14 Pro Max emulation: touch, pointer:coarse, DPR 3 (compose with --viewport for a coarse WxH)" },
  "--desktop": { group: "Environment", summary: "explicit default desktop viewport (1280x800)" },
  "--cpu-throttle": { group: "Environment", summary: "CDP CPU throttle applied before navigation (4 = the standard under-load arm)" },
  "--network": { group: "Environment", summary: "DevTools network preset applied before navigation" },
  // Stage family (ops/flags-stage.ts)
  "--isolated": { group: "Where", summary: "boot/reuse snap's isolated stage: a detached worktree served on an offset port pair" },
  "--ref": { group: "Where", summary: "pin the isolated stage to a commit (implies --isolated; survives a merge train)" },
  "--fresh": { group: "Where", summary: "rebuild the isolated stage instead of reusing the warm one (implies --isolated)" },
  "--dirty": { group: "Where", summary: "stage the working tree instead of a commit (implies --isolated)" },
  "--stage-down": { group: "Where", summary: "tear down this checkout's stages" },
  "--stage-status": { group: "Where", summary: "the shared stage-band table: owner, checkout, ref, age, sessions, db provenance" },
  "--stage-sweep": { group: "Where", summary: "reap stages idle past the TTL and prune orphan dirs" },
  "--stage-owner": { group: "Where", summary: "names the owner for a cross-checkout --stage-down" },
  "--stage-keeper": { group: "Where", summary: "the band idle timer's own entry — spawned by snap, never typed by an operator" },
  "--force": { group: "Where", summary: "confirmation half of --stage-down --stage-owner and --session-close on a foreign live session" },
  // Session family (ops/flags-session.ts)
  "--session": { group: "Stateful sessions", summary: "boot or drive a named daemon-held browser session" },
  "--session-daemon": { group: "Stateful sessions", summary: "the daemon's own entry — spawned by snap, never typed by an operator" },
  "--session-status": { group: "Stateful sessions", summary: "every session of this repo: owner, pid, live/dead, idle, binding, endpoint" },
  "--session-close": { group: "Stateful sessions", summary: "close a live session (--force for a foreign live one) or reap a dead one" },
  "--session-sweep": { group: "Stateful sessions", summary: "reap dead + idle-past-TTL sessions and orphan registry entries" },
  "--session-export": { group: "Stateful sessions", summary: "copy console/page-error/request rings and retained trace/HAR into this run's slot" },
  "--session-ttl": { group: "Stateful sessions", summary: "boot only: idle TTL in minutes (default 30)" },
};

/** Kind projection for a non-arm flag, mirroring `ops/flag-grammar.ts`'s arm-side `grammarOf`. */
export function nonArmFlagKind(flag: string): "boolean" | "required-value" | "optional-name" | "optional-value" {
  if (REQUIRED_VALUE_FLAGS.has(flag) && !armFlags().some((spec) => spec.flag === flag)) {
    return "required-value";
  }
  if (OPTIONAL_NAME_FLAGS.has(flag)) {
    return "optional-name";
  }
  return "boolean";
}

/** Every flag dispatched by the three hand-listed non-arm tables, deduped, `-h` and `--session-daemon`
 *  included (the caller decides whether to surface either — this is the universe, not the filtered view). */
export function nonArmFlagUniverse(): readonly string[] {
  return [...new Set([...Object.keys(FLAG_HANDLERS), ...Object.keys(SESSION_FLAG_HANDLERS), ...Object.keys(STAGE_FLAG_HANDLERS)])].sort();
}

/** The completeness door: every non-arm flag has a summary, or this throws naming the first one that does
 *  not — a flag added to a handler table with no row here fails LOUD instead of silently missing its help
 *  and index rows. Mirrors `ArmDef.help`'s "required, so an arm cannot ship without it" contract in the
 *  one shape available to a plain `Record<string, Handler>` dispatch table. */
export function nonArmFlagMeta(flag: string): NonArmFlagMeta {
  const meta = NON_ARM_FLAG_SUMMARIES[flag];
  if (meta === undefined) {
    throw new Error(`snap flag-grammar: ${flag} has no summary/group in ops/flags-metadata.ts — add one before it ships`);
  }
  return meta;
}
