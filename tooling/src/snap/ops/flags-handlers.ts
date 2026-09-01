// The flag table itself: one handler per flag (Record dispatch), driven by parseSnapArgs (ops/parse.ts)
// in argv order. Split out of ops/flags.ts when that file crossed the tooling line cap
// (docs/architecture/core/Core-Tooling-Law.md §4.3) — the table is the single biggest seam in that file.

import { mergeAppearancePatches } from "../../_shared/appearance.ts";
import { applyAppearanceFlag, FULL_MOTION_PATCH, loadAppearancePreset, parseAppearancePatch } from "../../_shared/appearance-flags.ts";
import { parseViewport, splitFirstEq, splitLastEq, splitSelectorEq } from "../../_shared/argv.ts";
import { DEFAULT_BASE } from "../../_shared/browser.ts";
import { MOBILE_DEVICE } from "../../_shared/browser-environment.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { applyPanelPresetFlag, loadPanelPreset } from "../../_shared/panel-flags.ts";
import { applyThemeFlag, parseThemeFlag } from "../../_shared/theme.ts";
import type { Args } from "../contract/types.ts";
import { NO_CPU_THROTTLE, parseNetworkProfile } from "../lib/throttle.ts";
import { STAGE_FLAG_HANDLERS } from "./flags-stage.ts";
import { ariaFlag, consumeOptionalSelector, DEFAULT_VIEWPORT, MS_PER_SECOND, mapFlag, pushEval, pushNav, pushStep, WIDE_VIEWPORT } from "./flags-support.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

// One handler per flag (Record dispatch, house style). Module-private (matches ops/flags.ts pre-split).
type FlagHandler = (args: Args, rest: string[], page: number) => void;

export const FLAG_HANDLERS: Record<string, FlagHandler> = {
  "--help": (a) => {
    a.help = true;
  },
  "--materialize-devtools-assets": (a) => {
    a.materializeDevToolsAssets = true;
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
  // --fill "selector=value" — the first TOP-LEVEL '=' splits (the value is a JS literal that
  // routinely contains '=' itself, e.g. `--fill 'input=const a = 1;'`; the selector is the invariant
  // prefix). Bracket-aware since #816: an attribute selector carries its own '=' and used to be cut
  // in half here (`[data-testid=x]=v` filled `[data-testid`), which made the flag unusable for the
  // one selector shape this app labels its inputs with.
  "--fill": (a, rest, page) => {
    const s = splitSelectorEq(rest.shift() ?? "") ?? { head: "", tail: "" };
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
  // That CSS-not-text reading is right but was INVISIBLE at the call site — a bare phrase timed out for
  // 10s and read as "the text is not rendered" (#550). It is now refused at parse time by
  // SELECTOR_VALUE_FLAGS + lib/selector-shape.ts, which names the `text=` spelling instead.
  "--wait-for": (a, rest, page) => {
    pushStep(a, { kind: "waitfor", selector: rest.shift() ?? "", page });
  },
  // --upload <selector>=<path[,path...]> (#651): LAST '=' splits (--key convention; --fill diverges,
  // see above — its value is a literal that commonly contains '='); boundary +
  // existence + real-input resolution happen at DRIVE time (_shared/upload.ts) — parse stays side-effect free.
  "--upload": (a, rest, page) => {
    const s = splitLastEq(rest.shift() ?? "");
    const paths = s.tail
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p !== "");
    pushStep(a, { kind: "upload", selector: s.head, paths, page });
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
  "--panel": (a, rest, page) => {
    pushNav(a, { kind: "panel", target: rest.shift() ?? "", page });
  },
  "--focus": (a, rest, page) => {
    pushNav(a, { kind: "focus", target: rest.shift() ?? "", page });
  },
  // `--panels <preset>` expands into the SAME panel/focus navs at ITS argv position and on THIS page tab,
  // so a preset is composition over the two flags above, never a second mechanism (_shared/panel-flags.ts).
  "--panels": (a, rest, page) => {
    applyPanelPresetFlag(loadPanelPreset(rest.shift() ?? ""), a.errors, (action) => {
      pushNav(a, { kind: action.method, target: action.target, page });
    });
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
  // CDP load emulation (#826). Both are applied to EVERY page before it navigates, so boot itself is
  // measured under the arm; both are refused at parse time on a bad value (an ignored throttle flag
  // would report a load arm that never ran). The rate is validated in ops/parse.ts.
  "--cpu-throttle": (a, rest) => {
    a.cpuThrottle = Number(rest.shift() ?? NO_CPU_THROTTLE);
  },
  "--network": (a, rest) => {
    a.network = parseNetworkProfile(rest.shift() ?? "");
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
  "--cascade": (a, rest, page) => {
    const value = splitLastEq(rest.shift() ?? "");
    a.cascade.push({ selector: value.head, property: value.tail, page });
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
