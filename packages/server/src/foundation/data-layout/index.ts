// The runtime data layout: one root (`DATA_DIR`) and every path under it, derived here and nowhere else.
// Pure (no env read, no I/O) so tooling can resolve the same tree without parsing the server env. The
// backup rule this shape exists for: copy the root except `cache/`.

import { dirname, join } from "node:path";
import { isBackupFileName } from "@orb/db";
import type { DataLayout, DataLayoutInput, DataLayoutKeeperKey, LegacyEntry } from "./contract.ts";
import { DATA_LAYOUT_SLOT_KEYS, SECRET_ENV_KEYS } from "./contract.ts";

export type { DataLayout, DataLayoutInput, DataLayoutKeeperKey, DataLayoutSlotKey, LegacyEntry, SecretEnvKey } from "./contract.ts";
export { DATA_LAYOUT_SLOT_KEYS, SECRET_ENV_KEYS } from "./contract.ts";

/** The root every slot defaults under, relative to the process cwd like every slot key before it. */
export const DEFAULT_DATA_DIR = "./data";
/** The db file's name. */
export const DB_FILE_NAME = "orbweaver.db";
/** The generated boot secrets' file names under `secrets/`; the container entrypoint writes the same names. */
export const SECRET_FILE_NAMES = { credentialsKey: "credentials_key", sessionSecret: "session_secret" } as const;
/** The generated boot secrets' legacy names at the root, before the layout moved them under `secrets/`. */
export const LEGACY_SECRET_FILE_NAMES = { credentialsKey: ".credentials-key", sessionSecret: ".session-secret" } as const;
/** The env key naming the legacy root entries a layout migration leaves in place, comma-separated. */
export const DATA_LAYOUT_SKIP_KEY = "DATA_LAYOUT_SKIP";

/** Every directory under the root, relative to it. The top-level names are the whole legal root listing. */
export const DATA_LAYOUT_DIRS = {
  db: "db",
  backups: "backups",
  assets: "assets",
  users: "users",
  secrets: "secrets",
  reports: "reports",
  cache: "cache",
  models: "cache/models/transformers",
  variants: "cache/variants",
  importStaging: "cache/import-staging",
} as const;

/** The legacy root entries a layout migration moves, in move order (the db last, so a failure on any other
 *  entry never strands it), each with its target and the env key that keeps it where it is. The db and the
 *  keyfiles move only with bytes: an empty one is what a holder that reopened a moved file leaves behind. */
export const LEGACY_ENTRIES: Readonly<Record<string, LegacyEntry>> = {
  [LEGACY_SECRET_FILE_NAMES.credentialsKey]: {
    to: join(DATA_LAYOUT_DIRS.secrets, SECRET_FILE_NAMES.credentialsKey),
    keptBy: "CREDENTIALS_KEY",
    requireBytes: true,
  },
  [LEGACY_SECRET_FILE_NAMES.sessionSecret]: {
    to: join(DATA_LAYOUT_DIRS.secrets, SECRET_FILE_NAMES.sessionSecret),
    keptBy: "SESSION_SECRET",
    requireBytes: true,
  },
  variants: { to: DATA_LAYOUT_DIRS.variants, keptBy: null, requireBytes: false },
  models: { to: dirname(DATA_LAYOUT_DIRS.models), keptBy: "LOCAL_LIGHT_CACHE_DIR", requireBytes: false },
  "import-staging": { to: DATA_LAYOUT_DIRS.importStaging, keptBy: "IMPORT_STAGING_DIR", requireBytes: false },
  "import-reports": { to: DATA_LAYOUT_DIRS.reports, keptBy: null, requireBytes: false },
  [DB_FILE_NAME]: { to: join(DATA_LAYOUT_DIRS.db, DB_FILE_NAME), keptBy: "DATABASE_URL", requireBytes: true },
};

/** The `DATABASE_URL` that opens the db file at `path`, in the path's own spelling. */
export function fileDatabaseUrl(path: string): string {
  return `file:${path}`;
}

/** The remedy that keeps a keyed legacy entry where it is: the secret's own value, the db's url as a working
 *  `DATABASE_URL=` value, or the slot key. `from` is the entry's path under the root. */
