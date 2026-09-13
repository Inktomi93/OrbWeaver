// Gate: no-tailwind-dark-variant (#954) — polarity is ThemeScope-derived color-scheme + light-dark(); a
// named-theme dark: utility cannot see custom-theme polarity. Class carriers come from the neutral static
// provenance walker; Tailwind's scanner is used only to tokenize an already-proven exact class value.
//
// FAMILY: declared SINGLETON (`no-tailwind-dark-variant`), with the shared reader named. The subject reader
// is `lib/static-class-expression.ts` `walkStaticClassExpressions` and it is genuinely SHARED — five gate
// modules consume it (`css-length-tokens`, `rest-transform-grid`, `integer-line-boxes`,
// `seed-theme-ink-contrast`, and this one) — but every one of the other four is still a LEGACY
// `GateDescriptor` carrying no `family` field, so there is no family string to join. The family name for the
// static-class-provenance set is a decision that belongs to the lane that converts the rest of it, not a
// string minted unilaterally here; this policy's own verdict (is any top-level `dark` variant present) shares
// no computation with theirs beyond the walk.
// POPULATION PORT: BYTE-IDENTICAL. The legacy descriptor at `d6f36904f` (the commit before the conversion at
// `99b7429e2`) scanned `path.startsWith("packages/client/src/") || path.startsWith("packages/ui/src/")`,
// which is exactly `["@client", "@ui"]`; nothing is added and nothing is subtracted.
//
// THE REPORTED POSITION is the CLASS CANDIDATE (`dark:bg-card`), supplied with its offset inside the carrier
// literal; `fix` states the spelling. A candidate whose text contains a paren — an arbitrary selector or
// `@supports` query such as `supports-[selector(:has(*))]:dark:text-foreground` — is named by its LEADING
// PAREN-FREE SLICE, because the central marker grammar's position group is `[^()\r\n]+` and a marker naming
// the whole candidate parses as malformed. That slice is still an exact slice of the carrier AT THE SAME
// OFFSET, so the runtime's identity rule holds; only its LENGTH changes, and the whole candidate moves into
// the message (#2107 arm c, guide §2.1; `reportAnchored` below). **This paragraph previously said the shape had
// "NO waiver spelling" and told the author to raise it on #1584 — refuted in code by the same commit that
// wrote it, and corrected here with the `fix` string (refutation-ledger row 530, #2160).** ONE position shape
// still cannot be waived and stays declared rather than hidden: the `unresolved:*` arm and the
// zero-carrier-root tripwire report a synthetic label, not authored text.
import { Scanner } from "@tailwindcss/oxide";
import type { Node } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { RuntimeClassPrefix, StaticClassCandidate, StaticClassSegment } from "../lib/static-class-expression.ts";
import { walkStaticClassExpressions } from "../lib/static-class-expression.ts";
import { waivableCoordinate } from "../lib/waivable-coordinate.ts";

const MESSAGE =
  "Tailwind dark: utility creates a second polarity mechanism that cannot see ThemeScope-derived custom-theme polarity; an `unresolved:*` token means static provenance could not prove the census clean (client-architecture-lockdown.md §4.6).";
const FIX =
  "Use a polarity-aware light-dark() token selected by ThemeScope's derived color-scheme; never branch paint " +
  "with dark:. A deliberate dark: utility is waived with `// @orb-waive no-tailwind-dark-variant(<position>): " +
  "<reason>` on a line above the offending statement, where <position> is the EXACT CLASS CANDIDATE — the " +
  "whole variant chain, `hover:dark:text-foreground`, never the bare `dark:` and never the quoted literal. A " +
  "candidate containing a paren (an arbitrary selector or @supports query) is named by its LEADING PAREN-FREE " +
  "SLICE instead — `[&:where` for `[&:where(.x:y)]:dark:bg-card` — because the marker grammar's position group " +
  "admits no paren; the whole candidate is in the finding's message rather than its position.";
/** The real-tree anchor for the zero-carrier-root self-guard: a file guaranteed present on a real run and
 *  inside the declared population, so a fixture-only invocation (which never loads it) stays silent. */
const REAL_TREE_ANCHOR = "packages/ui/src/lib/class-merge.ts";

interface Part {
  readonly text: string;
  readonly start: number;
}

interface ParseState {
  readonly stack: string[];
  quote: string;
  escaped: boolean;
}

