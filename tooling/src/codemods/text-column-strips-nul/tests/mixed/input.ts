import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { ROLES } from "./roles.ts";

export const rows = sqliteTable("rows", {
  id: text("id").primaryKey().$type<RowId>(),
  role: text("role", { enum: ROLES }).notNull(),
  blob: text("blob", { mode: "json" }).$type<RowBlob>(),
  title: text("title"),
});