export function keeperRemedy(key: DataLayoutKeeperKey, from: string): string {
  if ((SECRET_ENV_KEYS as readonly string[]).includes(key)) {
    return `set ${key} to the value in ${from}, which keeps the file where it is`;
  }
  if (key === "DATABASE_URL") {
    return `set ${key}=${fileDatabaseUrl(from)} to keep ${from} where it is`;
  }
  return `set ${key} to keep ${from} where it is`;
}

// `join` drops a leading `./`; keep it so a relative root reads as relative in every log line and env dump.
function under(root: string, relative: string): string {
  const joined = join(root, relative);
  return root.startsWith("./") ? `./${joined}` : joined;
}

function isSet(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

// The skip list may name only an entry no env key keeps, or a backup file: a keyed entry has a remedy that
// keeps the app reading it, and a skipped db would boot onto a fresh empty one. A typo fails here, loudly.
function parseSkip(root: string, raw: string | undefined): ReadonlySet<string> {
  const skip = new Set(
    (raw ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name !== ""),
  );
  const skippable = Object.entries(LEGACY_ENTRIES)
    .filter(([, entry]) => entry.keptBy === null)
    .map(([name]) => name);
  for (const name of skip) {
    const entry = LEGACY_ENTRIES[name];
    if (entry !== undefined && entry.keptBy !== null) {
      throw new Error(
        `${DATA_LAYOUT_SKIP_KEY} names ${name}, which it cannot keep: ${keeperRemedy(entry.keptBy, under(root, name))}, and remove ${name} from ${DATA_LAYOUT_SKIP_KEY}`,
      );
    }
    if (entry === undefined && !isBackupFileName(name, DB_FILE_NAME)) {
      throw new Error(
        `${DATA_LAYOUT_SKIP_KEY} names ${name}, which is not a legacy entry it can keep; it takes ${skippable.join(", ")} or a ${DB_FILE_NAME}.backup-<stamp> file`,
      );
    }
  }
  return skip;
}

/**
 * Resolve every data path from the root and the explicit keys.
 * @throws Error when `DATA_LAYOUT_SKIP` names an entry an env key keeps, or a name that is no legacy entry.
 */
export function resolveDataLayout(input: DataLayoutInput): DataLayout {
  const root = isSet(input.DATA_DIR) ? input.DATA_DIR : DEFAULT_DATA_DIR;
  const explicit = new Set<DataLayoutKeeperKey>([...DATA_LAYOUT_SLOT_KEYS, ...SECRET_ENV_KEYS].filter((key) => isSet(input[key])));
  const skip = parseSkip(root, input[DATA_LAYOUT_SKIP_KEY]);
  const dbDir = under(root, DATA_LAYOUT_DIRS.db);
  return {
    root,
    databaseUrl: isSet(input.DATABASE_URL) ? input.DATABASE_URL : fileDatabaseUrl(under(dbDir, DB_FILE_NAME)),
    dbDir,
    backups: under(root, DATA_LAYOUT_DIRS.backups),
    assets: isSet(input.ASSETS_DIR) ? input.ASSETS_DIR : under(root, DATA_LAYOUT_DIRS.assets),
    users: isSet(input.USER_RUNTIME_DIR) ? input.USER_RUNTIME_DIR : under(root, DATA_LAYOUT_DIRS.users),
    secrets: under(root, DATA_LAYOUT_DIRS.secrets),
    reports: under(root, DATA_LAYOUT_DIRS.reports),
    cache: under(root, DATA_LAYOUT_DIRS.cache),
    models: isSet(input.LOCAL_LIGHT_CACHE_DIR) ? input.LOCAL_LIGHT_CACHE_DIR : under(root, DATA_LAYOUT_DIRS.models),
    variants: under(root, DATA_LAYOUT_DIRS.variants),
    importStaging: isSet(input.IMPORT_STAGING_DIR) ? input.IMPORT_STAGING_DIR : under(root, DATA_LAYOUT_DIRS.importStaging),
    explicit,
    skip,
  };
}
