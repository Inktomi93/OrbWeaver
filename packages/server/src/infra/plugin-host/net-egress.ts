// infra/plugin-host/net-egress — the one implementation of `net.fetch` and `net.fetchAsset`. It runs in the APP
// process: the broker has no network grant, so its Worker forwards the guest's URL over the bridge and the app
// applies its own copy of the plugin's `netHosts`, never a host list the broker sent.

import type { PluginBridge, PluginInvocationLiveness } from "@orb/contracts/plugin";
import type { SafeFetchOptions } from "../network/egress.ts";
import { safeFetch } from "../network/egress.ts";
import { isAllowedImageBuffer } from "../network/image-guard.ts";
import { HOST_FN_DEADLINE_MS, PLUGIN_ASSET_MAX_BYTES, PLUGIN_NET_MAX_BYTES } from "./budgets.ts";

/** What a guest's `net.fetch` resolves to: JSON-safe primitives only, never a live `Response`. */
export interface PluginNetResponse {
  readonly status: number;
  readonly body: string;
}

/** The membrane's egress seam. `init` is the guest's raw (already dumped) request init; only GET/POST, a
 *  string-valued header map and a string body survive into the request. */
export interface PluginNetEgress {
  readonly fetch: (url: string, init: unknown, liveness: PluginInvocationLiveness) => Promise<PluginNetResponse>;
  // @orb-waive brand-in-name-position(assetId): the plugin SANDBOX wire DTO — a host-minted id for the installer's own new asset; branding the wire type would claim a validation this boundary has not performed. Ends if the bridge starts parsing to brands at the membrane.
  readonly fetchAsset: (url: string, liveness: PluginInvocationLiveness) => Promise<{ readonly assetId: string }>;
}

/** The only domain closures egress reaches: the two hourly belts and the installer's CAS store. */
export interface PluginEgressBridge extends Pick<PluginBridge, "admitEgress" | "admitAssetEgress"> {
  readonly assets: Pick<PluginBridge["assets"], "storeFetched">;
}

// The 2xx status window `net.fetchAsset` requires (a non-2xx has no asset to return).
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 300;

// Stateless without `{stream}`, so one shared instance is safe.
const NET_TEXT_DECODER = new TextDecoder();

/** Build the egress for one plugin binding. `netHosts` is the manifest allowlist the DOMAIN handed the host at
 *  activation (the SSRF wall — never `ANY_HOST`, never guest- or broker-supplied); empty refuses every fetch.
 *  The two hourly belts are the bridge's domain closures, claimed before the first await so the check-and-claim
 *  is atomic against concurrent host calls. */
export function createPluginNetEgress(netHosts: readonly string[], bridge: PluginEgressBridge): PluginNetEgress {
  return {
    fetch: async (url, init, liveness): Promise<PluginNetResponse> => {
      bridge.admitEgress();
      using cancel = livenessSignal(liveness);
      const res = await safeFetch(url, buildNetOptions(netHosts, init, cancel.signal));
      const body = NET_TEXT_DECODER.decode(await res.bytes());
      return { status: res.status, body };
    },
    fetchAsset: async (url, liveness): ReturnType<PluginNetEgress["fetchAsset"]> => {
      bridge.admitAssetEgress();
      using cancel = livenessSignal(liveness);
      const res = await safeFetch(url, buildAssetFetchOptions(netHosts, cancel.signal));
      if (res.status < HTTP_OK_MIN || res.status >= HTTP_OK_MAX) {
        res.dispose?.();
        throw new Error(`plugin host: net.fetchAsset got a non-2xx response (HTTP ${res.status})`);
      }
      const bytes = await res.bytes();
      // Magic-byte sniff plus the dimension/pixel bomb caps; the remote Content-Type is never trusted, and the
      // SNIFFED mime is what the CAS write records. These bytes never enter the guest, so the asset cap applies.
      const sniffed = isAllowedImageBuffer(bytes, { maxBytes: PLUGIN_ASSET_MAX_BYTES });
      return await bridge.assets.storeFetched(bytes, sniffed.mime, liveness);
    },
  };
}

// Carry the invocation's cancellation into `safeFetch`; disposing detaches the listener once the fetch ends.
function livenessSignal(liveness: PluginInvocationLiveness): { readonly signal: AbortSignal; readonly [Symbol.dispose]: () => void } {
  const controller = new AbortController();
  const unsubscribe = liveness.onAbort(() => controller.abort());
  return { signal: controller.signal, [Symbol.dispose]: unsubscribe };
}

// Any init shape other than GET/POST, a string→string header map and a string body is DROPPED: an unrecognized
// method defaults to GET, never an arbitrary verb. Optional fields stay ABSENT, not `undefined`.
function buildNetOptions(netHosts: readonly string[], rawInit: unknown, signal: AbortSignal): SafeFetchOptions {
  const init = (typeof rawInit === "object" && rawInit !== null ? rawInit : {}) as {
    method?: unknown;
    headers?: unknown;
    body?: unknown;
  };
  const method = init.method === "POST" || init.method === "GET" ? init.method : undefined;
  const headers = isStringRecord(init.headers) ? init.headers : undefined;
  const body = typeof init.body === "string" ? init.body : undefined;
  return {
    allowedHosts: netHosts,
    maxBytes: PLUGIN_NET_MAX_BYTES,
    deadlineMs: HOST_FN_DEADLINE_MS,
    signal,
    ...(method !== undefined ? { method } : {}),
    ...(headers !== undefined ? { headers } : {}),
    ...(body !== undefined ? { body } : {}),
  };
}

// A plain allowlisted GET with the asset byte cap and no guest init at all: the surface is exactly "download this
// allowlisted image". Scheme, allowlist, private-range and redirect walls re-run per hop inside safeFetch.
function buildAssetFetchOptions(netHosts: readonly string[], signal: AbortSignal): SafeFetchOptions {
  return {
    allowedHosts: netHosts,
    method: "GET",
    maxBytes: PLUGIN_ASSET_MAX_BYTES,
    deadlineMs: HOST_FN_DEADLINE_MS,
    signal,
  };
}

// A guest header map is inert data: a non-string value refuses the whole map rather than being coerced.
function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((v) => typeof v === "string");
}
