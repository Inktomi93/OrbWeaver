// @subject packages/server/src/domain/sessions/persistence/sessions.ts
// A login's session row carries the injected clock at the login in every stamp, the last-update stamp included.
import { sessions } from "@orb/db";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createAuthModeRoot, mintMember, signIn } from "@orb/testkit/node/auth";
import { eq } from "drizzle-orm";

const STEP_MS = 60_000;

test("a login's session row is stamped with the clock at the login", async () => {
  await using root = await createAuthModeRoot("local", { physicalPeer: () => PUBLIC_PEER_ADDRESS });
  const member = await mintMember(root);
  root.clock.advance(STEP_MS);
  const at = root.clock.now();

  await signIn(root, member);

  const rows = await root.db
    .select({ createdAt: sessions.createdAt, updatedAt: sessions.updatedAt, lastSeenAt: sessions.lastSeenAt })
    .from(sessions)
    .where(eq(sessions.userId, member.userId));
  expect(rows).toEqual([{ createdAt: at, updatedAt: at, lastSeenAt: at }]);
});
