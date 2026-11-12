import type { RowName } from "#client/names.ts";
import { ROW_NAME, RENAME_ROW_NAME } from "#client/names.ts";
import type { Other } from "#client/other.ts";
import { REMOVE_ROW_NAME } from "#client/other.ts";

export const renamed = (name: RowName): string => `${ROW_NAME}: ${name}` + RENAME_ROW_NAME;
export const removed = (other: Other): string => other + REMOVE_ROW_NAME;
