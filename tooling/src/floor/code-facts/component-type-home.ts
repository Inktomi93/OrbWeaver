// Component API origins in a delivered native browser view; copy policy and population admission remain separate.
import type { FunctionDeclaration, Identifier, Node as MorphNode, ParameterDeclaration, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { worldOf } from "../compiler/project-worlds.ts";
import { canonicalCompilerPath, descendantsOfKind, semanticWorkspaceOf } from "../compiler/ts-workspace.ts";
import type { SemanticSourceView } from "../compiler/ts-workspace-contract.ts";
import { readFunctionReturnPaths } from "./call-returns.ts";
import type {
  ComponentLowerDataEvidence,
  ComponentRenderEvidence,
  ComponentTypeHomeInput,
  ComponentTypeHomeResult,
  ComponentTypeHomeView,
} from "./component-type-home-contract.ts";
import { ComponentTypeHomeComparisonError } from "./component-type-home-contract.ts";
import { referenceResolutionServices } from "./reference-fact.ts";
import { resolveCallableDeclaration } from "./reference-fact-call.ts";
import { declarationBindingKeys, inventoryDeclarationKey, inventoryExports } from "./semantic-inventory-reader.ts";
import { agreeingCount, createShapeFieldAgreement, indexByField, sharedFieldCounts } from "./shape-copy.ts";
import type { ShapeCopyComparison, ShapeCopySource } from "./shape-copy-contract.ts";
import { exportedShapeDeclarations } from "./shape-declaration.ts";
import { directDerivationTargetKeys, readNativeGenericArgumentContribution } from "./shape-derivation.ts";
import { ownDataFieldNames, resolvedShapeProperties } from "./shape-fields.ts";
import { resolveTypeIdentityChain } from "./type-member-origin.ts";

/** Capture the delivered native owner's program/source epoch without opening another compiler world. */
export function captureComponentTypeHomeView(view: SemanticSourceView): ComponentTypeHomeView {
  return { ...view, nativeProgram: view.sourceFile.getProject().getProgram().compilerObject, nativeSource: view.sourceFile.compilerNode };
}

function unavailable(reason: string, component: ComponentRenderEvidence | null = null): ComponentTypeHomeResult {
  return { kind: "unqualified", reason, component, lowerData: { kind: "unqualified", reason, comparisons: [] } };
}

function contextRefusal(input: ComponentTypeHomeInput): string | undefined {
  const { declaration, view, path } = input;
  if (declaration.wasForgotten() || view.sourceFile.wasForgotten()) {
    return "Component ownership received a forgotten declaration or source view.";
  }
  const source = declaration.getSourceFile();
  const workspace = semanticWorkspaceOf(source.getProject());
  if (workspace === undefined || workspace.program(view.program.descriptor.config) !== view.program) {
    return "Component ownership requires an existing admitted native workspace view.";
  }
  const canonicalSource = canonicalCompilerPath(workspace.root, source.getFilePath());
  if (
    source !== view.sourceFile ||
    view.program.sourceFile(path) !== source ||
    canonicalCompilerPath(workspace.root, path) !== canonicalSource ||
    canonicalSource !== view.canonicalPath
  ) {
    return "Component ownership source identity differs from its native browser view.";
  }
  const program = source.getProject().getProgram().compilerObject;
  if (program !== view.nativeProgram || source.compilerNode !== view.nativeSource || program.getSourceFile(source.getFilePath()) !== source.compilerNode) {
    return "Component ownership source belongs to a stale or foreign native program epoch.";
  }
  const canonicalPath = canonicalSource.slice(workspace.root.length + 1);
  return worldOf(canonicalPath) !== "browser" || !program.getSourceFiles().some((file) => file.fileName.endsWith("/lib.dom.d.ts"))
    ? "Component ownership requires the native DOM world; Node React fallback is not evidence."
    : undefined;
}

interface ComponentTypeGraph {
  readonly edges: ReadonlyMap<string, readonly string[]>;
  readonly opaque: ReadonlySet<string>;
}

function supportedGenericReference(identifier: Identifier, input: ComponentTypeHomeInput): boolean {
  const ancestors = identifier.getAncestors();
  for (const reference of ancestors.filter(Node.isTypeReference)) {
    const argument = reference.getTypeArguments().find((type) => ancestors.includes(type));
    if (argument === undefined) {
      continue;
    }
    const contribution = readNativeGenericArgumentContribution({
      reference,
      argument,
      binding: identifier,
      program: input.view.nativeProgram,
      source: input.view.nativeSource,
    });
    if (contribution.kind !== "resolved" || !contribution.value.contributes) {
      return false;
    }
  }
  return true;
}

function localTypeGraph(input: ComponentTypeHomeInput): ComponentTypeGraph {
  const source = input.declaration.getSourceFile();
  const types = [...source.getInterfaces(), ...source.getTypeAliases()];
  const keys = new Set(types.map(inventoryDeclarationKey));
  const edges = new Map(types.map((type) => [inventoryDeclarationKey(type), [...directDerivationTargetKeys(type)].filter((key) => keys.has(key))]));
  const opaque = new Set<string>();
  for (const identifier of descendantsOfKind(source, SyntaxKind.Identifier)) {
    const owner = identifier.getFirstAncestor((node) => Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node));
    const targets = owner === undefined ? undefined : edges.get(inventoryDeclarationKey(owner));
    if (targets !== undefined) {
      const origins = declarationBindingKeys(identifier).filter((key) => keys.has(key));
      if (supportedGenericReference(identifier, input)) {
        targets.push(...origins);
      } else {
        for (const origin of origins) {
          opaque.add(origin);
        }
      }
    }
  }
  return { edges, opaque };
}

