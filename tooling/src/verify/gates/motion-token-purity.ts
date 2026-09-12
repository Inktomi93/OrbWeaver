// Gate: motion-token-purity (motion-and-animation-guide.md §2) — bans a raw duration (`220ms`) or easing
// keyword/cubic-bezier written straight into a `transition`/`animation` shorthand or duration/timing
// longhand, instead of the DTCG motion tokens. `linear` and any `var(--…)` are allowed; token DEFINITIONS,
// `0`/`0s`, and `steps(...)`/`step-*` all pass.
//
// FAMILY: singleton under its own id, and the reason is the loader's, not a shrug. The shared CSS corpus is
// a resource KIND (`authored-css`), which is not a family key. The one shared `lib/` reader this module
// calls is `lib/css-rules.ts#atRulesContaining` — but its co-consumers (`rest-transform-grid`, and
// `over-art-plate-arm` through `lib/over-art-plate.ts`) each rest on a DIFFERENT reader for their own
// subject, so none of them is a proven sibling here, and the loader refuses a lone member whose `family` is
// not its id. The true sibling is `no-raw-color-in-css` — the other authored-CSS literal scanner — whose own
// header reserves the shared name `css-literal-geometry` for "the commit that converts the second member";
// re-declaring it needs an edit to THAT module, outside this lane's fence, so both stay singletons and the
// merge is one line in each when a lane owns both.
//
// POPULATION PORT (legacy `a4206c511`, byte-identical): the legacy `scanCss` globbed
// `packages/ui/src/**/*.css` + `packages/client/src/**/*.css`; `authored-css` is exactly every `.css` under
// `packages/ui/src` and `packages/client/src` (`ops/resource-tree.ts:84-107`). The four motion PROPERTIES
// are ported verbatim, INCLUDING the deliberate absence of `animation-timing-function` and of `*-delay`:
// the drift surface the audit inventoried is run duration + timing on the shorthand/duration longhands.
// The legacy regex anchored a declaration at `(?:^|[;{])`; the parsed inventory answers the same question
// structurally, which additionally reaches a declaration nested inside an at-rule block.
//
// EXEMPTION-MECHANISM MOVE + PREDICATE CHANGE (guide §4.6 category 5, and both sides are stated because
// this is not a 1:1 port). The legacy file-level `ALLOWLIST` (two stylesheets, two collective reasons) hid
// 19 declaration findings, each carrying EXACTLY ONE raw literal, with 0 unallowlisted offenders — so the
// legacy gate was silent on the real tree. The arithmetic of the move is 19 = 2 + 17:
//   · 2 (`packages/ui/src/styles/globals.css:277,293` — the reduced-motion kill duration) STOP BEING
//     REPORTED, through the population carve-out below. That is the predicate change: an authoritative
//     home is a carve-out, never a waiver (the `no-raw-color-in-css` precedent).
//   · 17 become LIVE findings licensed by one `@orb-waive` marker each, where the file-level allowlist
//     used to hide them (client/styles/globals.css 2 · ui/styles/globals.css 15).
// So the real tree goes 0 effective → 0 effective, by way of 17 raw / 17 waived. The falsifier for a
// mechanism move is not "does it still catch" but "did every hidden site become exactly ONE live consumed
// row": a marker on a site that goes on-token ALARMS as a dead position, which is what the legacy
// STALE_ENTRY arm hand-rolled, so the ratchet survives the move rather than being dropped.
//
// FINDING GRANULARITY CHANGED (guide §4.6 ANCHOR MOVE): legacy reported once per DECLARATION anchored at
// the property name; a final ordinary policy's finding position must be an exact slice of the text at the
// reported column AND must be individually waivable, so this reports once per raw LITERAL at that literal.
// The two counts coincide on today's tree because no live declaration carries more than one.
//
// WHERE A BROKEN RESOURCE REFUSES — not here. A declared resource that comes back
// missing/empty/unresolved/malformed makes `resolveResourceDeclarations` (`lib/resource-declaration.ts:182`)
// THROW during the POPULATION phase, and the receipt phase withholds every consumer, both before
// `create`/`evaluate` run (guide §11 ruling 3). This module owns no not-ready branch: it reads the CSS
// inventory through `readyResourceValue`, whose throw asserts the runtime's own refusal already held.
import { defineGate } from "../contract/policy.ts";
import type { CssDeclarationFact } from "../contract/resource-css.ts";
import type { AuthoredCssFile } from "../contract/resource-tree.ts";
import { atRulesContaining } from "../lib/css-rules.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

