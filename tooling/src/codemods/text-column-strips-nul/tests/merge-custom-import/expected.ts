import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { vector32, nulFreeText } from "../custom-types/index.ts";

export const vectors = sqliteTable("vectors", {
  ref: nulFreeText("ref").notNull(),
  dim: integer("dim").notNull(),
  embedding: vector32("embedding", { dimensions: 4 }).notNull(),
});
