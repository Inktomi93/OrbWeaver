import { prepareRouterDeclarations } from "../floor/compiler/router-declarations.ts";

/** Rebuild the native declaration bridge without discarding any published family. */
export function buildRouterDeclarations(root: string): number {
  return prepareRouterDeclarations(root).declarations;
}
