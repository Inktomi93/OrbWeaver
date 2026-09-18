// Live Appearance/theme inputs shared by the representative-matrix consumers. The browser bridge owns
// carrier keys/arms; the authenticated catalog owns theme ids. Tool policies own only projections.
import type { Page } from "@playwright/test";
import { z } from "zod";
import { instrumentRefusal } from "./page-validate.ts";
import type { ThemeEntry } from "./theme.ts";
import { themeCatalogCapabilities } from "./theme.ts";
import type { VariantAssignment, VariantAxis } from "./variant-matrix.ts";

// All three dropped by one on 2026-09-18: `backgroundSeededId` left `AppearanceSettings` with the retired
// `kind:"seeded"` background source, and it was a DEPENDENCY row (no arms), so declared and dependencies
// move together while executable is unchanged.
const EXPECTED_DECLARED_APPEARANCE = 40;
const EXPECTED_EXECUTABLE_APPEARANCE = 36;
const EXPECTED_DEPENDENCIES = 4;
const EXPECTED_HISTORICAL_ROWS = 7;
const READ_APPEARANCE_MATRIX_CONTRACT = `(() => {
  const read = globalThis.__orb?.appearanceMatrixContract;
  if (typeof read !== "function") throw new Error("__orb.appearanceMatrixContract is unavailable");
  return read();
})()`;

export interface RuntimeAppearanceContractRow {
  readonly key: string;
  readonly arms: readonly unknown[] | null;
  readonly dependsOn: readonly string[];
  readonly incompatibleWith: readonly string[];
  readonly observable: { readonly kind: "attribute" | "inline-style" | "message-prop"; readonly selector: string; readonly signal: string } | null;
  readonly reached?: number | undefined;
  readonly samples?: readonly unknown[] | undefined;
}

export interface RuntimeMessageRegistryReceipt {
  readonly mounted: number;
  readonly registered: number;
  readonly matched: number;
  readonly missingIds: readonly string[];
  readonly staleIds: readonly string[];
}

export interface RuntimeAppearanceHistoricalSubject {
  readonly id: string;
  readonly selector: string;
  readonly population: "many" | "one";
  readonly sample: "carrier" | "geometry" | "interactive" | "pixel";
}

export interface RuntimeAppearanceHistoricalCascade {
  readonly selector: string;
  readonly property: string;
  readonly sources: readonly string[];
  readonly overloadedSources?: readonly string[] | undefined;
}

export type RuntimeAppearanceHistoricalMerge =
  | {
      readonly mechanism: "merge-required";
      readonly selector: string;
      readonly owner: string;
      readonly conflict: { readonly axis: string; readonly loser: string; readonly winner: string };
    }
  | { readonly mechanism: "merge-not-applicable"; readonly reason: "direct-carrier"; readonly selector: string; readonly owner: string };

export interface RuntimeAppearanceHistoricalRow {
  readonly id: string;
  readonly surface: "chat" | "config-sizing" | "shell";
  readonly subjects: readonly RuntimeAppearanceHistoricalSubject[];
  readonly cascade: readonly RuntimeAppearanceHistoricalCascade[];
  readonly merge: RuntimeAppearanceHistoricalMerge;
  readonly requiredChecks: readonly string[];
  readonly optionalSubjectIds: readonly string[];
}

export interface RuntimeAppearanceContract {
  readonly declared: number;
  readonly executable: number;
  readonly dependencies: number;
  readonly rows: readonly RuntimeAppearanceContractRow[];
  readonly themeObservables: Readonly<Record<string, { readonly selector: string; readonly signals: readonly string[]; readonly lifecycle: string }>>;
  readonly historicalRows: readonly RuntimeAppearanceHistoricalRow[];
  readonly messageRegistry?: RuntimeMessageRegistryReceipt | undefined;
}

