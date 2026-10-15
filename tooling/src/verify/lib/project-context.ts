// Build the whole-project read context (contract/project-context.ts) over the shared ts-morph workspace,
// and the repo-relative path helper its callers need. Split out of the retired `lib/pass.ts` at #2176
// Phase F (2026-09-14): the legacy dispatcher died; these two survived it because they describe the
// WORKSPACE, not the descriptor runtime.
import { posix } from "node:path";
import { createSemanticWorkspace, getWorkspace, registeredSemanticSourceView } from "@orb/tooling/floor/compiler/ts-workspace";
import type { AsExpression } from "ts-morph";
import type { TypeRelation } from "../../floor/code-facts/assignability.ts";
import { createSemanticInventory } from "../../floor/code-facts/semantic-inventory.ts";
import type { SemanticInventory } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { SemanticInventoryError } from "../../floor/code-facts/semantic-inventory-contract.ts";
import type { SemanticSourceView, SemanticWorkspace } from "../../floor/compiler/ts-workspace-contract.ts";
import type { NativeCastRelations, ProjectContext } from "../contract/project-context.ts";

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
    nativeCastRelations: () => castRelations(root, nativeWorkspace),
    nativeSourceView: (path): SemanticSourceView | undefined => {
      const source = nativeWorkspace().sourceCorpus().getSourceFile(path);
      return source === undefined ? undefined : registeredSemanticSourceView(source);
    },
  };
}

function castRelations(root: string, workspace: () => SemanticWorkspace): NativeCastRelations {
  let inventory: SemanticInventory | undefined;
  let open = true;
  return {
    read: (nodes): ReturnType<NativeCastRelations["read"]> => {
      if (!open) {
        throw new SemanticInventoryError("native cast relation context is disposed");
      }
      if (nodes.length === 0) {
        return new Map();
      }
      const worlds = workspace();
      const selected = nodes.map((node) => {
        if (node.wasForgotten()) {
          throw new SemanticInventoryError("native cast source was forgotten");
        }
        const owner = worlds.primaryOwner(node.getSourceFile().getFilePath());
        if (owner === undefined) {
          throw new SemanticInventoryError("native cast source has no unambiguous primary compiler owner");
        }
        return { node, owner };
      });
      const descriptors = [...new Map(selected.map(({ owner }) => [owner.descriptor.id, owner.descriptor])).values()];
      inventory ??= createSemanticInventory({ root, programs: descriptors, families: ["cast-relations"] });
      const captured = inventory;
      if (descriptors.some((descriptor) => !captured.programs.includes(descriptor.id))) {
        throw new SemanticInventoryError("native cast demand changed after generation pinning");
      }
      const values = new Map<AsExpression, TypeRelation>();
      for (const { node, owner } of selected) {
        const result = captured.castRelation(node, owner.descriptor.id);
        if (result.kind === "unavailable") {
          throw new SemanticInventoryError(`native cast relation unavailable: ${result.reason}`);
        }
        values.set(node, result.value);
      }
      return values;
    },
    [Symbol.dispose]: (): void => {
      if (open) {
        open = false;
        inventory?.[Symbol.dispose]();
      }
    },
  };
}

/** Share optional acquisition plumbing between both execution doors. */
export function nativeCastRelationOptions(context: Pick<ProjectContext, "nativeCastRelations">): Pick<ProjectContext, "nativeCastRelations"> {
  return context.nativeCastRelations === undefined ? {} : { nativeCastRelations: context.nativeCastRelations };
}
