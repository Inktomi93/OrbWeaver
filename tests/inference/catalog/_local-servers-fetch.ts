// A fake `fetch` over one rig arm's recorded advertisements (`_local-servers-fixtures.ts`), keyed the way the
// probe runner named them, so the catalog reader tests and the resolver tests dial exactly what each server said.

import { LOCAL_SERVER_FIXTURES } from "./_local-servers-fixtures.ts";

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
