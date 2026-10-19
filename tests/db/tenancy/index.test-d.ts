import type { SchemaTableName, TABLE_SCOPING, TableScopingRegistry } from "@orb/db/tenancy";
import { expectTypeOf, test } from "vitest";

type Row<Name extends SchemaTableName> = TableScopingRegistry[Name];

test("the scoping registry is keyed by exactly the schema's table exports, under each table's own SQL name", () => {
  expectTypeOf<keyof typeof TABLE_SCOPING>().toEqualTypeOf<SchemaTableName>();
  expectTypeOf<"characters">().toExtend<SchemaTableName>();
  expectTypeOf<"usersRelations">().not.toExtend<SchemaTableName>();
  // A table with no row.
  expectTypeOf<Omit<typeof TABLE_SCOPING, "assets">>().not.toExtend<TableScopingRegistry>();
  // A binding whose SQL table is another name: the row keys on the table the database gets.
  expectTypeOf<{ readonly sqlName: "not_classified"; readonly scope: "ownerId"; readonly stamp: string; readonly why: string }>().not.toExtend<
    Row<"characters">
  >();
  expectTypeOf<{ readonly sqlName: "assets"; readonly scope: "unscoped"; readonly why: string }>().not.toExtend<Row<"assets">>();
});

test("a table's ownerId column fixes its class to ownerId, and only an ownerId row carries a stamp justification", () => {
  expectTypeOf<{ readonly sqlName: "characters"; readonly scope: "ownerId"; readonly stamp: string; readonly why: string }>().toExtend<Row<"characters">>();
  // A stamped table declared under any other class.
  expectTypeOf<{ readonly sqlName: "characters"; readonly scope: "parent"; readonly why: string }>().not.toExtend<Row<"characters">>();
  expectTypeOf<{ readonly sqlName: "assets"; readonly scope: "global"; readonly why: string }>().not.toExtend<Row<"assets">>();
  // An ownerId row with no D23 justification.
  expectTypeOf<{ readonly sqlName: "characters"; readonly scope: "ownerId"; readonly why: string }>().not.toExtend<Row<"characters">>();
  // An unstamped table declared ownerId-scoped.
  expectTypeOf<{ readonly sqlName: "messages"; readonly scope: "ownerId"; readonly stamp: string; readonly why: string }>().not.toExtend<Row<"messages">>();
  expectTypeOf<{ readonly sqlName: "world_entries"; readonly scope: "ownerId"; readonly stamp: string; readonly why: string }>().not.toExtend<
    Row<"worldEntries">
  >();
  // chat_tags carries chatId and ownerId: the stamp wins (D30), so the roster does not claim it.
  expectTypeOf<{ readonly sqlName: "chat_tags"; readonly scope: "ownerId"; readonly stamp: string; readonly why: string }>().toExtend<Row<"chatTags">>();
  expectTypeOf<{ readonly sqlName: "chat_tags"; readonly scope: "membership"; readonly why: string }>().not.toExtend<Row<"chatTags">>();
});

test("a chatId column puts an unstamped table behind the roster, and only the room itself is membership without one", () => {
  expectTypeOf<{ readonly sqlName: "messages"; readonly scope: "membership"; readonly why: string }>().toExtend<Row<"messages">>();
  expectTypeOf<{ readonly sqlName: "chats"; readonly scope: "membership"; readonly why: string }>().toExtend<Row<"chats">>();
  // A room-gated table declared as a junction, a parent or global.
  expectTypeOf<{ readonly sqlName: "messages"; readonly scope: "parent"; readonly why: string }>().not.toExtend<Row<"messages">>();
  expectTypeOf<{ readonly sqlName: "chat_digests"; readonly scope: "junction"; readonly why: string }>().not.toExtend<Row<"chatDigests">>();
  expectTypeOf<{ readonly sqlName: "chat_locks"; readonly scope: "global"; readonly why: string }>().not.toExtend<Row<"chatLocks">>();
  // A membership row on a table with no chatId that is not the room.
  expectTypeOf<{ readonly sqlName: "settings"; readonly scope: "membership"; readonly why: string }>().not.toExtend<Row<"settings">>();
  expectTypeOf<{ readonly sqlName: "message_variants"; readonly scope: "membership"; readonly why: string }>().not.toExtend<Row<"messageVariants">>();
  // The derived classes stay a judgment the row's reason carries.
  expectTypeOf<{ readonly sqlName: "settings"; readonly scope: "global"; readonly why: string }>().toExtend<Row<"settings">>();
  expectTypeOf<{ readonly sqlName: "character_tags"; readonly scope: "junction"; readonly why: string }>().toExtend<Row<"characterTags">>();
  expectTypeOf<{ readonly sqlName: "world_entries"; readonly scope: "parent"; readonly why: string }>().toExtend<Row<"worldEntries">>();
});
