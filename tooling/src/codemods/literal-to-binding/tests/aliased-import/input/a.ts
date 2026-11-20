import { ROW_NAME as rowName } from "#client/names.ts";

export const renamed = (name: string): string => `${rowName}: ${name}` + "Row name";
