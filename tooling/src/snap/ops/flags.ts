// The flag table: one handler per flag (Record dispatch), the queue pushers, and the flag-class sets
// the scanner validates against. parseSnapArgs (ops/parse.ts) drives this table in argv order.
import {
  APPEARANCE_VALUE_FLAGS,
  applyAppearanceFlag,
  FULL_MOTION_PATCH,
  loadAppearancePreset,
  mergeAppearancePatches,
  parseAppearancePatch,
} from "../../_shared/appearance.ts";
import type { Viewport } from "../../_shared/argv.ts";
import { parseViewport, splitFirstEq, splitLastEq } from "../../_shared/argv.ts";
import { DEFAULT_BASE } from "../../_shared/browser.ts";
import { applyThemeFlag, parseThemeFlag, THEME_VALUE_FLAGS } from "../../_shared/theme.ts";
import type { Args, NavAction, PagedExpr, Step } from "../contract/types.ts";
import { STAGE_FLAG_HANDLERS } from "./flags-stage.ts";

export const MS_PER_SECOND = 1000;

export const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };
// --wide: layout sanity at a real monitor width (neo's default 1280 disguised a
// dialog max-width bug for a whole morning).
const WIDE_VIEWPORT: Viewport = { width: 1920, height: 1080 };
// --mobile: a Playwright device descriptor name (registry lookup in _shared/browser.ts). Real touch +
// pointer:coarse + mobile UA + DPR3, so the app's coarse-pointer progressive-disclosure and bottom-tab
// rail both render — a bare narrow viewport misses them. `scale:"css"` in SHOT_BASE keeps the DPR3 shot
// at 1 image px / CSS px (not 3×), so the PNG cost stays sane.
export const MOBILE_DEVICE = "iPhone 14 Pro Max";

// ── Flag dispatch ───────────────────────────────────────────────────────────
// One handler per flag (Record dispatch, house style) — each consumes what it
// needs from `rest`. Repeatable flags push; every order-sensitive drive flag (step OR
// bridge nav) lands in the ONE args.actions queue in argv order. `page` is the --pages
// tab index parsed off a `@<idx>` flag suffix (0 when unprefixed / single-page) —
// queued actions + per-page captures stamp it.
type FlagHandler = (args: Args, rest: string[], page: number) => void;

function pushStep(args: Args, step: Step): void {
  args.actions.push({ type: "step", action: step });
}

function pushNav(args: Args, action: NavAction): void {
  args.actions.push({ type: "nav", action });
}

// --eval lands in BOTH homes on purpose: `args.eval` stays the canonical argv-ordered expr list (page
// targeting validation + the --watch series re-runs it every tick), while the queue entry carries its
// POSITION so an eval written mid-chain runs mid-chain. capture() runs each expression exactly once —
// see its drive/trailing split.
function pushEval(args: Args, action: PagedExpr): void {
  args.eval.push(action);
  args.actions.push({ type: "eval", action });
}
// A `@<idx>` suffix on a flag (`--click@1`, `--eval@0`, `--aria@2`) selects a --pages tab — parsed by
// splitPageSuffix (_shared/argv.ts, unit-tested there).

// Optional inline selector: consume the next token ONLY if it's not a flag (--…) and not a
// route (/…). Selectors start with [ . # or a tag name. Shared by --aria/--text/--map's
// "defaults to a broad scope, narrow it inline" idiom.
function consumeOptionalSelector(rest: string[]): string | null {
  const next = rest[0];
  if (next !== undefined && !next.startsWith("-") && !next.startsWith("/")) {
    return rest.shift() as string;
  }
  return null;
}

function ariaFlag(args: Args, rest: string[], textMode: boolean, page: number): void {
  args.aria = true;
  args.ariaPage = page;
  // --text is the cheap combo: structure-as-text, no pixels.
  if (textMode) {
    args.shot = false;
  }
  const sel = consumeOptionalSelector(rest);
  if (sel !== null) {
    args.ariaSelector = sel;
  }
}

function mapFlag(args: Args, rest: string[], page: number): void {
  args.map = true;
  args.mapPage = page;
  const sel = consumeOptionalSelector(rest);
  if (sel !== null) {
    args.mapSelector = sel;
  }
}