function exportedCallable(exported: FunctionDeclaration | VariableDeclaration): MorphNode | undefined {
  const name = exported.getNameNode();
  if (name === undefined) {
    return exported;
  }
  const fact = resolveCallableDeclaration(name);
  return fact.kind === "resolved" ? fact.value.declaration : undefined;
}

function renderParameter(callable: MorphNode): ParameterDeclaration | undefined {
  return Node.isFunctionDeclaration(callable) || Node.isArrowFunction(callable) || Node.isFunctionExpression(callable)
    ? callable.getParameters()[0]
    : undefined;
}

function renderReturns(callable: MorphNode): readonly MorphNode[] | undefined {
  const returned = readFunctionReturnPaths(callable);
  if (returned.kind !== "resolved") {
    return;
  }
  const expressions = returned.value.map(referenceResolutionServices.unwrapExpression);
  const render = (value: MorphNode): boolean => Node.isJsxElement(value) || Node.isJsxSelfClosingElement(value) || Node.isJsxFragment(value);
  return expressions.every((value) => render(value) || value.getKind() === SyntaxKind.NullKeyword) && expressions.some(render) ? returned.value : undefined;
}

function supportingTypeKeys(parameter: ParameterDeclaration, graph: ReadonlyMap<string, readonly string[]>): ReadonlySet<string> {
  const identity = resolveTypeIdentityChain(parameter);
  const pending = identity.kind === "resolved" ? identity.value.flatMap((origin) => origin.declarations.map(inventoryDeclarationKey)) : [];
  const visited = new Set<string>();
  for (const key of pending) {
    if (!visited.has(key)) {
      visited.add(key);
      pending.push(...(graph.get(key) ?? []));
    }
  }
  return visited;
}

interface ComponentOriginRead {
  readonly component: ComponentRenderEvidence | undefined;
  readonly reason: string;
}

