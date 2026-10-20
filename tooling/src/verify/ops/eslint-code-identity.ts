// ESLint's cache hash sees rule options but not rule code: the `orb` plugin serializes as its bare name.
// This digest is the missing half: every module the two configs import (authored or installed) and the pnpm patch inputs.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules, createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { refuseDirectInvocation } from "@orb/tooling/floor/cli/entrypoint";
import ts from "typescript";
import { z } from "zod";
import { ESLINT_CONFIG_REL, ESLINT_HARD_CONFIG_REL } from "../contract/config-snapshot.ts";

refuseDirectInvocation(import.meta.url, "pnpm lint:eslint");

const WORKSPACE_SPECIFIER = "@orb/";
const NODE_MODULES = "/node_modules/";
const BUILTINS = new Set(builtinModules);
// Patched dependencies keep their path in node_modules but not their bytes; these inputs name the patch.
const PATCH_INPUTS = ["pnpm-workspace.yaml", "pnpm-lock.yaml"] as const;
const PATCH_DIR = "patches";

const packageManifest = z.looseObject({ main: z.string().optional(), module: z.string().optional(), exports: z.unknown().optional() });

function packageName(specifier: string): string {
  const [scopeOrName, scoped] = specifier.split("/");
  return specifier.startsWith("@") ? `${scopeOrName ?? ""}/${scoped ?? ""}` : (scopeOrName ?? specifier);
}

function stringLeaves(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  return typeof value === "object" && value !== null ? Object.values(value).flatMap(stringLeaves) : [];
}

/** Every entry file an installed package declares; all are digested because ESM-only exports cannot be `require`d. */
function installedEntries(importer: string, specifier: string): string[] {
  const name = packageName(specifier);
  for (let directory = dirname(importer); ; directory = dirname(directory)) {
    const manifestPath = join(directory, "node_modules", name, "package.json");
    if (existsSync(manifestPath)) {
      const manifest = packageManifest.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
      const leaves = [manifest.main ?? "index.js", manifest.module, ...stringLeaves(manifest.exports)].filter(
        (leaf): leaf is string => typeof leaf === "string",
      );
      return [manifestPath, ...leaves.filter((leaf) => !leaf.includes("*")).map((leaf) => resolve(dirname(manifestPath), leaf))];
    }
    if (dirname(directory) === directory) {
      throw new Error(`ESLint config import ${specifier} from ${importer} is not installed; no cache identity is available`);
    }
  }
}

function importedModules(importer: string, specifier: string): string[] {
  if (specifier.startsWith("file:")) {
    return [fileURLToPath(specifier)];
  }
  if (isAbsolute(specifier)) {
    return [specifier];
  }
  if (specifier.startsWith(".")) {
    return [resolve(dirname(importer), specifier)];
  }
  // `#` specifiers are package.json imports and `@orb/` ones are workspace links; both resolve to authored files.
  if (specifier.startsWith(WORKSPACE_SPECIFIER) || specifier.startsWith("#")) {
    return [createRequire(importer).resolve(specifier)];
  }
  // Inside an installed package only its own relative files matter; its dependencies are other packages' inputs.
  if (importer.includes(NODE_MODULES) || specifier.startsWith("node:") || BUILTINS.has(specifier)) {
    return [];
  }
  return installedEntries(importer, specifier);
}

function patchInputs(root: string): string[] {
  const directory = resolve(root, PATCH_DIR);
  const patches = existsSync(directory) ? readdirSync(directory, { recursive: true, encoding: "utf8" }).map((name) => join(directory, name)) : [];
  return [...PATCH_INPUTS.map((name) => resolve(root, name)), ...patches].filter((path) => existsSync(path) && statSync(path).isFile());
}

/** Digest of the config files, the modules they import (authored and installed) and the pnpm patch inputs. */
export function eslintRuleCodeIdentity(root: string): string {
  const pending = [ESLINT_CONFIG_REL, ESLINT_HARD_CONFIG_REL].map((path) => resolve(root, path));
  const seen = new Set<string>();
  const digest = createHash("sha256");
  for (const patch of patchInputs(root)) {
    digest.update(`${patch.slice(root.length)}\0${readFileSync(patch, "utf8")}\0`);
  }
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    // Extensionless or type-only package specifiers name no file; the config would not load if an authored one were missing.
    if (!(existsSync(file) && statSync(file).isFile())) {
      continue;
    }
    const source = readFileSync(file, "utf8");
    digest.update(`${file.slice(root.length)}\0${source}\0`);
    for (const { fileName } of ts.preProcessFile(source, true, true).importedFiles) {
      pending.push(...importedModules(file, fileName));
    }
  }
  return digest.digest("hex");
}
