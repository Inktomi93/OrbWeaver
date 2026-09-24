// The data layout's shapes: the slot keys an operator may override, the raw input and the resolved tree.

/** The env keys that override one slot each; an unset key derives its slot from `DATA_DIR`. */
export const DATA_LAYOUT_SLOT_KEYS = ["DATABASE_URL", "ASSETS_DIR", "LOCAL_LIGHT_CACHE_DIR", "USER_RUNTIME_DIR", "IMPORT_STAGING_DIR"] as const;
export type DataLayoutSlotKey = (typeof DATA_LAYOUT_SLOT_KEYS)[number];

/** The raw env values the resolver reads; every key is optional and an empty string counts as unset. */
export interface DataLayoutInput {
  readonly DATA_DIR?: string | undefined;
  readonly DATABASE_URL?: string | undefined;
  readonly ASSETS_DIR?: string | undefined;
  readonly LOCAL_LIGHT_CACHE_DIR?: string | undefined;
  readonly USER_RUNTIME_DIR?: string | undefined;
  readonly IMPORT_STAGING_DIR?: string | undefined;
}

/** The resolved tree. Paths keep the root's spelling (cwd-relative or absolute); `explicit` names the slots
 *  the operator set, which a layout migration must leave where they are. */
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
  readonly explicit: ReadonlySet<DataLayoutSlotKey>;
}
