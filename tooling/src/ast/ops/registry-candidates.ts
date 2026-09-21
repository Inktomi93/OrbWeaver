// registry-candidates: informational discovery lens for convention-maintained open sets (#1189).
import type { Node as MorphNode, SourceFile, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { resolveLexicalValueDeclaration, resolveModuleMemberOrigin, resolveStableExpression } from "../../_shared/reference-fact.ts";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import type { Flags, Hit } from "../contract/types.ts";
import { emit, hitOf, narrate } from "../lib/emit.ts";
import { noteUnits, scanCorpus } from "../lib/ledger.ts";
import { isTestPath } from "../lib/root.ts";
import { relPath } from "./swallowed.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast registry-candidates");

const MIN_MEMBERS = 3;
const CANDIDATE_CLASS_COUNT = 4;
const RECORD_RE = /\bRecord\s*</u;
const compareText = (left: string, right: string): number => left.localeCompare(right);

function productionFiles(project: SourceCorpus): readonly SourceFile[] {
  return project.getSourceFiles().filter((file) => !(file.isDeclarationFile() || isTestPath(file.getFilePath())));
}

function literal(node: MorphNode | undefined): MorphNode | undefined {
  let current = node;
  while (current !== undefined && (Node.isAsExpression(current) || Node.isSatisfiesExpression(current) || Node.isParenthesizedExpression(current))) {
    current = current.getExpression();
  }
  return current;
}

function hasExactConstAssertion(node: MorphNode | undefined): boolean {
  let current = node;
  while (current !== undefined && (Node.isAsExpression(current) || Node.isSatisfiesExpression(current) || Node.isParenthesizedExpression(current))) {
    if (Node.isAsExpression(current) && current.getTypeNode()?.getText() === "const") {
      return true;
    }
    current = current.getExpression();
  }
  return false;
}

function namedObjectFields(node: MorphNode): readonly string[] | undefined {
  if (!Node.isObjectLiteralExpression(node)) {
    return;
  }
  const fields: string[] = [];
  for (const property of node.getProperties()) {
    if (!(Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property) || Node.isMethodDeclaration(property))) {
      return;
    }
    const name = property.getNameNode();
    fields.push(Node.isStringLiteral(name) ? name.getLiteralText() : name.getText());
  }
  return fields.length === 0 ? undefined : fields.toSorted(compareText);
}

interface ObjectContribution {
  readonly declaration: VariableDeclaration;
  readonly fields: readonly string[];
}

function exportedObjectContributions(files: readonly SourceFile[]): readonly ObjectContribution[] {
  return files.flatMap((file) =>
    file.getVariableDeclarations().flatMap((declaration) => {
      if (declaration.getVariableStatement()?.isExported() !== true) {
        return [];
      }
      const value = literal(declaration.getInitializer());
      const fields = value === undefined ? undefined : namedObjectFields(value);
      return fields === undefined ? [] : [{ declaration, fields }];
    }),
  );
}

function contributionHits(files: readonly SourceFile[]): Hit[] {
  const groups = new Map<string, ObjectContribution[]>();
  for (const contribution of exportedObjectContributions(files)) {
    const directory = contribution.declaration.getSourceFile().getDirectoryPath();
    const key = `${directory}\0${contribution.fields.join("\0")}`;
    groups.set(key, [...(groups.get(key) ?? []), contribution]);
  }
  const hits: Hit[] = [];
  for (const group of groups.values()) {
    const owners = new Set(group.map(({ declaration }) => declaration.getSourceFile().getFilePath()));
    if (owners.size < MIN_MEMBERS) {
      continue;
    }
    const names = new Set(group.map(({ declaration }) => declaration.getName()));
    const declarationKeys = new Set(group.map(({ declaration }) => nodeIdentity(declaration)));
    if (files.some((file) => typedCompositionCovers(file, declarationKeys))) {
      continue;
    }
    const aggregationSites = files.filter((file) =>
      file.getDescendantsOfKind(SyntaxKind.Identifier).some((identifier) => names.has(identifier.getText()) && !owners.has(file.getFilePath())),
    );
    const hit = hitOf(group[0]?.declaration as VariableDeclaration, "registry-candidate:contribution-without-door");
    hit.text = `${owners.size} sibling exports share fields {${group[0]?.fields.join(", ")}}; aggregation=${aggregationSites.length === 0 ? "none" : `hand-maintained at ${aggregationSites.map((file) => relPath(file.getFilePath())).join(", ")}`}`;
    hits.push(hit);
  }
  return hits;
}

interface LiteralSet {
  readonly declaration: VariableDeclaration;
  readonly values: readonly string[];
  readonly canonical: boolean;
}

