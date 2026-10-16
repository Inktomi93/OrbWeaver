// Build the whole-project read context (contract/project-context.ts) over the shared ts-morph workspace,
// and the repo-relative path helper its callers need. Split out of the retired `lib/pass.ts` at #2176
// Phase F (2026-09-14): the legacy dispatcher died; these two survived it because they describe the
// WORKSPACE, not the descriptor runtime.
import { posix } from "node:path";
import { createSemanticWorkspace, getWorkspace, registeredSemanticSourceView } from "@orb/tooling/floor/compiler/ts-workspace";
import type { AsExpression, Node, TypeNode } from "ts-morph";
import type { TypeRelation } from "../../floor/code-facts/assignability.ts";
import type { SchemaDataProjection } from "../../floor/code-facts/schema-projection-contract.ts";
import { schemaDataProjectionSchema } from "../../floor/code-facts/schema-projection-contract.ts";
import { createSemanticInventory } from "../../floor/code-facts/semantic-inventory.ts";
import type { InventoryInvocationPlan } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { invocationPlanSchema, invocationQueryKey, SemanticInventoryError } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { canonicalInventoryPath } from "../../floor/code-facts/semantic-inventory-inputs.ts";
import { bindShapeInventory } from "../../floor/code-facts/shape-inventory-scope.ts";
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

/** One request ledger is shared by production and the existing isolated proof adapter. */
export function nativeTypeFactSession(acquire: (queries: readonly NativeTypeRequest[]) => NativeTypeFactReader): NativeTypeFacts {
  const requests = new Map<string, NativeTypeRequest[]>();
  const invocationAdmissions = new Map<string, ReadonlyMap<string, ReadonlySet<Node>>>();
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
  const selected = (
    owner: string,
    kind: NativeTypeRequest["kind"],
    nodes: readonly Node[],
    projection?: {
      readonly name?: string;
      readonly mode?: import("../../floor/code-facts/drizzle-evidence-contract.ts").DrizzleEvidenceMode;
      readonly plan?: import("../../floor/code-facts/semantic-inventory-contract.ts").InventoryInvocationPlan;
    },
  ): NativeTypeFactReader => {
    assertReadable();
    const admitted =
      kind === "invocation-evidence"
        ? invocationNodes(owner, projection?.plan)
        : new Set<Node>(
            (requests.get(owner) ?? [])
              .filter(
                (query) =>
                  query.kind === kind &&
                  (query.kind !== "drizzle-identities" || query.mode === projection?.mode) &&
                  (query.kind !== "export-declarations" || query.name === projection?.name),
              )
              .flatMap((query) => [...query.nodes]),
          );
    if (nodes.some((node) => !admitted.has(node))) {
      throw new Error("native type query was not registered by this owner");
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
      if (query.nodes.length > 0 || query.kind === "schema-data" || query.kind === "schema-identities") {
        const rows = requests.get(owner) ?? [];
        switch (query.kind) {
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
          case "callable-declarations":
            rows.push({ kind: query.kind, nodes: [...query.nodes] });
            break;
          case "computed-names":
          case "global-origins":
          case "global-bindings":
            rows.push({ kind: query.kind, nodes: [...query.nodes] });
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
        }
      }
      sealed = true;
    },
    exportDeclarations: (owner, sources, name): ReturnType<NativeTypeContext["exportDeclarations"]> => {
      if (sources.length === 0) {
        assertReadable();
        return new Map();
      }
      return selected(owner, "export-declarations", sources, { name }).exportDeclarations(sources, name);
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
        reader?.[Symbol.dispose]();
        requests.clear();
      }
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
  return queries.some((query) => query.kind === "drizzle-identities" && query.mode === "column")
    ? columnSchemaSources(queries)
    : [...new Set(queries.filter((query) => query.kind === "schema-identities").flatMap((query) => [...query.nodes]))];
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
  const descriptors = [
    ...new Map(
      queries
        .filter((query) => query.kind !== "shape-relations")
        .flatMap((query) => [...query.nodes])
        .map((node) => {
          const selected = workspace.program(owner(node));
          if (selected === undefined) {
            throw new SemanticInventoryError("native typed primary compiler owner is unavailable");
          }
          return [selected.descriptor.id, selected.descriptor] as const;
        }),
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
          return ["invocation-evidence", "global-origins", "computed-names"] as const;
        }
        if (query.kind === "global-bindings") {
          return ["global-origins"] as const;
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
  // biome-ignore lint/nursery/useDisposables: this reader transfers the store handle to its run-owned session.
  const inventory = createSemanticInventory({
    root,
    programs: descriptors,
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
              query.nodes.map((node) => ({
                program: owner(node),
                query: {
                  ...query.plan,
                  node: { file: canonicalInventoryPath(node.getSourceFile().getFilePath()), start: node.getStart(), end: node.getEnd(), kind: node.getKind() },
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
    invocationEvidence: (subjects, plan): ReturnType<NativeTypeFactReader["invocationEvidence"]> =>
      new Map(subjects.map((node) => [node, inventory.invocationEvidence(node, owner(node), plan)])),
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
