// E2E (FORWARD-HEADER mode): the proxy's header arm can be ambient (the proxy stamps it on any request carrying the
// proxy's own credential), so the byte ingests need the CSRF header on it too, while the tRPC mount rests on its
// JSON-only guard (Spine-Identity-and-Auth invariant 9). `sessions.me` projects the header principal without its
// subject or provenance.
import { randomBytes } from "node:crypto";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { DATABANK_UPLOAD_ROUTE } from "@orb/contracts/uploads";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/test";
import { actorViaHeader, importsIdle, rawTrpcCall } from "./support/actors.ts";
import { E2E_SSO_GROUPS } from "./support/modes.ts";

const INGEST_ROUTES = ["/api/assets/upload", DATABANK_UPLOAD_ROUTE, PORTABILITY_ROUTES.importCards, PORTABILITY_ROUTES.restoreCardLorebook] as const;
const MARKER_BYTES = 4;

function marker(label: string): string {
  return `${label}-${randomBytes(MARKER_BYTES).toString("hex")}`;
}

test("a header-authed JSON tRPC mutation runs without the CSRF header", async ({ baseURL }) => {
  const sso = await actorViaHeader(baseURL ?? "", { handle: castId<Handle>("csrf-sso-writer"), sub: "csrf-sso-writer", groups: [E2E_SSO_GROUPS.member] });
  const name = marker("header-json");
  const admitted = await rawTrpcCall(baseURL ?? "", { procedure: "tag.createTag", input: { input: { name } }, kind: "mutation" }, sso.headers);
  expect(admitted.status).toBe(200);
  expect((await sso.trpc.tag.listTags.query()).map((tag) => tag.name)).toContain(name);
});

for (const path of INGEST_ROUTES) {
  test(`${path}: an SSO header principal needs the CSRF header`, async ({ baseURL }) => {
    const sso = await actorViaHeader(baseURL ?? "", { handle: castId<Handle>("csrf-sso-uploader"), sub: "csrf-sso-uploader", groups: [E2E_SSO_GROUPS.member] });
    const forged = await fetch(`${baseURL ?? ""}${path}`, { method: "POST", headers: sso.headers, body: new FormData() });
    expect(forged.status).toBe(403);
    const proven = await fetch(`${baseURL ?? ""}${path}`, { method: "POST", headers: { ...sso.headers, [CSRF_HEADER]: "1" }, body: new FormData() });
    expect(proven.status).toBe(400);
  });
}

test("a bundle import on the header arm needs the CSRF header", async ({ baseURL }) => {
  const origin = baseURL ?? "";
  const sso = await actorViaHeader(origin, { handle: castId<Handle>("csrf-sso-importer"), sub: "csrf-sso-importer", groups: [E2E_SSO_GROUPS.member] });
  await importsIdle(sso);
  const zip = new Uint8Array(await (await fetch(`${origin}/api/export/library?kinds=tag`, { headers: sso.headers })).arrayBuffer());
  const forged = await fetch(`${origin}${PORTABILITY_ROUTES.importBundle}`, { method: "POST", headers: sso.headers, body: zip });
  expect(forged.status).toBe(403);
  const proven = await fetch(`${origin}${PORTABILITY_ROUTES.importBundle}`, { method: "POST", headers: { ...sso.headers, [CSRF_HEADER]: "1" }, body: zip });
  expect(proven.status).toBe(202);
});

test("leaks no other Principal field (externalId / via stay off the wire)", async ({ baseURL }) => {
  const subject = marker("sso-subject");
  const handle = castId<Handle>(marker("viewer-projection"));
  const sso = await actorViaHeader(baseURL ?? "", { handle, sub: subject, groups: [E2E_SSO_GROUPS.member] });
  const response = await fetch(`${baseURL ?? ""}/api/trpc/sessions.me`, { headers: { ...sso.headers, [CSRF_HEADER]: "1" } });
  const text = await response.text();
  expect(response.status).toBe(200);
  expect(text).not.toContain(subject);
  const viewer = await sso.trpc.sessions.me.query();
  expect(Object.keys(viewer).toSorted()).toEqual(["globalRole", "handle", "userId"]);
  expect(viewer).toMatchObject({ handle, globalRole: "user" });
});