function literalSets(files: readonly SourceFile[]): readonly LiteralSet[] {
  return files.flatMap((file) =>
    file.getVariableDeclarations().flatMap((declaration) => {
      const raw = declaration.getInitializer();
      const value = literal(raw);
      if (!Node.isArrayLiteralExpression(value)) {
        return [];
      }
      const values = value.getElements().flatMap((element) => (Node.isStringLiteral(element) ? [element.getLiteralText()] : []));
      if (values.length < MIN_MEMBERS || values.length !== value.getElements().length) {
        return [];
      }
      return [
        {
          declaration,
          values: [...new Set(values)].toSorted(compareText),
          canonical: declaration.getVariableStatement()?.isExported() === true && hasExactConstAssertion(raw),
        },
      ];
    }),
  );
}

function valueSetHits(files: readonly SourceFile[]): Hit[] {
  const groups = new Map<string, LiteralSet[]>();
  for (const set of literalSets(files)) {
    groups.set(set.values.join("\0"), [...(groups.get(set.values.join("\0")) ?? []), set]);
  }
  const hits: Hit[] = [];
  for (const group of groups.values()) {
    const owners = new Set(group.map(({ declaration }) => declaration.getSourceFile().getFilePath()));
    if (owners.size < MIN_MEMBERS || group.some(({ canonical }) => canonical)) {
      continue;
    }
    const hit = hitOf(group[0]?.declaration as VariableDeclaration, "registry-candidate:value-side-literal-set");
    hit.text = `${group[0]?.values.join(" | ")} is repeated as a ${group[0]?.values.length}-member value set in ${owners.size} files with no exported as-const tuple`;
    hits.push(hit);
  }
  return hits;
}

function nodeIdentity(node: MorphNode): string {
  return `${node.getSourceFile().getFilePath()}\0${node.getStart()}`;
}

function referencedDeclarationIdentity(node: MorphNode): string | undefined {
  const moduleOrigin = resolveModuleMemberOrigin(node);
  if (moduleOrigin.kind === "resolved" && moduleOrigin.value.canonical.kind === "project") {
    return nodeIdentity(moduleOrigin.value.canonical.declaration);
  }
  const stable = resolveStableExpression(node);
  if (stable.kind === "resolved") {
    return nodeIdentity(stable.value);
  }
  const lexical = resolveLexicalValueDeclaration(node);
  return lexical.kind === "resolved" ? nodeIdentity(lexical.value) : undefined;
}

function stableSpreadValues(node: MorphNode, visited: Set<string>): readonly MorphNode[] {
  const spread = resolveStableExpression(node);
  return spread.kind === "resolved" ? directCompositionValues(spread.value, visited) : [];
}

function directArrayCompositionValues(node: MorphNode, visited: Set<string>): readonly MorphNode[] {
  if (!Node.isArrayLiteralExpression(node)) {
    return [];
  }
  return node
    .getElements()
    .flatMap((element) => (Node.isSpreadElement(element) ? stableSpreadValues(element.getExpression(), visited) : [literal(element) ?? element]));
}

function directObjectCompositionValues(node: MorphNode, visited: Set<string>): readonly MorphNode[] {
  if (!Node.isObjectLiteralExpression(node)) {
    return [];
  }
  return node.getProperties().flatMap((property) => {
    if (Node.isPropertyAssignment(property)) {
      const initializer = property.getInitializer();
      return initializer === undefined ? [] : [literal(initializer) ?? initializer];
    }
    if (Node.isShorthandPropertyAssignment(property)) {
      return [property.getNameNode()];
    }
    return Node.isSpreadAssignment(property) ? stableSpreadValues(property.getExpression(), visited) : [];
  });
}

function directCompositionValues(node: MorphNode, visited = new Set<string>()): readonly MorphNode[] {
  const value = literal(node);
  if (value === undefined || visited.has(nodeIdentity(value))) {
    return [];
  }
  visited.add(nodeIdentity(value));
  return [...directArrayCompositionValues(value, visited), ...directObjectCompositionValues(value, visited)];
}

function typedCompositionCovers(file: SourceFile, contributionKeys: ReadonlySet<string>): boolean {
  return file.getVariableDeclarations().some((declaration) => {
    const raw = declaration.getInitializer();
    const value = literal(raw);
    const typed = declaration.getTypeNode() !== undefined || (raw !== undefined && Node.isSatisfiesExpression(raw));
    if (!(typed && (Node.isArrayLiteralExpression(value) || Node.isObjectLiteralExpression(value)))) {
      return false;
    }
    const covered = new Set(
      directCompositionValues(value)
        .map(referencedDeclarationIdentity)
        .filter((identity): identity is string => identity !== undefined),
    );
    return [...contributionKeys].every((identity) => covered.has(identity));
  });
}

type MutationReceiverIdentity = string;

