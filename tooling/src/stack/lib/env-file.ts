// The app's `.env` as the server reads it: the file foundation/env loads from the repo root, where every
// launcher starts the server. Parsed the same way, so a launcher's view of a key matches the boot's.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

// A leading UTF-8 byte-order mark; foundation/env strips it before parsing, so this reader does too.
const UTF8_BOM = "﻿";
const ENV_FILE = ".env";

export function envFilePath(repoRoot: string): string {
  return join(repoRoot, ENV_FILE);
}

/** The `.env` text, or `null` when there is no file. Any other read failure throws. */
export function readEnvText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/** `.env` text parsed the way foundation/env parses it. */
export function parseEnvText(text: string): Readonly<Record<string, string | undefined>> {
  return parseEnv(text.startsWith(UTF8_BOM) ? text.slice(UTF8_BOM.length) : text);
}
