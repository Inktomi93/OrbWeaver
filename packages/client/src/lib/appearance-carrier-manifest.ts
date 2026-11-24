// Binds the Appearance carrier manifest (#935) to the client's settings schema and writes its channels onto the root.
// The rows live in `@orb/kit/appearance-manifest`, which the floor tooling reads too; this file holds what kit cannot:
// the type-level proof that every settings key has one row, its owner lists it, its channel and arms fit its value
// type, and every armed row has an observation. Appearance is intentionally multi-plane: root-wide values must reach
// portals, density belongs on the ThemeScope shared by the grid and portal root, background media paints before that
// scope, and message skins stay prop-driven. The manifest describes those boundaries; it is not permission to collapse them.

import type { AppearanceSettings } from "@orb/contracts/settings";
import type {
  AppearanceCarrierKey,
  AppearanceCarrierObservable,
  AppearanceCarrierPlane,
  AppearanceChannel,
  AppearanceConsumerBinding,
  AppearanceEditorOwner,
  AppearanceLifecycle,
  AppearanceMatrixContract,
  AppearancePortalObligation,
  AppearancePreferenceCondition,
} from "@orb/kit/appearance-manifest";
import {
  APPEARANCE_CHANNEL_ROWS,
  appearanceCarrierContract,
  CHANNEL_BY_KEY,
  APPEARANCE_CARRIER_OBSERVABLES as MANIFEST_OBSERVABLES,
  APPEARANCE_OWNER_KEYS as MANIFEST_OWNER_KEYS,
  APPEARANCE_CARRIER_MANIFEST as MANIFEST_ROWS,
} from "@orb/kit/appearance-manifest";
import type { MEDIA_QUERIES } from "@orb/ui/tokens";
import { APPEARANCE_HISTORICAL_ROWS } from "./appearance-invariant-manifest.ts";

// Kit's channel with its OS preference held to a real media query, so a preference the generated CSS cannot resolve fails here. */
type BoundChannel =
  | Extract<AppearanceChannel, { readonly kind: "property" | "none" }>
  | { readonly kind: "attribute"; readonly preference?: Extract<keyof typeof MEDIA_QUERIES, AppearancePreferenceCondition> };

/** A number reaches CSS as a property; every other value as an attribute. */
type ChannelFor<V> = Extract<BoundChannel, { readonly kind: "none" | (V extends number ? "property" : "attribute") }>;

/** The portal obligation each carrier plane owes. A row's `portal` is the one its FIRST carrier implies. */
const PORTAL_BY_CARRIER = {
  "root-html": "must-reach-portals",
  "theme-scope": "shared-theme-scope-sibling",
  "shell-grid": "grid-only",
  "background-layer": "outside-theme-scope",
  "message-props": "prop-threaded",
  "source-catalog": "none",
} as const satisfies Readonly<Record<AppearanceCarrierPlane, AppearancePortalObligation>>;

/** At least one carrier, and a portal obligation that agrees with the first one. */
type CarrierPortalPairing = {
  readonly [Plane in AppearanceCarrierPlane]: {
    readonly carriers: readonly [Plane, ...AppearanceCarrierPlane[]];
    readonly portal: (typeof PORTAL_BY_CARRIER)[Plane];
  };
}[AppearanceCarrierPlane];

/** The editor owners whose key list names `K`, so a row cannot claim an owner that does not own its key. */
type OwnerOf<K extends keyof AppearanceSettings> = {
  readonly [Owner in AppearanceEditorOwner]: K extends (typeof APPEARANCE_OWNER_KEYS)[Owner][number] ? Owner : never;
}[AppearanceEditorOwner];

/** A value a matrix cell applies; a list setting takes it as a frozen literal, which the manifest's `as const` rows are. */
type ArmOf<Value> = Value extends readonly (infer Member)[] ? readonly Member[] : Value;