function receiverRootAndPath(receiver: MorphNode): { root: MorphNode; path: readonly string[] } | undefined {
  const path: string[] = [];
  let current = receiver;
  while (Node.isPropertyAccessExpression(current) || Node.isElementAccessExpression(current)) {
    if (Node.isPropertyAccessExpression(current)) {
      path.unshift(current.getName());
    } else {
      const argument = current.getArgumentExpression();
      if (!(argument !== undefined && (Node.isStringLiteral(argument) || Node.isNumericLiteral(argument)))) {
        return;
      }
      path.unshift(argument.getText());
    }
    current = current.getExpression();
  }
  return { root: current, path };
}

function mutationReceiverIdentity(receiver: MorphNode): MutationReceiverIdentity | undefined {
  const rooted = receiverRootAndPath(receiver);
  if (rooted === undefined) {
    return;
  }
  const { root, path } = rooted;
  if (Node.isIdentifier(root)) {
    const authoredLocals = root
      .getSourceFile()
      .getVariableDeclarations()
      .filter((declaration) => declaration.getName() === root.getText());
    const initializer = authoredLocals.length === 1 ? literal(authoredLocals[0]?.getInitializer()) : undefined;
    if (Node.isObjectLiteralExpression(initializer)) {
      return `${nodeIdentity(initializer)}\0${path.join(".")}`;
    }
  }
  const identity = referencedDeclarationIdentity(root);
  return identity === undefined ? undefined : `${identity}\0${path.join(".")}`;
}

interface MutationSite {
  readonly identity: MutationReceiverIdentity;
  readonly left: MorphNode;
  readonly receiver: MorphNode;
}

function mutationSite(node: MorphNode): MutationSite | undefined {
  if (!Node.isBinaryExpression(node) || node.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
    return;
  }
  const left = node.getLeft();
  const receiver = Node.isPropertyAccessExpression(left) || Node.isElementAccessExpression(left) ? left.getExpression() : undefined;
  const identity = receiver === undefined ? undefined : mutationReceiverIdentity(receiver);
  return receiver === undefined || identity === undefined ? undefined : { identity, left, receiver };
}

function namespaceMutationHits(files: readonly SourceFile[]): Hit[] {
  const groups = new Map<MutationReceiverIdentity, { node: MorphNode; receiver: string; files: Set<string> }>();
  for (const file of files) {
    for (const assignment of file.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
      const site = mutationSite(assignment);
      if (site === undefined) {
        continue;
      }
      const current = groups.get(site.identity) ?? { node: site.left, receiver: site.receiver.getText(), files: new Set<string>() };
      current.files.add(file.getFilePath());
      groups.set(site.identity, current);
    }
  }
  return [...groups.values()].flatMap((group) => {
    if (group.files.size < MIN_MEMBERS) {
      return [];
    }
    const hit = hitOf(group.node, "registry-candidate:shared-namespace-mutation");
    hit.text = `${group.receiver} is mutated from ${group.files.size} modules: ${[...group.files].map(relPath).toSorted(compareText).join(", ")}`;
    return [hit];
  });
}

interface DispatchSet {
  readonly name: string;
  readonly node: MorphNode;
  readonly keys: ReadonlySet<string>;
  readonly numericKeys: ReadonlySet<string>;
  readonly axis: string | undefined;
}

function numericDispatchKey(node: MorphNode): string | undefined {
  if (Node.isNumericLiteral(node)) {
    return node.getText();
  }
  if (!Node.isStringLiteral(node)) {
    return;
  }
  const value = node.getLiteralText();
  return value.trim() !== "" && Number.isFinite(Number(value)) ? value : undefined;
}

function typeOrigin(node: MorphNode | undefined): string | undefined {
  if (node === undefined) {
    return;
  }
  const type = node.getType();
  const declaration = (type.getAliasSymbol() ?? type.getSymbol())?.getDeclarations()[0];
  return declaration === undefined ? undefined : nodeIdentity(declaration);
}

function recordKeyAxis(declaration: VariableDeclaration): string | undefined {
  const typeNode = declaration.getTypeNode();
  const record = [typeNode?.asKind(SyntaxKind.TypeReference), ...(typeNode?.getDescendantsOfKind(SyntaxKind.TypeReference) ?? [])].find(
    (reference) => reference?.getTypeName().getText() === "Record",
  );
  return typeOrigin(record?.getTypeArguments()[0]);
}

function recordDispatchSets(file: SourceFile): readonly DispatchSet[] {
  return file.getVariableDeclarations().flatMap((declaration) => {
    if (!RECORD_RE.test(declaration.getTypeNode()?.getText() ?? "")) {
      return [];
    }
    const value = literal(declaration.getInitializer());
    const fields = value === undefined ? undefined : namedObjectFields(value);
    const numericKeys = Node.isObjectLiteralExpression(value)
      ? new Set(
          value.getProperties().flatMap((property) => {
            if (!(Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property) || Node.isMethodDeclaration(property))) {
              return [];
            }
            const key = numericDispatchKey(property.getNameNode());
            return key === undefined ? [] : [key];
          }),
        )
      : new Set<string>();
    return fields !== undefined && fields.length >= 2
      ? [{ name: declaration.getName(), node: declaration, keys: new Set(fields), numericKeys, axis: recordKeyAxis(declaration) }]
      : [];
  });
}

