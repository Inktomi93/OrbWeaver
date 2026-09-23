// Policy: no-arbitrary-tw-values — off-token Tailwind brackets on layout/size/type utilities.
// The shared lexical reader owns token offsets; the legacy utility/body predicate and literal-only
// population remain unchanged. Every string literal is scanned, not just className carriers.
// The two former file-wide exceptions are exact ordinary markers on their justified occurrences.
// Central authority now owns their liveness; no real-tree sentinel or module-owned pass state remains.
// Parenthesized classes use the shared waivable prefix coordinate; the message retains the full value.
// The legacy stale-file proof is replaced by the family test for central stale-marker alarms.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readTailwindClassTokens } from "../lib/tailwind-class-token.ts";
import { waivableCoordinate } from "../lib/waivable-coordinate.ts";

const MESSAGE =
  "arbitrary Tailwind value on a layout/size/type utility (tokens: packages/ui/src/tokens/tokens.json) — off-token " +
  "brackets bypass the design system; use a token utility (or extend tokens.json if none fits).";

/** Scoped utility prefixes: w, h, min-w, min-h, max-w, max-h, size, the p/m
 *  spacing family, gap, space-x/y, inset, top/left/right/bottom/start/end, translate-x/y/z, z,
 *  grid-cols/grid-rows, text/leading/tracking/rounded. */
const SCOPED_UTILITY_RE =
  /^(w|h|min-w|min-h|max-w|max-h|size|p[xytrbles]?|m[xytrbles]?|gap(-x|-y)?|space-[xy]|inset(-x|-y)?|top|left|right|bottom|start|end|translate(-x|-y|-z)?|z|grid-(cols|rows)|text|leading|tracking|rounded)$/u;

function isScopedUtility(util: string): boolean {
  return SCOPED_UTILITY_RE.test(util);
}

const VALUE_ARBITRARY_RE = /^(?<util>[a-z-]+)-\[(?<body>.+)\]$/u;
const TOKEN_DRIVEN_RE = /^(--|var\(|calc\()/u;

/** Is this whitespace-split class token a banned value-arbitrary (terminal segment, scoped utility,
 *  non-token-driven body)? */
function isBannedArbitrary(token: string): boolean {
  const terminal = token.split(":").at(-1) ?? token;
  const match = VALUE_ARBITRARY_RE.exec(terminal);
  if (match?.groups === undefined) {
    return false;
  }
  const { util, body } = match.groups;
  if (util === undefined || body === undefined || !isScopedUtility(util)) {
    return false;
  }
  return !TOKEN_DRIVEN_RE.test(body);
}

export const gate = defineGate({
  id: "no-arbitrary-tw-values",
  family: "tailwind-class-token",
  authority: "ordinary",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "use a token utility or extend tokens.json; an intentional exception needs an exact @orb-waive no-arbitrary-tw-values(<reported-coordinate>) marker and its reason.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral],
        visit: (node) => {
          for (const hit of readTailwindClassTokens(node.getText())) {
            if (isBannedArbitrary(hit.token)) {
              const token = waivableCoordinate(hit.token);
              if (token === undefined) {
                throw new Error("arbitrary value has no waivable coordinate");
              }
              ctx.report.node(node, { token, offset: hit.offset, message: `${MESSAGE} Class: ${hit.token}` });
            }
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/features/x/x.tsx": 'export const G = <div className="w-[137px] p-[7px]" />;\n' },
      // PER-TOKEN: two banned arbitraries (w-[137px] + p-[7px]) → two findings, not one.
      expect: { count: 2 },
      why: "scoped-utility value arbitraries — off-token brackets that bypass the design scale",
    },
    {
      mode: "source",
      files: { "packages/ui/src/x/x.tsx": 'export const G = <div className="hover:w-[137px]" />;\n' },
      expect: { count: 1 },
      why: "a variant-prefixed value arbitrary (hover:w-[…]) — the terminal segment still flags",
    },
    {
      mode: "source",
      files: { "packages/ui/src/primitives/demo/demo.tsx": 'export const G = <div className="text-[13px]" />;\n' },
      expect: { count: 1 },
      why: "the gate scans packages/ui/src too — a scoped-type value arbitrary flags there",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/features/x/ok.tsx": 'export const G = <div className="w-[var(--sidebar-width)]" />;\n' },
      why: "a var(--…) bracket body is token-driven — same class as a bare token utility, passes",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/np.tsx": 'export const G = <div className="data-[state=open]:opacity-100" />;\n' },
      why: "a variant-SELECTOR bracket (non-terminal segment) is not a value bracket — passes",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/calc.tsx": 'export const G = <div className="translate-x-[calc(var(--a)-var(--b))]" />;\n' },
      why: "a calc(...) bracket body is token-driven — passes",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/has.tsx": 'export const G = <div className="has-[:focus-visible]:ring-2" />;\n' },
      why: "a has-[...]: selector bracket is a variant selector, not a terminal value bracket — passes",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/content.tsx": "export const G = <div className=\"before:content-['']\" />;\n" },
      why: "content-['...'] — content is not a scoped utility, out of scope — passes",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/fill.tsx": 'export const G = <div className="fill-[#fff]" />;\n' },
      why: "fill is an unscoped utility — a bracket on it is out of scope — passes",
    },
  ],
});
