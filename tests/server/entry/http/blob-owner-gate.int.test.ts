// @subject packages/server/src/entry/http/blob.ts
// `GET /api/blob/:hash` serves a blob only to its owner, resolved from the request's own credential: an anonymous
// request is refused, another signed-in user reads a 404 exactly as for a hash that does not exist, and the owner's
// response is cached privately (Spine-Identity-and-Auth.md §2b).
import { BLOB_ROUTE } from "@orb/contracts/assets";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createAuthModeRoot, mintMember, ownerSubject, signIn } from "@orb/testkit/node/auth";
import { magicBytes } from "@orb/testkit/node/helpers";

const UNAUTHORIZED = 401;
const NOT_FOUND = 404;
const OK = 200;

test("a blob is served only to its owner's own sign-in, privately cached, and reads as missing to anyone else", async () => {
  // A public peer, so no request rides the owner fallback: each identity is the credential it presents.
  await using root = await createAuthModeRoot("local", { physicalPeer: () => PUBLIC_PEER_ADDRESS });
  const holder = await signIn(root, await mintMember(root));
  const stranger = await signIn(root, await ownerSubject(root));
  const stored = await root.services.assets.store({ principal: holder.principal, bytes: magicBytes("png"), kind: "avatar", mime: "image/png" });
  const path = `${BLOB_ROUTE}/${stored.hash}`;

  const served = await root.http.request(path, { headers: holder.headers });
  expect(served.status).toBe(OK);
  expect(new Uint8Array(await served.arrayBuffer())).toEqual(magicBytes("png"));
  expect(
    served.headers
      .get("cache-control")
      ?.split(",")
      .map((part) => part.trim()),
  ).toContain("private");

  // Another signed-in user, the box owner included: the same answer as a hash nobody stored.
  const foreign = await root.http.request(path, { headers: stranger.headers });
  const missing = await root.http.request(`${BLOB_ROUTE}/${"0".repeat(stored.hash.length)}`, { headers: stranger.headers });
  expect([foreign.status, missing.status]).toEqual([NOT_FOUND, NOT_FOUND]);
  expect(await foreign.text()).toBe(await missing.text());

  const anonymous = await root.http.request(path);
  expect(anonymous.status).toBe(UNAUTHORIZED);
  await anonymous.arrayBuffer();
});