type AppearanceCarrierRow<K extends keyof AppearanceSettings> = CarrierPortalPairing & {
  readonly owner: OwnerOf<K>;
  readonly channel: ChannelFor<AppearanceSettings[K]>;
  readonly consumer: AppearanceConsumerBinding;
  readonly lifecycle: AppearanceLifecycle;
  readonly requiredDistinctArms?: readonly [ArmOf<AppearanceSettings[K]>, ArmOf<AppearanceSettings[K]>];
  readonly dependsOn?: readonly (keyof AppearanceSettings)[];
  readonly incompatibleWith?: readonly (keyof AppearanceSettings)[];
};

// `-?` keeps an optional schema leaf required here; the homomorphic map would carry its `?` and let a row go missing.
type AppearanceCarrierManifest = { readonly [K in keyof AppearanceSettings]-?: AppearanceCarrierRow<K> };

/** The editor owners' key lists, held to the settings schema's keys. */
export const APPEARANCE_OWNER_KEYS = MANIFEST_OWNER_KEYS satisfies Record<AppearanceEditorOwner, readonly (keyof AppearanceSettings)[]>;

/**
 * The per-key contract. `satisfies AppearanceCarrierManifest` makes a missing/stale schema key, a row whose
 * owner does not list its key, an empty carrier list, and a carrier/portal mismatch type errors;
 * `tests/client/lib/appearance-carrier-manifest.test.ts` reconciles the same map with the Zod leaves,
 * editor tuples, and named live consumer declarations so a cast cannot hide drift.
 */
export const APPEARANCE_CARRIER_MANIFEST = MANIFEST_ROWS satisfies AppearanceCarrierManifest;

type AppearanceCarrierObservableManifest = {
  readonly [K in AppearanceCarrierKey as (typeof APPEARANCE_CARRIER_MANIFEST)[K] extends { readonly requiredDistinctArms: readonly [unknown, unknown] }
    ? K
    : never]: AppearanceCarrierObservable;
};

/** The browser-readable outcome for every two-arm row; an armed row without an executable observation is a type error here. */
export const APPEARANCE_CARRIER_OBSERVABLES = MANIFEST_OBSERVABLES satisfies AppearanceCarrierObservableManifest;

/** An attribute carries a list as its space-separated members, so CSS matches one member with `~=`. */
function channelValue(value: AppearanceSettings[AppearanceCarrierKey]): string {
  return Array.isArray(value) ? value.map((member) => (typeof member === "string" ? member : "")).join(" ") : String(value);
}

/** The DOM surface the channel writes through; both writers pass `document.documentElement`. Structural, because
 *  the lint and the generator load this module without the DOM lib. */
interface AppearanceChannelRoot {
  readonly style: { readonly setProperty: (name: string, value: string) => void; readonly removeProperty: (name: string) => string };
  readonly setAttribute: (name: string, value: string) => void;
  readonly removeAttribute: (name: string) => void;
}

/** Write every given root-carried setting onto its channel. The shell writes the whole block; the boot replay writes the axes it remembers. */
export function writeAppearanceChannel(root: AppearanceChannelRoot, values: Partial<AppearanceSettings>): void {
  for (const row of APPEARANCE_CHANNEL_ROWS) {
    const value = values[row.key];
    if (value === undefined) {
      continue;
    }
    if (row.kind === "property") {
      root.style.setProperty(row.name, channelValue(value));
    } else {
      root.setAttribute(row.name, channelValue(value));
    }
  }
}

/** Remove the given keys' channel names, so an unmounted shell leaves no stale value on the root. */
export function clearAppearanceChannel(root: AppearanceChannelRoot, keys: readonly AppearanceCarrierKey[]): void {
  for (const key of keys) {
    const row = CHANNEL_BY_KEY.get(key);
    if (row?.kind === "property") {
      root.style.removeProperty(row.name);
    } else if (row?.kind === "attribute") {
      root.removeAttribute(row.name);
    }
  }
}

/** Browser-serializable matrix input: the carrier roster the manifest derives, joined to `appearance-invariant-manifest.ts`'s
 * literal historical policies. The rated consumers read both from here; copying selectors or flattening those policies into
 * another matrix would sever source ownership. The debug bridge adds current reached-subject counts. */
export function appearanceMatrixContract(): AppearanceMatrixContract {
  return { ...appearanceCarrierContract(), historicalRows: APPEARANCE_HISTORICAL_ROWS };
}
