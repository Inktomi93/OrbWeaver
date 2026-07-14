// Gate: no-arbitrary-tw-values (design-enforcement.md §3) — widens the no-raw-spacing/no-raw-typography
// biome family to the general bracket escape hatch: a Tailwind arbitrary-VALUE class on a
// layout/size/spacing/type utility (`w-[137px]`, `text-[13px]`) in packages/{client,ui}/src is banned —
// if a value is worth using it's worth a token. Walks class tokens (terminal `:`-segment) and flags
// `<utility>-[<body>]` unless token-driven. ALLOWLIST is a both-directions ratchet.
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

/** Current legit arbitrary-value files → reason (no token exists). See no-raw-interactive-intrinsics.ts
 *  for the ratchet contract (both arms). */
const ALLOWLIST: Record<string, string> = {
  "packages/ui/src/markdown/markdown.tsx":
    "`max-h-[60cqh]` — container-query height unit; no Tailwind token exists for cqh.",
  "packages/ui/src/layout/variants.ts":
    "`grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))]` (and its `wide` " +
    "`minmax(min(22rem,100%),1fr)` variant) — responsive auto-fit grid; no token equivalent.",
};

const MESSAGE =
  "arbitrary Tailwind value on a layout/size/type utility (design-enforcement.md §3) — off-token " +
  "brackets bypass the design system; use a token utility (or extend tokens.json if none fits).";

const STALE_ENTRY_MESSAGE_PREFIX =
  "ALLOWLIST entry has NO scoped arbitrary-value class any more — the offender was reworked onto a " +
  "token (ratchet down): delete the stale row in no-arbitrary-tw-values.ts: ";

/** Scoped utility prefixes (design-enforcement.md §3): w, h, min-w, min-h, max-w, max-h, size, the p/m
 *  spacing family, gap, space-x/y, inset, top/left/right/bottom/start/end, translate-x/y/z, z,
 *  grid-cols/grid-rows, text/leading/tracking/rounded. */
const SCOPED_UTILITY_RE =
  /^(w|h|min-w|min-h|max-w|max-h|size|p[xytrbles]?|m[xytrbles]?|gap(-x|-y)?|space-[xy]|inset(-x|-y)?|top|left|right|bottom|start|end|translate(-x|-y|-z)?|z|grid-(cols|rows)|text|leading|tracking|rounded)$/u;

function isScopedUtility(util: string): boolean {
  return SCOPED_UTILITY_RE.test(util);
}

