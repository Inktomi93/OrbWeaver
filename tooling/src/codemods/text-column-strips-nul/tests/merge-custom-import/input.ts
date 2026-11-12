import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { vector32 } from "../custom-types/index.ts";

export const vectors = sqliteTable("vectors", {
  ref: text("ref").notNull(),
  dim: integer("dim").notNull(),
  embedding: vector32("embedding", { dimensions: 4 }).notNull(),
});
