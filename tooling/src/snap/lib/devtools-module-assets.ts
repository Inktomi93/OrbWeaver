// Literal module edges that the browser may resolve without requesting during the bounded discovery run.
// This is intentionally not a JavaScript interpreter: only the two emitted literal forms are closure edges.

export function pathForDevToolsRequest(rawUrl: string | undefined, revision: string): string {
  if (rawUrl === undefined || rawUrl.includes("\\") || rawUrl.includes("%")) {
    throw new Error(`refused non-canonical DevTools asset URL: ${rawUrl ?? "(missing)"}`);
  }
  const path = new URL(rawUrl, "http://127.0.0.1").pathname;
  const prefix = `/serve_rev/@${revision}/`;
  if (!path.startsWith(prefix) || path.includes("/../") || path.includes("/./") || path.includes("//")) {
    throw new Error(`refused out-of-closure DevTools asset URL: ${path}`);
  }
  return path;
}

export function literalModuleAssetPaths(modulePath: string, source: string, revision: string): readonly string[] {
  const paths = new Set<string>();
  // Bundled CSS uses `${import.meta.resolve(...)}` only as a source label; it is not a load edge.
  const patterns = [/new URL\((['"])([^'"\\]+)\1,\s*import\.meta\.url\)/gu, /(?<!\$\{)import\.meta\.resolve\((['"])([^'"\\]+)\1\)/gu];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const relative = match[2];
      if (relative === undefined) {
        throw new Error(`literal module asset parser lost its capture for ${modulePath}`);
      }
      const resolved = new URL(relative, `http://127.0.0.1${modulePath}`).pathname;
      paths.add(pathForDevToolsRequest(resolved, revision));
    }
  }
  return [...paths];
}
