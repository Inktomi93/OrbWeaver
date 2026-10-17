// Build the whole-project read context (contract/project-context.ts) over the shared ts-morph workspace,
// and the repo-relative path helper its callers need. Split out of the retired `lib/pass.ts` at #2176
// Phase F (2026-09-14): the legacy dispatcher died; these two survived it because they describe the
// WORKSPACE, not the descriptor runtime.

import { posix } from "node:path";
import {
  canonicalSemanticPrograms,
  createSemanticWorkspace,
  getWorkspace,
  hasRegisteredSemanticProgram,
  registeredSemanticSourceView,
  semanticProgramMatchesDescriptor,
  semanticWorkspaceOf,
} from "@orb/tooling/floor/compiler/ts-workspace";
import type { AsExpression, Node, SourceFile, TypeNode } from "ts-morph";
import { Node as MorphNode } from "ts-morph";
import type { TypeRelation } from "../../floor/code-facts/assignability.ts";
import type { SchemaDataProjection } from "../../floor/code-facts/schema-projection-contract.ts";
import { schemaDataProjectionSchema } from "../../floor/code-facts/schema-projection-contract.ts";
import { createSemanticInventory } from "../../floor/code-facts/semantic-inventory.ts";
import type { InventoryFamily, InventoryInvocationPlan, SemanticInventoryOptions } from "../../floor/code-facts/semantic-inventory-contract.ts";
import {
  invocationNeedsValueSourceCatalog,
  invocationPlanSchema,
  invocationQueryKey,
  SemanticInventoryError,
} from "../../floor/code-facts/semantic-inventory-contract.ts";
import { canonicalInventoryPath } from "../../floor/code-facts/semantic-inventory-inputs.ts";
import { bindShapeInventory } from "../../floor/code-facts/shape-inventory-scope.ts";
import { hasTypeObservationValueDemand } from "../../floor/code-facts/type-observations-contract.ts";
import type { SemanticSourceView, SemanticWorkspace } from "../../floor/compiler/ts-workspace-contract.ts";
import type { NativeTypeContext, NativeTypeFactReader, NativeTypeFacts, NativeTypeRequest, ProjectContext } from "../contract/project-context.ts";

/** repo-relative posix path for an absolute path under `root`. */
export function repoRel(root: string, absPath: string): string {
  return posix.relative(root.replaceAll("\\", "/"), absPath.replaceAll("\\", "/"));
}

/** The shared workspace, read once, with its resolved fileset. */
export function projectCtx(root: string): ProjectContext {
  const project = getWorkspace({ root });
  let native: SemanticWorkspace | undefined;
  const nativeWorkspace = (): SemanticWorkspace => {
    native ??= createSemanticWorkspace({ root });
    return native;
  };
  return {
    root,
    project,
    files: project.getSourceFiles(),
    nativeTypeFacts: () => nativeTypeFactSession((queries) => nativeTypeReader(root, nativeWorkspace(), queries)),
    nativeSourceView: (path): SemanticSourceView | undefined => {
      const source = nativeWorkspace().sourceCorpus().getSourceFile(path);
      return source === undefined ? undefined : registeredSemanticSourceView(source);
    },
  };
}

function requireModuleTargetDoors(nodes: readonly Node[]): void {
  if (nodes.some((node) => !(MorphNode.isImportDeclaration(node) || (MorphNode.isExportDeclaration(node) && node.getModuleSpecifier() !== undefined)))) {
    throw new Error("native module target requires an authored import or export door");
  }
}

