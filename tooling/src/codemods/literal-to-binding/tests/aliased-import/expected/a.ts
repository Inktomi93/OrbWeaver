import { ROW_NAME as rowName, ROW_NAME } from "#client/names.ts";

export const renamed = (name: string): string => `${rowName}: ${name}` + ROW_NAME;
