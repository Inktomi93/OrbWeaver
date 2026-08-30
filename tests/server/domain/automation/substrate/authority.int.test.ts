// substrate/authority — the ONE "does this user still hold host authority" predicate, both scopes. Pins:
// fail-CLOSED on every uncertainty (no such user, not present, a can() throw), a demoted ex-host loses
// authority, and the owner-global twin reads the ENABLED account state through the injected op rather than a
// local users select.

import { chatParticipants } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";
import { describe } from "vitest";
import { holdsChatHostAuthority, holdsOwnerAuthority } from "../../../../../packages/server/src/domain/automation/substrate/authority.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedParticipant } from "../../chat/_support.ts";
import { ruleFixture, seedUser } from "../_support.ts";

describe("holdsChatHostAuthority", () => {
  test("the host holds authority", async () => {
    const fixture = await ruleFixture();
    await expect(holdsChatHostAuthority(fixture.ctx, fixture.chatId, fixture.host)).resolves.toBe(true);
  });

  test("a present member who is not host does NOT hold authority (fail-closed on can()'s denial)", async () => {
    const fixture = await ruleFixture();
    const member = await seedUser(fixture.db, "user_member");
    await seedParticipant(fixture.db, { chatId: fixture.chatId, key: "member", userId: member, role: "member" });
    await expect(holdsChatHostAuthority(fixture.ctx, fixture.chatId, member)).resolves.toBe(false);
  });

  test("a non-member (no role) does NOT hold authority", async () => {
    const fixture = await ruleFixture();
    const outsider = await seedUser(fixture.db, "user_outsider");
    await expect(holdsChatHostAuthority(fixture.ctx, fixture.chatId, outsider)).resolves.toBe(false);
  });

  test("an unknown userId (no resolvable principal) does NOT hold authority", async () => {
    const fixture = await ruleFixture();
    await expect(holdsChatHostAuthority(fixture.ctx, fixture.chatId, castId<UserId>("user_ghost"))).resolves.toBe(false);
  });

  test("a demoted ex-host LOSES authority — the re-check reads live state, never the mint", async () => {
    const fixture = await ruleFixture();
    await fixture.db
      .update(chatParticipants)
      .set({ role: "member" })
      .where(and(eq(chatParticipants.chatId, fixture.chatId), eq(chatParticipants.userId, fixture.host), isNull(chatParticipants.leftSeq)));
    await expect(holdsChatHostAuthority(fixture.ctx, fixture.chatId, fixture.host)).resolves.toBe(false);
  });
});

describe("holdsOwnerAuthority (C5's owner-global twin)", () => {
  test("delegates directly to the injected isAuthorEnabled op", async () => {
    const calls: UserId[] = [];
    const userId = castId<UserId>("user_x");
    const deps = {
      isAuthorEnabled: (id: UserId): Promise<boolean> => {
        calls.push(id);
        return Promise.resolve(true);
      },
    };
    await expect(holdsOwnerAuthority(deps, userId)).resolves.toBe(true);
    expect(calls).toEqual([userId]);
  });

  test("a disabled/absent account answers false", async () => {
    const deps = { isAuthorEnabled: (): Promise<boolean> => Promise.resolve(false) };
    await expect(holdsOwnerAuthority(deps, castId<UserId>("user_x"))).resolves.toBe(false);
  });
});
