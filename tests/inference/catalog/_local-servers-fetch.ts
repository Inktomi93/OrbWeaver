// A fake `fetch` over one rig arm's recorded advertisements (`_local-servers-fixtures.ts`), keyed the way the
// probe runner named them, so the catalog reader tests and the resolver tests dial exactly what each server said.

import { LOCAL_SERVER_FIXTURES } from "./_local-servers-fixtures.ts";
import { LOCAL_SERVER_TRANSCRIPTS } from "./_local-servers-transcripts.ts";

export type TranscriptArm = keyof typeof LOCAL_SERVER_TRANSCRIPTS;

interface RecordedExchange {
  readonly method: string;
  readonly path: string;
  readonly bodyKeys: string;
  readonly status: number;
  readonly body: unknown;
}

function bodyKeysOf(body: RequestInit["body"]): string {
  return typeof body === "string"
    ? Object.keys(JSON.parse(body) as Record<string, unknown>)
        .sort()
        .join(",")
    : "";
}

/** Replay one arm's transcript (`_local-servers-transcripts.ts`): each request answers with the status and body
 *  the server gave the same method, path and body keys; anything the arm was never asked is a 404. */
export function transcriptFetch(arm: TranscriptArm, seen: string[] = []): typeof fetch {
  const exchanges: readonly RecordedExchange[] = LOCAL_SERVER_TRANSCRIPTS[arm];
  return ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    seen.push(url.toString());
    const method = init?.method ?? "GET";
    const keys = bodyKeysOf(init?.body);
    const hit = exchanges.find((exchange) => exchange.method === method && exchange.path === url.pathname && exchange.bodyKeys === keys);
    if (hit === undefined) {
      return Promise.resolve(Response.json({ error: `no recording for ${method} ${url.pathname} {${keys}}` }, { status: 404 }));
    }
    const body = typeof hit.body === "string" ? hit.body : JSON.stringify(hit.body);
    return Promise.resolve(new Response(body, { status: hit.status, headers: { "content-type": "application/json" } }));
  }) as typeof fetch;
}

/** The body an arm answered one request with, for a test that replays it outside the reader. */
export function recordedAnswer(arm: TranscriptArm, method: string, path: string): RecordedExchange {
  const exchanges: readonly RecordedExchange[] = LOCAL_SERVER_TRANSCRIPTS[arm];
  const hit = exchanges.find((exchange) => exchange.method === method && exchange.path === path);
  if (hit === undefined) {
    throw new Error(`${arm} never answered ${method} ${path}`);
  }
  return hit;
}

export type LocalServerArm = keyof typeof LOCAL_SERVER_FIXTURES;

type Recorded = Record<string, unknown>;

/** `/api/show` fixtures are named after the model id: `qwen2.5:0.5b` → `api-show-qwen2.5-0.5b`. */
function showKey(model: string): string {
  return `api-show-${model.replace(/:latest$/u, "").replace(":", "-")}`;
}

function fixtureKey(path: string, body: string | undefined): string {
  if (path === "/api/show") {
    const parsed = JSON.parse(body ?? "{}") as { readonly model?: string };
    return showKey(parsed.model ?? "");
  }
  return path.replace(/^\//u, "").replaceAll("/", "-");
}

/** Serve one arm's recordings; `overrides` replaces or (with `undefined`) removes an endpoint, for a planted control. */
export function localServerFetch(arm: LocalServerArm, overrides: Readonly<Record<string, unknown>> = {}, seen: string[] = []): typeof fetch {
  const recorded: Recorded = { ...(LOCAL_SERVER_FIXTURES[arm] as Recorded), ...overrides };
  return ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    seen.push(url);
    const key = fixtureKey(new URL(url).pathname, init?.body === undefined ? undefined : String(init.body));
    const body = recorded[key];
    return Promise.resolve(body === undefined ? Response.json({ error: `no recording for ${key}` }, { status: 404 }) : Response.json(body));
  }) as typeof fetch;
}
