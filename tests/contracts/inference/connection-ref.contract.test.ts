// contracts/inference/connection-ref — a bare branded connection id, and the binding ACTOR kinds. Two
// properties: the ref's TypeID prefix is validated (a `user_credential_…` or a `chat_…` handed to a ref is
// refused at the boundary rather than becoming a lookup that finds nothing), and the actor tuple stays
// closed — it is a persisted discriminator whose SQL CHECK and per-arm partial uniques are derived from it,
// so a member the tuple does not carry cannot be stored at all and must not parse either.

import { BINDING_ACTOR_KINDS, bindingActorKindSchema, connectionRefSchema } from "@orb/contracts/inference";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

test("a ref carries a user-connection TypeID and nothing else", () => {
  const connectionId = mintTypeId(ID_PREFIX.userConnection);
  expect(connectionRefSchema.parse({ connectionId })).toEqual({ connectionId });
});

test("a WRONG-PREFIX id is refused at the boundary, not turned into a lookup that finds nothing", () => {
  for (const wrong of [mintTypeId(ID_PREFIX.userCredential), mintTypeId(ID_PREFIX.connectionBinding)]) {
    expect(connectionRefSchema.safeParse({ connectionId: wrong }).success, `${wrong} is not a connection id`).toBe(false);
  }
  expect(connectionRefSchema.safeParse({ connectionId: "user_connection_not-a-typeid" }).success).toBe(false);
  expect(connectionRefSchema.safeParse({}).success).toBe(false);
});

test("the actor kinds are CLOSED — the persisted discriminator's vocabulary", () => {
  for (const kind of BINDING_ACTOR_KINDS) {
    expect(bindingActorKindSchema.parse(kind)).toBe(kind);
  }
  // `agent` is the future kind D60 would add; until the column's CHECK carries it, it must not parse.
  for (const notAKind of ["agent", "chat", "system", ""]) {
    expect(bindingActorKindSchema.safeParse(notAKind).success, `"${notAKind}" must not parse as an actor kind`).toBe(false);
  }
});

test("a ref is ONLY an id — no per-use model override rides along", () => {
  const connectionId = mintTypeId(ID_PREFIX.userConnection);
  const parsed = connectionRefSchema.parse({ connectionId, model: "sneaky-override" });
  expect(Object.keys(parsed), "the model has ONE home: `user_connections.model`").toEqual(["connectionId"]);
});
