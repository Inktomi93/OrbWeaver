// @subject packages/server/src/entry/http/plugin-frame.ts
// The plugin frame mint takes the card frame's closed style slice through the real HTTP entry, from a real guest's
// registered frame: in-range tokens reach the served root, any other key or value is refused at the mint, and the
// response policy and every script byte stay what they are without the slice.
import { spawn } from "node:child_process";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { PluginFrameMintResponse } from "@orb/contracts/plugin";
import { PLUGIN_FRAME_ROUTE, PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginFrameMintResponseSchema, pluginManifestSchema } from "@orb/contracts/plugin";
import type { CardFrameStyleTokens } from "@orb/kit/card-frame";
import { CARD_FRAME_SANDBOX, CARD_FRAME_STYLE_TOKEN, cardFrameResponseHeaders } from "@orb/kit/card-frame";
import { FONT_SCALE_PERCENT } from "@orb/kit/font-scale";
import type { PluginId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle } from "@orb/testkit/node/composed";

const HEADERS = { [CSRF_HEADER]: "1", "content-type": "application/json" } as const;
const SURFACE_ID = "ledger";
const FRAME_TEXT = "plugin frame ledger";
const GUEST = `orb.host(1).ui.registerFrame({ id: ${JSON.stringify(SURFACE_ID)}, anchor: "page", title: "Ledger", html: ${JSON.stringify(`<p>${FRAME_TEXT}</p>`)} });`;
const SLICE = {
  [CARD_FRAME_STYLE_TOKEN.radius]: "0.5rem",
  [CARD_FRAME_STYLE_TOKEN.monoFamily]: "'Geist Mono', ui-monospace, monospace",
  [CARD_FRAME_STYLE_TOKEN.rootSize]: "125%",
} as const satisfies CardFrameStyleTokens;

interface Served {
  readonly handle: string;
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

async function openRoot(): Promise<ServerTestHarness> {
  return await createServerHarness({ pluginSpawn: spawn, env: { ["AUTH_MODE"]: "single-user", ["AUTH_FALLBACK"]: "owner" }, physicalPeer: () => "127.0.0.1" });
}

async function installFramePlugin(root: ServerTestHarness): Promise<PluginId> {
  const caller = await root.principalFor(root.ownerId);
  const manifest = pluginManifestSchema.parse({
    id: "frame-ledger",
    name: "Frame ledger",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Registers one frame surface.",
    capabilities: ["ui.surface", "ui.frame"],
  });
  const installed = await root.services.plugin.install({
    caller,
    bundle: makePluginBundle(manifest, GUEST, root.clock.now()),
    grant: [...manifest.capabilities],
  });
  await root.services.plugin.setEnabled({ caller, pluginId: installed.id, enabled: true });
  return installed.id;
}

async function postMint(root: ServerTestHarness, body: Record<string, unknown>): Promise<Response> {
  return await root.http.request(PLUGIN_FRAME_ROUTE, { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
}

async function serve(root: ServerTestHarness, url: string): Promise<Omit<Served, "handle">> {
  const response = await root.http.request(url);
  return { status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() };
}

async function mintAndServe(root: ServerTestHarness, pluginId: PluginId, extra: Record<string, unknown>): Promise<Served> {
  const minted = await postMint(root, { pluginId, surfaceId: SURFACE_ID, ...extra });
  expect(minted.status).toBe(200);
  const frame: PluginFrameMintResponse = pluginFrameMintResponseSchema.parse(await minted.json());
  const handle = frame.url.split("/").at(-1) ?? "";
  return { handle, ...(await serve(root, frame.url)) };
}

/** The production document headers for a policy, read in the response's own casing. */
function documentHeaders(csp: string): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(cardFrameResponseHeaders(csp)).map(([name, value]) => [name.toLowerCase(), value]));
}

const rootBlock = (tokens: CardFrameStyleTokens): string =>
  `:root { ${Object.entries(tokens)
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ")} }`;

test("an in-range style slice reaches the plugin frame's root, and an out-of-range root size is served at its bound", { tags: ["slow"] }, async () => {
  await using root = await openRoot();
  const pluginId = await installFramePlugin(root);
  const served = await mintAndServe(root, pluginId, { styleTokens: SLICE });
  expect(served.status).toBe(200);
  expect(served.body).toContain(FRAME_TEXT);
  expect(served.body).toContain(rootBlock(SLICE));

  const { max } = FONT_SCALE_PERCENT;
  const clamped = await mintAndServe(root, pluginId, { styleTokens: { [CARD_FRAME_STYLE_TOKEN.rootSize]: "400%" } });
  expect(clamped.body).toContain(rootBlock({ [CARD_FRAME_STYLE_TOKEN.rootSize]: `${max}%` }));
  expect(clamped.body).not.toContain("400%");
});

test("a plugin frame mint with a style key or value outside the closed slice answers 400", { tags: ["slow"] }, async () => {
  await using root = await openRoot();
  const pluginId = await installFramePlugin(root);
  const control = await postMint(root, { pluginId, surfaceId: SURFACE_ID, styleTokens: SLICE });
  expect(control.status).toBe(200);
  await control.arrayBuffer();
  for (const styleTokens of [
    { ...SLICE, "--sandbox-accent": "12px" },
    { "--anything": "red" },
    { ...SLICE, [CARD_FRAME_STYLE_TOKEN.radius]: "8px} </style><script>x()</script>" },
    { ...SLICE, [CARD_FRAME_STYLE_TOKEN.monoFamily]: 'a"' },
  ]) {
    const refused = await postMint(root, { pluginId, surfaceId: SURFACE_ID, styleTokens });
    expect(refused.status, JSON.stringify(styleTokens)).toBe(400);
    await refused.arrayBuffer();
  }
});

test("the slice changes only the root block: policy, sandbox and every script byte match the unstyled document", { tags: ["slow"] }, async () => {
  await using root = await openRoot();
  const pluginId = await installFramePlugin(root);
  const bare = await mintAndServe(root, pluginId, {});
  const styled = await mintAndServe(root, pluginId, { styleTokens: SLICE });
  const csp = bare.headers["content-security-policy"] ?? "";
  expect(csp.split("; ")).toContain(`sandbox ${CARD_FRAME_SANDBOX.document}`);
  expect(bare.headers).toMatchObject(documentHeaders(csp));
  expect(styled.headers).toMatchObject(documentHeaders(csp));
  // The miss arm serves the route's one policy constant too, so all three answers carry the same bytes.
  const miss = await serve(root, `${PLUGIN_FRAME_ROUTE}/${"0".repeat(bare.handle.length)}`);
  expect(miss.status).toBe(404);
  expect(miss.headers).toMatchObject(documentHeaders(csp));
  // Each handle is per mint; with it normalized and the root block removed, the documents are byte-identical.
  const normalized = (served: Served): string => served.body.replaceAll(served.handle, "HANDLE");
  expect(normalized(styled).replace(rootBlock(SLICE), "")).toBe(normalized(bare));
});
