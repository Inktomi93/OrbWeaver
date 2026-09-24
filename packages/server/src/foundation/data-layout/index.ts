// The runtime data layout: one root (`DATA_DIR`) and every path under it, derived here and nowhere else.
// Pure (no env read, no I/O) so tooling can resolve the same tree without parsing the server env. The
// backup rule this shape exists for: copy the root except `cache/`.

import { join } from "node:path";
import type { DataLayout, DataLayoutInput, DataLayoutSlotKey } from "./contract.ts";
import { DATA_LAYOUT_SLOT_KEYS } from "./contract.ts";

export type { DataLayout, DataLayoutInput, DataLayoutSlotKey } from "./contract.ts";
export { DATA_LAYOUT_SLOT_KEYS } from "./contract.ts";

/** The root every slot defaults under, relative to the process cwd like every slot key before it. */
export const DEFAULT_DATA_DIR = "./data";
/** The db file's name. */
export const DB_FILE_NAME = "orbweaver.db";
/** The generated boot secrets' file names under `secrets/`; the container entrypoint writes the same names. */
export const SECRET_FILE_NAMES = { credentialsKey: "credentials_key", sessionSecret: "session_secret" } as const;

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

// `join` drops a leading `./`; keep it so a relative root reads as relative in every log line and env dump.
function under(root: string, relative: string): string {
  const joined = join(root, relative);
  return root.startsWith("./") ? `./${joined}` : joined;
}

function isSet(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

/** Resolve every data path from the root and the explicit slot keys. */
export function resolveDataLayout(input: DataLayoutInput): DataLayout {
  const root = isSet(input.DATA_DIR) ? input.DATA_DIR : DEFAULT_DATA_DIR;
  const explicit = new Set<DataLayoutSlotKey>(DATA_LAYOUT_SLOT_KEYS.filter((key) => isSet(input[key])));
  const dbDir = under(root, DATA_LAYOUT_DIRS.db);
  return {
    root,
    databaseUrl: isSet(input.DATABASE_URL) ? input.DATABASE_URL : `file:${under(dbDir, DB_FILE_NAME)}`,
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
  };
}