const stringArray = z.array(z.string());
const observableSchema = z.object({
  kind: z.enum(["attribute", "inline-style", "message-prop"]),
  selector: z.string(),
  signal: z.string(),
});
const runtimeAppearanceContractRowSchema: z.ZodType<RuntimeAppearanceContractRow> = z.object({
  key: z.string(),
  arms: z.array(z.unknown()).nullable(),
  dependsOn: stringArray,
  incompatibleWith: stringArray,
  observable: observableSchema.nullable(),
  reached: z.number().int().nonnegative().optional(),
  samples: z.array(z.unknown()).optional(),
});
const messageRegistrySchema: z.ZodType<RuntimeMessageRegistryReceipt> = z.object({
  mounted: z.number().int().nonnegative(),
  registered: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative(),
  missingIds: stringArray,
  staleIds: stringArray,
});
const historicalSubjectSchema: z.ZodType<RuntimeAppearanceHistoricalSubject> = z.object({
  id: z.string(),
  selector: z.string(),
  population: z.enum(["many", "one"]),
  sample: z.enum(["carrier", "geometry", "interactive", "pixel"]),
});
const historicalCascadeSchema: z.ZodType<RuntimeAppearanceHistoricalCascade> = z.object({
  selector: z.string(),
  property: z.string(),
  sources: stringArray,
  overloadedSources: stringArray.optional(),
});
const historicalMergeSchema: z.ZodType<RuntimeAppearanceHistoricalMerge> = z.discriminatedUnion("mechanism", [
  z.object({
    mechanism: z.literal("merge-required"),
    selector: z.string(),
    owner: z.string(),
    conflict: z.object({ axis: z.string(), loser: z.string(), winner: z.string() }),
  }),
  z.object({
    mechanism: z.literal("merge-not-applicable"),
    reason: z.literal("direct-carrier"),
    selector: z.string(),
    owner: z.string(),
  }),
]);
const historicalRowSchema: z.ZodType<RuntimeAppearanceHistoricalRow> = z.object({
  id: z.string(),
  surface: z.enum(["chat", "config-sizing", "shell"]),
  subjects: z.array(historicalSubjectSchema),
  cascade: z.array(historicalCascadeSchema),
  merge: historicalMergeSchema,
  requiredChecks: stringArray,
  optionalSubjectIds: stringArray,
});
const runtimeAppearanceContractSchema: z.ZodType<RuntimeAppearanceContract> = z.object({
  declared: z.number().int().nonnegative(),
  executable: z.number().int().nonnegative(),
  dependencies: z.number().int().nonnegative(),
  rows: z.array(runtimeAppearanceContractRowSchema),
  themeObservables: z.record(z.string(), z.object({ selector: z.string(), signals: stringArray, lifecycle: z.string() })),
  historicalRows: z.array(historicalRowSchema),
  messageRegistry: messageRegistrySchema.optional(),
});

export interface DerivedAppearanceContract {
  readonly axes: readonly VariantAxis[];
  readonly dependencies: readonly RuntimeAppearanceContractRow[];
  readonly historicalRows: readonly RuntimeAppearanceHistoricalRow[];
}

export interface AppearanceReachReceipt {
  readonly rows: number;
  readonly subjects: number;
}

export function appearanceArmId(value: unknown): string {
  const encoded: unknown = JSON.stringify(value);
  if (typeof encoded !== "string") {
    return instrumentRefusal("Appearance arm is not JSON-serializable");
  }
  return encoded;
}

function appearanceAxis(row: RuntimeAppearanceContractRow): VariantAxis {
  if (row.arms === null || row.arms.length !== 2 || row.observable === null) {
    return instrumentRefusal(`executable Appearance row ${row.key} does not carry two arms and one observable`);
  }
  return {
    id: `appearance.${row.key}`,
    values: row.arms.map((payload) => ({ id: appearanceArmId(payload), payload })),
  };
}

