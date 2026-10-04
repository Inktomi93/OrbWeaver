// Boots a showcase plugin's real author-built `main.js` in a bare `node:vm` context under the realm's own
// `AMBIENT_STUBS`, over a caller-supplied fake `orb.host(1)` surface. The host is the test's; the denial is the realm's.

import { join } from "node:path";
import vm from "node:vm";
import { packPluginDirectory } from "@orb/plugin-toolchain";
import { AMBIENT_STUBS } from "@orb/server/infra/plugin-host";
import { unzipSync } from "fflate";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
/** Macrotask spins per settle — enough for a floated guest continuation to land. */
const SETTLE_TICKS = 24;

const sources = new Map<string, Promise<string>>();

function mainSourceOf(slug: string): Promise<string> {
  const cached = sources.get(slug);
  if (cached !== undefined) {
    return cached;
  }
  const built = (async (): Promise<string> => {
    const packed = await packPluginDirectory({
      pluginDirectory: join(REPO_ROOT, "packages", "showcase-plugins", "bundles", slug),
      sdkDirectory: join(REPO_ROOT, "packages", "plugin-sdk"),
    });
    if (packed.diagnostics.length > 0 || packed.bundle === null) {
      throw new Error(`${slug} author build failed: ${packed.diagnostics.map(({ message }) => message).join("; ")}`);
    }
    const main = unzipSync(packed.bundle)["main.js"];
    if (main === undefined) {
      throw new Error(`${slug} release bundle has no main.js`);
    }
    return new TextDecoder().decode(main);
  })();
  sources.set(slug, built);
  return built;
}

/** Spin the macrotask queue so a floated guest continuation lands. */
export async function settle(): Promise<void> {
  for (let i = 0; i < SETTLE_TICKS; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** Run the plugin's `main.js` against `host` (activation included) and let its floated work land. */
export async function bootShowcase(slug: string, host: object): Promise<void> {
  const source = await mainSourceOf(slug);
  const ctx = vm.createContext({});
  vm.runInContext(AMBIENT_STUBS, ctx);
  ctx["orb"] = {
    host: (major: number): object => {
      if (major !== 1) {
        throw new Error("HostVersionError");
      }
      return host;
    },
  };
  vm.runInContext(source, ctx, { filename: "plugin-guest.js" });
  await settle();
}
