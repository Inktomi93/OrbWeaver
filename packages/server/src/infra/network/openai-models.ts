import { z } from "zod";
import { getLog } from "#foundation/observability";
import { safeFetch } from "./egress";

// `/models` probe against a USER-CONFIGURED OpenAI-compatible endpoint (configured-endpoint consumer
// class, D61 §2). The owner's own `baseUrl` IS the declared intent — legitimately LAN/private and often
// plain http (BYO vLLM etc.), so this rides `safeFetch` with `ownerConfiguredEndpoint: true`: the fetch
// is host-PINNED to the configured host (a redirect off that host is refused) yet defers address gating
// to the global egress firewall + operator EGRESS_ALLOWLIST (preserving today's LAN posture) rather than
// safeFetch's own private-range denial. Best-effort: any failure returns [] (never throws, never surfaces
// endpoint/key in a throw).

const modelsResponseSchema = z.object({
  data: z.array(z.object({ id: z.string() }).loose()).optional(),
});

/** Trailing-slash trimmer (hoisted — useTopLevelRegex). */
const TRAILING_SLASH_RE = /\/$/;

/** The exact host this probe pins to, from the owner's configured `baseUrl`.
 *
 *  SEALED BY CONSTRUCTION (2026-08-02 security review of the `netHosts` hardening): `hostAllowed`
 *  (./egress) reads a LEADING-DOT allowlist entry as a SUFFIX WILDCARD — `.com` matches every `.com` host.
 *  WHATWG `URL` PRESERVES a leading dot (`new URL("https://.com/").hostname === ".com"`, probed), so this
 *  call site — the only wildcard-arm producer left once plugin manifests are `z.hostname()`-validated — could
 *  otherwise turn a user-supplied baseUrl into a wildcard pin. Not reachable as a privilege escalation today
 *  (a leading-dot host is unresolvable, so the first hop dies at DNS, and the allowlist only ever widens the
 *  OWNER'S own probe), but a "pinned to the configured host" contract must not depend on that.
 *
 *  REFUSE, not strip: stripping the dot would pin to a DIFFERENT host than the one being fetched (coherent
 *  only by accident — the fetch then fails the allowlist anyway). A leading-dot hostname is not a real host,
 *  so the honest answer is that there is nothing here to probe. The caller's best-effort `catch` turns this
 *  into the documented empty-list return plus a log line. */
function exactPinnedHost(base: string): string {
  const { hostname } = new URL(base);
  if (hostname.startsWith(".")) {
    throw new Error("baseUrl hostname starts with '.' — not an exact host, refusing to build a wildcard host pin");
  }
  return hostname;
}

const OK_STATUS_MIN = 200;
const OK_STATUS_MAX = 300;
// A `/models` list is small; keep a tight cap so an internal service coaxed into responding can't stream a
// large body back through the probe (the global firewall already blocks the private connect).
const MODELS_MAX_BYTES = 2_000_000;

/** Args for `fetchOpenAiModels`, the op `domain/credentials/verbs/fetch-models` injects. */
export interface FetchOpenAiModelsArgs {
  baseUrl: string;
  apiKey: string | null;
  headers: Record<string, string> | null;
}

/** GET `{baseUrl}/models` on an OpenAI-compatible endpoint → the model id list. Best-effort; never throws. */
export async function fetchOpenAiModels(args: FetchOpenAiModelsArgs): Promise<string[]> {
  try {
    const base = args.baseUrl.replace(TRAILING_SLASH_RE, "");
    const res = await safeFetch(`${base}/models`, {
      // Pinned to the owner's configured host; ownerConfiguredEndpoint defers SSRF to the global firewall.
      // `exactPinnedHost` guarantees the entry can never be read as `hostAllowed`'s suffix wildcard.
      allowedHosts: [exactPinnedHost(base)],
      ownerConfiguredEndpoint: true,
      maxBytes: MODELS_MAX_BYTES,
      headers: {
        ...(args.apiKey !== null && args.apiKey !== "" ? { authorization: `Bearer ${args.apiKey}` } : {}),
        ...(args.headers ?? {}),
      },
    });
    if (res.status < OK_STATUS_MIN || res.status >= OK_STATUS_MAX) {
      res.dispose?.(); // drop the non-2xx body + close any pinned Agent before returning (F9)
      return [];
    }
    const text = new TextDecoder().decode(await res.bytes());
    const parsed = modelsResponseSchema.safeParse(JSON.parse(text));
    return parsed.success ? (parsed.data.data ?? []).map((m) => m.id) : [];
  } catch (err) {
    getLog().info({ err: String(err) }, "network: custom_openai /models fetch failed");
    return [];
  }
}
