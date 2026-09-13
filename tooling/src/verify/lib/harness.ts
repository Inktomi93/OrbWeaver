// The shared ts-morph project for the callers that do NOT ride the single-pass walk: the injectable
// baseline factories and the committed baseline writers under ops/gen/. The live gate authority is the
// single-pass machine (loader → pass → render); the `Violation`/`CheckContext`/`GateResult` shapes this used
// to carry moved to ../contract/harness.ts at the @orb/tooling P6 move.
//
// ONE LOADER: the historical `getProject` had its OWN `new Project(` and its own packages+tests fileset.
// Under `tooling-project-home` the construction belongs to `_shared/ts-workspace.ts`, so what
// survives here is the FILESET — passed as globs, which is exactly the seam `getWorkspace` exposes for it.
// The set is deliberately NARROWER than `harnessGlobs`: these callers judge app source, and sweeping the
// tool corpus into their walk would put the gates' own fixture strings in a baseline.
import { getWorkspace } from "@orb/tooling/_shared/ts-workspace";
import type { Project } from "ts-morph";

let cached: Project | undefined;

/** A ts-morph project over all package source + tests (no tsconfig — pure AST, no type-graph needed). */
export function getProject(root: string): Project {
  cached ??= getWorkspace({
    root,
    globs: [`${root}/packages/*/src/**/*.ts`, `${root}/packages/*/src/**/*.tsx`, `${root}/tests/**/*.ts`, `${root}/tests/**/*.tsx`],
  });
  return cached;
}
