// The data layout's shapes: the slot keys an operator may override, the raw input and the resolved tree.

/** The env keys that override one slot each; an unset key derives its slot from `DATA_DIR`. */
export const DATA_LAYOUT_SLOT_KEYS = ["DATABASE_URL", "ASSETS_DIR", "LOCAL_LIGHT_CACHE_DIR", "USER_RUNTIME_DIR", "IMPORT_STAGING_DIR"] as const;
export type DataLayoutSlotKey = (typeof DATA_LAYOUT_SLOT_KEYS)[number];

/** The env keys whose explicit value replaces a generated keyfile; a set one keeps the legacy keyfile in place. */
export const SECRET_ENV_KEYS = ["CREDENTIALS_KEY", "SESSION_SECRET"] as const;
export type SecretEnvKey = (typeof SECRET_ENV_KEYS)[number];

/** An env key that, once set, keeps a legacy root entry where it is. */
export type DataLayoutKeeperKey = DataLayoutSlotKey | SecretEnvKey;

/** A legacy root entry a layout migration moves: its target under the root, the env key that keeps it in
 *  place (null when only `DATA_LAYOUT_SKIP` can), and whether an empty file counts as absent. */
export interface LegacyEntry {
  readonly to: string;
  readonly keptBy: DataLayoutKeeperKey | null;
  readonly requireBytes: boolean;
}

/** The raw env values the resolver reads; every key is optional and an empty string counts as unset. */
export interface DataLayoutInput {
  readonly DATA_DIR?: string | undefined;
  readonly DATABASE_URL?: string | undefined;
  readonly ASSETS_DIR?: string | undefined;
  readonly LOCAL_LIGHT_CACHE_DIR?: string | undefined;
  readonly USER_RUNTIME_DIR?: string | undefined;
  readonly IMPORT_STAGING_DIR?: string | undefined;
  readonly CREDENTIALS_KEY?: string | undefined;
  readonly SESSION_SECRET?: string | undefined;
  /** Comma-separated legacy root entries the layout migration leaves where they are. */
  readonly DATA_LAYOUT_SKIP?: string | undefined;
}

/** The resolved tree. Paths keep the root's spelling (cwd-relative or absolute); `explicit` names the keys
 *  the operator set, and `skip` the legacy root entries the operator named, both of which a layout migration
 *  must leave where they are. */
export interface DataLayout {
  readonly root: string;
  readonly databaseUrl: string;
  readonly dbDir: string;
  readonly backups: string;
  readonly assets: string;
  readonly users: string;
  readonly secrets: string;
  readonly reports: string;
  readonly cache: string;
  readonly models: string;
  readonly variants: string;
  readonly importStaging: string;
  /** The pinned cloudflared a share downloads on its first start, bare metal and container alike. */
  readonly relay: string;
  readonly explicit: ReadonlySet<DataLayoutKeeperKey>;
  readonly skip: ReadonlySet<string>;
}
