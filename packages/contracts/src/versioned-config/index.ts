// `defineVersionedConfig` — the ONE "versioned blob + lift loop" primitive shared by AppSettings,
// UserSettings, and PromptConfig (the lift loop was copy-pasted across all three; only the schema,
// version, default, and lifts vary). Collapsing it into one owner kills the drift risk. Boot-critical:
// it must exist before `@orb/contracts/settings` AND `@orb/contracts/preset` can compile (shared-
// dissolution §8 — the single most boot-fragile contracts edge).
//
// Parse contract: ALWAYS returns a valid T. A non-object input, a corrupted blob that fails even after
// lifts, or null/undefined → the `default` (the lenient shape; a malformed stored preset degrading to
// its default beats a hard load failure mid-session).
//
// …but degrading is only correct for the CURRENT REQUEST. A read-modify-WRITE that cannot tell the
// degraded stand-in from the real blob persists the default and destroys the user's data silently (#471 —
// the proven cause of the #461 settings wipe). `parseOutcome` is that discriminator: same value as
// `parse`, plus whether it is the stored blob or a stand-in for one that could not be read. Every write
// seam branches on it (`domain/settings/substrate/stored-config.ts`); read seams keep using `parse`.
//
// TWO ways `intact: true` used to LIE, both fixed here (#1364/#1365 — the same wipe family as #461):
//
//  1. A blob from the FUTURE (a newer build wrote it; a rollback / branch switch / older client reads it).
//     There is no lift for a version ABOVE `def.version`, so the walk never runs and the current
//     (non-strict) schema simply STRIPS every field this build has never heard of — a successful parse
//     over a truncated blob. READ POSTURE (chosen deliberately, #1364): serve the stripped value so the
//     session stays usable, but report `intact: false` + `versionFromFuture` so every write seam REFUSES.
//     Degrading the VALUE to `default` instead would read to the user as "my settings reset", which is the
//     visible half of the very failure this guard exists to prevent; the write refusal is the load-bearing
//     half. (A future blob the current schema cannot parse at all still falls back to `default`.)
//  2. A leaf that SELF-HEALS with `.catch()`. `intact` is decided by `def.schema.safeParse`, so a leaf
//     that catches its own failure makes the parse succeed over data the blob no longer carries —
//     `intact: true` cannot mean "the stored blob was fully read" while any `.catch()` sits below it.
//     A whole-COLLECTION `.catch([])` therefore erases every good row with the one bad one, invisibly to
//     the guard (#1365, `appearance.backgroundLibrary`). Collection leaves under a versioned config use
//     {@link tolerantArray} — one bad element costs one element. SWEEP RECORDED 2026-09-04, EXTENDED
//     2026-09-05 (#1532) over the three tenants (`appSettingsConfig`, `userSettingsConfig`,
//     `promptConfigConfig`) — FIVE array leaves, FOUR verdicts. `appearance.backgroundLibrary` +
//     `chat.customStoppingStrings` carry user CONTENT and moved to `tolerantArray`; `appearance.blurSurfaces`
//     KEEPS its whole-collection self-heal because an empty set is itself a meaningful stored value there
//     (filtering would fabricate a deliberate opt-out — the reasoning is at its own leaf);
//     `appSettings.importSkipCharacters` keeps `.catch(undefined)` because `undefined` there is the CLEAR
//     sentinel ("unset — inherit the env floor", `settings/index.ts:363`), not an empty list, so its degrade
//     is visible as "unset" on the admin surface rather than as silent loss; `chat.autoSwipe.blacklist`
//     (`settings/index.ts`, the `autoSwipe` object) carries NO `.catch` AT ALL — the FOURTH verdict, LOUD not
//     LOSSY: one non-string element fails `z.array(z.string())`, which fails the enclosing `autoSwipe` object
//     (its own `.prefault({})` only supplies a MISSING object, it does not cushion an internal validation
//     failure), which fails the whole blob — every settings write for that user refuses until the blacklist
//     is fixed, rather than silently losing an entry. Left AS-IS (not moved to `tolerantArray`): unlike
//     `customStoppingStrings`, a blacklist entry is compared against `{{user}}`/`{{char}}`-resolved reply
//     text at swipe time, so a SILENTLY dropped entry is a silent BEHAVIOR regression (fewer things trigger
//     an auto-swipe) with no on-screen signal, where the loud refusal at least surfaces at the write. Ends if
//     that tradeoff is re-judged the other way (then it takes the same `tolerantArray` move as its siblings).
//     The object-valued `.catch(undefined)` override groups (`memoryDefaults`, `rateLimits`,
//     `memorySummarizer`, `engineLaunch`, …) keep their documented whole-group self-heal — they are
//     re-enterable admin overrides, and the file states that tradeoff at `settings/index.ts:59,87,198`.
//     Scalar `.catch()` leaves are unchanged: self-heal is right for a scalar.

