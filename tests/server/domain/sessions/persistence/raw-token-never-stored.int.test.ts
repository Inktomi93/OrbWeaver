// @subject packages/server/src/domain/sessions/verbs/create.ts
// The raw session cookie token is never stored (Spine-Identity-and-Auth.md invariant 8): after a real password login,
// the session row the cookie validates against holds the token only as its peppered hash, in no column.
import { sessions } from "@orb/db";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createAuthModeRoot, mintMember, signIn } from "@orb/testkit/node/auth";
import { eq } from "drizzle-orm";

const COOKIE_PAIR = /^[^=]+=(?<token>[^;]+)/u;

test("a login's raw cookie token is in no column of the session row it validates against", async () => {
  await using root = await createAuthModeRoot("local", { physicalPeer: () => PUBLIC_PEER_ADDRESS });
  const member = await mintMember(root);
  // Positive control: the cookie the login minted signs the member in.
  const signedIn = await signIn(root, member);
  const token = COOKIE_PAIR.exec(signedIn.headers["cookie"] ?? "")?.groups?.["token"];
  if (token === undefined) {
    throw new Error("the login answered with a session cookie");
  }

  const rows = await root.db.select().from(sessions).where(eq(sessions.userId, member.userId));
  expect(rows).toHaveLength(1);
  for (const [column, value] of Object.entries(rows[0] ?? {})) {
    expect(String(value), column).not.toContain(token);
  }
});