export const FLAG_HANDLERS: Record<string, FlagHandler> = {
  "--help": (a) => {
    a.help = true;
  },
  "-h": (a) => {
    a.help = true;
  },
  "--scenario": (a, rest) => {
    a.scenario = rest.shift() ?? null;
  },
  "--matrix": (a) => {
    a.matrix = true;
  },
  "--json": (a) => {
    a.json = true;
  },
  "--summary": (a) => {
    a.summary = true;
  },
  "--no-failure-evidence": (a) => {
    a.failureEvidence = false;
  },
  "--strict-console": (a) => {
    a.strictConsole = true;
  },
  "--checkpoint": (a) => {
    a.checkpoint = true;
  },
  "--include-hidden": (a) => {
    a.includeHidden = true;
  },
  "--vnc": (a) => {
    a.vnc = true;
  },
  "--full": (a) => {
    a.fullPage = true;
  },
  "--wait": (a, rest) => {
    a.waitSelector = rest.shift() ?? null;
  },
  "--sse": (a, rest) => {
    a.sseSeconds = Number(rest.shift() ?? "0");
  },
  "--base": (a, rest) => {
    a.base = rest.shift() ?? DEFAULT_BASE;
  },
  "--debug-token": (a, rest) => {
    a.debugToken = rest.shift() ?? "";
  },
  "--click": (a, rest, page) => {
    pushStep(a, { kind: "click", selector: rest.shift() ?? "", page });
  },
  // In-page el.click() — bypasses Playwright's actionability checks for
  // stubborn targets (icon divs under overlay stacks).
  "--jsclick": (a, rest, page) => {
    pushStep(a, { kind: "jsclick", selector: rest.shift() ?? "", page });
  },
  // Hover the target's position then FORCE-click — for hover-revealed controls
  // (group-hover kebabs/toolbars stay actionability-invisible) and Radix
  // triggers that want real pointer events but fail visibility checks.
  "--press": (a, rest, page) => {
    pushStep(a, { kind: "press", selector: rest.shift() ?? "", page });
  },
  "--hover": (a, rest, page) => {
    pushStep(a, { kind: "hover", selector: rest.shift() ?? "", page });
  },
  // FIRST '=' splits (localStorage keys never contain '='; JSON values often do).
  "--ls": (a, rest) => {
    const seed = splitFirstEq(rest.shift() ?? "");
    if (seed !== null) {
      a.localStorage.push({ key: seed.head, value: seed.tail });
    }
  },
  // --fill "selector=value" — LAST '=' splits (selectors contain '=').
  "--fill": (a, rest, page) => {
    const s = splitLastEq(rest.shift() ?? "");
    pushStep(a, { kind: "fill", selector: s.head, value: s.tail, page });
  },
  // TWO forms, picked by whether the value carries an '=':
  //   --key "selector=KeyName"  focus the selector, THEN press — pairs with --fill to COMMIT a search
  //                             box (`--fill 'input=q' --key 'input=Enter'`).
  //   --key Tab                 BARE key to the page keyboard, no focus change — the only form that can
  //                             WALK focus (the pair form re-focuses its selector before every press, so
  //                             five of them land five times on the same neighbour, never a walk).
  "--key": (a, rest, page) => {
    const raw = rest.shift() ?? "";
    if (!raw.includes("=")) {
      pushStep(a, { kind: "keyboard", key: raw, page });
      return;
    }
    const s = splitLastEq(raw);
    pushStep(a, { kind: "key", selector: s.head, key: s.tail === "" ? "Enter" : s.tail, page });
  },
  // A POST-STEP wait (vs the page-load `--wait`): waits for the selector to become rendered at
  // this point in the step sequence. Use Playwright's explicit `text=phrase` selector for rendered
  // text; a bare phrase remains a CSS selector, so matching prose cannot falsely satisfy a missing
  // control. Text waiters must not accept a pre-existing hidden node: that was the databank "Fetch
  // and add" timeout class, where an attached placeholder was not yet the stable result a user could read.
  "--wait-for": (a, rest, page) => {
    pushStep(a, { kind: "waitfor", selector: rest.shift() ?? "", page });
  },
  // ── SPA navigation (dev nav bridge __orb.nav) — queued INLINE with the steps, argv order ──
  "--goto": (a, rest, page) => {
    pushNav(a, { kind: "goto", target: rest.shift() ?? "", page });
  },
  "--open-chat": (a, rest, page) => {
    pushNav(a, { kind: "open-chat", target: rest.shift() ?? "", page });
  },
  "--open-character": (a, rest, page) => {
    pushNav(a, { kind: "open-character", target: rest.shift() ?? "", page });
  },
  "--context-tab": (a, rest, page) => {
    pushNav(a, { kind: "context-tab", target: rest.shift() ?? "", page });
  },
  "--pages": (a, rest) => {
    a.pages = Math.max(1, Number(rest.shift() ?? "1") || 1);
  },
  "--contexts": (a, rest) => {
    a.contexts = Math.max(1, Number(rest.shift() ?? "1") || 1);
  },
  "--as": (a, rest) => {
    a.as = rest.shift() ?? null;
  },
  "--fixture-server": (a, rest) => {
    a.fixtureServer = rest.shift() ?? null;
  },
  "--fixture-base": (a, rest) => {
    a.fixtureBase = rest.shift() ?? null;
  },
  // Render a local HTML file (a committed mock) instead of a dev-stack route — same instruments over file://.
  "--file": (a, rest) => {
    a.file = rest.shift() ?? null;
  },
  "--watch": (a, rest) => {
    a.watchMs = Math.max(0, Number(rest.shift() ?? "0") || 0);
  },
  "--every": (a, rest) => {
    a.watchEveryMs = Math.max(1, Number(rest.shift() ?? "0") || MS_PER_SECOND);
  },
  "--no-deadcss": (a) => {
    a.deadCss = false;
  },
  "--aria": (a, rest, page) => {
    ariaFlag(a, rest, false, page);
  },
  "--text": (a, rest, page) => {
    ariaFlag(a, rest, true, page);
  },
  "--aria-depth": (a, rest) => {
    a.ariaDepth = Number(rest.shift() ?? "0") || null;
  },
  "--aria-boxes": (a) => {
    a.ariaBoxes = true;
  },
  "--no-shot": (a) => {
    a.shot = false;
  },
  "--shot-of": (a, rest) => {
    a.shotOf = rest.shift() ?? null;
  },
  "--mask": (a, rest) => {
    const sel = rest.shift();
    if (sel !== undefined && sel !== "") {
      a.mask.push(sel);
    }
  },
  "--dark": (a) => {
    a.colorScheme = "dark";
  },
  "--light": (a) => {
    a.colorScheme = "light";
  },
  // THE OS MEDIA QUERY. Its app-setting twin is --full-motion/--appearance below — different gates.
  "--reduced-motion": (a) => {
    a.reducedMotion = true;
  },
  // ── APPEARANCE SHIM (the app's own settings, not the OS media query) ──
  "--appearance": (a, rest) => {
    applyAppearanceFlag(a, parseAppearancePatch(rest.shift() ?? ""));
  },
  "--appearance-preset": (a, rest) => {
    applyAppearanceFlag(a, loadAppearancePreset(rest.shift() ?? ""));
  },
  "--full-motion": (a) => {
    a.appearance = mergeAppearancePatches(a.appearance, FULL_MOTION_PATCH);
  },
  // THE ACTIVE THEME — the settings SELECTION, a different axis from --dark/--light (the OS color scheme).
  "--theme": (a, rest) => {
    applyThemeFlag(a, parseThemeFlag(rest.shift() ?? ""));
  },
  "--idle": (a) => {
    a.idle = true;
  },
  "--crop": (a, rest) => {
    a.crop = rest.shift() ?? null;
  },
  "--probe": (a) => {
    a.probe = true;
  },
  "--baseline": (a) => {
    a.baseline = true;
  },
  "--diff": (a) => {
    a.diff = true;
  },
  "--out": (a, rest) => {
    a.out = rest.shift() ?? null;
  },
  // --wide/--viewport/--mobile/--desktop all fill ONE slot — last wins. The device presets and the raw
  // viewport are mutually exclusive, so each clears the other.
  "--wide": (a) => {
    a.viewport = WIDE_VIEWPORT;
    a.device = null;
  },
  "--viewport": (a, rest) => {
    a.viewport = parseViewport(rest.shift() ?? "") ?? a.viewport;
    a.device = null;
  },
  // Full mobile emulation (touch + mobile UA + DPR), not just a narrow viewport — the app's
  // progressive-disclosure law renders hover-revealed controls ALWAYS-VISIBLE at pointer:coarse, and the
  // rail flips to a bottom tab bar; a bare narrow viewport would miss both.
  "--mobile": (a) => {
    a.device = MOBILE_DEVICE;
  },
  // Explicit alias for the default desktop viewport — lets a script pair --mobile/--desktop symmetrically.
  "--desktop": (a) => {
    a.viewport = DEFAULT_VIEWPORT;
    a.device = null;
  },
  "--eval": (a, rest, page) => {
    const expr = rest.shift();
    if (expr !== undefined && expr !== "") {
      pushEval(a, { expr, page });
    }
  },
  "--contrast": (a, rest, page) => {
    const sel = rest.shift();
    if (sel !== undefined && sel !== "") {
      a.contrast.push({ selector: sel, page });
    }
  },
  "--contrast-pixel": (a) => {
    a.contrastPixel = true;
  },
  "--expect-visible": (a, rest, page) => {
    a.assertions.push({ kind: "visible", selector: rest.shift() ?? "", page });
  },
  "--expect-text": (a, rest, page) => {
    const value = splitLastEq(rest.shift() ?? "");
    a.assertions.push({ kind: "text", selector: value.head, expected: value.tail, page });
  },
  "--expect-count": (a, rest, page) => {
    const value = splitLastEq(rest.shift() ?? "");
    a.assertions.push({ kind: "count", selector: value.head, expected: Number(value.tail), page });
  },
  "--expect-url": (a, rest, page) => {
    a.assertions.push({ kind: "url", expected: rest.shift() ?? "", page });
  },
  "--expect-no-overflow": (a, rest, page) => {
    a.assertions.push({ kind: "overflow", selector: consumeOptionalSelector(rest) ?? "html", page });
  },
  "--expect-focus": (a, rest, page) => {
    a.assertions.push({ kind: "focus", selector: rest.shift() ?? "", page });
  },
  "--map": (a, rest, page) => {
    mapFlag(a, rest, page);
  },
  // The isolated-stage family lives in its own module (ops/flags-stage.ts) — seven flags about the same
  // subsystem, split out when this table crossed the tooling line cap.
  ...STAGE_FLAG_HANDLERS,
};