interface AnchoredToken {
  readonly node: Node;
  readonly offset: number;
  readonly token: string;
}

function consumesQuoteOrEscape(state: ParseState, char: string): boolean {
  if (state.escaped) {
    state.escaped = false;
    return true;
  }
  if (char === "\\") {
    state.escaped = true;
    return true;
  }
  if (state.quote.length > 0) {
    if (char === state.quote) {
      state.quote = "";
    }
    return true;
  }
  if (char === '"' || char === "'") {
    state.quote = char;
    return true;
  }
  return false;
}

function consumesBracket(state: ParseState, char: string): boolean {
  const closes: Readonly<Record<string, string>> = { "]": "[", ")": "(", "}": "{" };
  if (char === "[" || char === "(" || char === "{") {
    state.stack.push(char);
    return true;
  }
  const open = closes[char];
  if (open === undefined) {
    return false;
  }
  if (state.stack.at(-1) === open) {
    state.stack.pop();
  }
  return true;
}

/** Split only top-level variant separators: colons inside arbitrary selectors/functions are data. */
function topLevelParts(candidate: string): Part[] {
  const parts: Part[] = [];
  const state: ParseState = { stack: [], quote: "", escaped: false };
  let start = 0;
  for (let index = 0; index < candidate.length; index += 1) {
    const char = candidate[index] ?? "";
    if (consumesQuoteOrEscape(state, char) || consumesBracket(state, char)) {
      continue;
    }
    if (char === ":" && state.stack.length === 0) {
      parts.push({ text: candidate.slice(start, index), start });
      start = index + 1;
    }
  }
  parts.push({ text: candidate.slice(start), start });
  return parts;
}

function darkPart(candidate: string): Part | undefined {
  return topLevelParts(candidate)
    .slice(0, -1)
    .find((part) => part.text === "dark");
}

function sourceToken(segments: readonly StaticClassSegment[], valueOffset: number, token: string): AnchoredToken | undefined {
  const segment = segments.find((part) => valueOffset >= part.valueStart && valueOffset < part.valueEnd) ?? segments[0];
  if (segment === undefined) {
    return;
  }
  return {
    node: segment.node,
    offset: segment.sourceStart + Math.max(0, valueOffset - segment.valueStart) - segment.node.getStart(),
    token,
  };
}

function exactTokens(scanner: Scanner, value: StaticClassCandidate): AnchoredToken[] {
  const findings: AnchoredToken[] = [];
  for (const scanned of scanner.getCandidatesWithPositions({ content: value.value, extension: "html" })) {
    if (darkPart(scanned.candidate) !== undefined) {
      const anchored = sourceToken(value.segments, Number(scanned.position), scanned.candidate);
      if (anchored !== undefined) {
        findings.push(anchored);
      }
    }
  }
  return findings;
}

function runtimeToken(value: RuntimeClassPrefix): AnchoredToken | undefined {
  const part = darkPart(value.prefix);
  return part === undefined ? undefined : sourceToken(value.segments, part.start, "dark:");
}

/** A candidate spanning a resolved template substitution (a template literal with an interpolated
 *  variable) carries an EVALUATED value — the source text at the anchored offset is still the
 *  unevaluated interpolation, never the substituted string, so the token cannot always be an exact
 *  slice of the node's own text. Report the
 *  precise anchor only when it genuinely holds; otherwise the finding still reaches the census through
 *  `message`, never silently dropped. */
