// `defineVersionedConfig` — the ONE "versioned blob + lift loop" primitive shared by AppSettings,
// UserSettings, and PromptConfig (the lift loop was copy-pasted across all three; only the schema,
// version, default, and lifts vary). Collapsing it into one owner kills the drift risk. Boot-critical:
// it must exist before `@orb/contracts/settings` AND `@orb/contracts/preset` can compile (shared-
// dissolution §8 — the single most boot-fragile contracts edge).
//
// Parse contract: ALWAYS returns a valid T. A non-object input, a corrupted blob that fails even after
// lifts, or null/undefined → the `default` (the lenient shape; a malformed stored preset degrading to
// its default beats a hard load failure mid-session).

import { isPlainObject } from "@orb/kit/guards";
import { z } from "zod";

// Schema versions are 1-based; v1 is the floor a probe/lift walk starts from.
const INITIAL_VERSION = 1;

export interface VersionedConfigDef<T> {
  /** Final-version Zod schema. Must accept the output of the last lift. */
  schema: z.ZodType<T>;
  /** Current schema version (1-based). Bump and add a lift when the shape changes. */
  version: number;
  /** Maps a blob at version N → a blob at version N+1. Identity for missing keys is a no-op. */
  lifts: Record<number, (config: Record<string, unknown>) => Record<string, unknown>>;
  /** The fully-defaulted value returned on parse failure / non-object input. */
  default: T;
}

export interface VersionedConfig<T> {
  /**
   * Parse a stored blob, lifting older shapes to the current version first.
   *
   * `storedVersion` — the version the STORAGE layer recorded for this blob (e.g. the
   * `user_settings.schemaVersion` column). When provided (a positive integer) it wins over the
   * in-blob `schemaVersion` probe. Callers whose schema strips `schemaVersion` from the persisted
   * blob MUST pass it — otherwise every blob probes as v1 and all lifts re-run on every read, which
   * corrupts data the moment a lift is non-idempotent (the load-bearing invariant).
   */
  parse: (raw: unknown, storedVersion?: number) => T;
  serialize: (value: T) => string;
  readonly default: T;
  readonly currentVersion: number;
}

const versionProbeSchema = z.object({ schemaVersion: z.number().int().optional() });

export function defineVersionedConfig<T>(def: VersionedConfigDef<T>): VersionedConfig<T> {
  return {
    parse(raw: unknown, storedVersion?: number): T {
      if (!isPlainObject(raw)) {
        return def.default;
      }
      const probe = versionProbeSchema.safeParse(raw);
      const probedVersion = probe.success ? (probe.data.schemaVersion ?? INITIAL_VERSION) : INITIAL_VERSION;
      // Externally-recorded version (a storage column) beats the in-blob probe; garbage
      // (non-positive / non-integer) falls back to the probe rather than poisoning the walk.
      let version = storedVersion !== undefined && Number.isInteger(storedVersion) && storedVersion >= INITIAL_VERSION ? storedVersion : probedVersion;
      let config: Record<string, unknown> = raw;
      let lift = def.lifts[version];
      while (lift !== undefined) {
        const next = lift(config);
        if (!isPlainObject(next)) {
          return def.default;
        }
        config = next;
        version += 1;
        lift = def.lifts[version];
      }
      const parsed = def.schema.safeParse(config);
      return parsed.success ? parsed.data : def.default;
    },
    serialize(value: T): string {
      return JSON.stringify(value);
    },
    default: def.default,
    currentVersion: def.version,
  };
}
