// @subject packages/server/src/entry/http/security-headers.ts
// Each registered own-policy route keeps the Content-Security-Policy its handler wrote on the arm that writes one,
// and an arm that writes none leaves with the app document policy. The cases are keyed by the production
// registration, `OWN_POLICY_ROUTES`, so a member with no case fails `tsc`. The directives and resource policies a
// route must carry are the specification, so this file states them; the production constant only pins which policy
// the route writes. This covers the registered routes only: a route whose own policy is never registered is
// overwritten before the response leaves, so no request can see it.
import { spawn } from "node:child_process";
import { CARD_FRAME_ROUTE, cardFrameMintResponseSchema } from "@orb/contracts/chat";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import {
  PLUGIN_FRAME_ROUTE,
  PLUGIN_HOST_VERSIONS,
  PLUGIN_MAIN_ENTRY,
  PLUGIN_UI_ASSETS_DIR,
  pluginFrameAssetUrl,
  pluginFrameMintResponseSchema,
  pluginManifestSchema,
} from "@orb/contracts/plugin";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makeAssetBytes, makePluginBundle } from "@orb/testkit/node/composed";
import { CARD_FRAME_FLOOR_CSP } from "#server/entry/http/card-frame.ts";
import { PLUGIN_FRAME_ASSET_CSP, PLUGIN_FRAME_CSP } from "#server/entry/http/plugin-frame.ts";
import { OWN_POLICY_ROUTES } from "#server/entry/http/security-headers.ts";

const POLICY = "content-security-policy";
const RESOURCE_POLICY = "cross-origin-resource-policy";
const MINT_HEADERS = { [CSRF_HEADER]: "1", "content-type": "application/json" } as const;
// A relay tell: the owner fallback refuses a loopback request that carries one, so the route answers its bare 401.
const RELAYED = { "x-forwarded-for": "203.0.113.9" } as const;
const SURFACE_ID = "ledger";
const ASSET_PATH = `${PLUGIN_UI_ASSETS_DIR}ledger.png`;
// The asset route's grammar admits rasters only, so this path is refused with a bare 404 that writes no policy.
const REFUSED_ASSET_PATH = `${PLUGIN_UI_ASSETS_DIR}ledger.svg`;
const GUEST = `orb.host(1).ui.registerFrame({ id: ${JSON.stringify(SURFACE_ID)}, anchor: "page", title: "Ledger", html: "<p>ledger</p>" });`;
const OK = 200;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;

// The specification, stated here and never read from production. Every own policy sandboxes its document; one that
// promises to deny every source says `default-src 'none'`. The opaque-origin plugin frame loads its asset
// cross-origin, and every other response keeps the app's same-origin resource policy and its document policy.
const SANDBOX = "sandbox";
const DENY_ALL_SOURCES = "default-src 'none'";
const CROSS_ORIGIN = "cross-origin";
const SAME_ORIGIN = "same-origin";
const APP_REQUIRED_DIRECTIVES = ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'"] as const;

const directivesOf = (policy: string | null): readonly string[] => (policy ?? "").split(";").map((directive) => directive.trim());
const sandboxed = (policy: string | null): boolean => directivesOf(policy).some((directive) => directive.split(" ")[0] === SANDBOX);

interface Served {
  readonly status: number;
  readonly policy: string | null;
  readonly resourcePolicy: string | null;
}

async function served(root: ServerTestHarness, url: string, headers: Readonly<Record<string, string>> = {}): Promise<Served> {
  const response = await root.http.request(url, { headers });
  await response.arrayBuffer();
  return { status: response.status, policy: response.headers.get(POLICY), resourcePolicy: response.headers.get(RESOURCE_POLICY) };
}

async function openRoot(): Promise<ServerTestHarness> {
  return await createServerHarness({
    pluginSpawn: spawn,
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
    physicalPeer: () => "127.0.0.1",
  });
}

/** Install a frame plugin that ships one raster asset, and mint its frame through the real route. */
async function mintPluginFrame(root: ServerTestHarness): Promise<string> {
  const caller = await root.principalFor(root.ownerId);
  const manifest = pluginManifestSchema.parse({
    id: "own-policy-ledger",
    name: "Own policy ledger",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Registers one frame surface with one asset.",
    capabilities: ["ui.surface", "ui.frame"],
  });
  const bundle = makePluginBundle(manifest, GUEST, root.clock.now(), { [ASSET_PATH]: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)) });
  const installed = await root.services.plugin.install({ caller, bundle, grant: [...manifest.capabilities] });
  await root.services.plugin.setEnabled({ caller, pluginId: installed.id, enabled: true });
  const minted = await root.http.request(PLUGIN_FRAME_ROUTE, {
    method: "POST",
    headers: MINT_HEADERS,
    body: JSON.stringify({ pluginId: installed.id, surfaceId: SURFACE_ID }),
  });
  expect(minted.status).toBe(OK);
  return pluginFrameMintResponseSchema.parse(await minted.json()).url;
}