function reportAnchored(report: GatePolicyContext["report"], anchored: AnchoredToken): void {
  const text = anchored.node.getText();
  if (text.slice(anchored.offset, anchored.offset + anchored.token.length) === anchored.token) {
    // THE CARRIER / COORDINATE SPLIT (#2107 arm c, guide §2.1). An arbitrary-variant class carries parentheses
    // (`[&:where(.x:y)]:dark:bg-card`, `supports-[selector(:has(*))]:dark:…`) and the `@orb-waive` position
    // grammar admits none, so naming the whole candidate made the finding PERMANENTLY UNWAIVABLE while this
    // ordinary policy's `fix` string promised otherwise. The node stays the carrier, the coordinate narrows to
    // the candidate's leading paren-free slice at the SAME offset, and the whole candidate goes in the message.
    // A paren-free candidate is returned unchanged, so `dark:bg-card` and `hover:dark:text-foreground` are
    // untouched — the split can only ever collide two candidates that both contain a paren, i.e. two that were
    // already unwaivable.
    // DECLARED LIMIT — this refusal has no `mustRefuse` row and cannot get one (#2160, ledger row 534). It
    // fires only for a candidate whose FIRST character is `(`, `)`, CR or LF, and no such candidate reaches
    // here: measured 2026-09-12 over `(--x):dark:bg-card`, `(dark:bg-card)`, `(:has(*)):dark:bg-card` and
    // `)dark:bg-card`, Oxide's scanner returns ZERO candidates for every one, while the two paren-CARRYING
    // shapes in the same probe (`[&:where(.x:y)]:dark:bg-card`, `supports-[selector(:has(*))]:dark:bg-card`)
    // report normally at their leading slice — so the probe could see candidates and the zero is a real zero.
    // The two sibling consumers of this reader DO carry the row (`no-raw-color-in-css`, `rest-transform-grid`),
    // because a CSS declaration value can start with a paren where a Tailwind utility cannot. The throw stays
    // rather than becoming a silent drop: it is the reader's contract, not this policy's local choice, and a
    // future scanner that admits such a candidate must fail loudly instead of minting an unwaivable finding.
    const coordinate = waivableCoordinate(anchored.token);
    if (coordinate === undefined) {
      throw new Error(`dark-variant candidate has no anchorable coordinate: ${anchored.token}`);
    }
    report.node(anchored.node, {
      token: coordinate,
      offset: anchored.offset,
      ...(coordinate === anchored.token ? {} : { message: `${MESSAGE} Token: ${anchored.token}.` }),
    });
    return;
  }
  // A candidate that spans a resolved template/concatenation substitution carries an EVALUATED value; the
  // source text at the computed offset is still the unevaluated literal (`${tone}`), so the precise slice
  // never matches. Anchor the WHOLE node against its OWN full text instead of omitting token/offset — a
  // template-literal segment node (e.g. a bare `TemplateHead`) has no identifier/literal token the runtime's
  // own fallback deriver could find, which would throw rather than report. `token = text` is trivially a
  // valid slice at offset 0, and `message` still names the exact evaluated token for the census.
  report.node(anchored.node, { token: text, offset: 0, message: `${MESSAGE} Token: ${anchored.token}.` });
}

