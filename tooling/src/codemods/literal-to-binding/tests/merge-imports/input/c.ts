import type { RowName } from "#client/names.ts";
import { ROW_NAME } from "#client/names.ts";
import type { Other } from "#client/other.ts";

export const renamed = (name: RowName): string => `${ROW_NAME}: ${name}` + "Rename row";
export const removed = (other: Other): string => other + "Remove row";