export function deriveAppearanceContract(contract: RuntimeAppearanceContract): DerivedAppearanceContract {
  const keys = contract.rows.map((row) => row.key);
  const executable = contract.rows.filter((row) => row.arms !== null);
  const dependencies = contract.rows.filter((row) => row.arms === null);
  if (new Set(keys).size !== keys.length) {
    instrumentRefusal("Appearance contract contains duplicate keys");
  }
  if (
    contract.declared !== contract.rows.length ||
    contract.executable !== executable.length ||
    contract.dependencies !== dependencies.length ||
    contract.declared !== EXPECTED_DECLARED_APPEARANCE ||
    contract.executable !== EXPECTED_EXECUTABLE_APPEARANCE ||
    contract.dependencies !== EXPECTED_DEPENDENCIES
  ) {
    instrumentRefusal(
      `Appearance contract population drift: declared=${contract.declared}/${contract.rows.length}, executable=${contract.executable}/${executable.length}, dependencies=${contract.dependencies}/${dependencies.length}`,
    );
  }
  if (Object.keys(contract.themeObservables).length === 0) {
    instrumentRefusal("Appearance contract has no theme observables");
  }
  if (
    contract.historicalRows.length !== EXPECTED_HISTORICAL_ROWS ||
    new Set(contract.historicalRows.map((row) => row.id)).size !== EXPECTED_HISTORICAL_ROWS ||
    contract.historicalRows.some(
      (row) =>
        row.subjects.length === 0 ||
        row.cascade.length === 0 ||
        new Set(row.subjects.map((subject) => subject.id)).size !== row.subjects.length ||
        new Set(row.subjects.map((subject) => subject.selector)).size !== row.subjects.length ||
        row.cascade.some(
          (entry) =>
            entry.selector.length === 0 ||
            entry.property.length === 0 ||
            entry.sources.length === 0 ||
            new Set(entry.sources).size !== entry.sources.length ||
            (entry.overloadedSources !== undefined &&
              (entry.overloadedSources.length === 0 || new Set(entry.overloadedSources).size !== entry.overloadedSources.length)),
        ) ||
        row.requiredChecks.length === 0 ||
        new Set(row.requiredChecks).size !== row.requiredChecks.length ||
        new Set(row.optionalSubjectIds).size !== row.optionalSubjectIds.length ||
        row.optionalSubjectIds.some((id) => !row.subjects.some((subject) => subject.id === id)) ||
        row.merge.selector.length === 0 ||
        row.merge.owner.length === 0 ||
        !row.subjects.some((subject) => subject.selector === row.merge.selector),
    )
  ) {
    instrumentRefusal(`Appearance contract historical-row population drift: rows=${contract.historicalRows.length}`);
  }
  return { axes: executable.map(appearanceAxis), dependencies, historicalRows: contract.historicalRows };
}

/** Read the client-owned live bridge. Tool consumers do not import the client manifest or copy this
 *  evaluation body; the page is the source of truth for the contract it actually rendered. */
export async function readRuntimeAppearanceContract(page: Page): Promise<RuntimeAppearanceContract> {
  // #1004 — the contract is the DENOMINATOR for every axis this tool plans, so a malformed read is a
  // silently smaller matrix, not an error. Counts and the two row lists are settled here; the per-row
  // shape is already re-derived and cross-checked by `deriveAppearanceContract` above.
  return runtimeAppearanceContractSchema.parse(await page.evaluate(READ_APPEARANCE_MATRIX_CONTRACT));
}

function assertMessageRegistryReceipt(registry: RuntimeMessageRegistryReceipt | undefined): void {
  if (
    registry !== undefined &&
    (registry.staleIds.length > 0 || registry.missingIds.length > 0 || registry.matched + registry.staleIds.length !== registry.registered)
  ) {
    instrumentRefusal(
      `live message registry does not reconcile: mounted=${registry.mounted}, registered=${registry.registered}, matched=${registry.matched}, missing=${registry.missingIds.join(",") || "none"}, stale=${registry.staleIds.join(",") || "none"}`,
    );
  }
}

export function appearanceReachReceipt(contract: RuntimeAppearanceContract): AppearanceReachReceipt {
  assertMessageRegistryReceipt(contract.messageRegistry);
  let rows = 0;
  let subjects = 0;
  for (const row of contract.rows) {
    if (typeof row.reached !== "number" || !Number.isInteger(row.reached) || row.reached < 0) {
      instrumentRefusal(`live Appearance row ${row.key} omitted a valid reached-subject count`);
    }
    if (row.reached > 0) {
      if (row.samples === undefined || row.samples.length !== row.reached || row.samples.some((sample) => sample === undefined)) {
        instrumentRefusal(`live Appearance row ${row.key} samples do not reconcile with reached=${row.reached}`);
      }
      rows += 1;
      subjects += row.reached;
    }
  }
  if (rows === 0 || subjects === 0) {
    instrumentRefusal("live Appearance bridge reached zero carrier subjects");
  }
  return { rows, subjects };
}

function firstTheme(entries: readonly ThemeEntry[], capability: string): ThemeEntry {
  const first = [...entries].sort((left, right) => left.id.localeCompare(right.id))[0];
  return first ?? instrumentRefusal(`theme catalog is missing ${capability}`);
}

