import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nulFreeText } from "../custom-types/index.ts";
import { ROLES } from "./roles.ts";

export const rows = sqliteTable("rows", {
  id: nulFreeText("id").primaryKey().$type<RowId>(),
  role: text("role", { enum: ROLES }).notNull(),
  blob: text("blob", { mode: "json" }).$type<RowBlob>(),
  title: nulFreeText("title"),
});
