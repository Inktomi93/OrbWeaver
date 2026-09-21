// The contract-field liveness FENCES: model-projection seeds (schemas whose json-schema projection
// consumes every field) + registry-value and file-local-part expansion. Split from lib/fields.ts at
// P4 (the tooling-size cap).
import type { Node, SourceFile, VariableDeclaration } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import { CONTRACTS_SRC, calleeName, MODEL_PROJECTION_CALLEES, TOOL_ARGS_SCHEMA_KEY } from "./fields.ts";
import { isTestPath } from "./root.ts";

/** Every `const <name> = …` declared under `packages/contracts/src`, by name — the resolution table the
 *  fence walks (a projected schema names its parts as identifiers, and the parts are declared here). */
export function contractDeclarations(project: SourceCorpus): Map<string, VariableDeclaration> {
  const byName = new Map<string, VariableDeclaration>();
  for (const sf of project.getSourceFiles()) {
    if (!sf.getFilePath().includes(CONTRACTS_SRC)) {
      continue;
    }
    for (const decl of sf.getVariableDeclarations()) {
      byName.set(decl.getName(), decl);
    }
  }
  return byName;
}

/** The SEED names of the fence: a schema handed to `projectJsonSchema`/`z.toJSONSchema`, or registered as a
 *  tool's `argsSchema`. A registry hop (`projectJsonSchema(REFINERY_STAGE_PAYLOADS.score)`) contributes the
 *  registry's own name, expanded one level below. */
function modelProjectionSeeds(project: SourceCorpus): { readonly names: Set<string>; readonly registries: Set<string> } {
  const names = new Set<string>();
  const registries = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    if (isTestPath(sf.getFilePath())) {
      continue;
    }
    projectionCallSeeds(sf, names, registries);
    toolArgsSeeds(sf, names);
  }
  return { names, registries };
}

/** `projectJsonSchema(forgeDesignEnvelopeSchema)` seeds a NAME;
 *  `projectJsonSchema(REFINERY_STAGE_PAYLOADS.score)` seeds the REGISTRY, expanded one level by
 *  {@link modelProjectedSchemas}. */
function projectionCallSeeds(sf: SourceFile, names: Set<string>, registries: Set<string>): void {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (!MODEL_PROJECTION_CALLEES.has(calleeName(call.getExpression()))) {
      continue;
    }
    const arg = call.getArguments()[0];
    const direct = arg?.asKind(SyntaxKind.Identifier);
    const viaRegistry = arg?.asKind(SyntaxKind.PropertyAccessExpression)?.getExpression().asKind(SyntaxKind.Identifier);
    if (direct !== undefined) {
      names.add(direct.getText());
    } else if (viaRegistry !== undefined) {
      registries.add(viaRegistry.getText());
    }
  }
}

/** `argsSchema: updatePartyArgsSchema` — a tool registration hands the schema to the MODEL as its call
 *  grammar, so the model is the only producer of those keys. */
function toolArgsSeeds(sf: SourceFile, names: Set<string>): void {
  for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
    const registered = pa.getName() === TOOL_ARGS_SCHEMA_KEY ? pa.getInitializer()?.asKind(SyntaxKind.Identifier) : undefined;
    if (registered !== undefined) {
      names.add(registered.getText());
    }
  }
}

/** THE FENCE: schema consts whose key space is written by a MODEL, not by this repository — projected
 *  through `projectJsonSchema`/`z.toJSONSchema` or registered as a tool `argsSchema`, plus (one closure step,
 *  SAME FILE only) the schema consts those declarations are built from. A key index cannot tell "the model
 *  writes it" from "nothing writes it", so these are excluded and COUNTED rather than reported — 25 of the
 *  #210 triage's 70 hits were this class, and they are what buried the two real findings. The closure is
 *  file-local on purpose: a cross-file hop would fence shared primitives and blind the lens wholesale. */
export function modelProjectedSchemas(project: SourceCorpus): Set<string> {
  const declarations = contractDeclarations(project);
  const { names, registries } = modelProjectionSeeds(project);
  const fenced = new Set(names);
  for (const registry of registries) {
    addRegistryValues(declarations.get(registry), fenced);
  }
  for (const name of [...fenced]) {
    addFileLocalParts(declarations.get(name), declarations, fenced);
  }
  return fenced;
}

/** The expression under this repo's assertion wrappers — `{…} as const satisfies Record<…>` is the house
 *  registry spelling, and a bare `asKind(ObjectLiteralExpression)` on it silently returns undefined. */
function unwrapAssertions(expr: Node | undefined): Node | undefined {
  let current = expr;
  while (current !== undefined) {
    const inner =
      current.asKind(SyntaxKind.AsExpression) ?? current.asKind(SyntaxKind.SatisfiesExpression) ?? current.asKind(SyntaxKind.ParenthesizedExpression);
    if (inner === undefined) {
      return current;
    }
    current = inner.getExpression();
  }
  return current;
}

/** Every identifier-valued row of a registry const (`REFINERY_STAGE_PAYLOADS`) — one projected registry
 *  fences every schema it dispatches to. */
export function addRegistryValues(registry: VariableDeclaration | undefined, fenced: Set<string>): void {
  for (const prop of unwrapAssertions(registry?.getInitializer())?.asKind(SyntaxKind.ObjectLiteralExpression)?.getProperties() ?? []) {
    const value = prop.asKind(SyntaxKind.PropertyAssignment)?.getInitializer()?.asKind(SyntaxKind.Identifier);
    if (value !== undefined) {
      fenced.add(value.getText());
    }
  }
}

/** The ONE closure step: the schema consts a fenced declaration is BUILT FROM, in its own file only
 *  (`plotPatchSchema` inside `updateSceneArgsSchema`). File-local by design — a cross-file hop would fence
 *  shared primitives and blind the lens far past the projected surface. */
export function addFileLocalParts(decl: VariableDeclaration | undefined, declarations: ReadonlyMap<string, VariableDeclaration>, fenced: Set<string>): void {
  if (decl === undefined) {
    return;
  }
  const file = decl.getSourceFile().getFilePath();
  for (const ident of decl.getInitializer()?.getDescendantsOfKind(SyntaxKind.Identifier) ?? []) {
    if (declarations.get(ident.getText())?.getSourceFile().getFilePath() === file) {
      fenced.add(ident.getText());
    }
  }
}
