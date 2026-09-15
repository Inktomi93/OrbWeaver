// Build the whole-project read context (contract/project-context.ts) over the shared ts-morph workspace,
// and the repo-relative path helper its callers need. Split out of the retired `lib/pass.ts` at #2176
// Phase F (2026-09-14): the legacy dispatcher died; these two survived it because they describe the
// WORKSPACE, not the descriptor runtime.
import { getWorkspace } from "@orb/tooling/_shared/ts-workspace";
import type { ProjectContext } from "../contract/project-context.ts";

/** repo-relative posix path for an absolute path under `root`. */
export function repoRel(root: string, absPath: string): string {
  const withRoot = absPath.startsWith(root) ? absPath.slice(root.length) : absPath;
  return withRoot.startsWith("/") ? withRoot.slice(1) : withRoot;
}

/** The shared workspace, read once, with its resolved fileset. */
export function projectCtx(root: string): ProjectContext {
  const project = getWorkspace({ root });
  return { root, project, files: project.getSourceFiles() };
}