function switchDispatchSets(file: SourceFile): readonly DispatchSet[] {
  return file.getDescendantsOfKind(SyntaxKind.SwitchStatement).flatMap((statement) => {
    const numericKeys = new Set<string>();
    const keys = statement.getClauses().flatMap((clause) => {
      if (!Node.isCaseClause(clause)) {
        return [];
      }
      const expression = clause.getExpression();
      if (Node.isStringLiteral(expression)) {
        const key = expression.getLiteralText();
        if (numericDispatchKey(expression) !== undefined) {
          numericKeys.add(key);
        }
        return [key];
      }
      if (Node.isNumericLiteral(expression)) {
        const key = numericDispatchKey(expression);
        numericKeys.add(key ?? expression.getText());
        return [key ?? expression.getText()];
      }
      return [];
    });
    return keys.length >= 2
      ? [
          {
            name: `switch(${statement.getExpression().getText()})`,
            node: statement,
            keys: new Set(keys),
            numericKeys,
            axis: typeOrigin(statement.getExpression()),
          },
        ]
      : [];
  });
}

function overlapsOnlyOnUnrelatedNumericAxes(left: DispatchSet, right: DispatchSet, common: readonly string[]): boolean {
  return (
    common.every((key) => left.numericKeys.has(key) && right.numericKeys.has(key)) &&
    left.axis !== undefined &&
    right.axis !== undefined &&
    left.axis !== right.axis
  );
}

function dispatchSets(files: readonly SourceFile[]): readonly DispatchSet[] {
  return files.flatMap((file) => [...recordDispatchSets(file), ...switchDispatchSets(file)]);
}

function driftedTwinHit(left: DispatchSet, right: DispatchSet): Hit | undefined {
  if (left.node.getSourceFile() === right.node.getSourceFile()) {
    return;
  }
  const common = [...left.keys].filter((key) => right.keys.has(key));
  const leftOnly = [...left.keys].filter((key) => !right.keys.has(key));
  const rightOnly = [...right.keys].filter((key) => !left.keys.has(key));
  if (common.length < 2 || (leftOnly.length === 0 && rightOnly.length === 0) || overlapsOnlyOnUnrelatedNumericAxes(left, right, common)) {
    return;
  }
  const hit = hitOf(left.node, "registry-candidate:drifted-twins");
  hit.text = `${left.name} vs ${right.name} (${relPath(right.node.getSourceFile().getFilePath())}): common={${common.toSorted(compareText).join(", ")}} left-only={${leftOnly.toSorted(compareText).join(", ")}} right-only={${rightOnly.toSorted(compareText).join(", ")}}`;
  return hit;
}

function driftedTwinHits(files: readonly SourceFile[]): Hit[] {
  const sets = dispatchSets(files);
  const hits: Hit[] = [];
  for (let leftIndex = 0; leftIndex < sets.length; leftIndex += 1) {
    const left = sets[leftIndex];
    if (left === undefined) {
      continue;
    }
    for (const right of sets.slice(leftIndex + 1)) {
      const hit = driftedTwinHit(left, right);
      if (hit !== undefined) {
        hits.push(hit);
      }
    }
  }
  return hits;
}

/** Four candidate classes from #1189. Findings are prompts for human review, never deletion verdicts. */
export function collectRegistryCandidates(project: SourceCorpus): Hit[] {
  const files = productionFiles(project);
  return [...contributionHits(files), ...valueSetHits(files), ...namespaceMutationHits(files), ...driftedTwinHits(files)];
}

export function cmdRegistryCandidates(project: SourceCorpus, arg: string, flags: Flags): void {
  const files = productionFiles(project);
  scanCorpus(project, { scope: files.map((file) => file.getFilePath()), label: "path:production-source" });
  const all = collectRegistryCandidates(project);
  const hits = arg === "" ? all : all.filter((hit) => hit.file.includes(arg) || hit.text.includes(arg));
  noteUnits("candidate-classes", CANDIDATE_CLASS_COUNT);
  narrate(
    flags,
    `registry-candidates is an INFORMATIONAL lens: every hit needs human triage. Classes: contribution-without-door, value-side-literal-set, shared-namespace-mutation, drifted-twins. Scanned ${files.length} production source files.`,
  );
  emit(hits, flags, `registry-candidates${arg === "" ? "" : ` ${arg}`}`);
}
