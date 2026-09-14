// Policy: class-token-splice (UI-Gates-and-Lessons.md §12) — a `${…}` inside a class string may sit only
// BETWEEN class tokens, never INSIDE one. Tailwind's scanner reads whole literals out of source text, so
// `inset-${side}-0` registers no rule at all and paints NOTHING — silently, past tsc, biome, and eslint's
// better-tailwindcss (which skips substituted templates; measured 2026-08-19, #249). COMMENT POSTURE:
// comment-SAFE — it subscribes to TemplateExpression nodes and reads only their own literal spans.
//
// A junction (the seam between two adjacent template segments) is SAFE when the LEFT segment's every
// possible value ends in whitespace, or the RIGHT's every possible value starts with whitespace — so the
// `shrink-0${cellWidthClass(c)}` idiom, whose resolved value set is `" w-avatar-hero" | ""`, is correct
// and stays green. Empty possible values are TRANSPARENT: the junction is then re-judged against the
// segment beyond. DECLARED LIMITS: only className/class-callee/`base`-key positions are judged, and an
// expression the policy cannot resolve to a literal set is UNSAFE — an unverifiable class interpolation is
// exactly the "whole literals only" law's blind spot, and the permissive direction ships dead paint.
//
// FINAL-CONTRACT CONVERSION (#1584). LEGACY SHA: 68c8f42d6 (the descriptor this policy replaces,
// byte-for-byte the pre-conversion module). THREE THINGS CHANGED, all forced by §3's non-negotiables:
//
//   1. THE PRIVATE CROSS-MODULE RESOLVER IS GONE. Legacy `resolveName` hand-rolled identifier lookup
//      (`sf.getVariableDeclaration` plus a named-import hop through `getModuleSpecifierSourceFile`) — a
//      private reader wearing a shared reader's clothes (§5b item 7). Identity now goes through
//      `_shared/reference-fact.ts#resolveStableExpression` and
//      `_shared/reference-fact-call.ts#resolveCallableDeclaration`, the shared binding readers, which are
//      STRICTLY STRONGER: they see through aliases, re-export renames and namespace members, and they
//      REFUSE a binding that is written to (a reassigned `let` resolved silently in the legacy reader and
//      now lands on the UNSAFE arm, which is the correct direction for this policy). That is why
//      `analysis` is "types" and the proof rows are `mode: "types"`.
//      **AND THE LAST HALF OF IT WENT AT #2163.** Until then `calleeDeclaration` was TWO halves: the
//      shared origin reader for the cross-module case plus a local
//      `lexicalReferenceSymbol(...).getDeclarations()` fallback with a private exactly-one-declaration
//      rule, because the origin reader answers "which module EXPORT is this" and refuses a module-LOCAL
//      factory by design. That fallback was the shape the owner ruling on #2097 forbids, and its
//      exactly-one rule was this module's own answer to declaration multiplicity. Both halves now live in
//      `resolveCallableDeclaration`, which tries the module axis first and falls back to the lexical
//      binding — so a local overload set resolves to its implementation instead of refusing, and a
//      reassigned callee refuses instead of resolving. `mustPass[1]` is the module-local arm's pin.
//      **LANDED 2026-09-13 (5c73621ea). Its COMMIT MESSAGE and the lane report's §2.2 claimed both deltas
//      were "strictly stricter, never more permissive" — this header never carried that sentence, and the
//      distinction matters because a reader auditing the header alone would find no claim to distrust.
//      THAT DIRECTION CLAIM WAS WRONG and is REFUTED (reviewer `cb-v-callable-reader`, reproduced here
//      through the production proof runner).** In THIS policy an unresolvable segment IS
//      the report verdict (`Segment = undefined` → `startsSafe` false → the junction reads as spliced), so
//      RESOLVING MORE REPORTS LESS. The OVERLOAD delta is therefore PERMISSIVE — more accurate, because
//      the finding it drops was a false positive on a factory whose returns genuinely lead with a space,
//      but permissive, and a permissive change in an ordinary/error policy whose catch is invisible
//      rendered geometry owes a row: `mustPass[12]` (0 findings here, 1 before the migration). Only the
//      REASSIGNED-CALLEE delta is stricter, and its row is `mustFlag[5]` (1 finding here, 0 before).
//      Restore the pre-#2163 two-half `calleeDeclaration` and exactly those two rows red, nothing else —
//      which is what makes them the deltas' discriminators rather than decoration.
//   2. THE FUNCTION-RETURN DESCENDANT WALK IS GONE. Legacy read a callee's returns with
//      `decl.getDescendantsOfKind(SyntaxKind.ReturnStatement)` — one of §3's named bans, and recorded as
//      such at `docs/reviews/gate-runtime/uncovered-gate-conversion-census.md:103`. ReturnStatement is now
//      a SUBSCRIBED KIND on the policy's own visitor, indexed by its nearest enclosing function through an
//      ancestor walk, and the junction verdict moves to `evaluate` because a template may be visited before
//      the function it calls (§8.6).
//   3. EXECUTION IS `entire-population`, AND THAT IS A REAL CHANGE from the legacy
//      `scopeSafety: "incremental-safe"`. The return index is built from the files THIS RUN walks, so on a
//      proper subset a call into an unselected population file would resolve to nothing, land on the
//      UNSAFE arm, and report a splice that the whole-population run does not — a scope-shaped false
//      positive. The verdict genuinely does not compose over a subset, so the policy defers under
//      `--changed`/`--scope` and is decided by the whole `pnpm check`. (Identifier resolution does NOT have
//      this property — the shared readers ask the compiler Project, not this run's fileset — so only the
//      call arm forces it. Drop the call arm and `selected-files` would be correct.)
//
// ANCHOR MOVE (§4.6 category 6), and it costs nothing here: legacy reported the TemplateExpression with no
// token, so the position was whatever `derivedNodePosition` scanned first. The policy now names the
// INTERPOLATED EXPRESSION at the offending junction, so a waiver points at the splice rather than at the
// first identifier in the template. No marker is orphaned by it: the MARKER CENSUS is ZERO — no
// `@orb-gate-ignore class-token-splice` exists anywhere on the tree (0 raw across `packages/**`,
// `tooling/**`, `tests/**`), so there is nothing to translate and nothing to drop. An expression whose own
// text carries a paren or a newline (`${someRuntimeThing()}`) CANNOT be a waiver position — the marker
// grammar's position group is `[^()\r\n]+` — so the policy passes NO token there and lets the runtime
// derive one; `fix` states both spellings and `mustFlag[1]` pins the derived one.
//
// POPULATION PORT: byte-identical. The legacy `scanRoot` was `/\/packages\/(?:client|ui)\/src\//u` over
// `/${path}`; `["@client", "@ui"]` resolves to exactly `packages/client/src/` + `packages/ui/src/`
// (`contract/population.ts`).
// FAMILY: singleton `class-token-splice` — it consumes the shared binding readers for identity (which is
// what the final contract asks for and does not by itself mint a family: `bounded-list-limit` and
// `no-direct-reports-write` are the precedent), and its own logic — junction safety over a template's
// flattened segments — has no sibling policy on the tree. No other converted policy judges an
// interpolation inside a class token; `no-hover-display-swap`, `scroll-container-positioned`,
// `no-off-token-radius-shadow` and `ui-size-via-variant` all judge WHOLE authored tokens and none of them
// looks at a seam.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `class-token-splice` descriptor at 2241d52b80eedf94a6de8c6cfa29027bfc7364eb, the parent of the conversion
// `e8e4d85b7` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `68c8f42d6`
// cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations
// resolve to this source. Over the SAME 7,432 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 1,685 and final `population` admits 1,685.
// legacy − final = ∅. final − legacy = ∅. Controls: inside `packages/client/src/agent-handles/__cbbhr_in_index.ts`
// (virtual) admitted by both; outside `packages/contracts/src/assets/__cbbhr_out_index.ts` (virtual) rejected by
// both.
import type { CallExpression, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { resolveStableExpression } from "../../_shared/reference-fact.ts";
import { resolveCallableDeclaration } from "../../_shared/reference-fact-call.ts";
import { defineGate } from "../contract/policy.ts";
import { unwrapExpression } from "../lib/ast-read.ts";

const LEADING_SPACE = /^\s/u;
const TRAILING_SPACE = /\s$/u;
const CLASS_ATTRIBUTE = /^class(Name)?$/u;
const QUOTES = /["']/gu;
/** A token the ordinary-waiver grammar cannot carry: its position group is `[^()\r\n]+`. */
const UNWAIVABLE_TOKEN = /[()\r\n]/u;
/** The class-composition callees whose arguments are class strings. Mirrors no-raw-z-index's list. */
const CLASS_CALLEES = new Set(["cn", "cx", "clsx", "cva", "tv", "twMerge", "twJoin"]);
/** `tv`/`cva` config keys whose leaves are class strings (variant leaves are reached through the callee). */
const CLASS_KEYS = new Set(["base", "class", "className"]);
/** Resolution depth cap — an identifier→const→ternary→call chain deeper than this is treated as unknown. */
const MAX_DEPTH = 4;
const UNION_OPERATORS = new Set<SyntaxKind>([SyntaxKind.BarBarToken, SyntaxKind.QuestionQuestionToken]);
/** The function-like kinds a ReturnStatement can belong to; the index key is the nearest one above it. */
const FUNCTION_KINDS = new Set<SyntaxKind>([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.FunctionExpression,
  SyntaxKind.ArrowFunction,
  SyntaxKind.MethodDeclaration,
]);

const MESSAGE =
  "a `${…}` spliced INSIDE a class token — the composed class never appears as a whole literal in source, " +
  "so Tailwind's scanner never registers it and it compiles to NOTHING (no error anywhere; only rendered " +
  "geometry catches it). See UI-Gates-and-Lessons.md §12.";
const FIX =
  'Spell whole classes and switch between them (`${cond ? "inset-y-0" : "inset-x-0"}`), or move the branch ' +
  "into a variant. If the interpolated value legitimately carries its own leading space, give it a " +
  "resolvable literal shape — a same-file const, or a function whose returns are string literals. " +
  "A deliberate splice is waived with `// @orb-waive class-token-splice(<position>): <reason>` on the line " +
  "above, where <position> is the INTERPOLATED EXPRESSION at the offending junction exactly as authored " +
  "(`side`, `cond ? a : b`) — EXCEPT where that text contains a paren or a newline, which the marker " +
  "grammar cannot carry: there the position is the first paren-free identifier or literal token inside the " +
  "template (for `${someRuntimeThing()}` that is `someRuntimeThing`). See UI-Gates-and-Lessons.md §12.";

/** Union of two operand value-sets; unknown on either side poisons the result. */
function union(a: readonly string[] | undefined, b: readonly string[] | undefined): readonly string[] | undefined {
  return a === undefined || b === undefined ? undefined : [...a, ...b];
}

/** The expression a NAME stands for, through the shared binding reader. A `dynamic` refusal is not a dead
 *  end: `resolveStableExpression` treats a call/ternary as a TERMINAL, and the walk continues at the
 *  refusal's own node (TS-MORPH-CAPABILITIES.md, limit 1). A binding that is written to refuses for real. */
function boundExpression(expr: Node): Node | undefined {
  const stable = resolveStableExpression(expr);
  if (stable.kind === "resolved") {
    return stable.value === expr ? undefined : stable.value;
  }
  return stable.reason === "dynamic" && stable.node !== expr ? stable.node : undefined;
}

/** The value set of every expression shape that is decided WITHOUT a call: literals, ternary and `||`/`??`
 *  unions, and a name resolved through the shared binding reader. `read` is the caller's recursion, which
 *  owns the depth cap and the call arm. */
function staticValues(expr: Node, depth: number, read: (node: Node, depth: number) => readonly string[] | undefined): readonly string[] | undefined {
  // ONE TAIL RETURN (the pass.ts idiom): biome deletes a trailing `return undefined;` as a safe fix and
  // tsc then reds the implicit fall-through with TS7030, so the verdict is accumulated, never fallen off.
  let values: readonly string[] | undefined;
  if (expr.isKind(SyntaxKind.StringLiteral) || expr.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    values = [expr.getLiteralText()];
  } else if (expr.isKind(SyntaxKind.ConditionalExpression)) {
    values = union(read(expr.getWhenTrue(), depth + 1), read(expr.getWhenFalse(), depth + 1));
  } else if (expr.isKind(SyntaxKind.BinaryExpression)) {
    values = UNION_OPERATORS.has(expr.getOperatorToken().getKind()) ? union(read(expr.getLeft(), depth + 1), read(expr.getRight(), depth + 1)) : undefined;
  } else if (expr.isKind(SyntaxKind.Identifier)) {
    const bound = boundExpression(expr);
    values = bound === undefined ? undefined : read(bound, depth + 1);
  }
  return values;
}

/** The single declaration a direct call names — ONE question, ONE shared reader (#2097).
 *
 *  This used to be two halves: `resolveCallableOrigin` for the cross-module case plus a local
 *  `lexicalReferenceSymbol(...).getDeclarations()` fallback with an exactly-one rule, because the origin
 *  reader answers "which module EXPORT is this" and a module-LOCAL factory refuses there by design. The
 *  fallback was the forbidden shape, and its exactly-one rule was this module's private answer to
 *  multiplicity — `resolveCallableDeclaration` now owns both halves and every hard case with them
 *  (a reassigned binding refuses, an overload set resolves to its implementation, a cycle terminates). */
function calleeDeclaration(call: CallExpression): Node | undefined {
  const callable = resolveCallableDeclaration(call);
  return callable.kind === "resolved" ? callable.value.declaration : undefined;
}

interface SpliceState {
  /** Class-carrying TemplateExpressions, judged in `evaluate` once every return is indexed. */
  readonly templates: Node[];
  /** Nearest enclosing function node → the expressions its `return` statements carry. */
  readonly returns: Map<Node, Node[]>;
}

/** One flattened template segment: a static literal span, or an interpolation's resolved value set.
 *  `undefined` values = unresolvable (unsafe by default). */
type Segment = readonly string[] | undefined;

function nonEmpty(seg: Segment): readonly string[] | undefined {
  return seg?.filter((v) => v !== "");
}

function endsSafe(seg: Segment): boolean {
  return nonEmpty(seg)?.every((v) => TRAILING_SPACE.test(v)) === true;
}

function startsSafe(seg: Segment): boolean {
  return nonEmpty(seg)?.every((v) => LEADING_SPACE.test(v)) === true;
}

/** Which ancestor decides whether this template's value is a class string. */
function carrierVerdict(a: Node): boolean | undefined {
  if (a.isKind(SyntaxKind.JsxAttribute)) {
    return CLASS_ATTRIBUTE.test(a.getNameNode().getText());
  }
  if (a.isKind(SyntaxKind.PropertyAssignment)) {
    return CLASS_KEYS.has(a.getName().replace(QUOTES, "")) ? true : undefined;
  }
  if (a.isKind(SyntaxKind.CallExpression)) {
    const parts = a.getExpression().getText().split(".");
    return CLASS_CALLEES.has(parts.at(-1) ?? "") ? true : undefined;
  }
  // A template that reached one of these without passing a class-carrying ancestor is not paint.
  const isBoundary = a.isKind(SyntaxKind.FunctionDeclaration) || a.isKind(SyntaxKind.VariableStatement) || a.isKind(SyntaxKind.JsxElement);
  return isBoundary ? false : undefined;
}

function isClassCarrier(node: Node): boolean {
  for (let a = node.getParent(); a !== undefined; a = a.getParent()) {
    const verdict = carrierVerdict(a);
    if (verdict !== undefined) {
      return verdict;
    }
  }
  return false;
}

/** Is the junction at `right` a splice? A left neighbour that can be EMPTY is transparent, so the seam is
 *  re-judged against the segment beyond it (`a${maybeEmpty}${leadingSpace}` is safe). */
function isSpliced(segments: readonly Segment[], right: number): boolean {
  if (startsSafe(segments[right])) {
    return false;
  }
  for (let left = right - 1; left >= 0; left -= 1) {
    const leftSeg = segments[left];
    if (endsSafe(leftSeg)) {
      return false;
    }
    if (leftSeg?.includes("") !== true) {
      return true;
    }
  }
  return false;
}

export const gate = defineGate({
  id: "class-token-splice",
  family: "class-token-splice",
  authority: "ordinary",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const state: SpliceState = { templates: [], returns: new Map() };

    function indexReturn(node: Node): void {
      const value = node.asKindOrThrow(SyntaxKind.ReturnStatement).getExpression();
      if (value === undefined) {
        return;
      }
      for (let a = node.getParent(); a !== undefined; a = a.getParent()) {
        if (FUNCTION_KINDS.has(a.getKind())) {
          const bucket = state.returns.get(a);
          if (bucket === undefined) {
            state.returns.set(a, [value]);
          } else {
            bucket.push(value);
          }
          return;
        }
      }
    }

    function valuesOfCall(expr: Node, depth: number): readonly string[] | undefined {
      if (!expr.isKind(SyntaxKind.CallExpression)) {
        return;
      }
      const declaration = calleeDeclaration(expr);
      // Parity with the legacy reader: only a `function` DECLARATION's returns are read. An arrow or a
      // method resolves to no value set and lands on the UNSAFE arm, exactly as it did before.
      if (declaration === undefined || !declaration.isKind(SyntaxKind.FunctionDeclaration)) {
        return;
      }
      const returned = state.returns.get(declaration);
      if (returned === undefined || returned.length === 0) {
        return;
      }
      const out: string[] = [];
      for (const value of returned) {
        const values = possibleValues(value, depth + 1);
        if (values === undefined) {
          return;
        }
        out.push(...values);
      }
      return out;
    }

    /** The set of string values an expression can evaluate to, or `undefined` when the policy cannot
     *  decide. `undefined` is the UNSAFE verdict, never a pass. */
    function possibleValues(node: Node, depth: number): readonly string[] | undefined {
      if (depth > MAX_DEPTH) {
        return;
      }
      const expr = unwrapExpression(node);
      // A CallExpression is the one shape `staticValues` does not decide, so the arms never overlap.
      return staticValues(expr, depth, possibleValues) ?? valuesOfCall(expr, depth);
    }

    /** The interpolated expression the offending junction sits on: the span at `right` when `right` is an
     *  interpolation slot, otherwise the span whose literal tail `right` is. */
    function spliceAnchor(node: Node, right: number): Node | undefined {
      const spans = node.asKindOrThrow(SyntaxKind.TemplateExpression).getTemplateSpans();
      return spans[right % 2 === 1 ? (right - 1) / 2 : (right - 2) / 2]?.getExpression();
    }

    function judge(node: Node): void {
      const template = node.asKindOrThrow(SyntaxKind.TemplateExpression);
      const segments: Segment[] = [[template.getHead().getLiteralText()]];
      for (const span of template.getTemplateSpans()) {
        segments.push(possibleValues(span.getExpression(), 0));
        segments.push([span.getLiteral().getLiteralText()]);
      }
      for (let right = 1; right < segments.length; right += 1) {
        if (!isSpliced(segments, right)) {
          continue;
        }
        const anchor = spliceAnchor(node, right);
        const token = anchor?.getText();
        if (anchor === undefined || token === undefined || UNWAIVABLE_TOKEN.test(token)) {
          // No waivable position exists in the anchor's own text; the runtime derives one.
          ctx.report.node(node);
        } else {
          ctx.report.node(node, { token, offset: anchor.getStart() - node.getStart() });
        }
        return;
      }
    }

    return {
      visitors: [
        {
          kinds: [SyntaxKind.TemplateExpression, SyntaxKind.ReturnStatement],
          visit: (node) => {
            if (node.isKind(SyntaxKind.ReturnStatement)) {
              indexReturn(node);
            } else if (isClassCarrier(node)) {
              state.templates.push(node);
            }
          },
        },
      ],
      evaluate: () => {
        for (const template of state.templates) {
          judge(template);
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: { "packages/ui/src/probe.tsx": 'const side = "end";\nconst x = <div className={`inset-${side}-0 p-2`} />;\n' },
      expect: { count: 1, line: 2, token: "side" },
      why: "THE FOUNDING SHAPE — `inset-block-0`'s sibling: a resolvable identifier spliced mid-token, which compiles to nothing and shipped a 490px-short band (#205/#249). The token also pins the ANCHOR MOVE: the finding names the interpolated expression, which is the waiver position",
    },
    {
      mode: "types",
      files: { "packages/client/src/probe.ts": "const x = cn(`text-${someRuntimeThing()}`);\n" },
      expect: { count: 1, token: "someRuntimeThing" },
      why: "UNRESOLVABLE is UNSAFE: the policy cannot prove the value carries its own separator, and a permissive default here reports green forever. It is ALSO the UNWAIVABLE-TOKEN arm: the anchor's own text `someRuntimeThing()` carries parens, which the marker grammar's `[^()\\r\\n]+` position group cannot hold, so the policy passes NO token and the runtime derives the paren-free `someRuntimeThing`",
    },
    {
      mode: "types",
      files: { "packages/ui/src/probe.tsx": 'const x = <div className={`p-2 ${"flex"}-row`} />;\n' },
      expect: { count: 1, token: '"flex"' },
      why: "the TRAILING junction — the interpolation is preceded by a space but the literal after it splices onto its tail. The reported token is the interpolated string literal INCLUDING its quotes, which is what an author must type",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/helpers.ts": 'export function widthClass(c: boolean): string {\n  return c ? "w-avatar-hero" : "";\n}\n',
        "packages/ui/src/probe.tsx": 'import { widthClass } from "./helpers.ts";\nconst x = <div className={`shrink-0${widthClass(true)}`} />;\n',
      },
      expect: { count: 1, line: 2, token: "widthClass" },
      why: "§4.1 — THE CROSS-FILE RETURN INDEX, pinned in its FAILING direction. The same imported helper as mustPass[0] but with the leading space DROPPED from its return: the policy must still read that function's returns through the visitor-built index and report the splice. It is also the reason `execution` is `entire-population` — resolve the callee's file out of the run and this row's verdict changes. The token is the DERIVED one (`widthClass`), not the anchor text: a call expression always carries parens, so the call arm always takes the unwaivable-token fallback",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/probe.tsx": 'let mutated = " w-avatar-hero";\nmutated = "w-avatar-hero";\nconst x = <div className={`shrink-0${mutated}`} />;\n',
      },
      expect: { count: 1, line: 3, token: "mutated" },
      why: "§4.1 — THE SHARED BINDING READER'S WRITE REFUSAL, pinned. A REASSIGNED binding has no single authored value, so `resolveStableExpression` refuses it and the junction lands on the UNSAFE arm. The legacy private resolver read the declaration's initializer and would have called this seam SAFE off the first assignment — a catch the conversion GAINS",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/probe.tsx":
          'function widthClass(c: boolean): string {\n  return c ? " w-avatar-hero" : "";\n}\n' +
          'widthClass = (c: boolean): string => (c ? " w-avatar-hero" : "");\n' +
          "const x = <div className={`shrink-0${widthClass(true)}`} />;\n",
      },
      expect: { count: 1, line: 5, token: "widthClass" },
      why: "THE STRICTER HALF OF THE #2163 MIGRATION, pinned (and it had no row until the reviewer refuted the direction claim — `cb-v-callable-reader`, 2026-09-13). The CALLEE is a `function` declaration whose binding is REASSIGNED, so which body its returns come from is not decidable and `resolveCallableDeclaration` refuses with `write`; the junction then lands on the UNSAFE arm and reports. The pre-#2163 `lexicalReferenceSymbol(...).getDeclarations()` fallback saw exactly ONE declaration here, read the `function`'s returns, found every non-empty value leading with a space, and called the seam SAFE — 0 findings. So this row is 1-on-the-stack / 0-pre-stack and is the ONLY row that dies if the write refusal is dropped. The reassignment is TS2630 by design: the fixture's whole subject is a callee somebody reassigns, and a policy that trusts the first declaration paints nothing when the second one wins",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/helpers.ts": 'export function widthClass(c: boolean): string {\n  return c ? " w-avatar-hero" : "";\n}\n',
        "packages/client/src/probe.tsx": 'import { widthClass } from "./helpers.ts";\nconst x = <div className={`shrink-0${widthClass(true)}`} />;\n',
      },
      why: "the LEADING-SPACE idiom resolved through an IMPORTED function: every non-empty return starts with whitespace, so no token is spliced (face-strip.tsx's live shape). The import hop is the shared callable reader's arm — the legacy private named-import walk is gone",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/probe.tsx":
          'function widthClass(c: boolean): string {\n  return c ? " w-avatar-hero" : "";\n}\nconst x = <div className={`shrink-0${widthClass(true)}`} />;\n',
      },
      why: "the same idiom through a MODULE-LOCAL function, and the pin on the shared callable reader's LEXICAL arm — the module-origin axis refuses this by design (it answers 'which module EXPORT is this'), so `resolveCallableDeclaration`'s lexical fallback is what resolves it, and real code is full of module-local factories. Cut that fallback (as this lane did, red-first) and this row alone reds",
    },
    {
      mode: "types",
      files: { "packages/ui/src/probe.tsx": 'const a = "p-2";\nconst x = <div className={`${a} flex`} />;\n' },
      why: "whole tokens separated by whitespace — the interpolation sits BETWEEN classes, the sanctioned use",
    },
    {
      mode: "types",
      files: { "packages/ui/src/probe.tsx": 'const gap = "gap-2";\nconst x = <div className={`p-2 ${gap}`} />;\n' },
      why: "§4.1 — THE LEFT-ENDS-IN-WHITESPACE ARM of the junction test, pinned. This is the commonest legal shape in the tree and NO pre-existing row carried it: every legacy mustPass acquitted through the RIGHT-starts-with-whitespace arm instead, so making `endsSafe` never acquit left them all green. Cut it and this row alone reds",
    },
    {
      mode: "types",
      files: { "packages/ui/src/probe.tsx": 'const leading = " w-avatar-hero";\nconst x = <div className={`shrink-0${leading}`} />;\n' },
      why: '§4.1 — IDENTIFIER RESOLUTION, pinned. The leading-space idiom through a same-file const, where the verdict genuinely depends on reading the NAME\'s value: the head does not end in whitespace, so only the resolved `" w-avatar-hero"` acquits. No pre-existing row needed the resolver — the legacy `${a} flex` row acquits on its literal tail and stayed green with the resolver cut out entirely',
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/tokens.ts": 'export const LEADING = " w-avatar-hero";\n',
        "packages/ui/src/probe.tsx": 'import { LEADING } from "./tokens.ts";\nconst x = <div className={`shrink-0${LEADING}`} />;\n',
      },
      why: "the same resolution through an IMPORTED const — the legacy header claimed same-file AND imported consts and no row ever exercised the import hop. It is now the shared binding reader's module arm, so an alias or a re-export rename resolves too",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/probe.tsx": 'declare const flag: boolean;\nconst x = <div className={`p-2 ${flag ? "" : "flex"}x`} />;\n',
      },
      why: '§4.1 — EMPTY-VALUE TRANSPARENCY, pinned, and the ONLY shape that reaches the backward walk: the seam before `x` is re-judged past a segment that CAN be empty, landing on the head\'s trailing space. Replace the `includes("")` continue with an unconditional `return true` and this row alone reds. DECLARED LIMIT, carried verbatim from the legacy rule and stated plainly: the rule is permissive here — when `flag` is false the rendered class is `flexx`, which Tailwind also does not register. Pinning it is a statement of what this policy does TODAY, not an endorsement; changing the transparency rule is a behaviour decision, not a conversion',
    },
    {
      mode: "types",
      files: { "packages/ui/src/probe.tsx": 'const x = <div className={`p-2${true ? "" : " flex"}${false ? " gap-2" : " grid"}`} />;\n' },
      why: "TRANSPARENT EMPTY: the first interpolation can be empty, so the junction is re-judged against the second — whose every non-empty value leads with a space",
    },
    {
      mode: "types",
      files: { "packages/ui/src/probe.ts": 'const label = `Hello ${"world"}!`;\n' },
      why: "DECLARED LIMIT — a template outside any class-carrying position is prose, not paint; only className/class-callee/`base` sites are judged. §4.1: delete the `isClassCarrier` guard and this row reds. WHICH BRANCH it holds, stated exactly because the guard has four: this template's walk reaches a `VariableStatement` and stops on the BOUNDARY branch — it never meets a `JsxAttribute`, so it says nothing about the attribute-NAME test. The row below is that branch's",
    },
    {
      mode: "types",
      files: { "packages/ui/src/probe.tsx": 'const side = "end";\nconst x = <div title={`inset-${side}-0 p-2`} />;\n' },
      why: "THE ATTRIBUTE-NAME HALF of `carrierVerdict` (`CLASS_ATTRIBUTE.test(a.getNameNode().getText())`), which nothing reached: the splice is `mustFlag[0]` BYTE FOR BYTE — an unsafe `inset-${side}-0` junction that paints nothing — and the ONLY thing saving it is that the JSX attribute is named `title` rather than `class`/`className`. A `title` is prose; Tailwind's scanner never reads it. Make the attribute test unconditionally true and this row flags. Note the branch is a DEFINITE `false`, not `undefined`: a non-class JSX attribute STOPS the ancestor walk rather than deferring to an outer carrier, which is what keeps a class-named ancestor from reclaiming it",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/anchor.tsx": 'const x = <div className={`${"p-2"} flex`} />;\n',
        "packages/server/src/probe.tsx": 'const side = "end";\nconst x = <div className={`inset-${side}-0 p-2`} />;\n',
      },
      why: "§4.1 — THE POPULATION FENCE, pinned. mustFlag[0]'s exact literal outside `@client`/`@ui` is not paint this policy owns. Widen the population to `@authored` and this row alone reds. The `@ui` file is the required IN-POPULATION ANCHOR: a fixture admitting zero paths comes back a `[population]` TOOL ERROR instead of a verdict",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/probe.tsx":
          'const side = "end";\n' +
          "// @orb-waive class-token-splice(side): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          "const x = <div className={`inset-${side}-0 p-2`} />;\n",
      },
      why: "THE ORDINARY IDENTITY ARM (§4.2): the correct central marker at the reported position — the INTERPOLATED EXPRESSION `side`, not the template, the className or the element — suppresses the twin of mustFlag[0]. One finding (the policy reports once per template, whatever the junction count), one marker, zero effective findings and zero authority alarms. A wrong position, a foreign policy id or an over-broad match each fail this row through `toolFailure`",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/probe.tsx":
          "function widthClass(c: boolean): string;\n" +
          "function widthClass(c: number): string;\n" +
          'function widthClass(c: unknown): string {\n  return c ? " w-avatar-hero" : "";\n}\n' +
          "const x = <div className={`shrink-0${widthClass(true)}`} />;\n",
      },
      why: "THE PERMISSIVE HALF OF THE #2163 MIGRATION, pinned — the reviewer's own counterexample fixture, landed as a row (`cb-v-callable-reader`, 2026-09-13). CARDINALITY: ZERO findings on the stack, ONE before it. A module-local OVERLOAD SET is one callable with one implementation body, and `resolveCallableDeclaration` resolves it there (`overloadHome`); the returns index yields the leading-space class beside the empty string, every non-empty value leads with a space, and the junction is genuinely safe. The pre-#2163 exactly-one-declaration fallback saw THREE declarations, refused, and `Segment = undefined` IS THE REPORT VERDICT here (`startsSafe(undefined)` is false), so it reported a splice that does not exist. That is the whole shape of the delta and the reason this row exists: in THIS policy resolving MORE reports LESS, so the overload change is PERMISSIVE — accurate, but permissive, and a permissive change in an `ordinary/error` policy whose catch is invisible rendered geometry owes a row. Its stricter twin is `mustFlag[5]`. A single-declaration `widthClass` passes on both sides and would prove nothing; the OVERLOAD is the discriminator",
    },
  ],
});
