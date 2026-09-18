// THE AUTHORITY-MATRIX FOLD — an object-literal matrix the caller names, resolved to verb → authority
// through object spreads of local/imported sibling matrices (#947), every member kind answered or refused
// (#1091). Split out of `chat-plane-read.ts` at the size cap (2026-09-18): the index, the visitors,
// reachability and the clamp discharge stay there, and its `resolveChatMatrix` is this fold's family door.
// The SUBJECT name every refusal spells travels in as `constName`, so the family's vocabulary constants keep
// their one home there. One-way: this module imports nothing from `chat-plane-read.ts`.
import { readStaticString, resolveStableExpression } from "@orb/tooling/_shared/reference-fact";
import type { ReferenceUnresolvedReason } from "@orb/tooling/_shared/reference-fact-contract";
import type { Node as MorphNode, ObjectLiteralExpression } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readStringValue, unwrapExpression } from "./ast-read.ts";

/** How many characters of an unsupported matrix expression a refusal quotes. */
const DIAGNOSTIC_PREVIEW_CHARS = 120;

/** A refusal reason's class. `cycle` and `missing`-family reasons keep the vocabulary the legacy reader's
 *  own refusals used, so a matrix this reader cannot establish never reads as a SMALLER matrix. */
const REFUSAL_CLASS = {
  cycle: "cycle",
  missing: "unbound",
  ambiguous: "unbound",
  unsupported: "shape",
  dynamic: "shape",
  write: "shape",
} as const satisfies Record<ReferenceUnresolvedReason, "cycle" | "unbound" | "shape">;

function preview(node: MorphNode): string {
  return node.getText().slice(0, DIAGNOSTIC_PREVIEW_CHARS);
}

/** A source-manifest key: `<repo-relative file>#<CONST>`, so the scan line reads the same as every other
 *  policy's rather than leaking an absolute worktree path. */
function sourceKey(node: MorphNode, name: string): string {
  const path = node.getSourceFile().getFilePath();
  const idx = path.indexOf("/packages/");
  return `${idx === -1 ? path : path.slice(idx + 1)}#${name}`;
}

/** The fold's accumulator: the resolved verb→authority map and the SOURCE manifest behind it. */
interface MatrixFold {
  readonly verbs: Map<string, string>;
  readonly sources: string[];
  /** The declared constant's name — the subject every refusal in this fold spells. */
  readonly constName: string;
}

export interface ChatVerbMatrix {
  readonly verbs: ReadonlyMap<string, string>;
  readonly sources: readonly string[];
}

/** Every refusal in this family carries the legacy opener, so a `mustRefuse` needle names authored text
 *  rather than a generic runner envelope sentence. */
function refuse(message: string): never {
  throw new Error(`chat-viewer-plane-canon-reads: ${message}`);
}

/** The object literal an expression denotes, following identifier/alias hops through the SHARED stable
 *  binding reader. It refuses on any other shape, on an unresolvable binding, and on a cycle, because a
 *  matrix this reader cannot establish must never read as a SMALLER matrix. */
function matrixObject(expression: MorphNode, constName: string): ObjectLiteralExpression {
  const direct = unwrapExpression(expression);
  if (Node.isObjectLiteralExpression(direct)) {
    return direct;
  }
  const fact = resolveStableExpression(expression);
  if (fact.kind === "resolved") {
    const terminal = unwrapExpression(fact.value);
    if (Node.isObjectLiteralExpression(terminal)) {
      return terminal;
    }
    return refuse(`unsupported ${constName} expression in ${expression.getSourceFile().getFilePath()}: ${preview(expression)}`);
  }
  const kind = REFUSAL_CLASS[fact.reason];
  if (kind === "cycle") {
    return refuse(`${constName} composition cycle at ${sourceKey(fact.node, direct.getText())}`);
  }
  if (kind === "unbound") {
    return refuse(`${constName} binding "${direct.getText()}" resolves to no local declaration or named import`);
  }
  return refuse(`unsupported ${constName} expression in ${expression.getSourceFile().getFilePath()}: ${preview(expression)}`);
}

/** A member's KEY: an identifier / numeric / quoted name read as written, or a COMPUTED key whose
 *  expression is a string literal. A computed key this reader cannot NAME must not enter the map: before
 *  #1091 it entered as the bracket text (`["listMessages"]`), which matches no factory — so the gate
 *  reported an UNCHECKED verb that does not exist while the real one went unjudged. */
