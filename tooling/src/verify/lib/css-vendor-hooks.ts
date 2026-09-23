// THE VENDOR HALF of the product-CSS selector census: which `data-*` hooks a selector may name because an
// INSTALLED dependency writes them at runtime, and where the committed record of that contract disagrees
// with what is installed.
//
// WHY IT IS A SHARED READER RATHER THAN POLICY CODE. Two policies need it and they need DIFFERENT halves:
// the ordinary `css-selector-has-a-writer` needs the ACQUITTAL (a selector Base UI or Streamdown writes has
// a writer, just not an authored one), and the hard `-health` sibling needs the two-sided RECONCILIATION
// (a committed row with no installed counterpart, and the reverse). Re-deriving `data-${state}` in each
// would be two spellings of one vocabulary.
//
// EVERY INPUT IS AN ALREADY-NARROWED RESOURCE VALUE, never a door. `docs/law/resource-policy-contract.md` §3.2 is
// explicit after #2148: "a shared reader takes the NARROWED VALUE and the caller reads its own door" — the
// carve that admitted a whole `ResourceHost` into a `lib/` reader shipped and was removed, because
// `policy-soundness` ARM E4's population is the gates tree and the guard stopped exactly where the escape
// began. So this module performs no read and holds no state.
//
// THE STREAMDOWN SIDE READS EVERY BUNDLE, NOT A CHUNK NAME. The legacy reader hardcoded
// `packages/ui/node_modules/streamdown/dist/chunk-BO2N2NFS.js` — a CONTENT-HASHED build artifact, so a
// version bump silently pointed the gate at a file that no longer exists and the two-sided arm went blind
// in the acquitting direction. `vendorCssSurface().selectorSources` is the whole `dist/` bundle set and its
// own contract header says why: "a chunk name is a build artifact and a gate pinned to one goes silently
// blind at the next upgrade".
import type { InstalledSurface, SurfaceManifest } from "../contract/baseui.ts";
import type { VendorInstalledFile } from "../contract/resource-vendor.ts";
import type { SelectorHookIdentity } from "./css-family-selector-provenance.ts";
import { hookValueMatches } from "./css-family-selector-provenance.ts";

/** The contracted Streamdown code-block hook, and the exact emission spelling its bundles carry. */
export const STREAMDOWN_HOOK_NAME = "data-streamdown";
export const STREAMDOWN_HOOK_VALUE = "code-block";
const STREAMDOWN_EMISSION = `"${STREAMDOWN_HOOK_NAME}":"${STREAMDOWN_HOOK_VALUE}"`;

export interface VendorHookCensus {
  /** Base UI state attributes present on BOTH sides, mapped to their statically declared values. An empty
   *  value set is a presence-only boolean contract, never "unknown" — the installed reader records exactly
   *  the literal union it read. */
  readonly baseUiAttributes: ReadonlyMap<string, ReadonlySet<string>>;
  /** Committed in the manifest, absent from the installed surface. */
  readonly baseUiManifestOnly: readonly string[];
  /** Present in the installed surface, absent from the committed manifest. */
  readonly baseUiInstalledOnly: readonly string[];
  /** Does an installed Streamdown bundle still emit the contracted code-block hook? */
  readonly streamdownEmitted: boolean;
}

/** Every `data-<state>` attribute a surface's anatomy parts declare. Written against the STRUCTURAL shape
 *  both `InstalledSurface` and `SurfaceManifest` satisfy, so the two sides are read by one function and
 *  cannot drift into two spellings of the same derivation. */
function stateAttributes(surface: InstalledSurface | SurfaceManifest): ReadonlySet<string> {
  const out = new Set<string>();
  for (const component of Object.values(surface.components)) {
    for (const part of Object.values(component.parts)) {
      for (const state of part.state) {
        out.add(`data-${state.toLowerCase()}`);
      }
    }
  }
  return out;
}

function difference(left: ReadonlySet<string>, right: ReadonlySet<string>): readonly string[] {
  return [...left].filter((value) => !right.has(value)).sort();
}

export interface VendorHookInput {
  readonly manifest: SurfaceManifest;
  readonly installed: InstalledSurface;
  /** `data-<state>` → the literal values the installed `*State` interfaces declare. */
  readonly installedValues: ReadonlyMap<string, ReadonlySet<string>>;
  /** Every installed Streamdown bundle under `dist/`. */
  readonly selectorSources: readonly VendorInstalledFile[];
}

/** Reconcile the committed vendor contract against what is installed. Judgment stays in the policies. */
export function readVendorHooks({ manifest, installed, installedValues, selectorSources }: VendorHookInput): VendorHookCensus {
  const manifestAttributes = stateAttributes(manifest);
  const installedAttributes = stateAttributes(installed);
  return {
    baseUiAttributes: new Map(
      [...manifestAttributes].filter((name) => installedAttributes.has(name)).map((name) => [name, installedValues.get(name) ?? new Set<string>()]),
    ),
    baseUiManifestOnly: difference(manifestAttributes, installedAttributes),
    baseUiInstalledOnly: difference(installedAttributes, manifestAttributes),
    streamdownEmitted: selectorSources.some((source) => source.text.includes(STREAMDOWN_EMISSION)),
  };
}

/** Does a vendor write this exact selector identity? The acquittal half, shared so the ordinary policy and
 *  its `-health` sibling cannot disagree about what "a vendor writes it" means. The operator semantics come
 *  from `hookValueMatches` — the SAME predicate the authored-writer side asks, because a hook acquitted by
 *  one question and accused by the other is both written and missing. */
export function vendorWritesHook(census: VendorHookCensus, hook: SelectorHookIdentity): boolean {
  const baseUiValues = census.baseUiAttributes.get(hook.name);
  return (
    (baseUiValues !== undefined && hookValueMatches(hook.operator, hook.value, baseUiValues)) ||
    (hook.name === STREAMDOWN_HOOK_NAME && hook.operator === "=" && hook.value === STREAMDOWN_HOOK_VALUE && census.streamdownEmitted)
  );
}