/** The four motion PROPERTIES whose value is a duration and/or easing (never a custom-property def, so
 *  `--motion-*`/`--shell-*` definitions are out of scope). */
const MOTION_PROPERTIES: ReadonlySet<string> = new Set(["transition", "animation", "transition-duration", "animation-duration", "transition-timing-function"]);

/** THE ONE AUTHORITATIVE HOME for a raw DURATION, on the `no-raw-color-in-css` precedent (whose population
 *  carve-out is `declaration.file !== GENERATED_THEME`): the reduced-motion floor's job is to DEFEAT every
 *  motion token, so a token there would be the defect. Both spellings of the floor are here — the OS media
 *  query and the shell-stamped manual attribute. NARROW ON PURPOSE: it exempts a duration only, so a raw
 *  EASING written under the floor still fires, and it is scoped by CONTEXT rather than by file, so a
 *  coordinated animation elsewhere in the same stylesheet is untouched.
 *
 *  It is also the only exemption this policy can express for those two sites: `@orb-waive` must be the
 *  comment IMMEDIATELY above its subject (`lib/ordinary-waiver.ts:19`, `ATTEMPT_RE` anchors at the start of
 *  the comment body) and so must `biome-ignore`, and both live sites already spend that slot on a REQUIRED
 *  `noImportantStyles` suppression. All four permutations were measured 2026-09-11: a marker separated by
 *  any comment alarms `cannot bind through comment trivia`, a `biome-ignore` separated by any comment reports
 *  "Suppression comment has no effect", and a shared comment loses whichever directive is second (biome
 *  honours `biome-ignore` only at the START of a comment, and `ATTEMPT_RE` anchors `@orb-waive` the same way).
 *  THE COLLISION IS SPECIFIC TO A FILE/RESOURCE FINDING, not to `@orb-waive` generally: a NODE finding's
 *  marker binds through leading trivia on the node or its ancestors up to the enclosing statement, while a
 *  file/resource finding binds ONLY to the line immediately above and has no trivia walk at all. The
 *  program-level question (give the resource binding a contiguous-comment-block walk, or let one comment
 *  carry both directives) is a `lib/ordinary-waiver.ts` contract change and is the orchestrator's row. */
