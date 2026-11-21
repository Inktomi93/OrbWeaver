// An operator key by name: the process env wins over the main checkout's `.env`, which is read in process.
// Nothing here prints a value.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { parseEnv } from "node:util";
import { execGit } from "../git/git.ts";
import { processEnvValue } from "./process-env.ts";

/** The env file an operator keeps keys in, at the main checkout's root. */
export const MAIN_ENV_FILE = ".env";

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
