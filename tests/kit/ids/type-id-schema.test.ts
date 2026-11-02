// The brand on `typeIdSchema`'s input side is a declaration only: these pin the runtime schema it must leave untouched.
import { createIdSource, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { z } from "zod";

const ids = createIdSource(createSeededIds().next);
const chatId = ids.typeId(ID_PREFIX.chat);
const schema = typeIdSchema(ID_PREFIX.chat);

test("a matching id parses to itself", () => {
  expect(schema.parse(chatId)).toBe(chatId);
});

test("a wrong prefix keeps its fixed refusal, which never echoes the value", () => {
  const result = schema.safeParse(ids.typeId(ID_PREFIX.persona));
  expect(result.success).toBe(false);
  expect(result.error?.issues).toEqual([{ code: "custom", message: "Invalid chat id", path: [] }]);
});

test("a non-string keeps zod's string refusal", () => {
  const result = schema.safeParse(42);
  expect(result.error?.issues.map(({ code }) => code)).toEqual(["invalid_type"]);
});

test.for([
  ["optional", schema.optional(), undefined, undefined],
  ["nullable", schema.nullable(), null, null],
  ["default", schema.default(chatId), undefined, chatId],
  ["array", schema.array(), [chatId], [chatId]],
] as const)("the %s wrapper still parses", ([, wrapped, input, output]) => {
  expect(wrapped.parse(input)).toEqual(output);
});

test("JSON-schema generation still reads the input side as a plain string", () => {
  expect(z.toJSONSchema(schema, { io: "input" })).toMatchObject({ type: "string" });
});
