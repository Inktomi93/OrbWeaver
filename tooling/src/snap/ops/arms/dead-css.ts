// The dead-class scan: DOM class tokens vs the compiled CSSOM (dead tokens + empty rules). The scan's
// dead-token definition is shared with the client's [css] flagger — two definitions would file two bugs.
// That sharing is now literal, not by hand-copy: the marker tables and the selector-token regex SOURCE
// come from `@orb/kit/dead-css` and are SERIALIZED into the in-page string below, so the flagger and this
// probe compile the same regex and skip the same namespaces by construction.
import { CLASS_SELECTOR_TOKEN_PATTERN, CLASS_TOKEN_ESCAPE_PATTERN, DEAD_CSS_MARKER_EXACT, DEAD_CSS_MARKER_PREFIXES } from "@orb/kit/dead-css";
import type { Page } from "@playwright/test";
import { aggregateScope } from "../../../_shared/artifact-scope.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import type { ArmArgs, ArmDef, ArmFactEmission, ArmFailureCounts, ArmNeeds, ArmPairInput } from "../../contract/arms.ts";
import type { DeadCssEvidence } from "../../contract/dead-css.ts";
import { deadCssCensus, deadCssDrain } from "../page-validate.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

// ── Dead-class scan ─────────────────────────────────────────────────────────
// Two failure modes, one walk:
//   1. DEAD TOKENS — a class on an element with NO matching rule anywhere: a
//      utility Tailwind didn't GENERATE (wrong theme namespace — neo's
//      sm:max-w-dialog-* bug: max-w resolves --container-*, the tokens only
//      mapped --width-*; or a typo'd variant / stale class). Marker-only
//      classes that legitimately have no rules (group/peer + named forms) are
//      skipped, as are known third-party marker namespaces.
//   2. EMPTY RULES — the rule compiled but every declaration was INVALID CSS,
//      so the browser dropped them at parse time and CSSOM holds an empty
//      block (style.length === 0). Canonical case: v3 var syntax `w-[--foo]`
//      compiling under v4 to `width: --foo` (bare ident, no var()). Mode 1
//      can't see it because the SELECTOR exists.
// #1004 — the in-page guard below throws on a bad GENERATION; this settles the SHAPE, and keeps
// `null` (a --file fixture with no bridge) distinguishable from an unreadable answer.
async function settleDeadCssDrain(page: Page): Promise<DeadCssEvidence["drain"]> {
  return deadCssDrain(
    await page.evaluate(`(async () => {
    const drain = globalThis.__orb?.motionFlaggersDrain;
    if (typeof drain !== "function") return null;
    const receipt = await drain();
    if (!receipt || !Number.isInteger(receipt.requestedGeneration) || !Number.isInteger(receipt.completedGeneration) ||
        receipt.requestedGeneration <= 0 || receipt.completedGeneration < receipt.requestedGeneration) {
      throw new Error("INSTRUMENT ERROR: motionFlaggersDrain returned an invalid generation receipt");
    }
    return receipt;
  })()`),
  );
}

export async function scanDeadCss(page: Page, includeHidden: boolean): Promise<DeadCssEvidence> {
  // NOTE: the body ships as a STRING. Surviving reason: the body runs in the BROWSER while tsc
  // would check a function form against the NODE lib (TS2584 on every DOM name). Original reason —
  // now historical, tsx was shed 2026-08-03: tsx (esbuild keepNames) decorated
  // function expressions with a __name helper that doesn't exist inside the
  // browser context; a serialized IIFE evaluates untransformed. (Also the root
  // tsconfig that checks scripts/ is DOM-less — a function body wouldn't compile.)
  const drain = await settleDeadCssDrain(page);
  const census = deadCssCensus(
    await page.evaluate(`(() => {
    const used = new Map();
    for (const el of document.querySelectorAll("*")) {
      if (!${JSON.stringify(includeHidden)}) {
        const visible = typeof el.checkVisibility === "function"
          ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })
          : el.getClientRects().length > 0;
        if (!visible || el.closest('[hidden],[inert],[aria-hidden="true"]')) continue;
      }
      for (const t of el.classList) used.set(t, (used.get(t) ?? 0) + 1);
    }
    const defined = new Set();
    const empty = new Set();
    const unreadable = [];
    let readableSheets = 0;
    let ruleCount = 0;
    // THE REGEX IS BUILT FROM @orb/kit/dead-css'S SOURCE, not written here. This whole IIFE is a RAW
    // STRING, so a regex LITERAL has to carry doubled backslashes to survive it — a hand-maintained
    // second spelling of the flagger's pattern, and the one thing most likely to drift. JSON.stringify
    // emits the escaped literal for us and new RegExp compiles exactly the pattern the flagger compiles.
    const re = new RegExp(${JSON.stringify(CLASS_SELECTOR_TOKEN_PATTERN)}, "g");
    const unescapeRe = new RegExp(${JSON.stringify(CLASS_TOKEN_ESCAPE_PATTERN)}, "g");
    const walk = (rules) => {
      for (const r of rules) {
        ruleCount += 1;
        const sel = r.selectorText;
        if (typeof sel === "string") {
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(sel)) !== null) defined.add(m[1].replace(unescapeRe, "$1"));
          // A style rule with zero surviving declarations AND no nested
          // child rules = the browser rejected every value in it. (Tailwind
          // v4 variants emit nesting — hover utilities hold an &:hover child
          // rule and no own declarations — hence the child check. NB: this
          // comment lives inside the evaluate string; no backticks here.)
          if (r.style && r.style.length === 0 && (!r.cssRules || r.cssRules.length === 0)) {
            empty.add(sel);
          }
        }
        if (r.cssRules) walk(r.cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch (error) {
        unreadable.push({ href: sheet.href, error: error instanceof Error ? error.message : String(error) });
        continue;
      }
      readableSheets += 1;
      walk(rules);
    }
    // Marker-only namespaces that ship no stylesheet rules — the SAME two tables the client flagger
    // reads (@orb/kit/dead-css), serialized in rather than restated.
    const markerExact = ${JSON.stringify(DEAD_CSS_MARKER_EXACT)};
    const markerPrefixes = ${JSON.stringify(DEAD_CSS_MARKER_PREFIXES)};
    const skip = (t) => markerExact.indexOf(t) !== -1 || markerPrefixes.some((p) => t.startsWith(p));
    const dead = [];
    for (const [token, count] of used) {
      if (!defined.has(token) && !skip(token)) dead.push({ token, count });
    }
    dead.sort((a, b) => b.count - a.count);
    // Only report empty rules whose class is actually ON an element right
    // now — Tailwind's source scanner also compiles class-shaped strings out
    // of comments/docs (w-[--foo] in a code comment becomes a real, empty
    // rule) and those are harmless until something wears them.
    const emptyUsed = [...empty].filter((sel) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(sel)) !== null) {
        if (used.has(m[1].replace(unescapeRe, "$1"))) return true;
      }
      return false;
    });
    return {
      sheets: document.styleSheets.length,
      readableSheets,
      rules: ruleCount,
      defined: defined.size,
      used: used.size,
      unreadable,
      dead,
      empty: emptyUsed.sort(),
    };
  })()`),
  );
  return { ...census, drain };
}

