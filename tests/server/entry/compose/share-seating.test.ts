// entry/compose/share-seating — the share's seating op: it writes the two owner-box settings a public link needs, as
// the owner, only where one is off, and its restore puts back each changed setting's own stored override. A start
// that somehow reaches it with no owner row fails loudly.

import type { Principal } from "@orb/contracts/identity";
import type { AppSettings } from "@orb/contracts/settings";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { createEnableShareSeating } from "../../../../packages/server/src/entry/compose/share-seating.ts";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER = castId<UserId>("user_owner");
const BOTH_ON: AppSettings = { localMultiUser: true, discreetLogin: true };

function ownerPrincipal(userId: UserId): Principal {
  return { userId, role: "owner", handle: castId<Handle>("owner"), externalId: null, via: "cookie" };
}

interface Seating {
  readonly localMultiUser: boolean;
  readonly discreetLogin: boolean;
}

interface Write {
  readonly principal: Principal;
  readonly partial: AppSettings;
}

function harness(
  start: Seating,
  options: { readonly ownerRow?: boolean; readonly stored?: Pick<AppSettings, "localMultiUser" | "discreetLogin"> } = {},
): { readonly op: ReturnType<typeof createEnableShareSeating>; readonly writes: Write[] } {
  const writes: Write[] = [];
  const op = createEnableShareSeating({
    seating: () => start,
    overrides: () => Promise.resolve(options.stored ?? {}),
    updateAppSettings: (params) => {
      writes.push(params);
      return Promise.resolve();
    },
    sessions: { getOwnerUserId: () => Promise.resolve((options.ownerRow ?? true) ? OWNER : undefined) },
    resolvePrincipal: (userId) => Promise.resolve(ownerPrincipal(userId)),
  });
  return { op, writes };
}

describe("createEnableShareSeating", () => {
  test.each([
    { localMultiUser: false, discreetLogin: false },
    { localMultiUser: true, discreetLogin: false },
    { localMultiUser: false, discreetLogin: true },
  ])("with %o it turns both on in one write, as the owner", async (start) => {
    const { op, writes } = harness(start);
    await op();
    expect(writes).toEqual([{ principal: ownerPrincipal(OWNER), partial: BOTH_ON }]);
  });

  test("control: with both on it writes nothing, and its restore writes nothing", async () => {
    const { op, writes } = harness({ localMultiUser: true, discreetLogin: true });
    await (await op())();
    expect(writes).toEqual([]);
  });

  test("the restore puts back only what it turned on: a stored override as stored, a default by clearing its override", async () => {
    const { op, writes } = harness({ localMultiUser: false, discreetLogin: false }, { stored: { discreetLogin: false } });
    await (await op())();
    expect(writes).toEqual([
      { principal: ownerPrincipal(OWNER), partial: BOTH_ON },
      { principal: ownerPrincipal(OWNER), partial: { localMultiUser: null, discreetLogin: false } },
    ]);
  });

  test("a setting that was already on is not touched by the restore", async () => {
    const { op, writes } = harness({ localMultiUser: true, discreetLogin: false }, { stored: { localMultiUser: true } });
    await (await op())();
    expect(writes[1]).toEqual({ principal: ownerPrincipal(OWNER), partial: { discreetLogin: null } });
  });

  test("with no owner row it throws and writes nothing", async () => {
    const { op, writes } = harness({ localMultiUser: false, discreetLogin: false }, { ownerRow: false });
    await expect(op()).rejects.toThrow("no owner row");
    expect(writes).toEqual([]);
  });
});
