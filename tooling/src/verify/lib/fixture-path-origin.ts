// Positive fixture-path provenance for `policy-fixture-substrate`. This module owns the final root
// classification; focused sibling readers supply complete helper calls and finite authored record values.
import { isAbsolute, posix, win32 } from "node:path";
import type { CallExpression, Identifier, Node as MorphNode, ParameterDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readMemberReference, referenceResolutionServices, resolveModuleMemberOrigin, resolveStableExpression } from "../../_shared/reference-fact.ts";
import type { FixtureAuthoredStringFact, FixtureAuthoredValueUnreadable, FixturePathOrigin, FixturePathOriginReader } from "../contract/fixture-path-origin.ts";
import { createFixtureAuthoredRecordReader } from "./fixture-path-authored-record.ts";
import { createFixturePathCallGraph } from "./fixture-path-call-graph.ts";
import { classifyProcessMemberRead } from "./process-member-origin.ts";

type RootKind = "scratch" | "checkout" | "temp-base";
interface RootFactBase {
  /** Minimum proven segments below the owned root across every authored alternative. */
  readonly depth: number;
  readonly carrier: MorphNode;
}
/** A DISTRIBUTED union rather than one interface carrying `RootKind`: the narrowing every consumer below
 *  performs (`fact.kind === "scratch"`) has to survive `biome`'s type service as well as tsc's, and a
 *  single-interface-with-union-field shape is exactly the receiver it reads as unreachable. */
type RootFact = { [Kind in RootKind]: RootFactBase & { readonly kind: Kind } }[RootKind];
type InternalFact = RootFact | FixtureAuthoredValueUnreadable;

const TOOL_FIXTURE_SUFFIX = "/tests/support/tool-fixtures.ts";
const SCRATCH_FIXTURE = "scratch";
const REPO_FIXTURE = "repoRoot";
const PLANTED_TREE_FIXTURE = "plantedTree";
const FIXTURE_PATH_EXPORT = "fixturePath";
const MAX_VALUES = 512;
const PATH_SPECIFIERS: ReadonlySet<string> = new Set(["path", "node:path", "path/posix", "node:path/posix"]);
const OS_SPECIFIERS: ReadonlySet<string> = new Set(["os", "node:os"]);
const FS_SPECIFIERS: ReadonlySet<string> = new Set(["fs", "node:fs", "fs/promises", "node:fs/promises"]);
/** The four temp-directory MINTERS. A `Disposable` twin differs only in its return wrapper, so a reader that
 *  knew two of the four would acquit the other two silently — the blind-spot class `gate-spelling-twins` owns. */
const MKDTEMP_VERBS: ReadonlySet<string> = new Set(["mkdtemp", "mkdtempSync", "mkdtempDisposable", "mkdtempDisposableSync"]);
/** `open`/`openSync` flags that cannot mutate. Anything else — including an unreadable flag expression — is
 *  mutation-capable, which is why this is an allowlist of proven values rather than a denylist. */
const READ_ONLY_OPEN_FLAGS: ReadonlySet<string> = new Set(["r", "rs", "sr"]);

function unreadable(carrier: MorphNode, detail: string): FixtureAuthoredValueUnreadable {
  return { kind: "unreadable", carrier, detail };
}

function unwrap(node: MorphNode): MorphNode {
  return referenceResolutionServices.unwrapExpression(node);
}

function canonicalVerb(call: CallExpression, specifiers: ReadonlySet<string>, verbs: ReadonlySet<string>): string | undefined {
  const fact = resolveModuleMemberOrigin(call.getExpression());
  if (fact.kind === "unresolved" || !specifiers.has(fact.value.moduleSpecifier)) {
    return;
  }
  const verb = fact.value.memberPath.at(-1) ?? fact.value.exportedName;
  return verbs.has(verb) ? verb : undefined;
}

/** The conformance mini-project has no ambient node declarations. An unbound `process` receiver is still
 *  the ambient global; a local declaration of that spelling is deliberately not. */
function isAmbientProcessCwd(call: CallExpression): boolean {
  const member = readMemberReference(call.getExpression());
  if (member.kind === "unresolved" || member.value.name !== "cwd") {
    return false;
  }
  const receiver = unwrap(member.value.receiver);
  if (!Node.isIdentifier(receiver) || receiver.getText() !== "process") {
    return false;
  }
  const declaration = referenceResolutionServices.declarationOf(receiver);
  return declaration.kind === "unresolved" && declaration.reason === "missing";
}

