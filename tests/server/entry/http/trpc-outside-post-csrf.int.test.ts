// Every tRPC request outside POST carries `x-orb-csrf`, one rule for every procedure and credential path: a cross-site
// page can send a header-less GET (an `<img>`, a navigation that carries the Lax cookie), never a custom header. No
// procedure runs on a header-less request outside POST, and each kind of request gets the answer
// Spine-Identity-and-Auth invariant 9 lists for it.
// @subject packages/server/src/entry/app.ts

import { spawn } from "node:child_process";
import { AUTH_FALLBACK_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { LogLevel } from "@orb/contracts/settings";
import { streamConnectInputSchema } from "@orb/contracts/stream";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { createAuthModeRoot, mintMember, signIn } from "@orb/testkit/node/auth";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/composed";
import { z } from "zod";

const LOOPBACK = "127.0.0.1";
const WITH_HEADER = { [CSRF_HEADER]: "1" } as const;
const UNKNOWN_PROCEDURE = "nothing.here";
const refusalSchema = z.object({ error: z.object({ data: z.object({ code: z.string(), httpStatus: z.number() }) }) });
const errorFrameSchema = z.looseObject({ data: z.looseObject({ code: z.string() }) });
// A failed guest call logs one warn line, which is how this suite sees that the transform ran.
const FAILURE_LEVEL = "warn" satisfies LogLevel;
const FAILURE_LINE = "plugin: failure";
const LOG_SCAN_LIMIT = 500;
const CRASHING_TRANSFORM = 'const h = orb.host(1); h.transforms.registerDisplay({ name: "boom", apply: () => { throw new Error("boom"); } });';

interface Answer {
  readonly status: number;
  readonly code: string | null;
}

const ANSWERED: Answer = { status: 200, code: null };
const NO_CONTENT: Answer = { status: 204, code: null };
const REFUSED: Answer = { status: 403, code: "FORBIDDEN" };
const UNKNOWN: Answer = { status: 404, code: "NOT_FOUND" };
const METHOD_REFUSED: Answer = { status: 405, code: "METHOD_NOT_SUPPORTED" };
const MEDIA_REFUSED: Answer = { status: 415, code: "UNSUPPORTED_MEDIA_TYPE" };

const OTHER_METHODS = ["OPTIONS", "PUT", "DELETE", "PATCH"] as const;

/** What a method other than GET, HEAD or POST gets, by the content type it carries, on a procedure and on an unknown path. */
const OTHER_METHOD_ROWS: readonly { readonly contentType: string | null; readonly procedure: Answer; readonly unknown: Answer }[] = [
  { contentType: null, procedure: MEDIA_REFUSED, unknown: MEDIA_REFUSED },
  { contentType: "text/plain", procedure: MEDIA_REFUSED, unknown: MEDIA_REFUSED },
  { contentType: "multipart/form-data", procedure: METHOD_REFUSED, unknown: METHOD_REFUSED },
  { contentType: "application/octet-stream", procedure: METHOD_REFUSED, unknown: METHOD_REFUSED },
  { contentType: "application/json", procedure: METHOD_REFUSED, unknown: UNKNOWN },
];

/** Every other-method request the rows name, against one path, with the answer the rows give it there. */
function otherMethodCases(
  target: "procedure" | "unknown",
): readonly { readonly method: string; readonly headers: Readonly<Record<string, string>>; readonly answer: Answer }[] {
  return OTHER_METHODS.flatMap((method) =>
    OTHER_METHOD_ROWS.map((row) => ({ method, headers: row.contentType === null ? {} : { "content-type": row.contentType }, answer: row[target] })),
  );
}

function crashingManifest(): PluginManifest {
  return pluginManifestSchema.parse({
    id: "crashingdisplay",
    name: "Crashing display",
    version: "1.0.0",
    description: "A display transform that throws on every call.",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["chat.transform"],
  });
}

/** One tRPC request with no body, carrying only the headers the case names, as a cross-site page or a probe sends it. */
async function send(
  root: Pick<ServerTestHarness, "http">,
  request: { readonly method: string; readonly path: string; readonly input?: unknown; readonly headers: Readonly<Record<string, string>> },
): Promise<Answer> {
  const address = new URL(`http://localhost/api/trpc/${request.path}`);
  if (request.input !== undefined) {
    address.searchParams.set("input", JSON.stringify(request.input));
  }
  const response = await root.http.request(address, { method: request.method, headers: request.headers });
  const body = await response.text();
  const refusal = body === "" ? null : refusalSchema.safeParse(JSON.parse(body));
  return { status: response.status, code: refusal?.success === true ? refusal.data.error.data.code : null };
}

/** How many plugin failures the root has logged: one per guest call that threw. */
function failuresLogged(root: ServerTestHarness): number {
  return root.observability.logLines(LOG_SCAN_LIMIT).filter((line) => line.includes(FAILURE_LINE)).length;
}

test("no header-less request outside POST to plugin.transformForDisplay runs its guest, whatever its method", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn, physicalPeer: () => LOOPBACK, logLevel: FAILURE_LEVEL });
  const owner = await root.principalFor(root.ownerId);
  const manifest = crashingManifest();
  const installed = await seedInstalledPlugin(root, { caller: owner, bundle: makePluginBundle(manifest, CRASHING_TRANSFORM, root.clock.now()), grant: [] });
  await seedPluginGrant(root, { caller: owner, pluginId: installed.outcome.id, grant: manifest.capabilities, acknowledgedNetHosts: [], enable: true });
  const input = { chatId: root.idSource.typeId(ID_PREFIX.chat), messageId: root.idSource.typeId(ID_PREFIX.message), text: "cross-site text" };
  const path = "plugin.transformForDisplay";

  expect(await send(root, { method: "GET", path, input, headers: {} })).toEqual(REFUSED);
  expect(await send(root, { method: "HEAD", path, input, headers: {} })).toEqual(NO_CONTENT);
  for (const { method, headers, answer } of otherMethodCases("procedure")) {
    expect({ method, headers, answer: await send(root, { method, path, input, headers }) }).toEqual({ method, headers, answer });
  }
  await root.settleBackground();
  expect(failuresLogged(root)).toBe(0);

  // Control: the same GET with the header runs the transform, and its throw is logged.
  expect(await send(root, { method: "GET", path, input, headers: WITH_HEADER })).toEqual(ANSWERED);
  await root.settleBackground();
  expect(failuresLogged(root)).toBe(1);
});