/** One request ledger is shared by production and the existing isolated proof adapter. */
export function nativeTypeFactSession(acquire: (queries: readonly NativeTypeRequest[]) => NativeTypeFactReader): NativeTypeFacts {
  const requests = new Map<string, NativeTypeRequest[]>();
  const invocationAdmissions = new Map<string, ReadonlyMap<string, ReadonlySet<Node>>>();
  const moduleImporterEpochs = new Map<string, Map<SourceFile, SourceFile["compilerNode"]>>();
  let reader: NativeTypeFactReader | undefined;
  let failure: { readonly error: unknown } | undefined;
  let sealed = false;
  let open = true;
  const assertOpen = (): void => {
    if (!open) {
      throw new Error("native type fact context is disposed");
    }
  };
  const assertReadable = (): void => {
    assertOpen();
    if (!sealed) {
      throw new Error("native type requests must be sealed before reading");
    }
  };
  const planKey = (plan: InventoryInvocationPlan): string => invocationQueryKey({ ...plan, node: { file: "", start: 0, end: 0, kind: 0 } });
  const invocationNodes = (owner: string, plan: InventoryInvocationPlan | undefined): ReadonlySet<Node> => {
    if (plan === undefined) {
      return new Set();
    }
    const existing = invocationAdmissions.get(owner);
    if (existing !== undefined) {
      return existing.get(planKey(plan)) ?? new Set();
    }
    const admitted = new Map<string, Set<Node>>();
    let key: string | undefined;
    for (const query of (requests.get(owner) ?? []).filter((request) => request.kind === "invocation-evidence")) {
      // Preserve registered-before-caller refusal order; publish only after every registration validates.
      const registered = planKey(query.plan);
      key ??= planKey(plan);
      const nodes = admitted.get(registered) ?? new Set<Node>();
      for (const node of query.nodes) {
        nodes.add(node);
      }
      admitted.set(registered, nodes);
    }
    if (key === undefined) {
      return new Set();
    }
    invocationAdmissions.set(owner, admitted);
    return admitted.get(key) ?? new Set();
  };
  const assertModuleImporter = (owner: string, importer: SourceFile | undefined): void => {
    if (importer === undefined) {
      return;
    }
    const epoch = moduleImporterEpochs.get(owner)?.get(importer);
    if (epoch === undefined) {
      throw new Error("native contextual module importer was not registered by this owner");
    }
    if (importer.wasForgotten() || importer.compilerNode !== epoch) {
      throw new Error("native contextual module importer epoch is stale");
    }
  };
  const registerModuleImporter = (owner: string, importer: SourceFile | undefined): void => {
    if (importer === undefined) {
      return;
    }
    if (importer.wasForgotten() || !MorphNode.isSourceFile(importer)) {
      throw new Error("native module importer must be a current source file");
    }
    const epochs = moduleImporterEpochs.get(owner) ?? new Map<SourceFile, SourceFile["compilerNode"]>();
    const previous = epochs.get(importer);
    if (previous !== undefined && previous !== importer.compilerNode) {
      throw new Error("native module importer epoch changed during registration");
    }
    epochs.set(importer, importer.compilerNode);
    moduleImporterEpochs.set(owner, epochs);
  };
  const selected = (
    owner: string,
    kind: NativeTypeRequest["kind"],
    nodes: readonly Node[],
    projection?: {
      readonly name?: string;
      readonly importer?: SourceFile;
      readonly mode?: import("../../floor/code-facts/drizzle-evidence-contract.ts").DrizzleEvidenceMode;
      readonly plan?: import("../../floor/code-facts/semantic-inventory-contract.ts").InventoryInvocationPlan;
    },
  ): NativeTypeFactReader => {
    assertReadable();
    if (kind === "references" && !(requests.get(owner) ?? []).some((query) => query.kind === "references" && query.importer === projection?.importer)) {
      throw new Error("native reference importer was not registered by this owner");
    }
    const admitted =
      kind === "invocation-evidence"
        ? invocationNodes(owner, projection?.plan)
        : new Set<Node>(
            (requests.get(owner) ?? [])
              .filter(
                (query) =>
                  query.kind === kind &&
                  (query.kind !== "references" || query.importer === projection?.importer) &&
                  (query.kind !== "drizzle-identities" || query.mode === projection?.mode) &&
                  (query.kind !== "export-declarations" || query.name === projection?.name) &&
                  (query.kind !== "module-targets" || query.importer === projection?.importer),
              )
              .flatMap((query) => [...query.nodes]),
          );
    if (nodes.some((node) => !admitted.has(node))) {
      throw new Error("native type query was not registered by this owner");
    }
    if (kind === "module-targets") {
      assertModuleImporter(owner, projection?.importer);
    }
    if (failure !== undefined) {
      throw failure.error;
    }
    try {
      reader ??= acquire([...requests.values()].flat());
      return reader;
    } catch (error) {
      failure = { error };
      throw error;
    }
  };
  const requireProjection = (owner: string, sources: readonly import("ts-morph").SourceFile[], projection: SchemaDataProjection): void => {
    for (const flag of ["typeVocabulary", "builderConfig"] as const) {
      if (projection[flag] !== true) {
        continue;
      }
      const projected = new Set(
        (requests.get(owner) ?? []).filter((query) => query.kind === "schema-data" && query.projection?.[flag] === true).flatMap((query) => [...query.nodes]),
      );
      if (sources.some((source) => !projected.has(source))) {
        throw new Error(
          flag === "typeVocabulary"
            ? "native schema vocabulary was not registered by this owner"
            : "native schema builder configuration was not registered by this owner",
        );
      }
    }
  };
  return {
    request: (owner, query): void => {
      assertOpen();
      if (sealed) {
        throw new Error("native type request registration is sealed");
      }
      if (hasNativeRequest(query)) {
        const rows = requests.get(owner) ?? [];
        switch (query.kind) {
          case "references":
            requireReferenceNodes(query);
            rows.push({ kind: query.kind, importer: query.importer, nodes: [...query.nodes] });
            break;
          case "schema-data":
            rows.push({
              kind: query.kind,
              nodes: [...query.nodes],
              ...(query.projection === undefined ? {} : { projection: schemaDataProjectionSchema.parse(query.projection) }),
            });
            break;
          case "schema-identities":
            rows.push({ kind: query.kind, nodes: [...query.nodes] });
            break;
          case "drizzle-identities":
            rows.push({ kind: query.kind, nodes: [...query.nodes], mode: query.mode });
            break;
          case "export-declarations":
            rows.push({ kind: query.kind, nodes: [...query.nodes], name: query.name });
            break;
          case "invocation-evidence":
            rows.push({ kind: query.kind, nodes: [...query.nodes], plan: invocationPlanSchema.parse(query.plan) });
            break;
          case "cast-relations":
            rows.push({ kind: query.kind, nodes: [...query.nodes] });
            break;
          case "id-brands":
            rows.push({ kind: query.kind, nodes: [...query.nodes] });
            break;
          case "runtime-exports":
            rows.push({ kind: query.kind, nodes: [...query.nodes] });
            break;
          case "declaration-outputs":
            rows.push({ kind: query.kind, nodes: [...query.nodes] });
            break;
          case "type-member-origins":
            rows.push({ kind: query.kind, nodes: [...query.nodes] });
            break;
          case "callable-declarations":
            rows.push({ kind: query.kind, nodes: [...query.nodes] });
            break;
          case "computed-names":
          case "global-origins":
          case "global-bindings":
            rows.push({ kind: query.kind, nodes: [...query.nodes] });
            break;
          case "module-targets":
            requireModuleTargetDoors(query.nodes);
            registerModuleImporter(owner, query.importer);
            rows.push(moduleTargetRequest(query));
            break;
          case "shape-relations":
            rows.push({ kind: query.kind, nodes: [...query.nodes], prepare: query.prepare });
            break;
          default:
            assertNeverRequest(query);
        }
        requests.set(owner, rows);
      }
    },
    seal: (owners): void => {
      assertOpen();
      if (sealed) {
        throw new Error("native type request registration is already sealed");
      }
      for (const owner of requests.keys()) {
        if (!owners.has(owner)) {
          requests.delete(owner);
          moduleImporterEpochs.delete(owner);
        }
      }
      sealed = true;
    },
    references: (owner, nodes, importer): ReturnType<NativeTypeContext["references"]> =>
      selected(owner, "references", nodes, { importer }).references(nodes, importer),
    exportDeclarations: (owner, sources, name): ReturnType<NativeTypeContext["exportDeclarations"]> => {
      if (sources.length === 0) {
        assertReadable();
        return new Map();
      }
      return selected(owner, "export-declarations", sources, { name }).exportDeclarations(sources, name);
    },
    moduleTargets: (owner, nodes, importer): ReturnType<NativeTypeContext["moduleTargets"]> => {
      if (nodes.length === 0) {
        assertReadable();
        return new Map();
      }
      return selected(owner, "module-targets", nodes, importer === undefined ? undefined : { importer }).moduleTargets(nodes, importer);
    },
    schemaData: (owner, sources, projection = {}): ReturnType<NativeTypeContext["schemaData"]> => {
      if (sources.length === 0) {
        assertReadable();
        throw new Error("native full schema data has no admitted source owner");
      }
      const registered = (requests.get(owner) ?? []).filter((query) => query.kind === "schema-data").flatMap((query) => [...query.nodes]);
      if (new Set(registered).size !== new Set(sources).size) {
        throw new Error("native full schema data roster is incomplete");
      }
      requireProjection(owner, sources, projection);
      return selected(owner, "schema-data", sources).schemaData(sources, projection);
    },
    schemaIdentity: (owner, sources): ReturnType<NativeTypeContext["schemaIdentity"]> => {
      if (sources.length === 0) {
        assertReadable();
        throw new Error("native schema identity has no admitted source owner");
      }
      const registered = (requests.get(owner) ?? []).filter((query) => query.kind === "schema-identities").flatMap((query) => [...query.nodes]);
      if (new Set(registered).size !== new Set(sources).size) {
        throw new Error("native schema identity roster is incomplete");
      }
      return selected(owner, "schema-identities", sources).schemaIdentity(sources);
    },
    drizzleEvidence: (owner, nodes, mode): ReturnType<NativeTypeContext["drizzleEvidence"]> => {
      if (nodes.length === 0) {
        assertReadable();
        return new Map();
      }
      return selected(owner, "drizzle-identities", nodes, { mode }).drizzleEvidence(nodes, mode);
    },
    invocationEvidence: (owner, nodes, plan): ReturnType<NativeTypeContext["invocationEvidence"]> => {
      if (nodes.length === 0) {
        assertReadable();
        return new Map();
      }
      return selected(owner, "invocation-evidence", nodes, { plan }).invocationEvidence(nodes, plan);
    },
    castRelations: (owner, nodes): ReturnType<NativeTypeContext["castRelations"]> => {
      if (nodes.length === 0) {
        assertReadable();
        return new Map();
      }
      return selected(owner, "cast-relations", nodes).castRelations(nodes);
    },
    declarationOutputs: (owner, nodes): ReturnType<NativeTypeContext["declarationOutputs"]> => {
      if (nodes.length === 0) {
        assertReadable();
        return new Map();
      }
      return selected(owner, "declaration-outputs", nodes).declarationOutputs(nodes);
    },
    callMemberOrigins: (owner, nodes): ReturnType<NativeTypeContext["callMemberOrigins"]> => {
      if (nodes.length === 0) {
        assertReadable();
        return new Map();
      }
      return selected(owner, "type-member-origins", nodes).callMemberOrigins(nodes);
    },
    callableDeclarations: (owner, nodes): ReturnType<NativeTypeContext["callableDeclarations"]> => {
      if (nodes.length === 0) {
        assertReadable();
        return new Map();
      }
      return selected(owner, "callable-declarations", nodes).callableDeclarations(nodes);
    },
    globalOrigins: (owner, nodes): ReturnType<NativeTypeContext["globalOrigins"]> => {
      if (nodes.length === 0) {
        assertReadable();
        return new Map();
      }
      return selected(owner, "global-origins", nodes).globalOrigins(nodes);
    },
    globalBindings: (owner, nodes): ReturnType<NativeTypeContext["globalBindings"]> => {
      if (nodes.length === 0) {
        assertReadable();
        return new Map();
      }
      return selected(owner, "global-bindings", nodes).globalBindings(nodes);
    },
    computedNames: (owner, nodes): ReturnType<NativeTypeContext["computedNames"]> => {
      if (nodes.length === 0) {
        assertReadable();
        return new Map();
      }
      return selected(owner, "computed-names", nodes).computedNames(nodes);
    },
    idBrands: (owner, nodes): ReturnType<NativeTypeContext["idBrands"]> => {
      if (nodes.length === 0) {
        assertReadable();
        return new Map();
      }
      return selected(owner, "id-brands", nodes).idBrands(nodes);
    },
    prepareShapes: (owner, sources): void => {
      if (sources.length === 0) {
        assertReadable();
        return;
      }
      selected(owner, "shape-relations", sources).prepareShapes(sources);
    },
    runtimeExports: (owner, nodes): ReturnType<NativeTypeContext["runtimeExports"]> => {
      if (nodes.length === 0) {
        assertReadable();
        return new Map();
      }
      return selected(owner, "runtime-exports", nodes).runtimeExports(nodes);
    },
    [Symbol.dispose]: (): void => {
      if (open) {
        open = false;
        invocationAdmissions.clear();
        moduleImporterEpochs.clear();
        reader?.[Symbol.dispose]();
        requests.clear();
      }
    },
  };
}

