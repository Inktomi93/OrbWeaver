import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { KINDS } from "./kinds.ts";

export const settings = sqliteTable("settings", {
  kind: text("kind", { enum: KINDS }).notNull(),
  value: text("value", { mode: "json" }).notNull(),
});