export const gate = defineGate({
  id: "no-tailwind-dark-variant",
  family: "no-tailwind-dark-variant",
  authority: "ordinary",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const walked = walkStaticClassExpressions(ctx.files);
      const scanner = new Scanner({ sources: [] });
      for (const candidate of walked.candidates) {
        for (const anchored of exactTokens(scanner, candidate)) {
          reportAnchored(ctx.report, anchored);
        }
      }
      for (const prefix of walked.runtimePrefixes) {
        const anchored = runtimeToken(prefix);
        if (anchored !== undefined) {
          reportAnchored(ctx.report, anchored);
        }
      }
      for (const unresolved of walked.unresolved) {
        // The `unresolved:<reason>` label is synthetic (never literal node text), so it cannot carry a
        // token/offset anchor — the runtime requires an anchored token to be an exact slice of the node's
        // own text. The reason still reaches the report through `message`.
        ctx.report.node(unresolved.node, { message: `${MESSAGE} unresolved:${unresolved.reason}` });
      }
      // NOT a `ctx.receipt()`: the shared `population`/`resource` receipt kinds both refuse the whole
      // policy outright when `unresolved > 0` (policy-pass.ts's `receiptFailures`), which is correct for a
      // semantic-member census but wrong here — an unresolved static-class expression is a NORMAL, already
      // reported finding (the loop above), not a shrunken denominator behind a silent green. The final
      // contract has no bare observability-count sink; the per-occurrence findings are the receipt.
      if (ctx.files.some((sourceFile) => ctx.relativePath(sourceFile) === REAL_TREE_ANCHOR) && walked.roots === 0) {
        ctx.report.file(REAL_TREE_ANCHOR, {
          line: 1,
          message:
            "static class-expression derivation returned zero carrier roots — the dark-variant census is blind, not clean (tooling/src/verify/lib/static-class-expression.ts)",
        });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/ui/src/x.tsx": 'export const G = <div className="dark:bg-card" />;\n' },
      expect: { count: 1, token: "dark:bg-card" },
      why: "direct JSX className remains the founding RED",
    },
    {
      mode: "source",
      files: { "packages/client/src/x.ts": 'import { clsx } from "clsx";\nexport const x = clsx?.(clsx("hover:dark:text-foreground"));\n' },
      expect: { count: 1, token: "hover:dark:text-foreground" },
      why: "nested and optional canonical composer calls are provenance roots",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/x.ts":
          'import { clsx as imported } from "clsx";\nconst local = imported;\nconst forward = (...args: Parameters<typeof local>) => local(...args) ?? "";\nexport const x = forward("dark:alias-wrapper");\n',
      },
      expect: { count: 1, token: "dark:alias-wrapper" },
      why: "import alias, local alias, and simple forwarding wrapper preserve composer identity",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/composer.ts": 'export { clsx as join } from "clsx";\n',
        "packages/ui/src/x.ts": 'import { join as compose } from "./composer.ts";\nexport const x = compose("dark:reexported-composer");\n',
      },
      expect: { count: 1, token: "dark:reexported-composer" },
      why: "composer identity survives cross-file re-export and consumer aliases",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/x.ts":
          'import * as kit from "clsx";\nexport const a = kit.clsx("dark:namespace-dot");\nexport const b = kit["clsx"]?.("dark:namespace-bracket");\n',
      },
      expect: { count: 2 },
      why: "namespace dot, optional, and static-bracket calls are declaration-proven",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/producer.ts": 'export const CARD = "dark:bg-card";\n',
        "packages/ui/src/barrel.ts": 'export { CARD as SURFACE } from "./producer.ts";\n',
        "packages/client/src/consumer.tsx": 'import { SURFACE } from "../../ui/src/barrel.ts";\nexport const x = <div className={SURFACE} />;\n',
      },
      expect: { count: 1, token: "dark:bg-card", line: 1 },
      why: "cross-file constants and re-export aliases report at the producer literal",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/x.ts":
          'import clsx from "clsx";\nconst shared = ["dark:array", { "dark:object-key": true }];\nexport const x = clsx([false && "dark:dead", ...shared]);\n',
      },
      expect: { count: 3 },
      why: "arrays, object class maps, values, and spreads remain visible to join composers",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/x.ts":
          'import { tv } from "tailwind-variants";\nexport const x = tv({ slots: { root: "dark:slot" }, variants: { tone: { loud: { root: "hover:dark:nested" } } }, compoundVariants: [{ tone: "dark:selector", class: "dark:compound" }], defaultVariants: { tone: "dark:default" } });\n',
      },
      expect: { count: 3 },
      why: "tv slots, nested variant slots, and compound class fields are class-bearing while selectors/defaults are not",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/x.tsx": `const tone = "card";
const a = \`hover:dark:bg-\${tone}\`;
const b = "focus:" + "dark:text-foreground";
export const x = <div className={[a, b]} />;
`,
      },
      expect: { count: 2 },
      why: "resolvable template substitutions and concatenation preserve exact candidates",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/x.tsx":
          'declare const key: "a" | "b";\nconst map = { a: "dark:static", b: "hover:dark:dynamic" } as const;\nexport const x = <div className={[map.a, map[key]]} />;\n',
      },
      expect: { count: 2 },
      why: "static member access and conservative dynamic object indexing cover the static property universe",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/x.tsx": `declare const tone: string;
