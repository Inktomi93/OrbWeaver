// An operator key by name: the process env wins over the main checkout's `.env`, which is read in process. It also
// strips the provider keys from a launched stack's env. Nothing here prints a value.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { parseEnv } from "node:util";
import { envNameKey, secretFileEnvName } from "@orb/kit/env-file";
import { execGit } from "../git/git.ts";
import { processEnvValue } from "./process-env.ts";

/** The env file an operator keeps keys in, at the main checkout's root. */
export const MAIN_ENV_FILE = ".env";

/** The provider keys an operator exports or keeps in the main checkout's `.env`, by name. */
export const PROVIDER_KEY_NAMES = ["OPENROUTER_API_KEY", "OPENROUTER_PROBE_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_PROBE_KEY"] as const;
export type ProviderKeyName = (typeof PROVIDER_KEY_NAMES)[number];

// The server's env parse reads a key in any letter case and from its `<NAME>_FILE` path, so each is a spelling of the key.
const PROVIDER_KEY_SPELLINGS: ReadonlySet<string> = new Set(PROVIDER_KEY_NAMES.flatMap((name) => [envNameKey(name), envNameKey(secretFileEnvName(name))]));

/**
 * `env` without any spelling of a provider key.
 * @remarks A launched server seals `OPENROUTER_API_KEY` as its owner's credential at boot, so a stack that never asked
 * for a key (a snap stage, the fixture) takes its env through this. A key such a stack needs arrives through its own
 * product verb instead.
 */
export function withoutProviderKeys(env: Readonly<Record<string, string | undefined>>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !PROVIDER_KEY_SPELLINGS.has(envNameKey(name))));
}

/** A parsed env file; a key the file does not set reads undefined. */
export type EnvFile = Readonly<Record<string, string | undefined>>;

// A linked worktree has no `.env` of its own; every worktree shares the git common dir, whose parent is the main checkout.
function mainCheckoutRoot(): string {
  return dirname(execGit(process.cwd(), ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim());
}

/** The main checkout's `.env`, parsed. Empty when the file is absent. */
export function readMainEnv(): EnvFile {
  const path = join(mainCheckoutRoot(), MAIN_ENV_FILE);
  return existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
}

/** One operator key: the process env wins over `mainEnv`; an empty value counts as absent. */
export function operatorKey(name: string, mainEnv: EnvFile): string | null {
  const value = processEnvValue(name) ?? mainEnv[name];
  return value === undefined || value === "" ? null : value;
}
