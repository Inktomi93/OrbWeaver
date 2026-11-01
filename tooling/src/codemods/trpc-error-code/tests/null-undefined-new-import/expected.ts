import { other } from "./other.ts";
import { trpcErrorCode } from "#lib";

export function isUnauthorized(error: unknown): boolean {
  return trpcErrorCode(error) === "UNAUTHORIZED";
}

export const used = other;