function recordsEmptyIntent(query: NativeTypeRequest): boolean {
  return query.kind === "schema-data" || query.kind === "schema-identities" || query.kind === "references";
}
function requireReferenceNodes(query: Extract<NativeTypeRequest, { readonly kind: "references" }>): void {
  if (!MorphNode.isSourceFile(query.importer) || query.nodes.some((node) => !MorphNode.isReferenceFindable(node))) {
    throw new Error("native reference demand requires an importing source and exact reference-findable query nodes");
  }
}
function nativeImporterOwner(root: string, workspace: SemanticWorkspace, importer: import("ts-morph").SourceFile): string {
  if (importer.wasForgotten()) {
    throw new SemanticInventoryError("native importing source was forgotten");
  }
  const registeredWorkspace = semanticWorkspaceOf(importer.getProject());
  const canonicalRoot = canonicalInventoryPath(root);
  const file = canonicalInventoryPath(importer.getFilePath());
  const path = repoRel(canonicalRoot, file);
  if (!hasRegisteredSemanticProgram(importer.getProject())) {
    const selected = workspace.primaryOwner(file);
    if (selected === undefined || !selected.descriptor.files.includes(path)) {
      throw new SemanticInventoryError("native importing source has no admitted primary root owner");
    }
    return selected.descriptor.id;
  }
  const view = registeredSemanticSourceView(importer);
  if (
    view === undefined ||
    registeredWorkspace === undefined ||
    canonicalInventoryPath(registeredWorkspace.root) !== canonicalRoot ||
    view.canonicalPath !== file
  ) {
    throw new SemanticInventoryError("native importing source has a foreign or changed compiler meaning");
  }
  const canonical = canonicalSemanticPrograms(root, importer.getProject()).find((program) => program.id === view.program.descriptor.id);
  if (canonical === undefined || !canonical.files.includes(path) || !semanticProgramMatchesDescriptor(importer, canonical)) {
    throw new SemanticInventoryError("native importing source has a foreign or changed compiler meaning");
  }
  if (importer.getProject().getFileSystem().readFileSync(importer.getFilePath()) !== importer.getFullText()) {
    throw new SemanticInventoryError("native importing source text/epoch is stale");
  }
  return canonical.id;
}
function referenceOptions(
  queries: readonly NativeTypeRequest[],
  owner: (node: import("ts-morph").SourceFile) => string,
): Pick<import("../../floor/code-facts/semantic-inventory-contract.ts").SemanticInventoryOptions, "referenceDemand"> {
  if (!queries.some((query) => query.kind === "references")) {
    return {};
  }
  return {
    referenceDemand: {
      mode: "closed",
      queries: queries
        .filter((query) => query.kind === "references")
        .flatMap((query) => {
          const program = owner(query.importer);
          const root = {
            file: canonicalInventoryPath(query.importer.getFilePath()),
            start: query.importer.getStart(),
            end: query.importer.getEnd(),
            kind: query.importer.getKind(),
          };
          return query.nodes.map((node) => ({
            program,
            root,
            node: { file: canonicalInventoryPath(node.getSourceFile().getFilePath()), start: node.getStart(), end: node.getEnd(), kind: node.getKind() },
          }));
        }),
    },
  };
}

