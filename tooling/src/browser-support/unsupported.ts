// Which browser-compat keys (`api.Element.computedStyleMap`, `css.properties.field-sizing`) some declared browser floor cannot run,
// read from web-features' per-key support. A key web-features does not carry is unknown and never refused.
import { features } from "web-features";

/** Our esbuild-style target names → the web-features browser ids. */
const BROWSER_IDS: Readonly<Record<string, string>> = { chrome: "chrome", edge: "edge", firefox: "firefox", safari: "safari", ios: "safari_ios" };
const TARGET = /^([a-z]+)(\d+(?:\.\d+)?)$/u;

function floorsOf(targets: readonly string[]): ReadonlyMap<string, number> {
  const floors = new Map<string, number>();
  for (const target of targets) {
    const [, name, version] = TARGET.exec(target) ?? [];
    const id = BROWSER_IDS[name ?? ""];
    if (version === undefined || id === undefined) {
      throw new Error(`Browser target "${target}" has no web-features browser; map it in browser-support/unsupported.ts.`);
    }
    floors.set(id, Number.parseFloat(version));
  }
  return floors;
}

/** Each compat key a floor in `targets` lacks → the browser ids that lack it. */
export function unsupportedAtFloor(targets: readonly string[]): ReadonlyMap<string, readonly string[]> {
  const floors = floorsOf(targets);
  const unsupported = new Map<string, readonly string[]>();
  for (const feature of Object.values(features)) {
    if (feature.kind !== "feature") {
      continue;
    }
    for (const key of feature.compat_features ?? []) {
      const support = (feature.status.by_compat_key?.[key] ?? feature.status).support;
      const lacking = [...floors]
        .filter(([id, floor]) => {
          const since = support[id as keyof typeof support];
          return since === undefined || Number.parseFloat(since.replace("≤", "")) > floor;
        })
        .map(([id]) => id);
      if (lacking.length > 0) {
        unsupported.set(key, lacking);
      }
    }
  }
  return unsupported;
}
