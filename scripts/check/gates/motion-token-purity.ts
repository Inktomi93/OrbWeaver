// Gate: motion-token-purity (BASEUI-MOTION-AUDIT.md §5 Layer 3 — the source arm of the never-desync
// guarantee). The audit found the entire drift surface for coordinated motion is raw-CSS files: a bare
// duration (`220ms`, `3s`) or a raw easing keyword (`ease`/`ease-in`/`ease-out`/`ease-in-out`/
// `cubic-bezier(...)`) written straight into a `transition`/`animation` shorthand (or a
// `transition-duration`/`transition-timing-function`/`animation-duration` longhand) instead of the DTCG
// motion tokens. The Tailwind class lane is already 100% on-token (`duration-(--motion-*) ease-out-expo`
// everywhere); the leak is CSS. A raw value can't be caught by review (it looks fine) and produces no
// dropped frame, but it is the slow leak that eventually re-creates the divergence class — a panel and
// its grid track animating at different tempos. This gate keeps the CSS motion monoculture that Layers 1
// (co-motion vars in shell.css) and 2 (the rendered-parity CT) assume.
//
// SCOPE: `packages/{ui,client}/src/**/*.css` — the CSS surfaces the drift lives in (the two globals.css +
// shell.css), matching the packages the sibling `no-off-token-radius-shadow` / `no-arbitrary-tw-values`
// gates cover. It reads the four MOTION properties only (`transition`, `animation`, and the duration/
// timing longhands) — so the token DEFINITIONS (`--motion-fast: 130ms` in theme.css, `--shell-motion:
// var(--motion-base)` in shell.css) pass straight through: a custom-property declaration is not one of
// the scanned properties. `linear` easing is ALLOWED (continuous loops legitimately use it — the skeleton
// shimmer), as is any `var(--…)` (a token OR a co-motion `--shell-*` var). A `var(...)` duration/easing,
// a `0`/`0s` (a deliberate no-transition), and `steps(...)`/`step-*` (a discrete timing function with no
// token home) all pass.
//
// ALLOWLIST (file-level, the no-off-token-radius-shadow BURN_DOWN precedent): a file lands here with the
// value + reason when the raw motion value is real pre-existing debt (the weave shimmer's `3s`, the
// spotlight's `ease-out`, the reduced-motion floor's `0.01ms !important` killer — all continuous/isolated,
// nothing to desync from). An allowlisted file gone CLEAN is RED ("stale entry — remove it"); a NEW
// offender not in the allowlist is RED immediately. `shell.css` is deliberately NOT allowlisted — it is
// the coordination surface, now fully on the co-motion vars, and MUST stay raw-value-free.
import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GateDescriptor } from "../contract.ts";
import type { Check, CheckContext, Violation } from "../harness.ts";

/** Current legit raw-motion files → reason (continuous loop / isolated hover / the a11y kill-switch — no
 *  coordination partner to desync from; not worth a token migration). */
const ALLOWLIST: Record<string, string> = {
  "packages/client/src/styles/globals.css":
    "`orb-weave-shimmer 3s ease-in-out` — a continuous decorative loop; nothing coordinates with it.",
  "packages/ui/src/styles/globals.css":
    "the reduced-motion floor's `0.01ms !important` duration killers (a11y kill-switch, must be a raw " +
    "sub-frame value) + the media-grid spotlight's `ease-out` (isolated hover effect).",
};

const MESSAGE =
  "raw motion value in CSS (BASEUI-MOTION-AUDIT.md §5 Layer 3) — a bare duration or easing keyword/" +
  "cubic-bezier bypasses the motion tokens and can drift a coordinated animation out of sync: use " +
  "var(--motion-*) for duration and var(--ease-*) (or a co-motion --*-ease var, or `linear`) for easing.";

const STALE_ENTRY_MESSAGE_PREFIX =
  "ALLOWLIST entry has NO raw motion value any more — the offender was moved onto a motion token " +
  "(ratchet down): delete the stale row in motion-token-purity.ts: ";