/** FOUR RESULT pairs in TWO historical positions, which is why `ArmDef.failures` returns a MAP rather than
 *  §6's single number: dead tokens and empty rules are independent findings with independent counts, and
 *  each has both a `*-fails` member (the verdict) and a bare count (the census). `ops/run.ts` claims each
 *  by name at the position it has always printed in, so the RESULT line stays byte-identical. */
function deadCssCounts({ outcomes }: ArmPairInput): { readonly dead: number; readonly empty: number } {
  return {
    dead: outcomes.reduce((count, outcome) => count + outcome.deadCss.length, 0),
    empty: outcomes.reduce((count, outcome) => count + outcome.emptyCss.length, 0),
  };
}

export const DEAD_CSS_ARM = {
  flags: [
    {
      flag: "--no-deadcss",
      kind: "boolean",
      pageTargetable: false,
      handler: (a): void => {
        a.deadCss = false;
      },
    },
  ],
  level: "call",
  needs: (): ArmNeeds => ({}),
  sessionCallBaseMs: (): null => null,
  defaults: (): Pick<ArmArgs, "deadCss"> => ({ deadCss: true }),
  help: `  --no-deadcss            skip the dead-class/empty-rule scan (it is ON by default: dead tokens and
                          used-but-empty rules RED the run, the same way --contrast findings do)`,
  result: {
    schema: "snap-arm-dead-css-v1",
    source: "CSSOM + rendered DOM class census",
    lifetime: "settled page capture",
    enabled: (opts): boolean => opts.deadCss,
  },
  lifecycle: {
    at: "page",
    enabled: ({ opts }): boolean => opts.deadCss,
    run: async ({ page, opts, outcome }): Promise<void> => {
      const scan = await scanDeadCss(page, opts.includeHidden);
      outcome.deadCss = [...scan.dead];
      outcome.emptyCss = [...scan.empty];
      outcome.deadCssEvidence = scan;
    },
    pairs: (input): readonly ResultPair[] => {
      const counts = deadCssCounts(input);
      return [
        ["deadcss-fails", counts.dead],
        ["emptycss-fails", counts.empty],
        ["deadcss", counts.dead],
        ["emptycss", counts.empty],
      ];
    },
    facts: (input): readonly ArmFactEmission<"dead-css">[] => {
      const counts = deadCssCounts(input);
      let state: "off" | "failed" | "passed" = "off";
      if (input.opts.deadCss) {
        state = counts.dead + counts.empty > 0 ? "failed" : "passed";
      }
      return [
        {
          scope: aggregateScope(),
          data: {
            state,
            detail: null,
            deadTokens: counts.dead,
            emptyRules: counts.empty,
          },
        },
      ];
    },
    // NOT `css`: that summary member counts OUTCOMES whose CSS evidence is untrustworthy for EITHER
    // reason — an unreadable stylesheet here, or a cascade instrument-error — and one page can carry both.
    // Summing two arm-owned counts would double-count it, so `css` stays a cross-arm fold in
    // ops/verdict.ts, which is the only place that sees both sheets of evidence for one page.
    failures: (input): ArmFailureCounts => {
      const counts = deadCssCounts(input);
      return { deadCss: counts.dead, emptyCss: counts.empty };
    },
    exit: (_input, code): number => code,
  },
} satisfies ArmDef<"dead-css">;
