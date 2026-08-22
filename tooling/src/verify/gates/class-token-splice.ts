// Gate: class-token-splice (UI-Gates-and-Lessons.md §12) — a `${…}` inside a class string may sit only
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
// expression the gate cannot resolve to a literal set is UNSAFE — an unverifiable class interpolation is
// exactly the "whole literals only" law's blind spot, and the permissive direction ships dead paint.
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import { unwrapExpression } from "../lib/ast-read.ts";

const SCOPE_REGEX = /\/packages\/(?:client|ui)\/src\//u;
const LEADING_SPACE = /^\s/u;
const TRAILING_SPACE = /\s$/u;
const CLASS_ATTRIBUTE = /^class(Name)?$/u;
const QUOTES = /["']/gu;
/** The class-composition callees whose arguments are class strings. Mirrors no-raw-z-index's list. */
const CLASS_CALLEES = new Set(["cn", "cx", "clsx", "cva", "tv", "twMerge", "twJoin"]);
/** `tv`/`cva` config keys whose leaves are class strings (variant leaves are reached through the callee). */
const CLASS_KEYS = new Set(["base", "class", "className"]);
/** Resolution depth cap — an identifier→const→ternary→call chain deeper than this is treated as unknown. */
const MAX_DEPTH = 4;
const UNION_OPERATORS = new Set<SyntaxKind>([SyntaxKind.BarBarToken, SyntaxKind.QuestionQuestionToken]);

const MESSAGE =
  "a `${…}` spliced INSIDE a class token — the composed class never appears as a whole literal in source, " +
  "so Tailwind's scanner never registers it and it compiles to NOTHING (no error anywhere; only rendered " +
  "geometry catches it). See UI-Gates-and-Lessons.md §12.";
const FIX =
  'Spell whole classes and switch between them (`${cond ? "inset-y-0" : "inset-x-0"}`), or move the branch ' +
  "into a variant. If the interpolated value legitimately carries its own leading space, give it a " +
  "resolvable literal shape — a same-file const, or a function whose returns are string literals. " +
  "See UI-Gates-and-Lessons.md §12.";

/** The declaration named `name` reachable from `sf`: a local one, else a named import followed into its
 *  module. Deliberately NOT the language service — the shared project resolves modules, and a conformance
 *  mini-project has no program to ask. */
function resolveName(sf: SourceFile, name: string): Node | undefined {
  const local = sf.getVariableDeclaration(name) ?? sf.getFunction(name);
  if (local !== undefined) {
    return local;
  }
  const imported = sf.getImportDeclarations().flatMap((decl) => {
    const named = decl.getNamedImports().find((n) => (n.getAliasNode() ?? n.getNameNode()).getText() === name);
    if (named === undefined) {
      return [];
    }
    const target = decl.getModuleSpecifierSourceFile();
    const original = named.getNameNode().getText();
    const found = target?.getVariableDeclaration(original) ?? target?.getFunction(original);
    return found === undefined ? [] : [found];
  });
  return imported[0];
}

/** Union of two operand value-sets; unknown on either side poisons the result. */
function union(a: readonly string[] | undefined, b: readonly string[] | undefined): readonly string[] | undefined {
  return a === undefined || b === undefined ? undefined : [...a, ...b];
}

function valuesOfIdentifier(expr: Node, sf: SourceFile, depth: number): readonly string[] | undefined {
  const decl = resolveName(sf, expr.getText());
  if (decl === undefined || !Node.isVariableDeclaration(decl)) {
    return;
  }
  const init = decl.getInitializer();
  return init === undefined ? undefined : possibleValues(init, decl.getSourceFile(), depth + 1);
}

function valuesOfCall(expr: Node, sf: SourceFile, depth: number): readonly string[] | undefined {
  if (!Node.isCallExpression(expr)) {
    return;
  }
  const callee = expr.getExpression();
  if (!Node.isIdentifier(callee)) {
    return;
  }
  const decl = resolveName(sf, callee.getText());
  if (decl === undefined || !Node.isFunctionDeclaration(decl)) {
    return;
  }
  const out: string[] = [];
  for (const ret of decl.getDescendantsOfKind(SyntaxKind.ReturnStatement)) {
    const value = ret.getExpression();
    const vals = value === undefined ? undefined : possibleValues(value, decl.getSourceFile(), depth + 1);
    if (vals === undefined) {
      return;
    }
    out.push(...vals);
  }
  return out.length === 0 ? undefined : out;
}

/** The set of string values an expression can evaluate to, or `undefined` when the gate cannot decide.
 *  `undefined` is the UNSAFE verdict, never a pass. */
function possibleValues(node: Node, sf: SourceFile, depth: number): readonly string[] | undefined {
  if (depth > MAX_DEPTH) {
    return;
  }
  const expr = unwrapExpression(node);
  if (Node.isStringLiteral(expr) || Node.isNoSubstitutionTemplateLiteral(expr)) {
    return [expr.getLiteralText()];
  }
  if (Node.isConditionalExpression(expr)) {
    return union(possibleValues(expr.getWhenTrue(), sf, depth + 1), possibleValues(expr.getWhenFalse(), sf, depth + 1));
  }
  if (Node.isBinaryExpression(expr)) {
    if (!UNION_OPERATORS.has(expr.getOperatorToken().getKind())) {
      return;
    }
    return union(possibleValues(expr.getLeft(), sf, depth + 1), possibleValues(expr.getRight(), sf, depth + 1));
  }
  if (Node.isIdentifier(expr)) {
    return valuesOfIdentifier(expr, sf, depth);
  }
  return valuesOfCall(expr, sf, depth);
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
  if (Node.isJsxAttribute(a)) {
    return CLASS_ATTRIBUTE.test(a.getNameNode().getText());
  }
  if (Node.isPropertyAssignment(a)) {
    return CLASS_KEYS.has(a.getName().replace(QUOTES, "")) ? true : undefined;
  }
  if (Node.isCallExpression(a)) {
    const parts = a.getExpression().getText().split(".");
    return CLASS_CALLEES.has(parts.at(-1) ?? "") ? true : undefined;
  }
  // A template that reached one of these without passing a class-carrying ancestor is not paint.
  const isBoundary = Node.isFunctionDeclaration(a) || Node.isVariableStatement(a) || Node.isJsxElement(a);
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

export const gate: GateDescriptor = {
  name: "class-token-splice",
  docRow: "UI-Gates-and-Lessons.md §12",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => SCOPE_REGEX.test(`/${p}`),
  kinds: [SyntaxKind.TemplateExpression],
  visit: (node, sf, ctx) => {
    if (!Node.isTemplateExpression(node)) {
      return;
    }
    if (!isClassCarrier(node)) {
      return;
    }
    const segments: Segment[] = [[node.getHead().getLiteralText()]];
    for (const span of node.getTemplateSpans()) {
      segments.push(possibleValues(span.getExpression(), sf, 0));
      segments.push([span.getLiteral().getLiteralText()]);
    }
    for (let right = 1; right < segments.length; right += 1) {
      if (isSpliced(segments, right)) {
        ctx.report(node);
        return;
      }
    }
  },
  mustFlag: [
    {
      files: 'const side = "end";\nconst x = <div className={`inset-${side}-0 p-2`} />;\n',
      at: "packages/ui/src/probe.tsx",
      expect: { count: 1 },
      why: "THE FOUNDING SHAPE — `inset-block-0`'s sibling: a resolvable identifier spliced mid-token, which compiles to nothing and shipped a 490px-short band (#205/#249)",
    },
    {
      files: "const x = cn(`text-${someRuntimeThing()}`);\n",
      at: "packages/client/src/probe.ts",
      expect: { count: 1 },
      why: "UNRESOLVABLE is UNSAFE: the gate cannot prove the value carries its own separator, and a permissive default here reports green forever",
    },
    {
      files: 'const x = <div className={`p-2 ${"flex"}-row`} />;\n',
      at: "packages/ui/src/probe.tsx",
      expect: { count: 1 },
      why: "the TRAILING junction — the interpolation is preceded by a space but the literal after it splices onto its tail",
    },
  ],
  mustPass: [
    {
      files:
        'function widthClass(c: boolean): string {\n  return c ? " w-avatar-hero" : "";\n}\n' +
        "const x = <div className={`shrink-0${widthClass(true)}`} />;\n",
      at: "packages/client/src/probe.tsx",
      why: "the LEADING-SPACE idiom resolved through a same-file function: every non-empty return starts with whitespace, so no token is spliced (face-strip.tsx's live shape)",
    },
    {
      files: 'const a = "p-2";\nconst x = <div className={`${a} flex`} />;\n',
      at: "packages/ui/src/probe.tsx",
      why: "whole tokens separated by whitespace — the interpolation sits BETWEEN classes, the sanctioned use",
    },
    {
      files: 'const x = <div className={`p-2${true ? "" : " flex"}${false ? " gap-2" : " grid"}`} />;\n',
      at: "packages/ui/src/probe.tsx",
      why: "TRANSPARENT EMPTY: the first interpolation can be empty, so the junction is re-judged against the second — whose every non-empty value leads with a space",
    },
    {
      files: 'const label = `Hello ${"world"}!`;\n',
      at: "packages/ui/src/probe.ts",
      why: "DECLARED LIMIT — a template outside any class-carrying position is prose, not paint; only className/class-callee/`base` sites are judged",
    },
  ],
};
