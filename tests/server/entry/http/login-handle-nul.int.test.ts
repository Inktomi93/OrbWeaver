// @subject packages/db/src/custom-types/index.ts
// A NUL is not text in this app, and that widens no lookup: a sign-in handle with a NUL appended names exactly the
// account the handle without it names, its own password still decides, and it never reaches a different account.
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { SignInRefusal, signInWithPassword } from "@orb/testkit/node/auth";
import { createServerHarness } from "@orb/testkit/node/composed";
import { authMe } from "../_auth-roots.ts";

const NUL = "\0";
const KEEPER = castId<Handle>("harbor-keeper");
const KEEPER_PASSWORD = "harbor-keeper-password";
const NEIGHBOR = castId<Handle>("harbor-keeper2");
const NEIGHBOR_PASSWORD = "harbor-neighbor-password";

test("a sign-in handle with a NUL appended signs in as that account with its own password, and as no other account", async () => {
  await using root = await createServerHarness({ physicalPeer: () => "192.168.1.55", env: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "deny" } });
  const owner = await root.principalFor(root.ownerId);
  await root.services.admin.createUser({ principal: owner, handle: KEEPER, password: KEEPER_PASSWORD });
  await root.services.admin.createUser({ principal: owner, handle: NEIGHBOR, password: NEIGHBOR_PASSWORD });

  const plain = await authMe(root, { cookie: await signInWithPassword(root, KEEPER, KEEPER_PASSWORD) });
  const withNul = await authMe(root, { cookie: await signInWithPassword(root, castId<Handle>(`${KEEPER}${NUL}`), KEEPER_PASSWORD) });
  expect(withNul).toEqual(plain);
  expect(plain).toMatchObject({ authenticated: true, handle: KEEPER });

  // The NUL never reaches another account: the keeper's handle with the neighbor's password is refused, as the plain
  // handle would be; a handle that reads as the neighbor's once its NUL is gone is the neighbor's, whose password decides.
  await expect(signInWithPassword(root, castId<Handle>(`${KEEPER}${NUL}`), NEIGHBOR_PASSWORD)).rejects.toBeInstanceOf(SignInRefusal);
  await expect(signInWithPassword(root, castId<Handle>(`${KEEPER}${NUL}2`), KEEPER_PASSWORD)).rejects.toBeInstanceOf(SignInRefusal);
  expect(await authMe(root, { cookie: await signInWithPassword(root, castId<Handle>(`${KEEPER}${NUL}2`), NEIGHBOR_PASSWORD) })).toMatchObject({
    handle: NEIGHBOR,
  });
});
