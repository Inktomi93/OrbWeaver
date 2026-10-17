// The manifest shape is shared by native lint and the retained installed-surface and CSS owners.
import type { Disposition, ExportKind, ManifestComponent, ManifestPart, SurfaceManifestRead } from "../contract/baseui.ts";
import { BASE_UI_NATIVE_INPUT_PATHS, DISPOSITIONS, EXPORT_KINDS } from "../contract/baseui.ts";
import type { JsonValue } from "../contract/resource-json.ts";

function refuseManifest(reason: string): SurfaceManifestRead {
  return { ok: false, reason };
}

function isRecord(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: JsonValue | undefined): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isArityMap(value: JsonValue | undefined): value is { readonly [key: string]: number } {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "number");
}

/** One `parts` entry.
 *
 *  ABSENT COLLECTION KEYS DEFAULT TO EMPTY; ONLY A PRESENT-AND-WRONG VALUE REFUSES. That asymmetry is the
 *  LEGACY CONTRACT preserved deliberately, and it was paid for: the first draft of this reader required all
 *  four collections and reported a shape refusal without them, which silenced `baseui-derives-not-respells`
 *  on every fixture that omits `state` — a gate that reads `handlers`/`props` and never touches `state`, so
 *  the legacy `as SurfaceManifest` cast let it through. `tests/tooling/ui-gate-structural-regressions.int.test.ts`
 *  caught it. The real committed ledger carries all nine keys on all 292 parts (measured 2026-09-13), so the
 *  tolerance costs nothing there; what it buys is that TIGHTENING A SHARED READ does not silently disarm a
 *  consumer that never wanted the tightened field. The identity fields — `kind`, `symbol`, `from`,
 *  `disposition`, `why` — are required, because a part with no ruling or no alias target is not a row. */
function manifestPart(value: JsonValue, at: string): ManifestPart | string {
  if (!isRecord(value)) {
    return `${at} is not an object`;
  }
  const { kind, symbol, from, props, handlers, state, inherits, disposition, why } = value;
  if (typeof kind !== "string" || !(EXPORT_KINDS as readonly string[]).includes(kind)) {
    return `${at}.kind is not one of ${EXPORT_KINDS.join("/")}`;
  }
  if (typeof symbol !== "string" || typeof from !== "string" || typeof why !== "string") {
    return `${at} is missing a string symbol/from/why`;
  }
  const wrongCollection = Object.entries({ props, state, inherits }).find(([, entry]) => entry !== undefined && !isStringArray(entry));
  if (wrongCollection !== undefined) {
    return `${at}.${wrongCollection[0]} is present but is not a string array`;
  }
  if (handlers !== undefined && !isArityMap(handlers)) {
    return `${at}.handlers is present but is not a name-to-arity map`;
  }
  if (typeof disposition !== "string" || !(DISPOSITIONS as readonly string[]).includes(disposition)) {
    return `${at}.disposition is not one of ${DISPOSITIONS.join("/")}`;
  }
  return {
    kind: kind as ExportKind,
    symbol,
    from,
    props: isStringArray(props) ? props : [],
    handlers: isArityMap(handlers) ? handlers : {},
    state: isStringArray(state) ? state : [],
    inherits: isStringArray(inherits) ? inherits : [],
    disposition: disposition as Disposition,
    why,
  };
}

function manifestComponent(value: JsonValue, at: string): ManifestComponent | string {
  if (!isRecord(value)) {
    return `${at} is not an object`;
  }
  const { module, namespaced, parts } = value;
  if (typeof module !== "string" || typeof namespaced !== "boolean") {
    return `${at} is missing a string module or a boolean namespaced`;
  }
  if (!isRecord(parts)) {
    return `${at}.parts is not an object`;
  }
  const read: Record<string, ManifestPart> = {};
  for (const [name, part] of Object.entries(parts)) {
    const one = manifestPart(part, `${at}.parts.${name}`);
    if (typeof one === "string") {
      return one;
    }
    read[name] = one;
  }
  return { module, namespaced, parts: read };
}

export function surfaceManifestFrom(value: JsonValue): SurfaceManifestRead {
  if (!isRecord(value)) {
    return refuseManifest("the manifest is not a JSON object");
  }
  if (typeof value["version"] !== "string") {
    return refuseManifest("the manifest has no string `version`");
  }
  const components = value["components"];
  if (!isRecord(components)) {
    return refuseManifest("the manifest has no `components` object");
  }
  const read: Record<string, ManifestComponent> = {};
  for (const [name, component] of Object.entries(components)) {
    const one = manifestComponent(component, `components.${name}`);
    if (typeof one === "string") {
      return refuseManifest(one);
    }
    read[name] = one;
  }
  return { ok: true, manifest: { version: value["version"], components: read } };
}

/** A metadata file, its deletion or an enclosing folder invalidates the native seal verdicts. */
export function affectsBaseUiLint(path: string): boolean {
  const prefix = path.replace(/\/$/u, "");
  return path === "." || BASE_UI_NATIVE_INPUT_PATHS.some((input) => input === path || input.startsWith(`${prefix}/`));
}