function memberKey(name: MorphNode, constName: string): string {
  if (Node.isComputedPropertyName(name)) {
    const computed = readStringValue(name.getExpression());
    if (computed === undefined) {
      return refuse(`computed ${constName} key in ${name.getSourceFile().getFilePath()} is not a string literal: ${preview(name)}`);
    }
    return computed;
  }
  return readStringValue(name) ?? name.getText();
}

/** The authority STRING a member's value denotes — through `as const`/`satisfies`/parens and through an
 *  identifier's BINDING, the same local-or-named-import hop the matrix object itself takes, answered by the
 *  shared reader. Every other shape REFUSES: an authority this reader cannot establish would drop its verb
 *  out of the classified set entirely, and `isViewerPlane` never sees the verb it was supposed to protect. */
function authorityValue(expression: MorphNode, constName: string): string {
  const fact = readStaticString(expression);
  if (fact.kind === "resolved") {
    return fact.value;
  }
  const kind = REFUSAL_CLASS[fact.reason];
  const named = unwrapExpression(expression);
  if (kind === "cycle") {
    return refuse(`${constName} value binding cycle at ${sourceKey(fact.node, named.getText())}`);
  }
  if (kind === "unbound") {
    return refuse(`${constName} value binding "${named.getText()}" resolves to no local declaration or named import`);
  }
  return refuse(`unsupported ${constName} value in ${expression.getSourceFile().getFilePath()}: ${preview(expression)}`);
}

/** Fold one matrix object's rows into the accumulator, resolving object spreads first so a locally-written
 *  row always WINS over the base it overrides (the live `{...BASE, listMessages:"member"}` precedence).
 *
 *  `seen` is threaded ACROSS the fold/resolve boundary, not re-seeded per spread: a cycle runs
 *  fold → resolve → fold, so a per-call seed detects nothing and the recursion blows the stack instead of
 *  refusing. */
function foldMatrix(obj: ObjectLiteralExpression, out: MatrixFold, seen: ReadonlySet<string>): void {
  const { constName } = out;
  const key = sourceKey(obj, obj.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName() ?? constName);
  if (seen.has(key)) {
    refuse(`${constName} composition cycle at ${key}`);
  }
  out.sources.push(key);
  const nested: ReadonlySet<string> = new Set([...seen, key]);
  for (const prop of obj.getProperties()) {
    if (Node.isSpreadAssignment(prop)) {
      const before = out.verbs.size;
      foldMatrix(matrixObject(prop.getExpression(), constName), out, nested);
      if (out.verbs.size === before) {
        refuse(`${constName} at ${key} spreads "${prop.getExpression().getText()}", which resolved to zero verbs`);
      }
      continue;
    }
    if (Node.isPropertyAssignment(prop)) {
      const initializer = prop.getInitializer();
      if (initializer === undefined) {
        refuse(`${constName} row "${prop.getName()}" at ${key} has no value`);
      }
      out.verbs.set(memberKey(prop.getNameNode(), constName), authorityValue(initializer, constName));
      continue;
    }
    // A SHORTHAND row (`{ previewAssembly, listMessages }`) is the same row one hop away: its NAME is both
    // the verb and the value expression, so the binding hop answers it.
    if (Node.isShorthandPropertyAssignment(prop)) {
      out.verbs.set(prop.getName(), authorityValue(prop.getNameNode(), constName));
      continue;
    }
    refuse(`unsupported ${constName} member kind ${prop.getKindName()} at ${key}: ${preview(prop)}`);
  }
}

/** The matrix as verb → authority, RESOLVED through object spreads of local/imported sibling matrices
 *  (#947), from the delivered `constName` variable declarations; `undefined` when none is readable, which is
 *  the BLINDNESS condition the health sibling reports and the reach sibling refuses on. */
export function resolveAuthorityMatrix(declarations: readonly MorphNode[], constName: string): ChatVerbMatrix | undefined {
  let found: ChatVerbMatrix | undefined;
  for (const declaration of declarations) {
    if (!Node.isVariableDeclaration(declaration)) {
      continue;
    }
    const initializer = declaration.getInitializer();
    const obj = initializer === undefined ? undefined : unwrapExpression(initializer);
    if (obj === undefined || !Node.isObjectLiteralExpression(obj)) {
      continue;
    }
    const fold: MatrixFold = { verbs: new Map<string, string>(), sources: [], constName };
    foldMatrix(obj, fold, new Set());
    if (fold.verbs.size > 0) {
      found = { verbs: fold.verbs, sources: fold.sources };
      break;
    }
  }
  return found;
}