const VALUE_ARBITRARY_RE = /^(?<util>[a-z-]+)-\[(?<body>.+)\]$/u;
const TOKEN_DRIVEN_RE = /^(--|var\(|calc\()/u;
const WHITESPACE_RE = /\s+/u;

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

function clientRel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

// Per-token: each banned arbitrary token in a class string is its own finding at its real column. The
// live non-empty ALLOWLIST's stale arm is finalize-guarded to project scope.
const GATE_SELF = "scripts/check/gates/no-arbitrary-tw-values.ts";
const passSeenAllowlisted = new Set<string>();

/** A single banned arbitrary token + its 0-based offset into the enclosing node's text (one past the
 *  leading delimiter). Per-occurrence granularity — a class string with N brackets yields N findings. */
type BannedArb = { readonly token: string; readonly offset: number };

/** Every banned arbitrary-value token in a class-string node's text, with its offset into `getText()`. */
function bannedArbTokens(nodeText: string): BannedArb[] {
  const stripped = nodeText.slice(1, -1);
  const out: BannedArb[] = [];
  const parts = stripped.split(WHITESPACE_RE);
  let cursor = 0;
  for (const part of parts) {
    const at = stripped.indexOf(part, cursor);
    cursor = at + part.length;
    if (part.length > 0 && isBannedArbitrary(part)) {
      out.push({ token: part, offset: at + 1 });
    }
  }
  return out;
}

export const gate: GateDescriptor = {
  name: "no-arbitrary-tw-values",
  docRow: "design-enforcement.md §3",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "use a token utility (w-*/text-*/p-* from the design scale), or extend tokens.json if none fits.",
  scanRoot: (p) => p.includes("packages/client/src/") || p.includes("packages/ui/src/"),
  kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral],
  begin: () => {
    passSeenAllowlisted.clear();
  },
  visit: (node, sf, ctx) => {
    const hits = bannedArbTokens(node.getText());
    if (hits.length === 0) {
      return;
    }
    const rel = clientRel(sf.getFilePath());
    if (rel in ALLOWLIST) {
      passSeenAllowlisted.add(rel);
      return;
    }
    for (const hit of hits) {
      ctx.report(node, hit);
    }
  },
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project") {
      return;
    }
    for (const rel of Object.keys(ALLOWLIST)) {
      // Only judge an allowlisted file that is actually LOADED (a synthetic conformance/parity tree omits
      // the real ones); on the real full-tree run every allowlisted file IS loaded, so the ratchet holds.
      if (!fileLoaded(ctx, rel)) {
        continue;
      }
      if (!passSeenAllowlisted.has(rel)) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_ENTRY_MESSAGE_PREFIX}"${rel}" — scripts/check/gates/no-arbitrary-tw-values.ts`,
        });
      }
    }
  },
  // NOTE: the ALLOWLIST ratchet/stale arms are `fileLoaded`-guarded to the real full tree (a synthetic
  // conformance project omits the real allowlisted files) — their coverage moves to the live
  // `pnpm check:structure` run. Only the pure FLAG/PASS branches port as examples below.
  mustFlag: [
    {
      files: 'export const G = <div className="w-[137px] p-[7px]" />;\n',
      at: "packages/client/src/features/x/x.tsx",
      // PER-TOKEN: two banned arbitraries (w-[137px] + p-[7px]) → two findings, not one.
      expect: { count: 2 },
      why: "scoped-utility value arbitraries — off-token brackets that bypass the design scale",
    },
    {
      files: 'export const G = <div className="hover:w-[137px]" />;\n',
      at: "packages/ui/src/x/x.tsx",
      why: "a variant-prefixed value arbitrary (hover:w-[…]) — the terminal segment still flags",
    },
    {
      files: 'export const G = <div className="text-[13px]" />;\n',
      at: "packages/ui/src/primitives/demo/demo.tsx",
      why: "the gate scans packages/ui/src too — a scoped-type value arbitrary flags there",
    },
  ],
  mustPass: [
    {
      files: 'export const G = <div className="w-[var(--sidebar-width)]" />;\n',
      at: "packages/client/src/features/x/ok.tsx",
      why: "a var(--…) bracket body is token-driven — same class as a bare token utility, passes",
    },
    {
      files: 'export const G = <div className="data-[state=open]:opacity-100" />;\n',
      at: "packages/client/src/features/x/np.tsx",
      why: "a variant-SELECTOR bracket (non-terminal segment) is not a value bracket — passes",
    },
    {
      files: 'export const G = <div className="translate-x-[calc(var(--a)-var(--b))]" />;\n',
      at: "packages/client/src/features/x/calc.tsx",
      why: "a calc(...) bracket body is token-driven — passes",
    },
    {
      files: 'export const G = <div className="has-[:focus-visible]:ring-2" />;\n',
      at: "packages/client/src/features/x/has.tsx",
      why: "a has-[...]: selector bracket is a variant selector, not a terminal value bracket — passes",
    },
    {
      files: "export const G = <div className=\"before:content-['']\" />;\n",
      at: "packages/client/src/features/x/content.tsx",
      why: "content-['...'] — content is not a scoped utility, out of scope — passes",
    },
    {
      files: 'export const G = <div className="fill-[#fff]" />;\n',
      at: "packages/client/src/features/x/fill.tsx",
      why: "fill is an unscoped utility — a bracket on it is out of scope — passes",
    },
  ],
};