// The four motion PROPERTIES whose value is a duration and/or easing (never a custom-property def, so
// `--motion-*`/`--shell-*` definitions are out of scope). `\banimation\b` etc. avoid matching e.g.
// `animation-name`/`animation-delay` (a delay is a duration too, but the audit's inventory is durations
// on the run/shorthand — keep the scope to what the drift surface actually is: run duration + timing).
const MOTION_DECL_RE =
  /(?:^|[;{])\s*(?<prop>transition|animation|transition-duration|animation-duration|transition-timing-function)\s*:\s*(?<value>[^;}]+)/gu;

// A raw time literal: a number (int/decimal) immediately followed by `s`/`ms`, NOT inside a `var(`/`calc(`
// (those resolve a token). `0`/`0s`/`0ms` is a deliberate no-transition, allowed.
const RAW_TIME_RE = /(?<![\w.-])(?<num>\d*\.?\d+)(?<unit>ms|s)\b/gu;
// A raw easing: the bare CSS keywords + cubic-bezier(...). `linear` is ALLOWED (continuous loops);
// `steps(...)`/`step-start`/`step-end` are discrete timing with no token home — not matched.
const RAW_EASE_RE =
  /\b(?:ease-in-out|ease-in|ease-out|ease)\b(?!-(?:expo|out-expo))|cubic-bezier\s*\(/gu;

/** Strip `var(...)` and `calc(...)` groups from a declaration value so their inner token time/easing
 *  literals (e.g. `var(--motion-base)` when a token happened to inline a bezier) don't false-fire — a
 *  `var(--…)`/`calc(--…)` reference IS the token-driven form. */
function stripTokenGroups(value: string): string {
  return value.replace(/\b(?:var|calc)\s*\([^()]*\)/gu, " ");
}

/** Does a `0`-only time survive? A raw `0s`/`0ms` (or bare `0`) is a deliberate no-transition, not a
 *  magic duration — allowed. So a time literal fires only when its numeric part is non-zero. */
function hasRawTime(value: string): boolean {
  RAW_TIME_RE.lastIndex = 0;
  for (const m of value.matchAll(RAW_TIME_RE)) {
    if (Number(m.groups?.["num"]) !== 0) {
      return true;
    }
  }
  return false;
}

function hasRawEase(value: string): boolean {
  RAW_EASE_RE.lastIndex = 0;
  return RAW_EASE_RE.test(value);
}

/** 1-based line number of `index` in `text` (count newlines in the preceding slice). */
function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/** Lines of every raw-motion declaration in one CSS file's text. */
function offenceLines(text: string): number[] {
  const lines: number[] = [];
  MOTION_DECL_RE.lastIndex = 0;
  for (const m of text.matchAll(MOTION_DECL_RE)) {
    const value = stripTokenGroups(m.groups?.["value"] ?? "");
    if (hasRawTime(value) || hasRawEase(value)) {
      // Anchor at the property name, not the match start (which includes the leading `;`/`{`).
      const propIdx = (m.index ?? 0) + m[0].indexOf(m.groups?.["prop"] ?? "");
      lines.push(lineOf(text, propIdx));
    }
  }
  return lines;
}

/** The offender scan over every CSS file in the two src trees (fs, not ts-morph — CSS isn't in the
 *  project). Returns new-offender violations + which allowlisted files still carry a raw motion value. */
function scanCss(
  root: string,
  allowlist: Record<string, string>,
): { violations: Violation[]; seenAllowlisted: Set<string> } {
  const violations: Violation[] = [];
  const seenAllowlisted = new Set<string>();
  const files = [
    ...globSync("packages/ui/src/**/*.css", { cwd: root }),
    ...globSync("packages/client/src/**/*.css", { cwd: root }),
  ];
  for (const rel of files) {
    const text = readFileSync(`${root}/${rel}`, "utf8");
    const lines = offenceLines(text);
    if (rel in allowlist) {
      if (lines.length > 0) {
        seenAllowlisted.add(rel);
      }
      continue;
    }
    for (const line of lines) {
      violations.push({ file: rel, line, message: MESSAGE });
    }
  }
  return { violations, seenAllowlisted };
}

/** The ratchet-down arm: an allowlisted file that never surfaced a raw motion value (absent OR clean). */
function staleEntries(
  allowlist: Record<string, string>,
  seenAllowlisted: ReadonlySet<string>,
): Violation[] {
  return Object.keys(allowlist)
    .filter((rel) => !seenAllowlisted.has(rel))
    .map((rel) => ({
      file: "scripts/check/gates/motion-token-purity.ts",
      line: 1,
      message: `${STALE_ENTRY_MESSAGE_PREFIX}"${rel}" — scripts/check/gates/motion-token-purity.ts`,
    }));
}

/** Factory (the createNoOffTokenRadiusShadow precedent): the self-test drives BOTH ratchet arms with an
 *  injected registry + a real temp tree (withTree). */
export function createMotionTokenPurity(allowlist: Record<string, string>): Check {
  return {
    name: "motion-token-purity",
    run: ({ root }: CheckContext): Violation[] => {
      const { violations, seenAllowlisted } = scanCss(root, allowlist);
      return [...violations, ...staleEntries(allowlist, seenAllowlisted)];
    },
  };
}

export const motionTokenPurity: Check = createMotionTokenPurity(ALLOWLIST);

// ── SINGLE-PASS CONTRACT FORM (§1.2 — a CSS-glob fs `run` gate with a ratchet, fsBacked conformance) ─
// motion-token-purity reads the real fs (globSync of packages/{ui,client}/src/**/*.css + readFileSync) —
// CSS isn't in the ts-morph Project — so it ports as a `run` descriptor over ctx.root, `fsBacked` for
// conformance. The offender arm reuses scanCss against the LIVE ALLOWLIST. The stale arm (an allowlisted
// .css that went clean) is name-keyed to CSS FILES; the batch-6 fileLoaded sentinel is Project-based and
// can't see a .css, so the fs-analog is used: the stale arm only judges an allowlisted file that EXISTS on
// disk (existsSync) — a synthetic tree lacking the real allowlisted .css files won't misfire. On the real
// run every allowlisted .css exists, so the ratchet is preserved. Byte-identical to the legacy Check.
export const gate: GateDescriptor = {
  name: "motion-token-purity",
  docRow: "BASEUI-MOTION-AUDIT.md §5 (Layer 3)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message: MESSAGE,
  fix: "use var(--motion-*) for duration and var(--ease-*) (or a co-motion --*-ease var, or `linear`) for easing — never a raw duration/easing in CSS.",
  run: (ctx) => {
    const { violations, seenAllowlisted } = scanCss(ctx.root, ALLOWLIST);
    for (const v of violations) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
    for (const rel of Object.keys(ALLOWLIST)) {
      // The fs-analog of the fileLoaded sentinel: only judge an allowlisted CSS file that actually EXISTS
      // in this run's tree — a synthetic conformance/parity tree without the real allowlisted files must
      // not misfire the name-keyed stale arm (on the real run they all exist, so the ratchet holds).
      if (existsSync(join(ctx.root, rel)) && !seenAllowlisted.has(rel)) {
        ctx.report({
          file: "scripts/check/gates/motion-token-purity.ts",
          line: 1,
          column: 0,
          message: `${STALE_ENTRY_MESSAGE_PREFIX}"${rel}" — scripts/check/gates/motion-token-purity.ts`,
        });
      }
    }
  },
  mustFlag: [
    {
      files: { "packages/ui/src/x/x.css": ".a { transition: opacity 220ms ease-out; }\n" },
      expect: { messageIncludes: "raw motion value" },
      why: "a raw duration (220ms) + easing (ease-out) in a CSS transition — bypasses the motion tokens",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/ui/src/x/ok.css":
          ".a { transition: opacity var(--motion-base) var(--ease-out-expo); }\n",
      },
      why: "the transition uses var(--motion-*)/var(--ease-*) tokens — on-token, passes",
    },
  ],
};
