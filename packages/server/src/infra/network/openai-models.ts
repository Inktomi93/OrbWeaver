import { z } from "zod";
import { getLog } from "#foundation/observability";
import { safeFetch } from "./egress";

// `/models` probe against a USER-supplied OpenAI-compatible endpoint. Best-effort: any failure
// (unreachable, non-2xx, non-OpenAI shape) returns [] so the UI falls back to manual model entry — not
// every server implements /models. NEVER throws, and never surfaces the user's endpoint/key in a throw;
// failures log only a redacted error string. A fetch vs a user URL is an infra I/O adapter, NOT a DB
// query (persistence-no-io) — `domain/credentials/verbs/fetch-models` calls this through an injected op.
//
// SSRF: `baseUrl` is user-supplied (`credentials.fetchModels`/`inspectEndpoint`), so this MUST NOT fetch it
// raw. The global egress firewall address-gates the connect, and this routes through `safeFetch` for the
// response-side belts too (size cap · per-hop redirect re-validation) — defense-in-depth, not dispatcher-
// only (a stale/uninstalled dispatcher must not be the sole barrier at a user-URL boundary).

const modelsResponseSchema = z.object({
  data: z.array(z.object({ id: z.string() }).loose()).optional(),
});

/** Trailing-slash trimmer (hoisted — useTopLevelRegex). */
const TRAILING_SLASH_RE = /\/$/;

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
    const res = await safeFetch(`${args.baseUrl.replace(TRAILING_SLASH_RE, "")}/models`, {
      maxBytes: MODELS_MAX_BYTES,
      headers: {
        ...(args.apiKey ? { authorization: `Bearer ${args.apiKey}` } : {}),
        ...(args.headers ?? {}),
      },
    });
    if (res.status < OK_STATUS_MIN || res.status >= OK_STATUS_MAX) {
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