/** A card frame minted with no character selector, which the route serves at the floor policy. */
async function mintCardFrame(root: ServerTestHarness): Promise<string> {
  const principal = await root.principalFor(root.ownerId);
  const chatId = (await root.services.chat.startChat({ principal, characterIds: [], opening: "none" })).chat.id;
  const minted = await root.http.request(CARD_FRAME_ROUTE, {
    method: "POST",
    headers: MINT_HEADERS,
    body: JSON.stringify({ chatId, characterId: null, html: "<p>card</p>" }),
  });
  expect(minted.status).toBe(OK);
  return cardFrameMintResponseSchema.parse(await minted.json()).url;
}

interface Minted {
  readonly cardUrl: string;
  readonly pluginUrl: string;
  readonly pluginHandle: string;
}

/** One registered route: the success arm and the policy its handler writes there, and an arm that writes none. */
interface OwnPolicyCase {
  readonly pattern: (typeof OWN_POLICY_ROUTES)[keyof typeof OWN_POLICY_ROUTES];
  readonly url: string;
  /** The production constant the route writes, which pins the route to its own policy. */
  readonly policy: string;
  /** The directives the route promises beyond its sandbox. */
  readonly required: readonly string[];
  /** The resource policy the success arm carries; the documents write none. */
  readonly resourcePolicy: string | null;
  readonly refusal: { readonly url: string; readonly headers: Readonly<Record<string, string>>; readonly status: number };
}

const CASES: { readonly [Key in keyof typeof OWN_POLICY_ROUTES]: (minted: Minted) => OwnPolicyCase } = {
  cardFrameDocument: ({ cardUrl }) => ({
    pattern: OWN_POLICY_ROUTES.cardFrameDocument,
    url: cardUrl,
    policy: CARD_FRAME_FLOOR_CSP,
    required: [DENY_ALL_SOURCES],
    resourcePolicy: null,
    refusal: { url: cardUrl, headers: RELAYED, status: UNAUTHORIZED },
  }),
  pluginFrameDocument: ({ pluginUrl }) => ({
    pattern: OWN_POLICY_ROUTES.pluginFrameDocument,
    url: pluginUrl,
    policy: PLUGIN_FRAME_CSP,
    required: [DENY_ALL_SOURCES],
    resourcePolicy: null,
    refusal: { url: pluginUrl, headers: RELAYED, status: UNAUTHORIZED },
  }),
  pluginFrameAsset: ({ pluginHandle }) => ({
    pattern: OWN_POLICY_ROUTES.pluginFrameAsset,
    url: pluginFrameAssetUrl(pluginHandle, ASSET_PATH),
    policy: PLUGIN_FRAME_ASSET_CSP,
    required: [DENY_ALL_SOURCES],
    resourcePolicy: CROSS_ORIGIN,
    refusal: { url: pluginFrameAssetUrl(pluginHandle, REFUSED_ASSET_PATH), headers: {}, status: NOT_FOUND },
  }),
};

test("each own-policy route keeps its handler's policy on the arm that writes one, and every other arm gets the app policy", { tags: ["slow"] }, async () => {
  await using root = await openRoot();
  const app = await served(root, "/healthz");
  expect(app.status).toBe(OK);
  expect(app.resourcePolicy).toBe(SAME_ORIGIN);
  expect(directivesOf(app.policy)).toEqual(expect.arrayContaining([...APP_REQUIRED_DIRECTIVES]));
  expect(sandboxed(app.policy)).toBe(false);

  const pluginUrl = await mintPluginFrame(root);
  const minted: Minted = { cardUrl: await mintCardFrame(root), pluginUrl, pluginHandle: pluginUrl.split("/").at(-1) ?? "" };
  expect(Object.keys(CASES).toSorted()).toEqual(Object.keys(OWN_POLICY_ROUTES).toSorted());
  for (const [key, build] of Object.entries(CASES)) {
    const routeCase = build(minted);
    const { prefix, suffix } = routeCase.pattern;
    const { pathname } = new URL(routeCase.url, "http://own-policy.invalid");
    // The case drives the route its key registers: the pattern's prefix, one id segment, then its tail.
    expect(pathname.startsWith(prefix) && pathname.endsWith(suffix) && !pathname.slice(prefix.length, pathname.length - suffix.length).includes("/"), key).toBe(
      true,
    );
    const success = await served(root, routeCase.url);
    expect(success, key).toEqual({ status: OK, policy: routeCase.policy, resourcePolicy: routeCase.resourcePolicy });
    expect(sandboxed(success.policy), key).toBe(true);
    expect(directivesOf(success.policy), key).toEqual(expect.arrayContaining([...routeCase.required]));
    // Every refusal arm leaves under the app policy, checked above against the specification.
    expect(await served(root, routeCase.refusal.url, routeCase.refusal.headers), key).toEqual({ ...app, status: routeCase.refusal.status });
  }
});