function preferredCustomTheme(entries: readonly ThemeEntry[], preferred: readonly [ThemeEntry, ThemeEntry], polarity: "dark" | "light"): ThemeEntry {
  const claimed = preferred.find((entry) => entry.polarity === polarity);
  if (claimed === undefined) {
    return instrumentRefusal(`preferred custom-${polarity} fixture omitted that polarity`);
  }
  const authenticated = entries.find((entry) => entry.id === claimed.id);
  if (authenticated === undefined) {
    return instrumentRefusal(`preferred custom-${polarity} theme ${claimed.id} is absent from the authenticated catalog`);
  }
  if (authenticated.isSeed === true || authenticated.polarity !== polarity || authenticated.hasCustomCss !== true) {
    return instrumentRefusal(`preferred custom-${polarity} theme ${claimed.id} does not carry the rated capability`);
  }
  return authenticated;
}

export function representativeMatrixThemes(
  entries: readonly ThemeEntry[],
  preferredCustom: readonly [ThemeEntry, ThemeEntry] | null = null,
): Readonly<Record<string, ThemeEntry>> {
  const capabilities = themeCatalogCapabilities(entries);
  return {
    seed: firstTheme([...capabilities.seed.light, ...capabilities.seed.dark], "seed"),
    "custom-light":
      preferredCustom === null
        ? firstTheme(
            capabilities.custom.light.filter((entry) => entry.hasCustomCss === true),
            "custom-light with custom CSS",
          )
        : preferredCustomTheme(entries, preferredCustom, "light"),
    "custom-dark":
      preferredCustom === null
        ? firstTheme(
            capabilities.custom.dark.filter((entry) => entry.hasCustomCss === true),
            "custom-dark with custom CSS",
          )
        : preferredCustomTheme(entries, preferredCustom, "dark"),
  };
}

export function appearanceArmValueId(axes: readonly VariantAxis[], key: string, payload: unknown): string {
  const axis = axes.find((candidate) => candidate.id === `appearance.${key}`);
  const id = appearanceArmId(payload);
  if (axis === undefined || !axis.values.some((value) => value.id === id)) {
    return instrumentRefusal(`required risk row cannot resolve Appearance arm ${key}=${id}`);
  }
  return id;
}

/** The LIVE background a matrix cell paints with — one entry of the authenticated user's
 *  `appearance.backgroundLibrary`. The `asset` arm of `backgroundImageKind` cannot be completed from a
 *  static source the way the retired `seeded` arm could (a slug into a bundled `public/` catalog), so the
 *  arm's dependent carriers come from the real account state instead. The ten seeded scene plates are what
 *  guarantee the library is non-empty on any install this tool runs against. */
export interface BackgroundCapability {
  readonly assetId: string;
  readonly assetHash: string;
  readonly mime: string;
}

export function appearancePatchForAssignment(
  axes: readonly VariantAxis[],
  assignment: VariantAssignment,
  background: BackgroundCapability | null = null,
): Readonly<Record<string, unknown>> {
  const patch = Object.fromEntries(
    axes.map((axis) => {
      const valueIdForCell = assignment[axis.id];
      const value = axis.values.find((candidate) => candidate.id === valueIdForCell);
      if (value === undefined) {
        return instrumentRefusal(`cell is missing ${axis.id}`);
      }
      return [axis.id.slice("appearance.".length), value.payload];
    }),
  );
  if (patch["backgroundImageKind"] !== "asset") {
    return patch;
  }
  if (background === null) {
    // LOUD, never a silent fall-through to the `none` arm: a cell that cannot paint its background is a cell
    // that measured a DIFFERENT arm than the plan claims, and `data-has-bg-image` would read false while the
    // receipt said `asset`. An empty library on a real install is itself the finding (the scene-plate seed
    // did not run), so the instrument reports it rather than quietly narrowing its own coverage.
    return instrumentRefusal("asset Appearance arm has no live background-library member to paint");
  }
  // backgroundAssetId/Hash/Mime are declared dependencies, not axes. Complete the selected `asset` carrier
  // from the authenticated account's own library rather than promoting the dependencies into fake pairwise
  // coverage. Both thin consumers use this shared projection, so `data-has-bg-image` cannot mean two
  // different things in Snap and design-audit.
  return { ...patch, backgroundAssetId: background.assetId, backgroundAssetHash: background.assetHash, backgroundAssetMime: background.mime };
}