test("a header-less request outside POST to an unknown procedure or a mutation gets the lookup's refusal", async () => {
  await using root = await createServerHarness({ physicalPeer: () => LOOPBACK });

  expect(await send(root, { method: "GET", path: UNKNOWN_PROCEDURE, headers: {} })).toEqual(UNKNOWN);
  expect(await send(root, { method: "GET", path: "chat.startChat", input: { characterIds: [] }, headers: {} })).toEqual(METHOD_REFUSED);
  for (const { method, headers, answer } of otherMethodCases("unknown")) {
    expect({ method, headers, answer: await send(root, { method, path: UNKNOWN_PROCEDURE, headers }) }).toEqual({ method, headers, answer });
  }
});

test("a header-less GET to a subscription gets an event stream whose error frame is the FORBIDDEN", async () => {
  await using root = await createServerHarness({ physicalPeer: () => LOOPBACK });
  const address = new URL("http://localhost/api/trpc/stream.connect");
  address.searchParams.set("input", JSON.stringify({ socketId: streamConnectInputSchema.parse({ socketId: root.ids.uuid() }).socketId }));

  const response = await root.http.request(address, { headers: { accept: "text/event-stream" } });
  const frames = (await response.text())
    .split("\n")
    .filter((line) => line.startsWith("data: {"))
    .map((line) => errorFrameSchema.safeParse(JSON.parse(line.slice("data: ".length))))
    .flatMap((parsed) => (parsed.success ? [parsed.data.data.code] : []));

  expect({ status: response.status, frames }).toEqual({ status: ANSWERED.status, frames: [REFUSED.code] });
});

test.for([
  { path: "sessions.me", input: undefined },
  { path: "chat.listChats", input: {} },
  { path: "settings.getVersion", input: undefined },
])("a header-less GET to $path is refused on the owner fallback, and answers with the header", async ({ path, input }) => {
  await using root = await createServerHarness({ physicalPeer: () => LOOPBACK });

  expect(await send(root, { method: "GET", path, input, headers: {} })).toEqual(REFUSED);
  expect(await send(root, { method: "GET", path, input, headers: WITH_HEADER })).toEqual(ANSWERED);
});

test("on the cookie path a header-less GET gets the same refusal as a header-less mutation", async () => {
  await using root = await createAuthModeRoot("local", { env: { [AUTH_FALLBACK_KEY]: "deny" } });
  const member = await signIn(root, await mintMember(root));
  const mutation = await root.http.request("/api/trpc/chat.startChat", {
    method: "POST",
    headers: { ...member.headers, "content-type": "application/json" },
    body: JSON.stringify({ characterIds: [] }),
  });
  const mutationRefusal = refusalSchema.parse(await mutation.json()).error.data.code;

  expect({ status: mutation.status, code: mutationRefusal }).toEqual(REFUSED);
  expect(await send(root, { method: "GET", path: "sessions.me", headers: member.headers })).toEqual(REFUSED);
  expect(await send(root, { method: "GET", path: "sessions.me", headers: { ...member.headers, ...WITH_HEADER } })).toEqual(ANSWERED);
});
