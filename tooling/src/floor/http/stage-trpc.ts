// One non-batched tRPC call against a tool-owned stage, as the stage's owner. The stack carries no
// transformer, so a mutation body is the raw input and a query's input rides `?input=`. The mount refuses
// a request outside POST without the CSRF header on every credential path, and a cookie mutation without
// it, so every call sends it.

import { CSRF_HEADER } from "@orb/contracts/identity";
import { errorMessage } from "@orb/kit/error-message";
import { instrumentRefusal } from "../browser/page-validate.ts";

/** How tRPC carries the procedure: a query over GET, a mutation over POST. */
export type StageTrpcKind = "query" | "mutation";

interface TrpcEnvelope {
  readonly result?: { readonly data?: unknown };
}

/** The decoded response body of one call. A non-2xx answer or a body that is not JSON refuses as an
 *  instrument error naming the procedure. */
export async function stageTrpc(baseUrl: string, procedure: string, kind: StageTrpcKind, input?: unknown): Promise<unknown> {
  const url = new URL(`${baseUrl}/api/trpc/${procedure}`);
  const init: RequestInit = { headers: { [CSRF_HEADER]: "1" } };
  if (kind === "mutation") {
    init.method = "POST";
    init.headers = { [CSRF_HEADER]: "1", "content-type": "application/json" };
    if (input !== undefined) {
      init.body = JSON.stringify(input);
    }
  } else if (input !== undefined) {
    url.searchParams.set("input", JSON.stringify(input));
  }
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    return instrumentRefusal(`${procedure} failed (HTTP ${String(response.status)}): ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    return instrumentRefusal(`${procedure} returned invalid JSON: ${errorMessage(error)}`);
  }
}

/** The `result.data` of one call's body, or undefined when the envelope carries none. */
export async function stageTrpcData(baseUrl: string, procedure: string, kind: StageTrpcKind, input?: unknown): Promise<unknown> {
  const body = (await stageTrpc(baseUrl, procedure, kind, input)) as TrpcEnvelope;
  return body.result?.data;
}
