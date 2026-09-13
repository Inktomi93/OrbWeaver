// registry-candidates: informational discovery lens for convention-maintained open sets (#1189).
import type { Node as MorphNode, Project, SourceFile, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { resolveLexicalValueDeclaration, resolveModuleMemberOrigin, resolveStableExpression } from "../../verify/lib/reference-fact.ts";
import type { Flags, Hit } from "../contract/types.ts";
import { emit, hitOf } from "../lib/emit.ts";
import { noteUnits, scanCorpus } from "../lib/ledger.ts";
import { isTestPath } from "../lib/root.ts";
import { relPath } from "./swallowed.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast registry-candidates");

const MIN_MEMBERS = 3;
const CANDIDATE_CLASS_COUNT = 4;
const RECORD_RE = /\bRecord\s*</u;
const compareText = (left: string, right: string): number => left.localeCompare(right);

function productionFiles(project: Project): readonly SourceFile[] {
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
    fields.push(property.getName());
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

type MutationReceiverIdentity = object | string;

function mutationReceiverIdentity(receiver: MorphNode): MutationReceiverIdentity | undefined {
  if (Node.isIdentifier(receiver)) {
    const authoredLocals = receiver
      .getSourceFile()
      .getVariableDeclarations()
      .filter((declaration) => declaration.getName() === receiver.getText());
    const initializer = authoredLocals.length === 1 ? literal(authoredLocals[0]?.getInitializer()) : undefined;
    if (Node.isObjectLiteralExpression(initializer)) {
      return initializer.compilerNode;
    }
  }
  const stable = resolveStableExpression(receiver);
  if (stable.kind === "resolved") {
    return stable.value.compilerNode;
  }
  const moduleOrigin = resolveModuleMemberOrigin(receiver);
  if (moduleOrigin.kind === "resolved") {
    const canonical = moduleOrigin.value.canonical;
    return canonical.kind === "project" ? canonical.declaration.compilerNode : `external\0${canonical.moduleSpecifier}\0${canonical.exportedName}`;
  }
  const lexical = resolveLexicalValueDeclaration(receiver);
  return lexical.kind === "resolved" ? lexical.value.compilerNode : undefined;
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
}

function recordDispatchSets(file: SourceFile): readonly DispatchSet[] {
  return file.getVariableDeclarations().flatMap((declaration) => {
    if (!RECORD_RE.test(declaration.getTypeNode()?.getText() ?? "")) {
      return [];
    }
    const value = literal(declaration.getInitializer());
    const fields = value === undefined ? undefined : namedObjectFields(value);
    return fields !== undefined && fields.length >= 2 ? [{ name: declaration.getName(), node: declaration, keys: new Set(fields) }] : [];
  });
}

function switchDispatchSets(file: SourceFile): readonly DispatchSet[] {
  return file.getDescendantsOfKind(SyntaxKind.SwitchStatement).flatMap((statement) => {
    const keys = statement.getClauses().flatMap((clause) => {
      if (!Node.isCaseClause(clause)) {
        return [];
      }
      const expression = clause.getExpression();
      return Node.isStringLiteral(expression) ? [expression.getLiteralText()] : [];
    });
    return keys.length >= 2 ? [{ name: `switch(${statement.getExpression().getText()})`, node: statement, keys: new Set(keys) }] : [];
  });
}

function dispatchSets(files: readonly SourceFile[]): readonly DispatchSet[] {
  return files.flatMap((file) => [...recordDispatchSets(file), ...switchDispatchSets(file)]);
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
      if (left.node.getSourceFile() === right.node.getSourceFile()) {
        continue;
      }
      const common = [...left.keys].filter((key) => right.keys.has(key));
      const leftOnly = [...left.keys].filter((key) => !right.keys.has(key));
      const rightOnly = [...right.keys].filter((key) => !left.keys.has(key));
      if (common.length < 2 || (leftOnly.length === 0 && rightOnly.length === 0)) {
        continue;
      }
      const hit = hitOf(left.node, "registry-candidate:drifted-twins");
      hit.text = `${left.name} vs ${right.name} (${relPath(right.node.getSourceFile().getFilePath())}): common={${common.toSorted(compareText).join(", ")}} left-only={${leftOnly.toSorted(compareText).join(", ")}} right-only={${rightOnly.toSorted(compareText).join(", ")}}`;
      hits.push(hit);
    }
  }
  return hits;
}

/** Four candidate classes from #1189. Findings are prompts for human review, never deletion verdicts. */
export function collectRegistryCandidates(project: Project): Hit[] {
  const files = productionFiles(project);
  return [...contributionHits(files), ...valueSetHits(files), ...namespaceMutationHits(files), ...driftedTwinHits(files)];
}

export function cmdRegistryCandidates(project: Project, arg: string, flags: Flags): void {
  const files = productionFiles(project);
  scanCorpus(project, { scope: files.map((file) => file.getFilePath()), label: "path:production-source" });
  const all = collectRegistryCandidates(project);
  const hits = arg === "" ? all : all.filter((hit) => hit.file.includes(arg) || hit.text.includes(arg));
  noteUnits("candidate-classes", CANDIDATE_CLASS_COUNT);
  print(
    `registry-candidates is an INFORMATIONAL lens: every hit needs human triage. Classes: contribution-without-door, value-side-literal-set, shared-namespace-mutation, drifted-twins. Scanned ${files.length} production source files.`,
  );
  emit(hits, flags, `registry-candidates${arg === "" ? "" : ` ${arg}`}`);
}