function componentEvidence(input: ComponentTypeHomeInput): ComponentOriginRead {
  const source = input.declaration.getSourceFile();
  const types = [...source.getInterfaces(), ...source.getTypeAliases()];
  const graph = localTypeGraph(input);
  const target = inventoryDeclarationKey(input.declaration);
  let evidence: ComponentRenderEvidence | undefined;
  for (const exported of new Set([...inventoryExports(source).values()].flat())) {
    if (exported.getSourceFile() !== source || !(Node.isFunctionDeclaration(exported) || Node.isVariableDeclaration(exported))) {
      continue;
    }
    const callable = exportedCallable(exported);
    const parameter = callable === undefined ? undefined : renderParameter(callable);
    const returns = callable === undefined ? undefined : renderReturns(callable);
    if (callable === undefined || callable.getSourceFile() !== source || parameter === undefined || returns === undefined) {
      continue;
    }
    const visited = supportingTypeKeys(parameter, graph.edges);
    if (visited.has(target)) {
      evidence = { callable, parameter, returns, supportingDeclarations: types.filter((type) => visited.has(inventoryDeclarationKey(type))) };
      break;
    }
  }
  return {
    component: evidence,
    reason: graph.opaque.has(target)
      ? "Supporting API contribution through an opaque generic is unqualified."
      : "No exported local render callable parameter/supporting graph proves this API.",
  };
}

function lowerData(input: ComponentTypeHomeInput): ComponentLowerDataEvidence {
  const { declaration } = input;
  const body = Node.isTypeAliasDeclaration(declaration) ? declaration.getTypeNode() : declaration;
  const fields = body !== undefined && (Node.isInterfaceDeclaration(body) || Node.isTypeLiteral(body)) ? ownDataFieldNames(body) : new Set<string>();
  const origins = input.lowerDeclarations.filter((lower) => directDerivationTargetKeys(declaration).has(inventoryDeclarationKey(lower)));
  if (fields.size === 0 && origins.length > 0) {
    return { kind: "derived", origins };
  }
  const sources: ShapeCopySource[] = input.lowerDeclarations.flatMap((decl) => {
    const properties = resolvedShapeProperties(decl, "copy");
    return properties === undefined
      ? []
      : [{ name: decl.getName(), file: decl.getSourceFile().getFilePath(), decl, fields: new Set(properties.map((property) => property.getName())) }];
  });
  const agree = createShapeFieldAgreement(declaration.getProject().getTypeChecker(), (kind): never => {
    throw new ComponentTypeHomeComparisonError(`Component lower-data comparison refused: ${kind}`);
  });
  const comparisons: ShapeCopyComparison[] = [...sharedFieldCounts(fields, indexByField(sources))].map(([contract, shared]) => ({
    contract,
    shared,
    agreeing: agreeingCount({ decl: declaration, fields }, contract, agree),
    exact: shared === fields.size && shared === contract.fields.size,
  }));
  return { kind: "unqualified", reason: "Field nonmatches or an incomplete lower-owner set do not prove lower-data ownership.", comparisons };
}

/** Prove actual exported render-callable support, never ownership from a name, path or structural type fit. */
export function componentTypeHome(input: ComponentTypeHomeInput): ComponentTypeHomeResult {
  const refusal = contextRefusal(input);
  if (refusal !== undefined) {
    return { kind: "refused", reason: refusal };
  }
  if (!exportedShapeDeclarations(input.declaration.getSourceFile()).some(([, declaration]) => declaration === input.declaration)) {
    return unavailable("The candidate is not a local exported type origin.");
  }
  if (input.lowerDeclarations.some((declaration) => declaration.wasForgotten() || declaration.getProject() !== input.declaration.getProject())) {
    return { kind: "refused", reason: "Lower-owner evidence belongs to a stale or foreign compiler world." };
  }
  const origin = componentEvidence(input);
  const component = origin.component;
  if (component === undefined) {
    return unavailable(origin.reason);
  }
  let data: ComponentLowerDataEvidence;
  try {
    data = lowerData(input);
  } catch (error) {
    if (error instanceof ComponentTypeHomeComparisonError) {
      return { kind: "refused", reason: error.message };
    }
    throw error;
  }
  if (data.kind === "unqualified" && data.comparisons.some((comparison) => comparison.agreeing > 0)) {
    return {
      kind: "unqualified",
      reason: "Hand-written fields overlap lower-owned data; component use does not establish derivation.",
      component,
      lowerData: data,
    };
  }
  return { kind: "owned", component, lowerData: data };
}
