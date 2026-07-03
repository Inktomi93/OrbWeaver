import { z } from "zod";
import { getLog } from "#foundation/observability";

// Raw `/models` probe against a USER-supplied OpenAI-compatible endpoint. Best-effort: any failure
// (unreachable, non-2xx, non-OpenAI shape) returns [] so the UI falls back to manual model entry — not
// every server implements /models. NEVER throws, and never surfaces the user's endpoint/key in a throw;
// failures log only a redacted error string. A raw fetch vs a user URL is an infra I/O adapter, NOT a DB
// query (persistence-no-io) — `domain/credentials/verbs/fetch-models` calls this through an injected op.

const modelsResponseSchema = z.object({
  data: z.array(z.object({ id: z.string() }).loose()).optional(),
});

/** Trailing-slash trimmer (hoisted — useTopLevelRegex). */
const TRAILING_SLASH_RE = /\/$/;

/** Args for `fetchOpenAiModels`, the op `domain/credentials/verbs/fetch-models` injects. */
export interface FetchOpenAiModelsArgs {
  baseUrl: string;
  apiKey: string | null;
  headers: Record<string, string> | null;
}

/** GET `{baseUrl}/models` on an OpenAI-compatible endpoint → the model id list. Best-effort; never throws. */
export async function fetchOpenAiModels(args: FetchOpenAiModelsArgs): Promise<string[]> {
  try {
    const res = await fetch(`${args.baseUrl.replace(TRAILING_SLASH_RE, "")}/models`, {
      method: "GET",
      headers: {
        ...(args.apiKey ? { authorization: `Bearer ${args.apiKey}` } : {}),
        ...(args.headers ?? {}),
      },
    });
    if (!res.ok) {
      return [];
    }
    const parsed = modelsResponseSchema.safeParse(await res.json());
    return parsed.success ? (parsed.data.data ?? []).map((m) => m.id) : [];
  } catch (err) {
    getLog().info({ err: String(err) }, "network: custom_openai /models fetch failed");
    return [];
  }
}
