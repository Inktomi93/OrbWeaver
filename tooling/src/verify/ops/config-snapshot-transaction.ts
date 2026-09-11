// Private copy-on-write root for native executable-config observation. The stage contains authored bytes
// only; installed dependencies remain in the owning worktree and workspace package links point back here.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ConfigSnapshotTransaction } from "../contract/config-snapshot.ts";
import type { ResourceFileSnapshot, ResourceReaderOptions } from "../contract/resource.ts";
import { PACKAGE_RESOURCE_PATHS } from "../contract/resource-config.ts";
import { readPolicyRepositoryInventory } from "../lib/policy-repo-inventory.ts";
import { createResourceReader } from "./resource-reader.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

function packageName(bytes: Uint8Array, path: string): string {
  const value: unknown = JSON.parse(Buffer.from(bytes).toString("utf8"));
  if (typeof value !== "object" || value === null || !("name" in value) || typeof value.name !== "string" || value.name === "") {
    throw new Error(`workspace package metadata has no name: ${path}`);
  }
  return value.name;
}

function stagedBytes(path: string, entries: ReadonlyMap<string, ResourceFileSnapshot>, visited = new Set<string>()): Uint8Array | undefined {
  if (visited.has(path)) {
    throw new Error(`workspace package manifest symlink cycle: ${path}`);
  }
  visited.add(path);
  const entry = entries.get(path);
  if (entry === undefined) {
    return;
  }
  return entry.kind === "file" ? entry.bytes : stagedBytes(entry.targetPath, entries, visited);
}

interface WorkspaceLinkPlan {
  readonly link: string;
  readonly name: string;
  readonly target: string;
  readonly tombstone: boolean;
}

function workspaceLinkPlans(root: string, stage: string, entries: ReadonlyMap<string, ResourceFileSnapshot>): readonly WorkspaceLinkPlan[] {
  const plans: WorkspaceLinkPlan[] = [];
  const linkRoot = join(stage, "node_modules");
  for (const [id, manifest] of Object.entries(PACKAGE_RESOURCE_PATHS)) {
    if (id === "root") {
      continue;
    }
    const original = join(root, manifest);
    if (!existsSync(original)) {
      continue;
    }
    const name = packageName(readFileSync(original), manifest);
    const stagedManifest = stagedBytes(manifest, entries);
    if (entries.has(manifest) && stagedManifest === undefined) {
      throw new Error(`workspace package manifest target is absent from the authored transaction: ${manifest}`);
    }
    if (stagedManifest !== undefined && packageName(stagedManifest, manifest) !== name) {
      throw new Error(`workspace package overlay cannot redefine ${name}: ${manifest}`);
    }
    const target = join(stage, dirname(manifest));
    const link = resolve(linkRoot, ...name.split("/"));
    const rel = relative(linkRoot, link);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new Error(`workspace package name cannot escape staged node_modules: ${name}`);
    }
    plans.push({ link, name, target, tombstone: !entries.has(manifest) });
  }
  return plans;
}

function linkWorkspacePackages(plans: readonly WorkspaceLinkPlan[]): void {
  for (const { link, name, target, tombstone } of plans) {
    mkdirSync(target, { recursive: true });
    if (tombstone) {
      writeFileSync(join(target, "package.json"), `${JSON.stringify({ name, private: true, exports: {} })}\n`);
    }
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(relative(dirname(link), target), link, "dir");
  }
}

export function materializeConfigSnapshotTransaction(options: ResourceReaderOptions): ConfigSnapshotTransaction {
  const overlay = options.overlay ?? {};
  const deleted = (path: string): boolean =>
    Object.entries(overlay).some(([entry, value]) => value === null && (path === entry || path.startsWith(`${entry}/`)));
  const inventory = readPolicyRepositoryInventory(options.root).paths.filter((path) => !deleted(path));
  const additions = Object.entries(overlay).flatMap(([path, value]) => (typeof value === "string" ? [path] : []));
  const loaded = createResourceReader(options).snapshot([...inventory, ...additions]);
  if (loaded.status !== "ready") {
    throw new Error(`config snapshot transaction is ${loaded.status}: ${loaded.reason}`);
  }
  const cache = join(options.root, ".cache");
  mkdirSync(cache, { recursive: true });
  const stage = mkdtempSync(join(cache, "config-snapshot-"));
  try {
    const entries = new Map(loaded.value.map((entry) => [entry.path, entry]));
    const workspaceLinks = workspaceLinkPlans(options.root, stage, entries);
    for (const entry of loaded.value) {
      const target = join(stage, entry.path);
      mkdirSync(dirname(target), { recursive: true });
      if (entry.kind === "file") {
        writeFileSync(target, entry.bytes);
      } else {
        symlinkSync(relative(dirname(target), join(stage, entry.targetPath)), target);
      }
    }
    linkWorkspacePackages(workspaceLinks);
    return {
      root: stage,
      paths: loaded.paths,
      cleanup: () => rmSync(stage, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}
