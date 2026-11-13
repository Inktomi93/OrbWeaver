// Every tRPC request outside POST carries `x-orb-csrf`, one rule for every procedure and credential path: a cross-site
// page can send a header-less GET (an `<img>`, a navigation that carries the Lax cookie), never a custom header. A
// header-less GET gets the tRPC FORBIDDEN a header-less cookie mutation gets, before any procedure runs.
// @subject packages/server/src/entry/app.ts

import { spawn } from "node:child_process";
import { AUTH_FALLBACK_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { LogLevel } from "@orb/contracts/settings";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { createAuthModeRoot, mintMember, signIn } from "@orb/testkit/node/auth";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/composed";
import { z } from "zod";

const LOOPBACK = "127.0.0.1";
const OK = 200;
const FORBIDDEN = 403;
const WITH_HEADER = { [CSRF_HEADER]: "1" } as const;
const refusalSchema = z.object({ error: z.object({ data: z.object({ code: z.string(), httpStatus: z.number() }) }) });
// A failed guest call logs one warn line, which is how this suite sees that the transform ran.
const FAILURE_LEVEL = "warn" satisfies LogLevel;
const FAILURE_LINE = "plugin: failure";
const LOG_SCAN_LIMIT = 500;
const CRASHING_TRANSFORM = 'const h = orb.host(1); h.transforms.registerDisplay({ name: "boom", apply: () => { throw new Error("boom"); } });';

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

/** One tRPC GET as an `<img>` or a navigation sends it: no body, and only the headers the case names. */
async function get(
  root: Pick<ServerTestHarness, "http">,
  path: string,
  input: unknown,
  headers: Readonly<Record<string, string>>,
): Promise<{ readonly status: number; readonly code: string | null }> {
  const address = new URL(`http://localhost/api/trpc/${path}`);
  if (input !== undefined) {
    address.searchParams.set("input", JSON.stringify(input));
  }
  const response = await root.http.request(address, { headers });
  const body: unknown = await response.json();
  const refusal = refusalSchema.safeParse(body);
  return { status: response.status, code: refusal.success ? refusal.data.error.data.code : null };
}

/** How many plugin failures the root has logged: one per guest call that threw. */
function failuresLogged(root: ServerTestHarness): number {
  return root.observability.logLines(LOG_SCAN_LIMIT).filter((line) => line.includes(FAILURE_LINE)).length;
}

test("a header-less GET to plugin.transformForDisplay under the owner fallback is refused before its guest runs", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn, physicalPeer: () => LOOPBACK, logLevel: FAILURE_LEVEL });
  const owner = await root.principalFor(root.ownerId);
  const manifest = crashingManifest();
  const installed = await seedInstalledPlugin(root, { caller: owner, bundle: makePluginBundle(manifest, CRASHING_TRANSFORM, root.clock.now()), grant: [] });
  await seedPluginGrant(root, { caller: owner, pluginId: installed.outcome.id, grant: manifest.capabilities, acknowledgedNetHosts: [], enable: true });
  const input = { chatId: root.idSource.typeId(ID_PREFIX.chat), messageId: root.idSource.typeId(ID_PREFIX.message), text: "cross-site text" };

  expect(await get(root, "plugin.transformForDisplay", input, {})).toEqual({ status: FORBIDDEN, code: "FORBIDDEN" });
  await root.settleBackground();
  expect(failuresLogged(root)).toBe(0);

  // Control: the same GET with the header runs the transform, and its throw is logged.
  expect(await get(root, "plugin.transformForDisplay", input, WITH_HEADER)).toEqual({ status: OK, code: null });
  await root.settleBackground();
  expect(failuresLogged(root)).toBe(1);
});

test.for([
  { path: "sessions.me", input: undefined },
  { path: "chat.listChats", input: {} },
  { path: "settings.getVersion", input: undefined },
])("a header-less GET to $path is refused on the owner fallback, and answers with the header", async ({ path, input }) => {
  await using root = await createServerHarness({ physicalPeer: () => LOOPBACK });

  expect(await get(root, path, input, {})).toEqual({ status: FORBIDDEN, code: "FORBIDDEN" });
  expect(await get(root, path, input, WITH_HEADER)).toEqual({ status: OK, code: null });
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

  expect({ status: mutation.status, code: mutationRefusal }).toEqual({ status: FORBIDDEN, code: "FORBIDDEN" });
  expect(await get(root, "sessions.me", undefined, member.headers)).toEqual({ status: FORBIDDEN, code: "FORBIDDEN" });
  expect(await get(root, "sessions.me", undefined, { ...member.headers, ...WITH_HEADER })).toEqual({ status: OK, code: null });
});
