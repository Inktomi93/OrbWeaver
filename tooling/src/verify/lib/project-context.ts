// Build the whole-project read context (contract/project-context.ts) over the shared ts-morph workspace,
// and the repo-relative path helper its callers need. Split out of the retired `lib/pass.ts` at #2176
// Phase F (2026-09-14): the legacy dispatcher died; these two survived it because they describe the
// WORKSPACE, not the descriptor runtime.
import { posix } from "node:path";
import { createSemanticWorkspace, getWorkspace, registeredSemanticSourceView } from "@orb/tooling/floor/compiler/ts-workspace";
import type { AsExpression, Node, TypeNode } from "ts-morph";
import type { TypeRelation } from "../../floor/code-facts/assignability.ts";
import { createSemanticInventory } from "../../floor/code-facts/semantic-inventory.ts";
import { SemanticInventoryError } from "../../floor/code-facts/semantic-inventory-contract.ts";
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
  const selected = (owner: string, kind: NativeTypeRequest["kind"], nodes: readonly Node[]): NativeTypeFactReader => {
    assertReadable();
    const admitted = new Set<Node>((requests.get(owner) ?? []).filter((query) => query.kind === kind).flatMap((query) => [...query.nodes]));
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
  return {
    request: (owner, query): void => {
      assertOpen();
      if (sealed) {
        throw new Error("native type request registration is sealed");
      }
      if (query.nodes.length > 0) {
        const rows = requests.get(owner) ?? [];
        switch (query.kind) {
          case "cast-relations":
            rows.push({ kind: query.kind, nodes: [...query.nodes] });
            break;
          case "id-brands":
            rows.push({ kind: query.kind, nodes: [...query.nodes] });
            break;
          case "runtime-exports":
            rows.push({ kind: query.kind, nodes: [...query.nodes] });
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
    castRelations: (owner, nodes): ReturnType<NativeTypeContext["castRelations"]> => {
      if (nodes.length === 0) {
        assertReadable();
        return new Map();
      }
      return selected(owner, "cast-relations", nodes).castRelations(nodes);
    },
    idBrands: (owner, nodes): ReturnType<NativeTypeContext["idBrands"]> => {
      if (nodes.length === 0) {
        assertReadable();
        return new Map();
      }
      return selected(owner, "id-brands", nodes).idBrands(nodes);
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
        reader?.[Symbol.dispose]();
        requests.clear();
      }
    },
  };
}

function assertNeverRequest(value: never): never {
  throw new Error(`unhandled native type request: ${String(value)}`);
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
      nodes.map((node) => {
        const selected = workspace.program(owner(node));
        if (selected === undefined) {
          throw new SemanticInventoryError("native typed primary compiler owner is unavailable");
        }
        return [selected.descriptor.id, selected.descriptor] as const;
      }),
    ).values(),
  ];
  const families = [...new Set(queries.map((query) => query.kind))];
  // biome-ignore lint/nursery/useDisposables: this reader transfers the store handle to its run-owned session.
  const inventory = createSemanticInventory({ root, programs: descriptors, families });
  return {
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
    [Symbol.dispose]: (): void => inventory[Symbol.dispose](),
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
