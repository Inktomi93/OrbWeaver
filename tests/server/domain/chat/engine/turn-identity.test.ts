// engine/turn-identity — the turn-identity triple. Tiny and pure, and exactly the kind of function whose
// two fields get swapped in a refactor with no compiler complaint (both are `UserId`). The consequences are
// not symmetric: `triggeredBy` is the FUNDER (whose connection the turn spends), `runAsUserId` is the room
// HOST (whose books/cards/preset/prose the assembly reads). Swapping them bills the wrong human and
// assembles the wrong library, so both arms are pinned by NAME here, including the auto-mode chain-starter.

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { resolveTurnIdentity } from "../../../../../packages/server/src/domain/chat/engine/turn-identity.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const CALLER = castId<UserId>("user_caller");
const HOST = castId<UserId>("user_host");
const STARTER = castId<UserId>("user_chain_starter");

test("a direct send: the CALLER funds it, the HOST scopes the assembly", () => {
  expect(resolveTurnIdentity({ principalUserId: CALLER, hostUserId: HOST })).toEqual({ triggeredBy: CALLER, runAsUserId: HOST });
});

test("auto-mode: the chain STARTER funds it — the caller is not billed for a chain they did not start", () => {
  expect(resolveTurnIdentity({ principalUserId: CALLER, hostUserId: HOST, triggeredBy: STARTER })).toEqual({
    triggeredBy: STARTER,
    runAsUserId: HOST,
  });
});

test("`runAsUserId` is ALWAYS the host — never the caller, even when the caller is not a member's host", () => {
  const identity = resolveTurnIdentity({ principalUserId: CALLER, hostUserId: HOST, triggeredBy: STARTER });
  expect(identity.runAsUserId).not.toBe(CALLER);
  expect(identity.runAsUserId).toBe(HOST);
});

test("a host talking in their own room funds their own turn", () => {
  expect(resolveTurnIdentity({ principalUserId: HOST, hostUserId: HOST })).toEqual({ triggeredBy: HOST, runAsUserId: HOST });
});
