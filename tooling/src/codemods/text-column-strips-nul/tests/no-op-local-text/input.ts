import { sqliteTable } from "drizzle-orm/sqlite-core";

const text = (name: string): string => name.trim();

export const label = text("label");
export const table = sqliteTable;
