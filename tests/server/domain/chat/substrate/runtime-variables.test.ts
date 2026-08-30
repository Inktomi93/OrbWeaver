// domain/chat/substrate/runtime-variables — pins the D46 fold (seq-ordered, defensively re-sorted) and the
// two cache statements' "empty ⇒ null, never {}/[]" contract, round-tripped against a real db row (the
// read side treats null as "nothing folded", so a spurious empty object/array sentinel would be a second
// spelling of the same state).

import type { StandaloneVariableDelta } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chats } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import type { ChatId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import {
  foldChain,
  runtimeVariablesUpdateStatement,
  standaloneVariableDeltasUpdateStatement,
} from "../../../../../packages/server/src/domain/chat/substrate/runtime-variables.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedChat } from "../_support.ts";

let db: Db;
let chatId: ChatId;

beforeEach(async () => {
  db = await freshDb();
  chatId = await seedChat(db, "vars");
});

describe("foldChain", () => {
  test("folds seq-ordered deltas — a later seq's set wins over an earlier one for the same key", () => {
    const out = foldChain([
      { seq: 2, delta: [{ op: "set", key: "hp", value: "10" }] },
      { seq: 1, delta: [{ op: "set", key: "hp", value: "5" }] },
    ]);
    expect(out["hp"]).toBe("10"); // seq 2 applied after seq 1, regardless of array order
  });

  test("re-sorts by seq DEFENSIVELY even when the caller hands entries out of order", () => {
    // The query already orders, but a caller may splice an appended entry — the fold must not trust order.
    const inOrder = foldChain([
      { seq: 1, delta: [{ op: "set", key: "gold", value: "1" }] },
      { seq: 2, delta: [{ op: "set", key: "gold", value: "2" }] },
    ]);
    const outOfOrder = foldChain([
      { seq: 2, delta: [{ op: "set", key: "gold", value: "2" }] },
      { seq: 1, delta: [{ op: "set", key: "gold", value: "1" }] },
    ]);
    expect(outOfOrder).toEqual(inOrder);
  });

  test("an empty entry list folds to an empty record", () => {
    expect(foldChain([])).toEqual({});
  });
});

describe("runtimeVariablesUpdateStatement — round-tripped against the chat row", () => {
  test("a non-empty cache writes the object verbatim", async () => {
    await db.batch(batchMany([runtimeVariablesUpdateStatement(db, chatId, { hp: "10" })]));
    const [row] = await db.select({ v: chats.runtimeVariables }).from(chats).where(eq(chats.id, chatId));
    expect(row?.v).toEqual({ hp: "10" });
  });

  test("an EMPTY cache writes null, never a `{}` sentinel — the read contract's whole point", async () => {
    await db.batch(batchMany([runtimeVariablesUpdateStatement(db, chatId, {})]));
    const [row] = await db.select({ v: chats.runtimeVariables }).from(chats).where(eq(chats.id, chatId));
    expect(row?.v).toBeNull();
  });
});

describe("standaloneVariableDeltasUpdateStatement — round-tripped against the chat row", () => {
  const delta: StandaloneVariableDelta = { seq: 1, delta: [{ op: "set", key: "hp", value: "10" }] };

  test("a non-empty delta list writes the array verbatim", async () => {
    await db.batch(batchMany([standaloneVariableDeltasUpdateStatement(db, chatId, [delta])]));
    const [row] = await db.select({ v: chats.standaloneVariableDeltas }).from(chats).where(eq(chats.id, chatId));
    expect(row?.v).toEqual([delta]);
  });

  test("an empty delta list writes null (mirrors the runtime-cache null contract)", async () => {
    await db.batch(batchMany([standaloneVariableDeltasUpdateStatement(db, chatId, [delta])])); // seed a non-null value first
    await db.batch(batchMany([standaloneVariableDeltasUpdateStatement(db, chatId, [])]));
    const [row] = await db.select({ v: chats.standaloneVariableDeltas }).from(chats).where(eq(chats.id, chatId));
    expect(row?.v).toBeNull();
  });
});
