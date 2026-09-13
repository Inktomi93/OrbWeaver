// The FOREIGN-TOOL directive grammar — Biome, ESLint and TypeScript suppression comments — as one shared
// reader. Two policies judge the same syntax for opposite reasons: `suppressions` budgets each site
// (a both-ways per-file ratchet), `no-blanket-suppression` refuses the FILE-WIDE forms. Before this module
// the grammar lived inside `gates/suppressions.ts` and the second gate imported its sibling gate, which is
// exactly the private-reader shape the final contract forbids — a policy may call a shared `lib/` reader and
// nothing else (`docs/design/gate-runtime-standardization.md` §3).
//
// THIS IS NOT AN ORB WAIVER AND MUST NEVER BE ROUTED THROUGH `ordinary-waiver.ts`
// (`docs/reviews/gate-runtime/ordinary-waiver-source-migration.md` §"Explicit non-migrations", marker kind 7:
// *"native-tool syntax, not Orb ordinary waivers… Do NOT route these through `ordinary-waiver.ts`"*). The
// central engine owns `@orb-waive <policy-id>(<position>): <reason>`, which binds to an Orb policy id and is
// consumed exactly once; a `biome-ignore` binds to a FOREIGN rule id, is consumed by a foreign analyzer this
// repository does not run through the gate runtime, and is DATA to us — a population two policies measure,
// never a permission either of them grants. Keeping the two vocabularies in separate modules is what stops
// the next reader from collapsing them.
//
// AND IT IS NOT A SECOND COMMENT SUBSTRATE. `comment-spans.ts` remains the one comment/trivia lexer (its
// `forEachCommentRange` gap walk for TS, its quote-aware `commentSpansInText` for CSS/JSON) and this module
// consumes it; it owns the DIRECTIVE grammar on top and nothing below it — no policy ids, no waiver
// consumption, no liveness, which stay where they already live.
//
// THE MENTION FENCE is the whole reason this is a grammar and not a substring test: a directive is matched at
// the comment OPENER only (`^\s*<open>\s*<token>\b`), so a spelling inside a string literal, mid-sentence in
// prose, or quoted by a design document is INERT. Every `mustPass` row in both gates that pins that fence
// pins THIS regex.
import type { SourceFile } from "ts-morph";
import { ts } from "ts-morph";
import { forEachCommentRange } from "./comment-spans.ts";

const COMMENT_OPEN = String.raw`(?:\/\/|\/\*+|\{\/\*+)`;
const DIRECTIVE_TOKEN = String.raw`(?:biome-ignore(?:-all|-start|-end)?|eslint-(?:disable(?:-next-line|-line)?|enable)|@ts-expect-error|@ts-ignore|@ts-nocheck)`;
const SUPPRESSION_RE = new RegExp(String.raw`^\s*${COMMENT_OPEN}\s*(${DIRECTIVE_TOKEN})\b`, "u");
/** The RULE a marker names — the classification key. `biome-ignore[-all|-start|-end] <rule>:`, an
 *  `eslint-disable*` rule id, or the bare TypeScript directive (which names no rule and is its own key). */
const RULE_RE = new RegExp(
  String.raw`^\s*${COMMENT_OPEN}\s*(?:biome-ignore(?:-all|-start|-end)?\s+(\S+?):|eslint-(?:disable(?:-next-line|-line)?|enable)\s+([^\s:,*]+)|(@ts-expect-error|@ts-ignore|@ts-nocheck)\b)`,
  "u",
);

/** ONE live suppression marker: where it is, which marker shape it wears, and the RULE it names (null when
 *  the marker names none — a bare TypeScript directive, or a spelling this reader cannot parse; either way
 *  an unclassifiable marker falls to DEBT, which is the conservative direction). */
export interface SuppressionSite {
  readonly line: number;
  readonly token: string;
  readonly rule: string | null;
  /** A `/* … *\/` (or JSX `{/* … *\/}`) comment, as opposed to a `//` line comment — eslint honours its
   *  BLOCK directives (`eslint-disable`/`eslint-enable`) only in the former (#962's blanket judge). */
  readonly block: boolean;
}

/** The directive GRAMMAR as one door: a comment's text → its token + the rule it names, or null when the
 *  comment is not a directive at its OPENER (the mention fence above). Shared by the ledger gate, the blanket
 *  gate and the baseline generator, so "what is a directive" has one home for TS trivia, scratch-parsed JS,
 *  and the CSS/JSON comment lexer alike. */
export function readDirectiveComment(text: string): Pick<SuppressionSite, "token" | "rule"> | null {
  const match = SUPPRESSION_RE.exec(text);
  // biome-ignore lint/suspicious/noUnnecessaryConditions: RegExp.exec can return null; Biome narrows this constructed grammar incorrectly.
  if (match === null) {
    return null;
  }
  const ruleMatch = RULE_RE.exec(text);
  // biome-ignore lint/suspicious/noUnnecessaryConditions: RULE_RE is stricter than detection, so a matched directive can still have no parsed rule.
  return { token: match[1] ?? match[0], rule: ruleMatch?.[1] ?? ruleMatch?.[2] ?? ruleMatch?.[3] ?? null };
}

/** Every suppression-marker comment in one source file, in source order (line, matched token).
 *  Three carriers, each de-duplicated by source position so one physical comment counts once:
 *  (1) LEADING comment ranges (the common `// biome-ignore …` / `// eslint-disable …` shape);
 *  (2) TRAILING comment ranges (a suppression trailing the statement it guards, e.g. a same-block
 *  `else if` arm's closing brace swallows what would otherwise be the next node's leading comment);
 *  (3) a comment-only JSX expression container (`{/* eslint-disable-next-line … *\/}`) — ts-morph folds
 *  that into the JsxExpression's own node text rather than exposing it via comment ranges at all. */
export function suppressionSites(sf: SourceFile): SuppressionSite[] {
  const sites: SuppressionSite[] = [];
  const seenLines = new Set<number>(); // dedupe by LINE: the same physical comment surfaces through more
  // than one carrier (e.g. a JSX comment-only expression is BOTH its own node text and a token's trailing
  // range at an adjacent position) — a suppression marker is one-per-line in practice, so line identity is
  // the robust dedupe key (position identity drifts across carriers for the exact same comment).
  const record = (pos: number, text: string): void => {
    const directive = readDirectiveComment(text);
    if (directive === null) {
      return;
    }
    const line = sf.getLineAndColumnAtPos(pos).line;
    if (seenLines.has(line)) {
      return;
    }
    seenLines.add(line);
    sites.push({ line, token: directive.token, rule: directive.rule, block: !text.startsWith("//") });
  };
  // A TOKEN-level walk (never `forEachDescendant`): a same-block trailing suppression — an `else if`
  // arm's last statement — attaches its comment range to a token (a CloseBraceToken), and a node-only
  // traversal misses those carriers entirely, in the permissive direction. `forEachCommentRange` is that
  // walk over RAW compiler nodes: the same range set and the same document order as the kind-less
  // `getDescendants()` it replaced, without wrapping — or even synthesising — a single token (#967).
  const fullText = sf.getFullText();
  forEachCommentRange(sf, (range, node) => {
    record(range.pos, fullText.slice(range.pos, range.end));
    if (ts.isJsxExpression(node) && node.expression === undefined) {
      record(node.pos, fullText.slice(node.getStart(sf.compilerNode), node.end));
    }
  });
  sites.sort((a, b) => a.line - b.line);
  return sites;
}
