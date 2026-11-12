import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { nulFreeText } from "../custom-types/index.ts";

export const notes = sqliteTable("notes", {
  id: nulFreeText("id").primaryKey(),
  body: nulFreeText("body").notNull().default(""),
  seq: integer("seq").notNull(),
});