import { isPlainObject } from "@orb/kit/guards";
import { z } from "zod";

// Schema versions are 1-based; v1 is the floor a probe/lift walk starts from.
const INITIAL_VERSION = 1;

/** Why a stored blob could not be read as `T` — the honest reason a WRITE seam refuses on. */
export const VERSIONED_PARSE_FAILURES = {
  /** The stored value is not a plain object (null/undefined, a scalar, an array, a truncated write). */
  notAnObject: "not-an-object",
  /** A lift in the walk returned a non-object — the migration chain broke on this blob. */
  liftBrokeShape: "lift-broke-shape",
  /** The final-version schema rejected the (possibly lifted) blob. */
  schemaRejected: "schema-rejected",
  /**
   * The blob's version is NEWER than this build knows: there is no lift for it, so the current schema
   * would silently STRIP every field this build has never heard of (#1364). The value is still served
   * (see the read posture in the header) but no write may be derived from it.
   */
  versionFromFuture: "version-from-future",
} as const;

export type VersionedParseFailure = (typeof VERSIONED_PARSE_FAILURES)[keyof typeof VERSIONED_PARSE_FAILURES];

/** The FIRST zod issue off a `schema-rejected` failure (#1592) — enough for a caller to name WHICH field
 *  blew the schema, without carrying the whole zod `ZodError` (an internal detail this contract has never
 *  otherwise leaked). `path` is dot-joined (`"sections.0.content"`), never the raw `PropertyKey[]` — a
 *  caller renders it, never re-walks it structurally (walking it back to source vocabulary, e.g. an ST
 *  prompt identifier, is the CALLER's domain knowledge, not this primitive's). */
