// Live Appearance/theme inputs shared by the representative-matrix consumers. The browser bridge owns
// carrier keys/arms; the authenticated catalog owns theme ids. Tool policies own only projections.
// The bridge is parsed with the shapes in `@orb/kit/appearance-manifest` and checked against its rows.
import type { AppearanceMatrixBridgeContract } from "@orb/client/agent-bridge-contract";
import type { AppearanceMessageRegistryReceipt } from "@orb/kit/appearance-manifest";
import {
  APPEARANCE_HISTORICAL_ROW_IDS,
  appearanceCarrierContract,
  appearanceMatrixContractRowSchema,
  appearanceMatrixContractSchema,
  appearanceMessageRegistryReceiptSchema,
} from "@orb/kit/appearance-manifest";
import type { AssetId } from "@orb/kit/ids";
import type { Page } from "@playwright/test";
import { z } from "zod";
import { instrumentRefusal } from "../browser/page-validate.ts";
import type { VariantAssignment, VariantAxis } from "../variant-matrix/variant-matrix.ts";
import type { ThemeEntry } from "./theme.ts";
import { themeCatalogCapabilities } from "./theme.ts";

/** The app's reduced-motion setting is `system | on | off`; the matrices exercise `on` against `system`, the manifest's two arms. */
export const APP_REDUCED_MOTION_ON = "on";
export const APP_REDUCED_MOTION_SYSTEM = "system";

// Runs in the page, so it carries no import. It reads through `globalThis.__orb`, so a renamed accessor fails the typecheck.
function readAppearanceMatrixContract(): AppearanceMatrixBridgeContract {
  const read = globalThis.__orb?.appearanceMatrixContract;
  if (typeof read !== "function") {
    throw new Error("__orb.appearanceMatrixContract is unavailable");
  }
  return read();
}

// The live read leaves the bridge's per-row reach evidence optional: `appearanceReachReceipt` refuses an omission by name.
const runtimeAppearanceContractRowSchema = appearanceMatrixContractRowSchema.extend({
  reached: z.number().int().nonnegative().optional(),
  samples: z.array(z.unknown()).readonly().optional(),
});
const runtimeAppearanceContractSchema = appearanceMatrixContractSchema.extend({
  rows: z.array(runtimeAppearanceContractRowSchema).readonly(),
  messageRegistry: appearanceMessageRegistryReceiptSchema.optional(),
});

export type RuntimeAppearanceContract = z.infer<typeof runtimeAppearanceContractSchema>;
export type RuntimeAppearanceContractRow = RuntimeAppearanceContract["rows"][number];

export interface DerivedAppearanceContract {
  readonly axes: readonly VariantAxis[];
  readonly dependencies: readonly RuntimeAppearanceContractRow[];
  readonly historicalRows: RuntimeAppearanceContract["historicalRows"];
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
  // The live bridge must report the checked-in manifest's population exactly; a drift here is a stale bundle, not a new axis.
  const manifest = appearanceCarrierContract();
  const manifestKeys = new Set<string>(manifest.rows.map((row) => row.key));
  if (
    contract.declared !== contract.rows.length ||
    contract.executable !== executable.length ||
    contract.dependencies !== dependencies.length ||
    contract.declared !== manifest.declared ||
    contract.executable !== manifest.executable ||
    contract.dependencies !== manifest.dependencies ||
    keys.some((key) => !manifestKeys.has(key))
  ) {
    instrumentRefusal(
      `Appearance contract population drift: declared=${contract.declared}/${contract.rows.length}/${manifest.declared}, executable=${contract.executable}/${executable.length}/${manifest.executable}, dependencies=${contract.dependencies}/${dependencies.length}/${manifest.dependencies} (reported/rows/manifest)`,
    );
  }
  if (Object.keys(contract.themeObservables).length === 0) {
    instrumentRefusal("Appearance contract has no theme observables");
  }
  if (
    contract.historicalRows.length !== APPEARANCE_HISTORICAL_ROW_IDS.length ||
    new Set(contract.historicalRows.map((row) => row.id)).size !== APPEARANCE_HISTORICAL_ROW_IDS.length ||
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
    instrumentRefusal(`Appearance contract historical-row population drift: rows=${contract.historicalRows.length}/${APPEARANCE_HISTORICAL_ROW_IDS.length}`);
  }
  return { axes: executable.map(appearanceAxis), dependencies, historicalRows: contract.historicalRows };
}

/** Read the client-owned live bridge. Tool consumers do not import the client manifest or copy this
 *  evaluation body; the page is the source of truth for the contract it actually rendered. */
export async function readRuntimeAppearanceContract(page: Page): Promise<RuntimeAppearanceContract> {
  // The contract is the DENOMINATOR for every axis this tool plans, so a malformed read is a
  // silently smaller matrix, not an error. Counts and the two row lists are settled here; the per-row
  // shape is already re-derived and cross-checked by `deriveAppearanceContract` above.
  // `satisfies` holds the projection to what the client publishes: a client change this projection no longer takes fails the typecheck.
  return runtimeAppearanceContractSchema.parse((await page.evaluate(readAppearanceMatrixContract)) satisfies RuntimeAppearanceContract);
}

function assertMessageRegistryReceipt(registry: AppearanceMessageRegistryReceipt | undefined): void {
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
  const first = entries.toSorted((left, right) => left.id.localeCompare(right.id))[0];
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
  readonly assetId: AssetId;
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
