// Small primitive guards shared by the run-index reader's structural validators.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --report <index>");

export function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function isStringPair(value: unknown): value is readonly [string, string] {
  return Array.isArray(value) && value.length === 2 && value.every((member) => typeof member === "string");
}
