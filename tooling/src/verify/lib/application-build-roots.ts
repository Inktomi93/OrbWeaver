// Follow the authored build command, not a config-name glob: only composition reached by that command
// belongs to application qualification. Unsupported command grammar refuses instead of losing a root.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { z } from "zod";
import type { PolicyRepositoryInventory } from "../contract/policy-scope.ts";
import { assertPolicyRepoPath } from "./policy-repo-inventory.ts";

const manifestSchema = z.object({ name: z.string().optional(), scripts: z.record(z.string(), z.string()).optional() });
const viteConfigSchema = z.object({ path: z.string().min(1) });
const VITE_CONFIG_READER =
  'const vite = await import(process.argv[1]); const loaded = await vite.loadConfigFromFile({ command: "build", mode: "production" }, undefined, process.argv[2], "silent", undefined, "native"); if (!loaded) throw new Error("application Vite config is absent"); process.stdout.write(JSON.stringify({ path: loaded.path }));';

function buildCommandRoot(root: string, directory: string, command: string): string {
  const node = /^node (\S+\.(?:ts|mts|cts))(?: [\w:-]+)*$/u.exec(command);
  if (node?.[1] !== undefined) {
    return resolve(directory, node[1]);
  }
  if (command !== "vite build --configLoader native") {
    throw new Error(`application build command has unclassified composition: ${command}`);
  }
  const vite = createRequire(join(directory, "package.json")).resolve("vite");
  const result = runNicedSync(process.execPath, ["--input-type=module", "-e", VITE_CONFIG_READER, vite, directory], { cwd: root });
  if (result.status !== 0) {
    throw new Error(`application Vite config could not resolve: ${result.stderr}`);
  }
  return viteConfigSchema.parse(JSON.parse(result.stdout)).path;
}

export function applicationBuildRoots(inventory: PolicyRepositoryInventory): readonly string[] {
  const manifests = new Map(
    inventory.paths
      .filter((path) => path === "package.json" || /^packages\/[^/]+\/package\.json$/u.test(path))
      .map((path) => [path, manifestSchema.parse(JSON.parse(readFileSync(join(inventory.root, path), "utf8")))] as const),
  );
  const active = new Set<string>();
  const roots = new Set<string>();
  const admit = (absolute: string): void => {
    const path = relative(inventory.root, absolute).replaceAll("\\", "/");
    assertPolicyRepoPath(path, "application build root");
    if (!inventory.paths.includes(path)) {
      throw new Error(`application build root is not authored: ${path}`);
    }
    roots.add(path);
  };
  const visit = (manifestPath: string, script: string): void => {
    const identity = `${manifestPath}:${script}`;
    if (active.has(identity)) {
      throw new Error(`application build script cycle: ${identity}`);
    }
    const command = manifests.get(manifestPath)?.scripts?.[script];
    if (command === undefined) {
      throw new Error(`application build script is absent: ${identity}`);
    }
    active.add(identity);
    const directory = dirname(join(inventory.root, manifestPath));
    for (const part of command.split(" && ")) {
      const workspace = /^pnpm --filter (\S+) (\S+)$/u.exec(part);
      if (workspace !== null) {
        const member = [...manifests].find(([, manifest]) => manifest.name === workspace[1]);
        if (member === undefined || workspace[2] === undefined) {
          throw new Error(`application build workspace is unresolved: ${part}`);
        }
        visit(member[0], workspace[2]);
        continue;
      }
      admit(buildCommandRoot(inventory.root, directory, part));
    }
    active.delete(identity);
  };
  visit("package.json", "build");
  if (roots.size === 0) {
    throw new Error("application build resolved no composition roots");
  }
  return [...roots].toSorted();
}
