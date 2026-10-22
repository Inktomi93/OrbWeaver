// E2E (FORWARD-HEADER mode): a signed-JWT trusted-proxy credential is not ambient, so it needs no CSRF header on the
// tRPC mount or on the byte ingests, and `sessions.me` projects it without its subject or provenance.
import { randomBytes } from "node:crypto";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/test";
import { actorViaHeader, importsIdle, rawTrpcCall } from "./support/actors.ts";
import { E2E_SSO_GROUPS } from "./support/modes.ts";

const INGEST_ROUTES = ["/api/assets/upload", "/api/databank/upload", "/api/import", "/api/import/restore-card-lorebook"] as const;
const MARKER_BYTES = 4;

function marker(label: string): string {
  return `${label}-${randomBytes(MARKER_BYTES).toString("hex")}`;
}

test("a header-authed mutation is exempt (no cross-site surface)", async ({ baseURL }) => {
  const sso = await actorViaHeader(baseURL ?? "", { handle: castId<Handle>("csrf-sso-writer"), sub: "csrf-sso-writer", groups: [E2E_SSO_GROUPS.member] });
  const name = marker("header-exempt");
  const admitted = await rawTrpcCall(baseURL ?? "", { procedure: "tag.createTag", input: { input: { name } }, kind: "mutation" }, sso.headers);
  expect(admitted.status).toBe(200);
  expect((await sso.trpc.tag.listTags.query()).map((tag) => tag.name)).toContain(name);
});

for (const path of INGEST_ROUTES) {
  test(`${path}: SSO header principal is exempt → passes with no CSRF header`, async ({ baseURL }) => {
    const sso = await actorViaHeader(baseURL ?? "", { handle: castId<Handle>("csrf-sso-uploader"), sub: "csrf-sso-uploader", groups: [E2E_SSO_GROUPS.member] });
    const response = await fetch(`${baseURL ?? ""}${path}`, { method: "POST", headers: sso.headers, body: new FormData() });
    expect(response.status).toBe(400);
  });
}

test("a HEADER (non-ambient) credential needs no CSRF header", async ({ baseURL }) => {
  const origin = baseURL ?? "";
  const sso = await actorViaHeader(origin, { handle: castId<Handle>("csrf-sso-importer"), sub: "csrf-sso-importer", groups: [E2E_SSO_GROUPS.member] });
  await importsIdle(sso);
  const zip = new Uint8Array(await (await fetch(`${origin}/api/export/library?kinds=tag`, { headers: sso.headers })).arrayBuffer());
  const response = await fetch(`${origin}/api/import/bundle`, { method: "POST", headers: sso.headers, body: zip });
  expect(response.status).toBe(202);
});

test("leaks no other Principal field (externalId / via stay off the wire)", async ({ baseURL }) => {
  const subject = marker("sso-subject");
  const handle = castId<Handle>(marker("viewer-projection"));
  const sso = await actorViaHeader(baseURL ?? "", { handle, sub: subject, groups: [E2E_SSO_GROUPS.member] });
  const response = await fetch(`${baseURL ?? ""}/api/trpc/sessions.me`, { headers: sso.headers });
  const text = await response.text();
  expect(response.status).toBe(200);
  expect(text).not.toContain(subject);
  const viewer = await sso.trpc.sessions.me.query();
  expect(Object.keys(viewer).toSorted()).toEqual(["globalRole", "handle", "userId"]);
  expect(viewer).toMatchObject({ handle, globalRole: "user" });
});