function fixtureBinding(identifier: Identifier): { readonly name: string; readonly carrier: MorphNode } | undefined {
  const declaration = referenceResolutionServices.declarationOf(identifier);
  if (declaration.kind === "unresolved" || !Node.isBindingElement(declaration.value)) {
    return;
  }
  const binding = declaration.value;
  const parameter = binding.getFirstAncestorByKind(SyntaxKind.Parameter);
  const fn = parameter?.getParent();
  if (parameter === undefined || fn === undefined || !Node.isFunctionLikeDeclaration(fn)) {
    return;
  }
  const ownerCall = fn.getFirstAncestorByKind(SyntaxKind.CallExpression);
  if (ownerCall === undefined || !ownerCall.getArguments().some((argument) => unwrap(argument).compilerNode === fn.compilerNode)) {
    return;
  }
  const origin = resolveModuleMemberOrigin(ownerCall.getExpression());
  if (
    origin.kind === "unresolved" ||
    origin.value.canonical.kind !== "project" ||
    !origin.value.canonical.sourceFile.getFilePath().replaceAll("\\", "/").endsWith(TOOL_FIXTURE_SUFFIX) ||
    (origin.value.memberPath.at(-1) ?? origin.value.exportedName) !== "test"
  ) {
    return;
  }
  const property = binding.getPropertyNameNode() ?? binding.getNameNode();
  if (!(Node.isIdentifier(property) || Node.isStringLiteral(property) || Node.isNoSubstitutionTemplateLiteral(property))) {
    return;
  }
  return { name: Node.isIdentifier(property) ? property.getText() : property.getLiteralText(), carrier: identifier };
}

function segmentsEffect(value: string): { readonly minimum: number; readonly final: number } | undefined {
  if (isAbsolute(value) || win32.isAbsolute(value)) {
    return;
  }
  let depth = 0;
  let minimum = 0;
  for (const segment of value.replaceAll("\\", "/").split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      depth -= 1;
      minimum = Math.min(minimum, depth);
    } else {
      depth += 1;
    }
  }
  return { minimum, final: depth };
}

function distinct(values: readonly string[]): readonly string[] | undefined {
  const out = [...new Set(values)];
  return out.length <= MAX_VALUES ? out : undefined;
}

