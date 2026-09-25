// The quick-tunnel process over the `cloudflared` package's wrapper (`use`, `Tunnel.quick`, its output events), never
// its installer. The child stays in this server's process group and dies with it; `--no-autoupdate` keeps the binary
// from replacing itself past the pin.
//
// THE URL COMES ONLY FROM THE LINE AFTER CLOUDFLARED'S "created" BANNER. The package's own `url` event matches any
// `https://<label>.trycloudflare.com` in any output, and the binary prints `https://api.trycloudflare.com` and
// `https://login.trycloudflare.com` in its error lines; taking one of those would admit a foreign host and show the
// owner a link that is not theirs. The first banner URL per process wins; later output never replaces it.

import process from "node:process";
import { Tunnel, use } from "cloudflared";
import type { QuickTunnelLauncherDeps, RelayEvents, RelayLauncher, RelayProcess, SpawnRelay } from "./contract.ts";

const QUICK_TUNNEL_PARENT = "trycloudflare.com";
const QUICK_TUNNEL_LABEL = /^[a-z0-9]+(?:-[a-z0-9]+)+$/u;
const BANNER = /quick Tunnel has been created!/u;
const BANNER_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/u;
// A line longer than this is no banner line, so the unterminated tail is dropped rather than held.
const MAX_LINE_CHARS = 4096;
const STOP_GRACE_MS = 5000;

/** The canonical origin of a quick-tunnel URL, or null. Exact shape only: https, one hyphenated label directly under
 *  `trycloudflare.com`, no port, credentials, path, query or fragment. */
export function quickTunnelOrigin(candidate: string): string | null {
  if (!URL.canParse(candidate)) {
    return null;
  }
  const url = new URL(candidate);
  const bare = url.port === "" && url.username === "" && url.password === "" && url.pathname === "/" && url.search === "" && url.hash === "";
  if (url.protocol !== "https:" || !bare) {
    return null;
  }
  const dot = url.hostname.indexOf(".");
  const label = url.hostname.slice(0, dot);
  return dot > 0 && url.hostname.slice(dot + 1) === QUICK_TUNNEL_PARENT && QUICK_TUNNEL_LABEL.test(label) ? url.origin : null;
}

// Feeds output chunks through a line splitter and reports the first valid URL on a line after the banner.
function bannerUrlReader(onUrl: (url: string) => void): (chunk: string) => void {
  let carry = "";
  let bannerSeen = false;
  let reported = false;
  return (chunk) => {
    if (reported) {
      return;
    }
    const lines = (carry + chunk).split("\n");
    carry = (lines.pop() ?? "").slice(-MAX_LINE_CHARS);
    for (const line of lines) {
      if (!bannerSeen) {
        bannerSeen = BANNER.test(line);
        continue;
      }
      const match = BANNER_URL.exec(line);
      const origin = match === null ? null : quickTunnelOrigin(match[0]);
      if (origin !== null) {
        reported = true;
        onUrl(origin);
        return;
      }
    }
  };
}

/** Spawns `executable` as a quick tunnel to `origin`. `onExit` fires once, for an exit or a spawn failure. */
export const spawnQuickTunnel: SpawnRelay = (executable, origin, events: RelayEvents): RelayProcess => {
  use(executable);
  const tunnel = Tunnel.quick(origin, { "--no-autoupdate": true });
  const child = tunnel.process;
  let ended = false;
  let force: NodeJS.Timeout | undefined;
  // A server that exits without its shutdown (a crash, a direct exit) still takes the relay down with it.
  const killWithServer = (): void => {
    child.kill("SIGKILL");
  };
  process.once("exit", killWithServer);
  const end = (detail: string): void => {
    if (ended) {
      return;
    }
    ended = true;
    process.removeListener("exit", killWithServer);
    clearTimeout(force);
    events.onExit(detail);
  };
  const read = bannerUrlReader((url) => {
    if (!ended) {
      events.onUrl(url);
    }
  });
  tunnel.on("stderr", read);
  tunnel.on("stdout", read);
  tunnel.on("exit", (code, signal) => {
    end(`cloudflared exited (code ${String(code)}, signal ${String(signal)})`);
  });
  tunnel.on("error", (err) => {
    child.kill("SIGKILL");
    end(`cloudflared failed: ${err.message}`);
  });
  return {
    stop: (): void => {
      if (ended || force !== undefined) {
        return;
      }
      child.kill("SIGINT");
      force = setTimeout(() => {
        child.kill("SIGKILL");
      }, STOP_GRACE_MS);
      force.unref();
    },
  };
};

/** The launcher the relay controller holds: verify the pinned binary on every launch, then spawn it. */
export function createQuickTunnelLauncher(deps: QuickTunnelLauncherDeps): RelayLauncher {
  return {
    launch: async (origin, events) => deps.spawn(await deps.binary.ensure(), origin, events),
  };
}
