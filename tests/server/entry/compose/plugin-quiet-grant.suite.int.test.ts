// A plugin's `llm.quiet` spends through the plugin's OWN grant binding first. The installer binds `summarize`
// twice: their user default, and a `plugin-grant` row for one plugin. The quiet op must fold the plugin-grant
// hop before the user hop (`inference/resolve/precedence.ts`), composed-real over the app's own binder. Each
// scripted endpoint answers with its own host, which names the connection that served the call.

// COMPOSED-REAL: the server graph loads in the untimed IMPORT phase, never inside the first test's timeout (#2386 — support/composed-real.ts).
import "../../../support/composed-real.ts";
import type { Db } from "@orb/db";
import { assets, plugins } from "@orb/db";
import type { AssetId, PluginId, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import { buildPluginQuietLlm } from "../../../../packages/server/src/entry/compose/automation-plugin.ts";
import { expect, OWNER_USER_ID, test } from "../../../support/fixtures.ts";
import { principal } from "../../domain/automation/_support.ts";

const USER_HOST = "user-default.example";
const GRANT_HOST = "plugin-grant.example";
const MODEL = "quiet-model";

function endpoint(input: Parameters<typeof fetch>[0]): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const body = url.pathname.endsWith("/models")
    ? { object: "list", data: [{ id: MODEL, object: "model" }] }
    : { model: MODEL, choices: [{ index: 0, message: { role: "assistant", content: url.hostname } }] };
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
}

/** An installed, enabled plugin row owned by `ownerId`, seeded directly (the install door stores the bundle in the real CAS). */
async function seedPlugin(db: Db, ownerId: UserId, slug: string): Promise<PluginId> {
  const assetId = castId<AssetId>(`asset_${slug.replaceAll("-", "_")}_bundle`);
  await db.insert(assets).values({ id: assetId, ownerId, kind: "plugin", mime: "application/zip", size: 64, hash: `${slug}-hash`, uploadedAt: 1 });
  const id = mintTypeId(ID_PREFIX.plugin);
  await db.insert(plugins).values({
    id,
    ownerId,
    slug,
    name: slug,
    version: "1.0.0",
    manifest: { id: slug, name: slug, version: "1.0.0", hostVersion: 1, entry: "main.js", description: slug, capabilities: ["llm.quiet"] },
    bundleAssetId: assetId,
    grantedCapabilities: ["llm.quiet"],
    status: "enabled",
    origin: "upload",
    pendingReconsent: false,
    widenedNetHosts: [],
    consecutiveCrashes: 0,
    lastError: null,
    installedAt: 1,
    updatedAt: 1,
  });
  return id;
}

describe("plugin llm.quiet resolves the plugin-grant summarize binding", () => {
  test.override({
    providerFetch: async ({}, use): Promise<void> => {
      await use(endpoint);
    },
  });

  test("the grant's connection serves its plugin, and a plugin with no grant binding falls through to the user's", async ({ app, db, ownerCaller }) => {
    const granted = await seedPlugin(db, OWNER_USER_ID, "quiet-grant");
    const ungranted = await seedPlugin(db, OWNER_USER_ID, "quiet-plain");
    const connection = async (host: string, label: string): Promise<UserConnectionId> =>
      (
        await ownerCaller.connection.create({
          label,
          providerId: "custom-openai",
          credentialId: null,
          baseUrl: `https://${host}/v1`,
          model: MODEL,
          allowBackground: true,
        })
      ).id;
    const userDefault = await connection(USER_HOST, "user default");
    const grant = await connection(GRANT_HOST, "plugin grant");
    await ownerCaller.connection.setBinding({ task: "summarize", connectionId: userDefault });
    await ownerCaller.connection.setBinding({ task: "summarize", connectionId: grant, actor: { kind: "plugin-grant", pluginId: granted } });

    const quiet = buildPluginQuietLlm({
      roleClientsFor: app.roleClientsFor,
      resolveUserPresetParams: () => Promise.resolve({}),
      assets: app.services.assets,
      resolveOwnerPrincipal: () => Promise.resolve(principal(OWNER_USER_ID)),
    });
    const signal = new AbortController().signal;

    expect(await quiet({ installerUserId: OWNER_USER_ID, pluginId: granted, prompt: "caption this", signal })).toEqual({ text: GRANT_HOST });
    expect(await quiet({ installerUserId: OWNER_USER_ID, pluginId: ungranted, prompt: "caption this", signal })).toEqual({ text: USER_HOST });
  });
});
