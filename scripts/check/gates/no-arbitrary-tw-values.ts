// Gate: no-arbitrary-tw-values (design-enforcement.md §3 — the last PLANNED gate in the doc, widening
// the existing no-raw-spacing/no-raw-typography biome family to the general bracket escape hatch). A
// Tailwind arbitrary-VALUE class on a layout/size/spacing/type utility (`w-[137px]`, `text-[13px]`,
// `p-[7px]`) in `packages/client/src` or `packages/ui/src` is banned — if a value is worth using it's
// worth a token.
//
// SHAPE: walk every string/template literal in the two src trees, split on whitespace into class
// tokens, and for each token strip variant modifiers (split on `:`, keep only the LAST segment — so
// `hover:w-[137px]` and `md:text-[13px]` still flag; `data-[state=open]:opacity-100` does NOT, because
// its bracket lives in a NON-terminal segment, i.e. it's a variant/selector bracket, not a value). The
// terminal segment flags when it matches `<utility>-[<body>]` where `<utility>` is one of the scoped
// layout/size/spacing/type prefixes AND `<body>` does NOT start with `--`, `var(`, or `calc(` (those ARE
// token-driven, same class as a bare token utility). `content-['…']` (arbitrary content, not a magic
// value) is out of scope entirely — `content` isn't a scoped utility.
//
// ALLOWLIST (file-level, the no-interactive-role-in-features BURN_DOWN precedent): a file lands here
// with the value + reason when no token exists for it. An allowlisted file that has gone CLEAN (no
// scoped arbitrary-value class remains) is RED (stale entry — remove it); a NEW offender not in the
// allowlist is RED immediately.
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Check, CheckContext, Violation } from "../harness.ts";
import { fileLoaded } from "../pass.ts";

const CLIENT_SRC_DIR = "/packages/client/src/";
const UI_SRC_DIR = "/packages/ui/src/";

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

/** Lines of every banned arbitrary-value class token in every string literal of this file. Template
 *  literals with interpolation (TemplateHead/Middle/Tail) are skipped — className strings never carry
 *  interpolated tokens (only tv() slot values do, always plain strings/no-substitution templates). */
function offenceLines(sf: SourceFile): number[] {
  const lines: number[] = [];
  for (const kind of [
    SyntaxKind.StringLiteral,
    SyntaxKind.NoSubstitutionTemplateLiteral,
  ] as const) {
    for (const lit of sf.getDescendantsOfKind(kind)) {
      // Strip the one enclosing delimiter char (`"`/`'`/`` ` ``) each side — getText() includes it.
      const text = lit.getText().slice(1, -1);
      const tokens = text.split(WHITESPACE_RE);
      if (tokens.some(isBannedArbitrary)) {
        lines.push(lit.getStartLineNumber());
      }
    }
  }
  return lines;
}

/** The offender scan: new-offender violations + which allowlisted files still carry a banned arbitrary. */
function scanSrc(
  project: CheckContext["project"],
  allowlist: Record<string, string>,
): { violations: Violation[]; seenAllowlisted: Set<string> } {
  const violations: Violation[] = [];
  const seenAllowlisted = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    const path = sf.getFilePath();
    if (!(path.includes(CLIENT_SRC_DIR) || path.includes(UI_SRC_DIR))) {
      continue;
    }
    const rel = clientRel(path);
    const lines = offenceLines(sf);
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

/** The ratchet-down arm: an allowlisted file that never surfaced a banned arbitrary (absent OR clean). */
function staleEntries(
  allowlist: Record<string, string>,
  seenAllowlisted: ReadonlySet<string>,
): Violation[] {
  return Object.keys(allowlist)
    .filter((rel) => !seenAllowlisted.has(rel))
    .map((rel) => ({
      file: "scripts/check/gates/no-arbitrary-tw-values.ts",
      line: 1,
      message: `${STALE_ENTRY_MESSAGE_PREFIX}"${rel}" — scripts/check/gates/no-arbitrary-tw-values.ts`,
    }));
}

/** Factory (the createNoInteractiveRoleInFeatures precedent): the self-test drives BOTH ratchet arms with
 *  an injected registry. */
export function createNoArbitraryTwValues(allowlist: Record<string, string>): Check {
  return {
    name: "no-arbitrary-tw-values",
    run: ({ project }): Violation[] => {
      const { violations, seenAllowlisted } = scanSrc(project, allowlist);
      return [...violations, ...staleEntries(allowlist, seenAllowlisted)];
    },
  };
}

export const noArbitraryTwValues: Check = createNoArbitraryTwValues(ALLOWLIST);

// ── SINGLE-PASS CONTRACT FORM (§1.2 — per-token, reference-gate shape: offender arm + finalize stale) ─
// The legacy predicate as a String/NoSubstitutionTemplate subscription (interpolated template parts are
// deliberately skipped — className strings never carry them). PER-TOKEN: each banned arbitrary token in a
// class string is its own finding at its real column (owner ruling 1). scanRoot mirrors the legacy
// scanSrc filter (client|ui src); the live non-empty ALLOWLIST's stale arm is finalize-guarded to project
// scope (§4.4). Kept ALONGSIDE the legacy Check.
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
  ],
};
