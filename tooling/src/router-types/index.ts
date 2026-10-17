import { prepareRouterDeclarations } from "../floor/compiler/router-declarations.ts";

/** Rebuild only through an observed, current producer; retain published families for historical readers. */
export async function buildRouterDeclarations(root: string, controllerRoots: readonly string[] = []): Promise<number> {
  const prepared = await prepareRouterDeclarations(root, [import.meta.url, ...controllerRoots]);
  prepared.assertCurrent();
  return prepared.declarations;
}