function assertNeverRequest(value: never): never {
  throw new Error(`unhandled native type request: ${String(value)}`);
}

/** A column request may borrow identity only from its complete explicit full-catalog roster. */
export function columnSchemaSources(queries: readonly NativeTypeRequest[]): readonly import("ts-morph").SourceFile[] {
  const full = [...new Set(queries.filter((query) => query.kind === "schema-data").flatMap((query) => [...query.nodes]))];
  if (full.length === 0) {
    throw new SemanticInventoryError("native column demand requires an explicit full schema roster");
  }
  const explicit = queries.filter((query) => query.kind === "schema-identities");
  if (explicit.length === 0) {
    return full;
  }
  const identity = new Set(explicit.flatMap((query) => [...query.nodes]));
  if (explicit.some((query) => query.nodes.length === 0) || identity.size !== full.length || full.some((source) => !identity.has(source))) {
    throw new SemanticInventoryError("native column identity and full schema rosters disagree");
  }
  return full;
}

function identitySchemaSources(queries: readonly NativeTypeRequest[]): readonly import("ts-morph").SourceFile[] {
  return queries.some(
    (query) => (query.kind === "drizzle-identities" && query.mode === "column") || (query.kind === "invocation-evidence" && query.plan.mode === "observations"),
  )
    ? columnSchemaSources(queries)
    : [...new Set(queries.filter((query) => query.kind === "schema-identities").flatMap((query) => [...query.nodes]))];
}

