// ESLint's cache hash sees rule options but not rule code: the `orb` plugin serializes as its bare name.
// This digest is the missing half: every authored module the two configs import, so a rule patch drops the cache.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { refuseDirectInvocation } from "@orb/tooling/floor/cli/entrypoint";
import ts from "typescript";
import { ESLINT_CONFIG_REL, ESLINT_HARD_CONFIG_REL } from "../contract/config-snapshot.ts";

refuseDirectInvocation(import.meta.url, "pnpm lint:eslint");

const WORKSPACE_SPECIFIER = "@orb/";

function importedModule(importer: string, specifier: string): string | undefined {
  if (specifier.startsWith("file:")) {
    return fileURLToPath(specifier);
  }
  if (specifier.startsWith(".")) {
    return resolve(dirname(importer), specifier);
  }
  // Only workspace packages are authored code; any other bare specifier is a pinned dependency.
  return specifier.startsWith(WORKSPACE_SPECIFIER) ? createRequire(importer).resolve(specifier) : undefined;
}

/** Digest of the config files and the transitive workspace modules they import. */
export function eslintRuleCodeIdentity(root: string): string {
  const pending = [ESLINT_CONFIG_REL, ESLINT_HARD_CONFIG_REL].map((path) => resolve(root, path));
  const seen = new Set<string>();
  const digest = createHash("sha256");
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    const source = readFileSync(file, "utf8");
    digest.update(`${file.slice(root.length)}\0${source}\0`);
    for (const { fileName } of ts.preProcessFile(source, true, true).importedFiles) {
      const target = importedModule(file, fileName);
      if (target !== undefined) {
        pending.push(target);
      }
    }
  }
  return digest.digest("hex");
}
