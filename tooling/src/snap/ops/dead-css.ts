// The dead-class scan: DOM class tokens vs the compiled CSSOM (dead tokens + empty rules). The scan's
// dead-token definition is shared with the client's [css] flagger — two definitions would file two bugs.
import type { Page } from "@playwright/test";

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
export async function scanDeadCss(page: Page, includeHidden: boolean): Promise<{ dead: Array<{ token: string; count: number }>; empty: string[] }> {
  // NOTE: the body ships as a STRING — tsx (esbuild keepNames) decorates
  // function expressions with a __name helper that doesn't exist inside the
  // browser context; a serialized IIFE evaluates untransformed. (Also the root
  // tsconfig that checks scripts/ is DOM-less — a function body wouldn't compile.)
  return (await page.evaluate(`(() => {
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
    // BACKSLASH DOUBLING IS DELIBERATE — do not "fix" it. This whole IIFE is a
    // RAW STRING (see the keepNames note above), NOT a JS regex literal. Every
    // backslash that must survive into the browser-side regex has to be escaped
    // once here so the string literal yields it. The regex the browser actually
    // compiles is /.((?:\\.|[A-Za-z0-9_-])+)/g — i.e. a literal dot, then a run
    // of either an escaped char (\\.) or a CSS ident char. Halving these (.→.,
    // \\.→.) would change the in-browser regex and break dead-class matching.
    const re = /\\.((?:\\\\.|[A-Za-z0-9_-])+)/g;
    const walk = (rules) => {
      for (const r of rules) {
        const sel = r.selectorText;
        if (typeof sel === "string") {
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(sel)) !== null) defined.add(m[1].replace(/\\\\(.)/g, "$1"));
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
      try { walk(sheet.cssRules); } catch { /* cross-origin */ }
    }
    const skip = (t) =>
      t === "group" || t === "peer" || t.startsWith("group/") || t.startsWith("peer/") ||
      // third-party marker classes that ship no stylesheet rules
      t === "echarts-for-react" || t.startsWith("lucide") || t.startsWith("TanStack") || t.startsWith("tsqd-");
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
        if (used.has(m[1].replace(/\\\\(.)/g, "$1"))) return true;
      }
      return false;
    });
    return { dead, empty: emptyUsed.sort() };
  })()`)) as { dead: Array<{ token: string; count: number }>; empty: string[] };
}