/** Build one invocation-local reader. */
export function createFixturePathOriginReader(): FixturePathOriginReader {
  const graph = createFixturePathCallGraph();
  const records = createFixtureAuthoredRecordReader({ parameterArguments: graph.parameterArguments, stringValues });
  function stringParameter(identifier: Identifier, parameter: ParameterDeclaration, seen: Set<object>): FixtureAuthoredStringFact {
    const args = graph.parameterArguments(parameter);
    if (args === undefined) {
      return unreadable(identifier, "parameter has no complete, non-escaping authored call set");
    }
    const facts = args.map((argument) => stringValues(argument, new Set(seen)));
    const refusal = facts.find((fact): fact is FixtureAuthoredValueUnreadable => fact.kind === "unreadable");
    if (refusal !== undefined) {
      return refusal;
    }
    const values = distinct(facts.flatMap((fact) => (fact as { readonly kind: "values"; readonly values: readonly string[] }).values));
    return values === undefined ? unreadable(identifier, "authored string set exceeds the reader bound") : { kind: "values", values };
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: finite authored-string grammar.
  function stringValues(node: MorphNode, seen: Set<object>): FixtureAuthoredStringFact {
    const current = unwrap(node);
    if (seen.has(current.compilerNode)) {
      return unreadable(current, "string provenance cycle");
    }
    seen.add(current.compilerNode);
    if (Node.isStringLiteral(current) || Node.isNoSubstitutionTemplateLiteral(current)) {
      return { kind: "values", values: [current.getLiteralText()] };
    }
    if (Node.isTemplateExpression(current)) {
      let values: readonly string[] = [current.getHead().getLiteralText()];
      for (const span of current.getTemplateSpans()) {
        const expression = stringValues(span.getExpression(), new Set(seen));
        if (expression.kind === "unreadable") {
          return expression;
        }
        const combined = distinct(values.flatMap((prefix) => expression.values.map((value) => `${prefix}${value}${span.getLiteral().getLiteralText()}`)));
        if (combined === undefined) {
          return unreadable(current, "template string set exceeds the reader bound");
        }
        values = combined;
      }
      return { kind: "values", values };
    }
    if (Node.isIdentifier(current)) {
      const declaration = referenceResolutionServices.declarationOf(current);
      if (declaration.kind === "resolved" && Node.isBindingElement(declaration.value)) {
        return records.bindingElementValues(declaration.value, seen);
      }
      if (declaration.kind === "resolved" && Node.isParameterDeclaration(declaration.value)) {
        return stringParameter(current, declaration.value, seen);
      }
      if (declaration.kind === "resolved" && Node.isVariableDeclaration(declaration.value) && declaration.value.getInitializer() === undefined) {
        const loop = declaration.value.getFirstAncestorByKind(SyntaxKind.ForOfStatement);
        const array = loop === undefined ? undefined : records.arrayLiteralOf(loop.getExpression());
        if (array !== undefined) {
          const facts = array.getElements().map((element) => stringValues(element, new Set(seen)));
          const refusal = facts.find((item): item is FixtureAuthoredValueUnreadable => item.kind === "unreadable");
          if (refusal !== undefined) {
            return refusal;
          }
          const values = distinct(facts.flatMap((item) => (item as { readonly kind: "values"; readonly values: readonly string[] }).values));
          return values === undefined ? unreadable(current, "iterable string set exceeds the reader bound") : { kind: "values", values };
        }
      }
      const stable = resolveStableExpression(current);
      if (stable.kind === "resolved") {
        return stringValues(stable.value, seen);
      }
      return stable.reason === "dynamic" ? stringValues(stable.node, seen) : unreadable(current, stable.detail);
    }
    if (Node.isPropertyAccessExpression(current) || Node.isElementAccessExpression(current)) {
      const member = readMemberReference(current);
      return member.kind === "unresolved" ? unreadable(current, member.detail) : records.propertyValue(member.value.receiver, member.value.name, seen);
    }
    if (Node.isConditionalExpression(current)) {
      const left = stringValues(current.getWhenTrue(), new Set(seen));
      const right = stringValues(current.getWhenFalse(), new Set(seen));
      if (left.kind === "unreadable" || right.kind === "unreadable") {
        return left.kind === "unreadable" ? left : right;
      }
      const values = distinct([...left.values, ...right.values]);
      return values === undefined ? unreadable(current, "conditional string set exceeds the reader bound") : { kind: "values", values };
    }
    if (Node.isBinaryExpression(current) && current.getOperatorToken().getKind() === SyntaxKind.PlusToken) {
      const left = stringValues(current.getLeft(), new Set(seen));
      const right = stringValues(current.getRight(), new Set(seen));
      if (left.kind === "unreadable" || right.kind === "unreadable") {
        return left.kind === "unreadable" ? left : right;
      }
      const values = distinct(left.values.flatMap((a) => right.values.map((b) => `${a}${b}`)));
      return values === undefined ? unreadable(current, "concatenated string set exceeds the reader bound") : { kind: "values", values };
    }
    if (Node.isCallExpression(current) && canonicalVerb(current, PATH_SPECIFIERS, new Set(["basename", "dirname"])) !== undefined) {
      const argument = current.getArguments()[0];
      if (argument === undefined) {
        return unreadable(current, "basename has no path argument");
      }
      const fact = stringValues(argument, seen);
      if (fact.kind === "unreadable") {
        return fact;
      }
      const verb = canonicalVerb(current, PATH_SPECIFIERS, new Set(["basename", "dirname"]));
      return { kind: "values", values: fact.values.map((value) => (verb === "dirname" ? posix.dirname(value) : posix.basename(value))) };
    }
    return unreadable(current, `${current.getKindName()} is not a finite authored string`);
  }

  function mergeRoots(facts: readonly InternalFact[], carrier: MorphNode): InternalFact {
    const firstUnreadable = facts.find((fact): fact is FixtureAuthoredValueUnreadable => fact.kind === "unreadable");
    if (firstUnreadable !== undefined) {
      return unreadable(carrier, firstUnreadable.detail);
    }
    const roots = facts as RootFact[];
    if (roots.some((fact) => fact.kind === "checkout")) {
      return { kind: "checkout", depth: Math.min(...roots.filter((fact) => fact.kind === "checkout").map((fact) => fact.depth)), carrier };
    }
    const kind = roots[0]?.kind;
    if (kind === undefined || roots.some((fact) => fact.kind !== kind)) {
      return unreadable(carrier, "authored alternatives do not prove one path root");
    }
    return { kind, depth: Math.min(...roots.map((fact) => fact.depth)), carrier };
  }

  function parameterRoot(identifier: Identifier, parameter: ParameterDeclaration, seen: Set<object>): InternalFact {
    const args = graph.parameterArguments(parameter);
    if (args === undefined) {
      return unreadable(identifier, "parameter has no complete, non-escaping authored call set");
    }
    return mergeRoots(
      args.map((argument) => pathFact(argument, new Set(seen))),
      identifier,
    );
  }

  function applySegments(root: RootFact, values: readonly string[], carrier: MorphNode): InternalFact {
    let minimumDepth = Number.POSITIVE_INFINITY;
    for (const value of values) {
      const effect = segmentsEffect(value);
      if (effect === undefined || root.depth + effect.minimum < 0) {
        return unreadable(carrier, `path segment ${JSON.stringify(value)} can reset or escape its proven root`);
      }
      minimumDepth = Math.min(minimumDepth, root.depth + effect.final);
    }
    return { kind: root.kind, depth: Number.isFinite(minimumDepth) ? minimumDepth : root.depth, carrier: root.carrier };
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: finite canonical path-call grammar.
  function pathCall(call: CallExpression, seen: Set<object>): InternalFact | undefined {
    const fixturePathOrigin = resolveModuleMemberOrigin(call.getExpression());
    if (
      fixturePathOrigin.kind === "resolved" &&
      fixturePathOrigin.value.canonical.kind === "project" &&
      fixturePathOrigin.value.canonical.sourceFile.getFilePath().replaceAll("\\", "/").endsWith(TOOL_FIXTURE_SUFFIX) &&
      (fixturePathOrigin.value.memberPath.at(-1) ?? fixturePathOrigin.value.exportedName) === FIXTURE_PATH_EXPORT
    ) {
      const root = call.getArguments()[0];
      return root === undefined ? unreadable(call, "fixturePath has no owned root argument") : pathFact(root, new Set(seen));
    }
    const pathVerb = canonicalVerb(call, PATH_SPECIFIERS, new Set(["join", "resolve", "dirname"]));
    if (pathVerb !== undefined) {
      const args = call.getArguments();
      const first = args[0];
      if (first === undefined) {
        return unreadable(call, `${pathVerb} has no root argument`);
      }
      let root = pathFact(first, new Set(seen));
      if (root.kind === "unreadable") {
        return root;
      }
      if (pathVerb === "dirname") {
        return root.depth < 1 ? unreadable(call, "dirname can escape the proven root") : { ...root, depth: root.depth - 1 };
      }
      for (const argument of args.slice(1)) {
        if (pathVerb === "resolve") {
          const reset = pathFact(argument, new Set(seen));
          if (reset.kind !== "unreadable") {
            root = reset;
            continue;
          }
        }
        const values = stringValues(argument, new Set(seen));
        if (values.kind === "unreadable") {
          return unreadable(argument, `path composition is not proven root-preserving: ${values.detail}`);
        }
        const applied = applySegments(root, values.values, argument);
        if (applied.kind === "unreadable") {
          return applied;
        }
        root = applied;
      }
      return root;
    }
    if (canonicalVerb(call, OS_SPECIFIERS, new Set(["tmpdir"])) !== undefined) {
      return { kind: "temp-base", depth: 0, carrier: call };
    }
    if (canonicalVerb(call, FS_SPECIFIERS, MKDTEMP_VERBS) !== undefined) {
      const prefix = call.getArguments()[0];
      const base = prefix === undefined ? unreadable(call, "mkdtemp has no prefix") : pathFact(prefix, new Set(seen));
      // `depth > 0` is the whole point: `mkdtempSync(tmpdir())` creates a sibling of the SHARED temp base,
      // not a child of it, so only a prefix at least one segment below an owned base mints scratch.
      return (base.kind === "temp-base" || base.kind === "scratch") && base.depth > 0
        ? { kind: "scratch", depth: 0, carrier: call }
        : unreadable(call, "mkdtemp prefix is not proven below the canonical temporary-directory base or an invocation-owned scratch root");
    }
    const expression = unwrap(call.getExpression());
    if (Node.isIdentifier(expression)) {
      const fixture = fixtureBinding(expression);
      if (fixture?.name === PLANTED_TREE_FIXTURE) {
        return { kind: "scratch", depth: 0, carrier: expression };
      }
    }
    // biome-ignore lint/complexity/noUselessUndefined: tsconfig enables noImplicitReturns.
    return undefined;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: finite path-provenance grammar.
  function pathFact(node: MorphNode, seen: Set<object>): InternalFact {
    const current = unwrap(node);
    if (seen.has(current.compilerNode)) {
      return unreadable(current, "path provenance cycle");
    }
    seen.add(current.compilerNode);
    if (Node.isAwaitExpression(current)) {
      return pathFact(current.getExpression(), seen);
    }
    if (Node.isIdentifier(current)) {
      const fixture = fixtureBinding(current);
      if (fixture?.name === SCRATCH_FIXTURE) {
        return { kind: "scratch", depth: 0, carrier: current };
      }
      if (fixture?.name === REPO_FIXTURE) {
        return { kind: "checkout", depth: 0, carrier: current };
      }
      const declaration = referenceResolutionServices.declarationOf(current);
      if (declaration.kind === "unresolved") {
        return current.getText() === "__dirname" || current.getText() === "__filename"
          ? { kind: "checkout", depth: 0, carrier: current }
          : unreadable(current, declaration.detail);
      }
      if (Node.isParameterDeclaration(declaration.value)) {
        return parameterRoot(current, declaration.value, seen);
      }
      const stable = resolveStableExpression(current);
      if (stable.kind === "resolved") {
        return pathFact(stable.value, seen);
      }
      return stable.reason === "dynamic" ? pathFact(stable.node, seen) : unreadable(current, stable.detail);
    }
    if (Node.isCallExpression(current)) {
      const process = classifyProcessMemberRead(current.getExpression(), "cwd");
      if (process === "reads" || isAmbientProcessCwd(current)) {
        return { kind: "checkout", depth: 0, carrier: current.getExpression() };
      }
      if (process === "unreadable") {
        return unreadable(current, "process.cwd receiver identity is unreadable");
      }
      return pathCall(current, seen) ?? unreadable(current, "call result has no proven fixture-path origin");
    }
    if (Node.isPropertyAccessExpression(current) || Node.isElementAccessExpression(current)) {
      const member = readMemberReference(current);
      if (
        member.kind === "resolved" &&
        member.value.receiver.getKind() === SyntaxKind.MetaProperty &&
        new Set(["dirname", "url", "filename"]).has(member.value.name)
      ) {
        return { kind: "checkout", depth: 0, carrier: current };
      }
    }
    if (Node.isConditionalExpression(current)) {
      return mergeRoots([pathFact(current.getWhenTrue(), new Set(seen)), pathFact(current.getWhenFalse(), new Set(seen))], current);
    }
    return unreadable(current, `${current.getKindName()} has no proven fixture-path origin`);
  }

  function read(node: MorphNode): FixturePathOrigin {
    graph.finish();
    const fact = pathFact(node, new Set());
    if (fact.kind === "scratch") {
      return { kind: "scratch", carrier: fact.carrier };
    }
    if (fact.kind === "checkout") {
      return { kind: "checkout", carrier: fact.carrier };
    }
    if (fact.kind === "temp-base") {
      return { kind: "unreadable", carrier: fact.carrier, detail: "os.tmpdir() is shared and does not prove an invocation-owned fixture directory" };
    }
    return fact;
  }

  /** `mkdtemp` is judged on its PREFIX, and the prefix is not an ordinary destination: the directory is created
   *  as a SIBLING of the prefix, so a prefix that merely reaches an owned base (`depth === 0`) mints nothing,
   *  while a prefix one segment below one (`join(tmpdir(), "orb-")`) mints an invocation-owned root. */
  function readMkdtempPrefix(node: MorphNode): FixturePathOrigin {
    graph.finish();
    const fact = pathFact(node, new Set());
    if ((fact.kind === "scratch" || fact.kind === "temp-base") && fact.depth > 0) {
      return { kind: "scratch", carrier: fact.carrier };
    }
    if (fact.kind === "checkout") {
      return { kind: "checkout", carrier: fact.carrier };
    }
    return fact.kind === "unreadable" ? fact : unreadable(fact.carrier, "mkdtemp prefix is not proven below an invocation-owned root");
  }

  function isReadOnlyOpen(call: CallExpression): boolean {
    graph.finish();
    const flags = call.getArguments()[1];
    if (flags === undefined) {
      return false;
    }
    const authored = stringValues(flags, new Set());
    if (authored.kind === "values") {
      return authored.values.length > 0 && authored.values.every((value) => READ_ONLY_OPEN_FLAGS.has(value));
    }
    // `O_RDONLY` is numeric zero; nothing else in the numeric flag space is read-only on its own.
    const stable = Node.isIdentifier(unwrap(flags)) ? resolveStableExpression(unwrap(flags)) : undefined;
    const numeric = stable?.kind === "resolved" ? unwrap(stable.value) : unwrap(flags);
    return Node.isNumericLiteral(numeric) && Number(numeric.getText()) === 0;
  }

  return { visitCall: graph.visitCall, visitIdentifier: graph.visitIdentifier, isReadOnlyOpen, read, readMkdtempPrefix };
}