export const REQUIRED_VALUE_FLAGS = new Set([
  "--scenario",
  "--wait",
  "--sse",
  "--base",
  "--debug-token",
  "--click",
  "--jsclick",
  "--press",
  "--hover",
  "--ls",
  "--fill",
  "--key",
  "--wait-for",
  "--goto",
  "--open-chat",
  "--open-character",
  "--context-tab",
  "--pages",
  "--contexts",
  "--as",
  "--fixture-server",
  "--fixture-base",
  "--file",
  "--watch",
  "--every",
  "--aria-depth",
  "--shot-of",
  "--mask",
  "--crop",
  "--out",
  "--viewport",
  ...APPEARANCE_VALUE_FLAGS,
  ...THEME_VALUE_FLAGS,
  "--eval",
  "--contrast",
  "--expect-visible",
  "--expect-text",
  "--expect-count",
  "--expect-url",
  "--expect-focus",
  "--ref",
]);

export const OPTIONAL_SELECTOR_FLAGS = new Set(["--aria", "--text", "--map", "--expect-no-overflow"]);

export const PAGE_TARGET_FLAGS = new Set([
  "--click",
  "--jsclick",
  "--press",
  "--hover",
  "--fill",
  "--key",
  "--wait-for",
  "--goto",
  "--open-chat",
  "--open-character",
  "--context-tab",
  "--aria",
  "--text",
  "--eval",
  "--contrast",
  "--expect-visible",
  "--expect-text",
  "--expect-count",
  "--expect-url",
  "--expect-no-overflow",
  "--expect-focus",
  "--map",
]);