export interface VersionedParseIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * `parse`'s value plus its PROVENANCE. `intact: true` ⇒ `value` IS the stored blob (lifted + validated);
 * `intact: false` ⇒ `value` is a STAND-IN for a blob that could not be read faithfully — the `default`,
 * or (for `version-from-future` only) the stored blob minus the fields this build cannot represent — and
 * overwriting storage with anything derived from it would destroy the real data (#471/#1364).
 *
 * `issue` is populated ONLY for `schema-rejected` (#1592) — the one failure with a zod error to name; a
 * write-time REFUSAL (`requireIntactStoredConfig`) still names only the table/scope, never blob contents
 * (the leak-free posture), but an IMPORT door reading its own freshly-mapped value back through this seam
 * is not reading someone else's stored blob, so naming the offending field there is safe and load-bearing
 * (the #1592 defect: a 100k-character prompt's owner could not tell which prompt to shrink).
 */
export type VersionedParseOutcome<T> =
  | { readonly intact: true; readonly value: T }
  | { readonly intact: false; readonly value: T; readonly failure: VersionedParseFailure; readonly issue?: VersionedParseIssue };

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
  /**
   * `parse` with its provenance attached — the ONLY read a write path may build on. Same walk, same
   * value; the caller learns whether it got the stored blob or a degraded stand-in (#471).
   *
   * Absence is the CALLER's to model: a never-written blob arrives here as `undefined` and reports
   * `not-an-object`, which is honest (there is nothing to read) but is NOT a corruption — a write seam
   * checks "row absent?" first and only then asks this.
   */
  parseOutcome: (raw: unknown, storedVersion?: number) => VersionedParseOutcome<T>;
  serialize: (value: T) => string;
  readonly default: T;
  readonly currentVersion: number;
}

const versionProbeSchema = z.object({ schemaVersion: z.number().int().optional() });

/**
 * The version the walk STARTS from: the externally-recorded version (a storage column) beats the in-blob
 * probe; garbage (non-positive / non-integer) falls back to the probe rather than poisoning the walk.
 */
function startVersion(raw: Record<string, unknown>, storedVersion: number | undefined): number {
  const probe = versionProbeSchema.safeParse(raw);
  const probedVersion = probe.success ? (probe.data.schemaVersion ?? INITIAL_VERSION) : INITIAL_VERSION;
  return storedVersion !== undefined && Number.isInteger(storedVersion) && storedVersion >= INITIAL_VERSION ? storedVersion : probedVersion;
}

/** The first zod issue off a failed `safeParse`, in this contract's own (dot-path) shape — `undefined` only
 *  when zod reports success (never called on that arm) or, defensively, an empty issue list. */
function firstIssue(parsed: z.ZodSafeParseError<unknown>): VersionedParseIssue | undefined {
  const issue = parsed.error.issues[0];
  return issue === undefined ? undefined : { path: issue.path.join("."), message: issue.message };
}

/** The verdict once the lift walk is done: a from-the-future blob (served, never intact), a schema pass
 *  (intact), or a schema rejection (degraded, carrying the first offending field — #1592). Split out of
 *  `parseOutcome` purely to keep that function's own branching under the complexity ceiling. */
function verdictAfterLifts<T>(def: VersionedConfigDef<T>, config: Record<string, unknown>, version: number): VersionedParseOutcome<T> {
  const parsed = def.schema.safeParse(config);
  if (version > def.version) {
    // A blob from a NEWER build (#1364). The walk above cannot have lifted it — lifts only go forward — so
    // `parsed.data` is the stored blob with every unknown field stripped. Serve it (the session stays
    // usable) and mark it NOT intact so the write seams refuse; header §1 states the posture.
    return { intact: false, value: parsed.success ? parsed.data : def.default, failure: VERSIONED_PARSE_FAILURES.versionFromFuture };
  }
  if (parsed.success) {
    return { intact: true, value: parsed.data };
  }
  const issue = firstIssue(parsed);
  return { intact: false, value: def.default, failure: VERSIONED_PARSE_FAILURES.schemaRejected, ...(issue === undefined ? {} : { issue }) };
}

export function defineVersionedConfig<T>(def: VersionedConfigDef<T>): VersionedConfig<T> {
  const degraded = (failure: VersionedParseFailure): VersionedParseOutcome<T> => ({ intact: false, value: def.default, failure });

  // The ONE walk. `parse` is this minus the provenance, so the two can never disagree.
  const parseOutcome = (raw: unknown, storedVersion?: number): VersionedParseOutcome<T> => {
    if (!isPlainObject(raw)) {
      return degraded(VERSIONED_PARSE_FAILURES.notAnObject);
    }
    let version = startVersion(raw, storedVersion);
    let config: Record<string, unknown> = raw;
    let lift = def.lifts[version];
    while (lift !== undefined) {
      const next = lift(config);
      if (!isPlainObject(next)) {
        return degraded(VERSIONED_PARSE_FAILURES.liftBrokeShape);
      }
      config = next;
      version += 1;
      lift = def.lifts[version];
    }
    return verdictAfterLifts(def, config, version);
  };

  return {
    parse(raw: unknown, storedVersion?: number): T {
      return parseOutcome(raw, storedVersion).value;
    },
    parseOutcome,
    serialize(value: T): string {
      return JSON.stringify(value);
    },
    default: def.default,
    currentVersion: def.version,
  };
}

/**
 * A COLLECTION leaf for a versioned config: element-wise tolerance instead of a whole-array `.catch()`.
 * One malformed element costs THAT element; every readable element survives (#1365 — a single malformed
 * `backgroundLibrary` row erased the whole library, and because the array's own `.catch([])` made the
 * parse succeed, `parseOutcome` reported `intact: true` and the #471 write guard persisted the erasure).
 *
 * `whenNotAnArray` is the only whole-collection fallback left, and it fires ONLY when the stored value is
 * not an array at all — a shape with no element-wise reading. It exists because
 * `appearanceSettingsSchema.parse()` is contractually TOTAL (the client's device-local boot hint parses an
 * untrusted localStorage blob through it and must not throw — `client/src/state/appearance-boot-hint.ts:90`).
 *
 * Lives here rather than in a schema module because it is the other half of the `intact` contract above:
 * this is what a leaf must use so `intact: true` keeps meaning "the stored blob was fully read".
 */
export function tolerantArray<T>(entry: z.ZodType<T>, whenNotAnArray: readonly T[]): z.ZodType<T[], unknown> {
  return z
    .array(z.unknown())
    .transform((rows): T[] =>
      rows.flatMap((row): T[] => {
        const parsed = entry.safeParse(row);
        return parsed.success ? [parsed.data] : [];
      }),
    )
    .catch([...whenNotAnArray]);
}
