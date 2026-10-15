// @subject tests/support/node/factories/connection-view.ts
import type { UserId } from "@orb/kit/ids";
import { createIdSource, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { createSeededIds } from "../../iso/ids.ts";
import { expect, test } from "../fixtures.ts";
import { makeConnectionRow } from "./connection-view.ts";
import { makeResolvedCacheView, makeResolvedView } from "./resolved-connection.ts";

test("saved connection defaults use the native prefixless owner mint without inventing a stored credential", () => {
  const nativeOwner = createIdSource(createSeededIds().next).unprefixed<UserId>();
  const overridden = makeConnectionRow({ ownerId: nativeOwner, credentialId: null });
  expect(overridden.ownerId).toBe(nativeOwner);
  expect(overridden.credentialId).toBeNull();
  const first = makeConnectionRow();
  const second = makeConnectionRow();
  expect(first.ownerId.startsWith("user_")).toBe(false);
  expect(first.ownerId).not.toBe(second.ownerId);
  expect(first.id).not.toBe(second.id);
  expect(first.credentialId).toBeNull();
});

test("public resolved snapshots mint legal connection identities independently of private legacy fixture constants", () => {
  const connectionId = typeIdSchema(ID_PREFIX.userConnection).parse(createSeededIds().next(ID_PREFIX.userConnection));
  expect(makeResolvedView({ connectionId }).connectionId).toBe(connectionId);
  const view = makeResolvedView();
  const cached = makeResolvedCacheView();
  expect(typeIdSchema(ID_PREFIX.userConnection).safeParse(view.connectionId).success).toBe(true);
  expect(typeIdSchema(ID_PREFIX.userConnection).safeParse(cached.connectionId).success).toBe(true);
  expect(cached.connectionId).not.toBe(view.connectionId);
  expect(view).not.toHaveProperty("credential");
  expect(view).not.toHaveProperty("ownerId");
  expect(view).not.toHaveProperty("baseUrl");
});
