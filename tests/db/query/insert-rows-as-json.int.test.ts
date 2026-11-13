// A row inserted as JSON text stores what the same row stores through a VALUES insert, column by column.
// @subject packages/db/src/query/insert-json.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { messages, messageVariants } from "@orb/db";
import { batchMany, insertRowsAsJson } from "@orb/db/query";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { asc, sql } from "drizzle-orm";

const HANDLE = "twin-keeper";
const SENT = "2025-07-19@12h00m01s";
// Text a JSON encoder must escape and a decoder must restore: quotes, a backslash, control characters, the two
// line separators JSON allows raw, an astral character and a combining mark.
const AWKWARD = 'She said "no" \\ then\n\ttab\r     \u{1F56F}️ é {"not":"json"} [1,2] null';
const VALUES_IDX = 7;
const JSON_IDX = 8;

test("a JSON-fed insert stores the cells a VALUES insert stores, and leaves a defaulted column to its default", async ({ harness, ids }) => {
  const principal = await harness.principalFor(harness.ownerId);
  await harness.services.character.create({ principal, input: createCharacterSchema.parse({ handle: HANDLE, name: HANDLE, description: "Keeps the lamp." }) });
  const descriptor = harness.app.portability.find((entity) => entity.kind === "chat");
  if (descriptor === undefined) {
    throw new Error("the production chat import descriptor is missing");
  }
  // One imported message gives the variant rows a real parent; the import itself writes through the same helper.
  await descriptor.importFile(harness.ownerId, {
    filename: `${HANDLE}/${HANDLE} - 2025-07-19@12h00m00s.jsonl`,
    bytes: new TextEncoder().encode(
      [
        `{"character_name":"${HANDLE}","user_name":"Nate","create_date":"${SENT}"}`,
        `{"name":"Nate","is_user":true,"is_system":false,"mes":"Hello.","send_date":"${SENT}"}`,
      ].join("\n"),
    ),
  });
  const [parent] = await harness.db.select({ id: messages.id }).from(messages);
  if (parent === undefined) {
    throw new Error("the import landed no message");
  }
  const row = (idx: number): typeof messageVariants.$inferInsert => ({
    id: mintTypeId(ID_PREFIX.messageVariant, ids.next),
    messageId: parent.id,
    idx,
    content: AWKWARD,
    reasoning: "",
    tokensIn: 0,
    tokensOut: 9_007_199_254_740_991,
    costUsd: 0.1,
    tokenProvenance: "estimated",
    variableDelta: [],
    metadata: { importResidue: { text: AWKWARD, nested: { list: [1, "two", null, true] } } },
    createdAt: 1_752_926_401_000,
  });

  await harness.db.insert(messageVariants).values(row(VALUES_IDX));
  await harness.db.batch(batchMany(insertRowsAsJson(harness.db, messageVariants, [row(JSON_IDX)])));

  const stored = await harness.db.all<Record<string, unknown>>(
    sql`select * from ${messageVariants} where ${messageVariants.idx} in (${VALUES_IDX}, ${JSON_IDX}) order by ${asc(messageVariants.idx)}`,
  );
  const cells = stored.map(({ id: _id, idx: _idx, ...rest }) => rest);
  expect(cells).toHaveLength(2);
  expect(cells[1]).toEqual(cells[0]);
  // The storage classes too: a number that arrived as text would compare equal nowhere it is summed.
  const classes = await harness.db.all<Record<string, unknown>>(
    sql`select typeof(content) content, typeof(tokens_in) "tokensIn", typeof(tokens_out) "tokensOut", typeof(cost_usd) "costUsd", typeof(reasoning) reasoning, typeof(raw_content) "rawContent", typeof(metadata) metadata, typeof(created_at) "createdAt", connection_attribution_provenance provenance from ${messageVariants} where ${messageVariants.idx} in (${VALUES_IDX}, ${JSON_IDX}) order by ${asc(messageVariants.idx)}`,
  );
  expect(classes[1]).toEqual(classes[0]);
  expect(classes[1]).toMatchObject({ content: "text", tokensIn: "integer", costUsd: "real", reasoning: "text", rawContent: "null", provenance: "unrecorded" });
});