export const x = <div className={\`dark:\${tone}\`} />;
`,
      },
      expect: { count: 1, token: "dark:" },
      why: "runtime dark prefix is a separate AST proof because Oxide emits no complete candidate",
    },
    {
      mode: "source",
      files: { "packages/client/src/x.ts": 'export const props = { className: "dark:border-border" };\n' },
      expect: { count: 1, token: "dark:border-border" },
      why: "object className is a real carrier root before JSX spread",
    },
    {
      mode: "source",
      files: { "packages/ui/src/x.tsx": "const A = B;\nconst B = A;\nexport const x = <div className={A} />;\n" },
      expect: { count: 1, messageIncludes: " unresolved:" },
      why: "a static cycle is counted and fails loud instead of producing a clean zero",
    },
    {
      mode: "source",
      files: { "packages/ui/src/x.tsx": 'export const A = <div className="[&:where(.x:y)]:dark:bg-card" />;\n' },
      expect: { count: 1, token: "[&:where", messageIncludes: "Token: [&:where(.x:y)]:dark:bg-card." },
      why: "a top-level dark segment stays exact across bracket/paren/colon nesting inside :where(), and the finding is WAIVABLE (#2107 arm c): the coordinate is the candidate's leading paren-free slice at the same offset while the whole candidate is named in the message. Before this split the position was the parenthesised candidate and every marker naming it parsed malformed",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/x.tsx": 'export const A = <div className="supports-[selector(:has(*))]:dark:text-foreground" />;\n',
      },
      expect: { count: 1, token: "supports-[selector", messageIncludes: "Token: supports-[selector(:has(*))]:dark:text-foreground." },
      why: "a top-level dark segment stays exact across bracket/paren/colon nesting inside an @supports arbitrary selector, WAIVABLE by the same #2107 split — and the second shape proves the coordinate is the leading slice of THIS candidate rather than a fixed prefix",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/ui/src/x.ts": 'export const shiki = { dark: "github-dark" };\nexport const token = "--color-sky-cloud-dark";\n' },
      why: "legitimate Shiki dark keys and token names are not class strings",
    },
    {
      mode: "source",
      files: { "packages/client/src/x.ts": 'export const copy = "Never write dark:bg-card in prose";\n// dark:text-foreground is documentation\n' },
      why: "unrelated prose and comments are not class carriers",
    },
    {
      mode: "source",
      files: { "packages/ui/src/x.ts": 'function cn(value: string) { return value.length; }\nexport const inert = cn("dark:not-a-class");\n' },
      why: "an arbitrary local function named cn has no composer provenance",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/x.ts":
          'import { tv } from "tailwind-variants";\nexport const x = tv({ variants: { tone: { loud: "bg-card" } }, defaultVariants: { tone: "dark:not-a-class" } });\n',
      },
      why: "variant selectors/defaults are configuration values, not class candidates",
    },
    {
      mode: "source",
      files: { "packages/ui/src/x.tsx": 'export const G = <div className="[&_.dark:x]:bg-card darkroom:bg-card bg-card text-foreground" />;\n' },
      why: "nested selector text and non-exact dark prefixes are not top-level dark variants. NOTE what this row does NOT prove: `[&_.dark:x]` survives a `consumesBracket` cut too, because with brackets un-tracked the parts become `[&_.dark` and `x]` and neither is exactly `dark`. The row below is the one that proves the bracket tracking",
    },
    {
      mode: "source",
      files: { "packages/ui/src/x.tsx": 'export const G = <div className="[&_.x:dark:y]:bg-card" />;\n' },
      why: "THE ARBITRARY-SELECTOR FENCE (`consumesBracket` in `topLevelParts`): a `dark` segment sitting BETWEEN two colons inside an arbitrary selector is CSS data, not a variant — the only top-level variant here is the whole `[&_.x:dark:y]` bracket. Stop tracking brackets and the split yields `[&_.x`, `dark`, `y]`, `bg-card`, whose slice(0,-1) contains an exact `dark`, and this row flags. It is the one fixture whose bracketed `dark` is delimited by colons on BOTH sides, which is what the cut needs",
    },
    {
      mode: "source",
      files: { "packages/ui/src/x.tsx": 'export const G = <div className="hover:dark" />;\n' },
      why: "THE LAST-SEGMENT FENCE, pinned (#1584 pristine pass): this gate bans `dark` as a VARIANT, so `darkPart` searches `topLevelParts(...).slice(0, -1)` and never the utility position. A class whose FINAL segment is literally `dark` names a utility, not a polarity branch. Delete the `.slice(0, -1)` and this row goes red; before it existed, every pre-existing row stayed green without that fence",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/x.tsx":
          "// @orb-waive no-tailwind-dark-variant(dark:bg-card): the proof's stand-in reason and its end condition.\n" +
          'export const G = <div className="dark:bg-card" />;\n',
      },
      why: "THE ORDINARY IDENTITY ARM (§4.2): the correct central marker at the SUPPLIED position (the exact class candidate) suppresses the twin of mustFlag[0] — one finding, one marker, zero effective findings and zero authority alarms. A wrong position, a foreign policy id or an over-broad match each fail this row through `toolFailure`",
    },
  ],
});