function querySpan(node: Node): import("../../floor/code-facts/semantic-inventory-contract.ts").InventorySpan {
  return { file: canonicalInventoryPath(node.getSourceFile().getFilePath()), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
}
function moduleTargetRequest(
  query: Extract<NativeTypeRequest, { readonly kind: "module-targets" }>,
): Extract<NativeTypeRequest, { readonly kind: "module-targets" }> {
  return { kind: query.kind, nodes: [...query.nodes], ...(query.importer === undefined ? {} : { importer: query.importer }) };
}
function hasNativeRequest(query: NativeTypeRequest): boolean {
  return query.nodes.length > 0 || recordsEmptyIntent(query);
}
function contextualModuleDemand(
  queries: readonly NativeTypeRequest[],
  owner: (node: Node) => string,
): Pick<import("../../floor/code-facts/semantic-inventory-contract.ts").SemanticInventoryOptions, "moduleTargetQueries"> {
  const paired = queries.filter((query) => query.kind === "module-targets" && query.importer !== undefined);
  if (paired.length === 0) {
    return {};
  }
  return {
    moduleTargetQueries: paired.flatMap((query) => {
      if (query.kind !== "module-targets" || query.importer === undefined) {
        return [];
      }
      const importer = query.importer;
      return query.nodes.map((node) => ({ program: owner(importer), query: { importer: querySpan(importer), node: querySpan(node) } }));
    }),
  };
}

function requestOwnerNodes(query: NativeTypeRequest): readonly Node[] {
  const importer = query.kind === "references" || query.kind === "module-targets" ? query.importer : undefined;
  return importer === undefined ? query.nodes : [importer];
}
function nativeTypeReader(root: string, workspace: SemanticWorkspace, queries: readonly NativeTypeRequest[]): NativeTypeFactReader {
  const nodes = queries.flatMap((query) => [...query.nodes]);
  const owner = (node: Node): string => {
    if (node.wasForgotten()) {
      throw new SemanticInventoryError("native typed source was forgotten");
    }
    const selected = workspace.primaryOwner(node.getSourceFile().getFilePath());
    if (selected === undefined) {
      throw new SemanticInventoryError("native typed source has no unambiguous primary compiler owner");
    }
    return selected.descriptor.id;
  };
  const referenceOwner = (importer: import("ts-morph").SourceFile): string => nativeImporterOwner(root, workspace, importer);
  const descriptors = [
    ...new Map(
      queries
        .filter((query) => query.kind !== "shape-relations")
        .flatMap((query) =>
          requestOwnerNodes(query).map((node) => {
            const importer = query.kind === "references" || query.kind === "module-targets" ? query.importer : undefined;
            const program = importer === undefined ? owner(node) : referenceOwner(importer);
            const selected = workspace.program(program);
            if (selected === undefined) {
              throw new SemanticInventoryError("native typed compiler owner is unavailable");
            }
            return [selected.descriptor.id, selected.descriptor] as const;
          }),
        ),
    ).values(),
  ];
  const families = [
    ...new Set(
      queries.flatMap((query) => {
        if (query.kind === "shape-relations") {
          return [];
        }
        if (query.kind === "schema-identities" || query.kind === "drizzle-identities") {
          return ["drizzle-identities"] as const;
        }
        if (query.kind === "invocation-evidence") {
          return invocationFamilies(query.plan);
        }
        if (query.kind === "global-bindings") {
          return ["global-origins"] as const;
        }
        if (query.kind === "module-targets") {
          return ["modules"] as const;
        }
        return query.kind === "type-member-origins" ? ([query.kind, "bindings"] as const) : [query.kind];
      }),
    ),
  ];
  const shapes = queries.filter((query) => query.kind === "shape-relations");
  const capturedSources = [...new Set(nodes.map((node) => node.getSourceFile()))];
  const schemaSources = identitySchemaSources(queries);
  const schemaProgram = schemaSources[0] === undefined ? undefined : owner(schemaSources[0]);
  if (schemaSources.some((source) => owner(source) !== schemaProgram)) {
    throw new SemanticInventoryError("native schema roster crosses canonical owners");
  }
  const schemaDataSources = [...new Set(queries.filter((query) => query.kind === "schema-data").flatMap((query) => [...query.nodes]))];
  const schemaDataProgram = schemaDataSources[0] === undefined ? undefined : owner(schemaDataSources[0]);
  if (schemaDataSources.some((source) => owner(source) !== schemaDataProgram)) {
    throw new SemanticInventoryError("native schema roster crosses canonical owners");
  }
  const inventory = createSemanticInventory({
    ...idBrandOptions(queries, owner, families),
    root,
    programs: descriptors,
    ...referenceOptions(queries, referenceOwner),
    ...(families.includes("drizzle-identities")
      ? {
          ...(schemaProgram === undefined
            ? {}
            : {
                schemaQuery: {
                  program: schemaProgram,
                  sources: schemaSources.map((source) => ({
                    file: canonicalInventoryPath(source.getFilePath()),
                    start: source.getStart(),
                    end: source.getEnd(),
                    kind: source.getKind(),
                  })),
                },
              }),
          drizzleQueries: queries
            .filter((query) => query.kind === "drizzle-identities")
            .flatMap((query) =>
              query.nodes.map((node) => ({
                program: owner(node),
                query: {
                  mode: query.mode,
                  node: { file: canonicalInventoryPath(node.getSourceFile().getFilePath()), start: node.getStart(), end: node.getEnd(), kind: node.getKind() },
                },
              })),
            ),
        }
      : {}),
    ...schemaDataOptions(schemaDataProgram, schemaDataSources, requestedSchemaProjection(queries)),

    ...(families.includes("export-declarations")
      ? {
          exportQueries: queries
            .filter((query) => query.kind === "export-declarations")
            .flatMap((query) =>
              query.nodes.map((source) => ({
                program: owner(source),
                query: { file: canonicalInventoryPath(source.getFilePath()), name: query.name },
              })),
            ),
        }
      : {}),
    ...(families.includes("invocation-evidence")
      ? {
          invocationQueries: queries
            .filter((query) => query.kind === "invocation-evidence")
            .flatMap((query) =>
              invocationDemandGroups(query.nodes, query.plan, owner).map((group) => ({
                program: owner(group.anchor),
                query: {
                  ...group.plan,
                  node: {
                    file: canonicalInventoryPath(group.anchor.getSourceFile().getFilePath()),
                    start: group.anchor.getStart(),
                    end: group.anchor.getEnd(),
                    kind: group.anchor.getKind(),
                  },
                },
              })),
            ),
        }
      : {}),
    ...(families.includes("global-origins")
      ? {
          globalOriginQueries: queries
            .filter((query) => query.kind === "global-origins")
            .flatMap((query) =>
              query.nodes.map((node) => ({
                program: owner(node),
                node: { file: canonicalInventoryPath(node.getSourceFile().getFilePath()), start: node.getStart(), end: node.getEnd(), kind: node.getKind() },
              })),
            ),
          globalBindingQueries: queries
            .filter((query) => query.kind === "global-bindings")
            .flatMap((query) =>
              query.nodes.map((node) => ({
                program: owner(node),
                node: { file: canonicalInventoryPath(node.getSourceFile().getFilePath()), start: node.getStart(), end: node.getEnd(), kind: node.getKind() },
              })),
            ),
        }
      : {}),
    ...(families.includes("computed-names")
      ? {
          computedNameQueries: queries
            .filter((query) => query.kind === "computed-names")
            .flatMap((query) =>
              query.nodes.map((node) => ({
                program: owner(node),
                node: { file: canonicalInventoryPath(node.getSourceFile().getFilePath()), start: node.getStart(), end: node.getEnd(), kind: node.getKind() },
              })),
            ),
        }
      : {}),
    ...(families.includes("callable-declarations")
      ? {
          callableQueries: queries
            .filter((query) => query.kind === "callable-declarations")
            .flatMap((query) =>
              query.nodes.map((node) => ({
                program: owner(node),
                node: { file: canonicalInventoryPath(node.getSourceFile().getFilePath()), start: node.getStart(), end: node.getEnd(), kind: node.getKind() },
              })),
            ),
        }
      : {}),
    ...contextualModuleDemand(queries, (node) => nativeImporterOwner(root, workspace, node.getSourceFile())),
    ...(families.length === 0 ? {} : { families }),
    ...(shapes.length === 0
      ? {}
      : {
          shapePlan: {
            sources: shapes.flatMap((query) => [...query.nodes]),
            prepare: (catalog) => {
              using _binding = bindShapeInventory(capturedSources, catalog);
              return shapes.flatMap((query) => [...query.prepare()]);
            },
          },
        }),
  });
  // biome-ignore lint/nursery/useDisposables: the returned reader owns the binding lease.
  const binding = shapes.length === 0 ? undefined : bindShapeInventory(capturedSources, inventory);
  return {
    references: (subjects, importer): ReturnType<NativeTypeFactReader["references"]> => {
      const program = referenceOwner(importer);
      return new Map(subjects.map((node) => [node, inventory.references(node, program, importer)]));
    },
    schemaData: (sources, projection): ReturnType<NativeTypeFactReader["schemaData"]> => {
      if (schemaDataProgram === undefined) {
        throw new SemanticInventoryError("native schema roster owner is unavailable");
      }
      return inventory.schemaData(sources, schemaDataProgram, projection);
    },
    schemaIdentity: (sources): ReturnType<NativeTypeFactReader["schemaIdentity"]> => {
      if (schemaProgram === undefined) {
        throw new SemanticInventoryError("native schema roster owner is unavailable");
      }
      return inventory.schemaIdentity(sources, schemaProgram);
    },
    drizzleEvidence: (subjects, mode): ReturnType<NativeTypeFactReader["drizzleEvidence"]> =>
      new Map(subjects.map((node) => [node, inventory.drizzleEvidence(node, owner(node), mode)])),
    exportDeclarations: (sources, name): ReturnType<NativeTypeFactReader["exportDeclarations"]> =>
      new Map(sources.map((source) => [source, inventory.exportDeclarations(source, owner(source), name)])),
    moduleTargets: (subjects, importer): ReturnType<NativeTypeFactReader["moduleTargets"]> =>
      new Map(
        subjects.map((node) => [
          node,
          inventory.moduleTarget(node, importer === undefined ? owner(node) : nativeImporterOwner(root, workspace, importer), importer),
        ]),
      ),
    invocationEvidence: (subjects, plan): ReturnType<NativeTypeFactReader["invocationEvidence"]> => {
      const result = new Map<Node, import("../../floor/code-facts/semantic-inventory-contract.ts").NativeInvocationEvidence>();
      for (const group of invocationDemandGroups(subjects, plan, owner)) {
        const evidence = inventory.invocationEvidence(group.anchor, owner(group.anchor), group.plan);
        for (const node of group.nodes) {
          result.set(node, evidence);
        }
      }
      return result;
    },
    globalOrigins: (subjects): ReturnType<NativeTypeFactReader["globalOrigins"]> =>
      new Map(subjects.map((node) => [node, inventory.globalOrigin(node, owner(node))])),
    globalBindings: (subjects): ReturnType<NativeTypeFactReader["globalBindings"]> =>
      new Map(subjects.map((node) => [node, inventory.globalBinding(node, owner(node))])),
    computedNames: (subjects): ReturnType<NativeTypeFactReader["computedNames"]> =>
      new Map(subjects.map((node) => [node, inventory.computedName(node, owner(node))])),
    callableDeclarations: (calls): ReturnType<NativeTypeFactReader["callableDeclarations"]> =>
      new Map(calls.map((node) => [node, inventory.callableDeclaration(node, owner(node))])),
    callMemberOrigins: (calls): ReturnType<NativeTypeFactReader["callMemberOrigins"]> =>
      new Map(calls.map((node) => [node, inventory.callMemberOrigin(node, owner(node))])),
    declarationOutputs: (declarations): ReturnType<NativeTypeFactReader["declarationOutputs"]> =>
      new Map(declarations.map((node) => [node, inventory.declarationOutput(node, owner(node))])),
    prepareShapes: (requested): void => {
      for (const source of requested) {
        inventory.assertShapeSource(source);
      }
    },
    runtimeExports: (sources): ReturnType<NativeTypeFactReader["runtimeExports"]> =>
      new Map(sources.map((source) => [source, inventory.runtimeExports(source, owner(source))])),
    castRelations: (casts): ReadonlyMap<AsExpression, TypeRelation> =>
      new Map(
        casts.map((node) => {
          const result = inventory.castRelation(node, owner(node));
          if (result.kind === "unavailable") {
            throw new SemanticInventoryError(`native cast relation unavailable: ${result.reason}`);
          }
          return [node, result.value];
        }),
      ),
    idBrands: (brands): ReadonlyMap<TypeNode, string | null> => new Map(brands.map((node) => [node, inventory.idBrand(node, owner(node))])),
    [Symbol.dispose]: (): void => {
      binding?.[Symbol.dispose]();
      inventory[Symbol.dispose]();
    },
  };
}

/** Share optional acquisition plumbing between both execution doors. */
export function nativeTypeFactOptions(
  context: Pick<ProjectContext, "nativeTypeFacts" | "nativeSourceView">,
): Pick<ProjectContext, "nativeTypeFacts" | "nativeSourceView"> {
  return {
    ...(context.nativeTypeFacts === undefined ? {} : { nativeTypeFacts: context.nativeTypeFacts }),
    ...(context.nativeSourceView === undefined ? {} : { nativeSourceView: context.nativeSourceView }),
  };
}

function idBrandOptions(
  queries: readonly NativeTypeRequest[],
  owner: (node: Node) => string,
  families: readonly InventoryFamily[],
): Pick<SemanticInventoryOptions, "idBrandQueries"> {
  return families.includes("id-brands")
    ? {
        idBrandQueries: queries
          .filter((query) => query.kind === "id-brands")
          .flatMap((query) =>
            query.nodes.map((node) => ({
              program: owner(node),
              node: { file: canonicalInventoryPath(node.getSourceFile().getFilePath()), start: node.getStart(), end: node.getEnd(), kind: node.getKind() },
            })),
          ),
      }
    : {};
}

function requestedSchemaProjection(queries: readonly NativeTypeRequest[]): SchemaDataProjection {
  return {
    ...(queries.some((query) => query.kind === "schema-data" && query.projection?.typeVocabulary === true) ? { typeVocabulary: true } : {}),
    ...(queries.some((query) => query.kind === "schema-data" && query.projection?.builderConfig === true) ? { builderConfig: true } : {}),
  };
}

function schemaDataOptions(
  program: string | undefined,
  sources: readonly import("ts-morph").SourceFile[],
  projection: SchemaDataProjection,
): Pick<import("../../floor/code-facts/semantic-inventory-contract.ts").SemanticInventoryOptions, "schemaDataQuery"> {
  return program === undefined
    ? {}
    : {
        schemaDataQuery: {
          ...(projection.typeVocabulary === true || projection.builderConfig === true ? { projection } : {}),
          program,
          sources: sources.map((source) => ({
            file: canonicalInventoryPath(source.getFilePath()),
            start: source.getStart(),
            end: source.getEnd(),
            kind: source.getKind(),
          })),
        },
      };
}

/** Ordinary root order is local to its actual importing owner; one exact graph is stored per request/world. */
function invocationDemandGroups(
  nodes: readonly Node[],
  plan: import("../../floor/code-facts/semantic-inventory-contract.ts").InventoryInvocationPlan,
  owner: (node: Node) => string,
): readonly { readonly nodes: readonly Node[]; readonly anchor: Node; readonly plan: typeof plan }[] {
  if (plan.mode !== "observations" && plan.mode !== "types") {
    return nodes.map((node) => ({ nodes: [node], anchor: node, plan }));
  }
  const demand = plan.observations;
  const typeDemand = plan.typeObservations;
  if ((demand === undefined && typeDemand === undefined) || nodes.some((node) => !MorphNode.isSourceFile(node))) {
    throw new SemanticInventoryError("native ordinary cohort requires real source anchors");
  }
  const owners = new Map<string, Node[]>();
  const files = new Map<string, string>();
  for (const node of nodes) {
    const program = owner(node);
    const selected = owners.get(program) ?? [];
    selected.push(node);
    owners.set(program, selected);
    files.set(canonicalInventoryPath(node.getSourceFile().getFilePath()), program);
  }
  if (
    [
      ...(demand?.roots ?? []),
      ...(demand?.reads.map((read) => read.node) ?? []),
      ...(typeDemand?.sources ?? []),
      ...(typeDemand?.nodes ?? []),
      ...(typeDemand?.questions?.flatMap((q) => [
        ...q.nodes,
        ...(q.relationTargets ?? []),
        ...(q.predicateContext?.calls ?? []),
        ...(q.predicateContext?.references ?? []),
      ]) ?? []),
    ].some((node) => !files.has(node.file))
  ) {
    throw new SemanticInventoryError("native ordinary roots/reads are outside their registered source cohort");
  }
  assertPredicateImporters(typeDemand, files);
  return [...owners].map(([program, selected]) => {
    const anchor = selected[0];
    if (anchor === undefined) {
      throw new SemanticInventoryError("native ordinary cohort has no source anchor");
    }
    return {
      nodes: selected,
      anchor,
      plan: {
        ...plan,
        ...(demand === undefined
          ? {}
          : {
              observations: {
                ...demand,
                roots: demand.roots.filter((node) => files.get(node.file) === program),
                reads: demand.reads.filter((read) => files.get(read.node.file) === program),
              },
            }),
        ...(typeDemand === undefined
          ? {}
          : {
              typeObservations: {
                ...typeDemand,
                sources: typeDemand.sources.filter((node) => files.get(node.file) === program),
                nodes: typeDemand.nodes.filter((node) => files.get(node.file) === program),
                ...(typeDemand.questions === undefined
                  ? {}
                  : { questions: typeDemand.questions.map((q) => ({ ...q, nodes: q.nodes.filter((node) => files.get(node.file) === program) })) }),
              },
            }),
      },
    };
  });
}

function assertPredicateImporters(demand: InventoryInvocationPlan["typeObservations"], files: ReadonlyMap<string, string>): void {
  for (const question of demand?.questions ?? []) {
    if (question.predicateContext === undefined) {
      continue;
    }
    const importing = new Set(question.nodes.map((node) => files.get(node.file)));
    if (
      importing.size !== 1 ||
      [...question.predicateContext.calls, ...question.predicateContext.references].some((node) => !importing.has(files.get(node.file)))
    ) {
      throw new SemanticInventoryError("native predicate-input context crosses importing source cohorts");
    }
  }
}

function invocationFamilies(plan: InventoryInvocationPlan): readonly InventoryFamily[] {
  switch (plan.mode) {
    case "types":
      return [
        "invocation-evidence",
        ...(hasTypeObservationValueDemand(plan.typeObservations) ? ["global-origins" as const, "computed-names" as const] : []),
        ...(invocationNeedsValueSourceCatalog(plan) ? ["drizzle-identities" as const] : []),
      ];
    case "observations":
      return ["invocation-evidence", "global-origins", "computed-names", "drizzle-identities"];
    case "value":
    case "invocation":
      return ["invocation-evidence", "global-origins", "computed-names"];
  }
}