const REDUCED_MOTION_FLOOR_RE = /prefers-reduced-motion|\[data-reduced-motion/u;
const DURATION_PROPERTIES: ReadonlySet<string> = new Set(["transition-duration", "animation-duration"]);

const MESSAGE =
  "raw motion value in CSS (motion-and-animation-guide.md §2 — the taxonomy→token map) — a bare duration or easing keyword/" +
  "cubic-bezier bypasses the motion tokens and can drift a coordinated animation out of sync: use " +
  "var(--motion-*) for duration and var(--ease-*) (or a co-motion --*-ease var, or `linear`) for easing.";

// A raw time literal: a number (int/decimal) immediately followed by `s`/`ms`, NOT inside a `var(`/`calc(`
// (those resolve a token). `0`/`0s`/`0ms` is a deliberate no-transition, allowed.
const RAW_TIME_RE = /(?<![\w.-])(?<num>\d*\.?\d+)(?:ms|s)\b/gu;
// A raw easing: the bare CSS keywords + cubic-bezier(...). `linear` is ALLOWED (continuous loops);
// `steps(...)`/`step-start`/`step-end` are discrete timing with no token home — not matched.
const RAW_EASE_RE = /\b(?:ease-in-out|ease-in|ease-out|ease)\b(?!-(?:expo|out-expo))|cubic-bezier\s*\(/gu;

/** Blank `var(...)` and `calc(...)` groups so their inner token time/easing literals don't false-fire — a
 *  `var(--…)`/`calc(--…)` reference IS the token-driven form. LENGTH-PRESERVING, because every offset in
 *  the scanned span has to index the RAW stylesheet: the ordinary-waiver engine verifies that a finding's
 *  reported line/column actually holds its position token, so an offset shifted by a collapsing replace is
 *  an `AUTHORITY ALARM`, not a cosmetic slip. */
function blankTokenGroups(span: string): string {
  return span.replace(/\b(?:var|calc)\s*\([^()]*\)/gu, (group) => " ".repeat(group.length));
}

/** The authored VALUE span of one declaration: from just after its colon to the `;`/`}` that ends it at
 *  paren depth 0. Offsets are into the raw stylesheet text, so a finding can anchor on the literal itself. */
function valueSpan(text: string, declarationOffset: number): { readonly start: number; readonly end: number } {
  const colon = text.indexOf(":", declarationOffset);
  if (colon === -1) {
    throw new Error(`CSS declaration at offset ${String(declarationOffset)} has no colon`);
  }
  let depth = 0;
  for (let index = colon + 1; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    } else if (depth === 0 && (char === ";" || char === "}")) {
      return { start: colon + 1, end: index };
    }
  }
  return { start: colon + 1, end: text.length };
}

/** 1-based line/column of an absolute offset in a stylesheet. */
function positionOf(text: string, offset: number): { readonly line: number; readonly column: number } {
  const before = text.slice(0, offset);
  return { line: before.split("\n").length, column: offset - before.lastIndexOf("\n") };
}

/** ONE raw motion literal and where it sits — the finding, and the waiver POSITION.
 *  @public knip type-face false positive — the element type of this module's own scan result, never
 *  referenced by its own name outside this file. */
interface RawMotionHit {
  readonly token: string;
  readonly offset: number;
}

/** Every raw motion literal of one declaration's authored value, in authored order. Each is its OWN
 *  finding: the ordinary-waiver engine narrows a marker's candidates by carrier and then by exact position
 *  token, so a duration and an easing in one declaration are separately waivable only when each finding
 *  points at its own literal. `cubic-bezier(` reports the bare function name — the token must be an exact
 *  slice of the text at the reported column, and a position containing a paren is unwaivable by
 *  construction (the marker grammar's position group is `[^()\r\n]+`). A `0`-only time is a deliberate
 *  no-transition, not a magic duration, so a time literal counts only when its numeric part is non-zero. */
function rawMotionHits(text: string, declarationOffset: number): readonly RawMotionHit[] {
  const { start, end } = valueSpan(text, declarationOffset);
  const scannable = blankTokenGroups(text.slice(start, end));
  const hits: RawMotionHit[] = [];
  for (const match of scannable.matchAll(RAW_TIME_RE)) {
    if (Number(match.groups?.["num"]) !== 0) {
      hits.push({ token: match[0], offset: start + match.index });
    }
  }
  for (const match of scannable.matchAll(RAW_EASE_RE)) {
    hits.push({ token: match[0].startsWith("cubic-bezier") ? "cubic-bezier" : match[0], offset: start + match.index });
  }
  return hits.toSorted((left, right) => left.offset - right.offset);
}

/** Is this declaration inside the reduced-motion floor? BOTH spellings, and the at-rule half needs the
 *  shared ANCESTRY reader rather than the declaration's own `owner`: a declaration written as
 *  `@media (prefers-reduced-motion: reduce) { * { … } }` is owned by the style rule `*`, so reading only
 *  `owner` sees the floor's inner selector and never its prelude. */
function inReducedMotionFloor(file: AuthoredCssFile, declaration: CssDeclarationFact): boolean {
  if (REDUCED_MOTION_FLOOR_RE.test(declaration.owner.kind === "at-rule" ? declaration.owner.prelude : declaration.owner.selectorList)) {
    return true;
  }
  return atRulesContaining(file.atRules, declaration.offset).some((atRule) => REDUCED_MOTION_FLOOR_RE.test(atRule.prelude));
}

/** One declaration's reportable raw motion literals: a non-motion property is out of scope, and a raw
 *  DURATION under the reduced-motion floor is the kill value, not an offence. */
function judgedHits(file: AuthoredCssFile, declaration: CssDeclarationFact): readonly RawMotionHit[] {
  if (!MOTION_PROPERTIES.has(declaration.property)) {
    return [];
  }
  if (DURATION_PROPERTIES.has(declaration.property) && inReducedMotionFloor(file, declaration)) {
    return [];
  }
  return rawMotionHits(file.text, declaration.offset);
}

export const gate = defineGate({
  id: "motion-token-purity",
  family: "motion-token-purity",
  authority: "ordinary",
  severity: "error",
  population: { of: "none", why: "CSS is a ResourceHost fact population, never a compiler population" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "authored-css" }],
  message: MESSAGE,
  fix:
    "use var(--motion-*) for duration and var(--ease-*) (or a co-motion --*-ease var, or `linear`) for " +
    "easing — never a raw duration/easing in CSS. A deliberate site (a continuous decorative loop, an " +
    "isolated hover, the reduced-motion kill-switch) is waived with " +
    "`/* @orb-waive motion-token-purity(<position>): <reason> */` on the line above, where <position> is " +
    "the ONE raw literal this finding points at (e.g. `ease-in-out`, `0.01ms`, `220ms`) — a declaration " +
    "carrying both a raw duration and a raw easing produces TWO findings and takes TWO markers, and a " +
    "bezier's position is the bare `cubic-bezier`, never the call with its arguments.",
  create: (ctx) => ({
    evaluate: () => {
      const inventory = readyResourceValue(ctx.resources.cssInventory("authored"));
      const byPath = new Map(inventory.files.map((file) => [file.path, file]));
      for (const declaration of inventory.declarations) {
        const file = byPath.get(declaration.file);
        if (file === undefined) {
          throw new Error(`CSS declaration has no source resource: ${declaration.file}`);
        }
        for (const hit of judgedHits(file, declaration)) {
          ctx.report.file(declaration.file, { ...positionOf(file.text, hit.offset), token: hit.token });
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        "packages/ui/src/x/x.css": ".a {\n  transition: opacity 220ms ease-out;\n}\n",
        "packages/client/src/styles/clean.css": ".clean { transition: opacity var(--motion-base) var(--ease-out-expo); }\n",
      },
      expect: { count: 2, line: 2, token: "ease-out" },
      why: "THE FOUNDING SHAPE: a raw duration (220ms) + easing (ease-out) in a CSS transition — bypasses the motion tokens. TWO findings, one per literal, because finding granularity must match waiver granularity: a site that keeps the easing and tokenizes the duration has to be able to waive exactly one of them",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/styles/clean.css": ".clean { transition: opacity var(--motion-base) var(--ease-out-expo); }\n",
        "packages/client/src/x/reduced.css": ".a {\n  animation-duration: 0.01ms !important;\n}\n",
      },
      expect: { count: 1, line: 2, token: "0.01ms" },
      why: "the DURATION LONGHAND half of the property list, and the live reduced-motion kill-switch spelling — a sub-frame duration is still a raw duration and owes its waiver",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/styles/clean.css": ".clean { transition: opacity var(--motion-base) var(--ease-out-expo); }\n",
        "packages/client/src/x/bezier.css": ".a {\n  animation: orb-web-weave var(--motion-shimmer) cubic-bezier(0.45, 0.05, 0.35, 0.95) infinite;\n}\n",
      },
      expect: { count: 1, line: 2, token: "cubic-bezier" },
      why: "the live `orb-web-weave` bezier verbatim, and the PAREN-NORMALIZATION proof: the position is the bare `cubic-bezier`, because the marker grammar's position group is `[^()\\r\\n]+` and a reported `cubic-bezier(0.45, …)` would be a finding with no waiver door",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/styles/clean.css": ".clean { transition: opacity var(--motion-base) var(--ease-out-expo); }\n",
        "packages/client/src/x/nested.css": "@media (min-width: 40rem) {\n  .a {\n    transition: opacity 220ms;\n  }\n}\n",
      },
      expect: { count: 1, line: 3, token: "220ms" },
      why: "NARROWING ROW for the parsed-inventory port: a declaration nested inside an at-rule block. The legacy line regex anchored on `(?:^|[;{])` and reached it too, so this is the intentional-delta control rather than a new arm — it pins that the structural port did not lose the nested case",
    },
    {
      mode: "resource",
      files: {
        "packages/ui/src/styles/clean.css": ".clean { transition: opacity var(--motion-base) var(--ease-out-expo); }\n",
        "packages/client/src/x/floor-ease.css":
          "@media (prefers-reduced-motion: reduce) {\n  * {\n    animation-duration: 0.01ms !important;\n    transition-timing-function: ease-out !important;\n  }\n}\n",
      },
      expect: { count: 1, line: 4, token: "ease-out" },
      why: "the reduced-motion carve-out is NARROW, and this is the row that holds it so: the kill DURATION on line 3 is silent, and a raw EASING two lines later under the same floor still fires. A floor that has to defeat every token has a reason to spell its duration raw; it has no reason at all to spell an easing raw",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "packages/client/src/styles/clean.css": ".clean { transition: opacity var(--motion-base) var(--ease-out-expo); }\n",
        "packages/ui/src/x/ok.css": ".a { transition: opacity var(--motion-base) var(--ease-out-expo); }\n",
      },
      why: "the transition uses var(--motion-*)/var(--ease-*) tokens — on-token, passes",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/styles/clean.css": ".clean { transition: opacity var(--motion-base) var(--ease-out-expo); }\n",
        "packages/ui/src/x/keyframe-name.css": ".a {\n  animation: orb-ease-out-expo-pulse var(--motion-base) linear infinite;\n}\n",
      },
      why: "NARROWING ROW for the `(?!-(?:expo|out-expo))` lookahead, and the ONLY valid-CSS spelling that reaches it: a @keyframes NAME is an author-chosen ident and sits in the shorthand OUTSIDE any `var(…)`, so the blanking beside it cannot help. Cut the lookahead and `ease-out` inside `orb-ease-out-expo-pulse` REDs this row",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/styles/clean.css": ".clean { transition: opacity var(--motion-base) var(--ease-out-expo); }\n",
        "packages/ui/src/x/commented.css":
          "/* was: .b { transition: opacity 220ms ease-out; } */\n.a { transition: opacity var(--motion-base) var(--ease-out-expo); }\n",
      },
      why: "COMMENT POSTURE (issue #117, the founding class): a raw duration + easing quoted in a CSS comment is PROSE — the note explaining what the tokens replaced is the most natural thing to write next to a migration, and reading it as a declaration reddens the file that did the work",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/styles/clean.css": ".clean { transition: opacity var(--motion-base) var(--ease-out-expo); }\n",
        "packages/ui/src/x/allowed.css":
          ".a {\n  animation: orb-shimmer var(--motion-shimmer) linear infinite;\n  transition-duration: 0s;\n  transition-timing-function: steps(4, end);\n}\n.b {\n  --motion-custom: 220ms;\n  animation-delay: 220ms;\n}\n",
      },
      why: "the four DECLARED LIMITS in one rule set, each of which the arm must not touch: `linear` (a continuous loop has no coordination partner), a zero duration (a deliberate no-transition), `steps()` (discrete timing with no token home), and — the PROPERTY-LIST fence — a `--motion-*` custom-property DEFINITION plus an `animation-delay`, neither of which is one of the four judged properties",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/styles/clean.css": ".clean { transition: opacity var(--motion-base) var(--ease-out-expo); }\n",
        "packages/ui/src/x/waived.css":
          ".waived {\n  /* @orb-waive motion-token-purity(ease-in-out): a continuous decorative loop; nothing coordinates with it. */\n  animation: orb-weave-shimmer var(--motion-breathe) ease-in-out infinite;\n}\n",
      },
      why: "§4.2 IDENTITY: the exact ordinary waiver at the reported position suppresses the one finding of `mustFlag`'s live-shape twin — this is `packages/client/src/styles/globals.css:47` verbatim, the site whose legacy ALLOWLIST row this marker replaced",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/styles/clean.css": ".clean { transition: opacity var(--motion-base) var(--ease-out-expo); }\n",
        "packages/ui/src/x/token-groups.css":
          ".a {\n  transition-timing-function: var(--drawer-ease-out);\n  animation: orb-ws-sway calc(var(--motion-ambient) * 0.6) linear infinite;\n}\n",
      },
      why: "NARROWING ROW for `blankTokenGroups`, and the `fix` string's own promise that a co-motion `--*-ease` var is a legal easing: the reference NAME contains `ease-out`, so an unblanked scan reads the token indirection itself as a raw keyword. Cut the blanking and this row REDs on the `var(--drawer-ease-out)` line — which is also what makes the lookahead beside it measurable, since a bare `ease-out-expo` keyword is not CSS and only ever appears inside a `var(--…)`",
    },
  ],
});
