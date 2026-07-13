// Probe output lands under `<repo>/reports/<kind>/`, which is root-anchor gitignored.
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

// _kit lives at scripts/probes/_kit/ — three levels up is the repo root.
export const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");

/** Resolve (and create) `reports/<kind>/` from the repo root. */
export async function artifactDir(kind: string): Promise<string> {
  const dir = join(REPO_ROOT, "reports", kind);
  await mkdir(dir, { recursive: true });
  return dir;
}

const LEADING_SLASH_RE = /^\//u;
const NON_SLUG_RE = /[^a-zA-Z0-9_-]+/gu;

/** Default artifact basename for a route: `/chats/abc?x=1` → `chats_abc_x_1`, `/` → `root`. */
export function routeSlug(route: string): string {
  return route.replace(LEADING_SLASH_RE, "").replace(NON_SLUG_RE, "_") || "root";
}
