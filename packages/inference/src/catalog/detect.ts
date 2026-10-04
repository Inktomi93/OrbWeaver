// Which known local server answers at a Custom connection's URL, by the one native field each states about
// itself. Most specific first: KoboldCpp also answers Ollama's `/api/version` (a fixed `0.7.0`) and serves a
// `/props`, so it is asked before llama.cpp and Ollama. The answer is a `ModelInfoApi`, which names the built-in
// row that reads that server.

import type { ModelInfoApi } from "@orb/contracts/inference";
import { z } from "zod";
import { authHeaders, isRedirect, serverRootOf } from "../backends/kit/fetch-json.ts";
import type { DetectedServer } from "../contract/runtime.ts";

export interface DetectArgs {
  readonly fetch: typeof fetch;
  readonly baseUrl: string;
  readonly secret: string | null;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  readonly signal?: AbortSignal | undefined;
}

const KOBOLDCPP_RESULT = "KoboldCpp";

const koboldVersionSchema = z.object({ result: z.literal(KOBOLDCPP_RESULT) }).loose();
/** `build_info` is llama.cpp's own; KoboldCpp's `/props` carries neither field. */
const llamaCppPropsSchema = z.union([
  z.object({ build_info: z.string() }).loose(),
  z.object({ chat_template_caps: z.record(z.string(), z.unknown()) }).loose(),
]);
const ollamaVersionSchema = z.object({ version: z.string() }).loose();

const PROBES: readonly { readonly server: ModelInfoApi; readonly path: string; readonly schema: z.ZodType }[] = [
  { server: "koboldcpp", path: "/api/extra/version", schema: koboldVersionSchema },
  { server: "llama-cpp", path: "/props", schema: llamaCppPropsSchema },
  { server: "ollama", path: "/api/version", schema: ollamaVersionSchema },
];

/** One GET: the JSON body of a 2xx, `null` for any other answer, and a throw only when nothing answered. A
 *  redirect is never followed (host pin #25): it would carry the transport headers to another origin, and that
 *  origin's answer would decide the shared detect cache. */
async function answer(args: DetectArgs, path: string): Promise<unknown> {
  const res = await args.fetch(`${serverRootOf(args.baseUrl)}${path}`, {
    headers: authHeaders(args.secret, args.headers),
    redirect: "manual",
    ...(args.signal !== undefined ? { signal: args.signal } : {}),
  });
  if (!res.ok || isRedirect(res)) {
    return null;
  }
  // @orb-waive caught-failure-ownership(catch): a 2xx that is not JSON is a server that is not this one; the
  // probe moves on. Ends if a probed route can answer anything but JSON on the server it identifies.
  try {
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

/**
 * Probe the server in order and name the first that identifies itself. A server the first probe could not reach
 * (refused, timed out) throws at once: every probe dials the same origin, so asking the rest only waits out the same
 * dead host again. The throw leaves the caller's cache cold; a server that answered and matched none is `null`, which
 * is cached like a match.
 */
export async function detectServer(args: DetectArgs): Promise<DetectedServer> {
  for (const probe of PROBES) {
    if (probe.schema.safeParse(await answer(args, probe.path)).success) {
      return { modelInfoApi: probe.server };
    }
  }
  return { modelInfoApi: null };
}
