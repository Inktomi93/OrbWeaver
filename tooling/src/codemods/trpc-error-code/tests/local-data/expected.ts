import type { Thing } from "#lib";
import { trpcErrorCode } from "#lib";

export function isBadRequest(error: unknown): boolean {
  return trpcErrorCode(error) === "BAD_REQUEST";
}

// `data` is read beyond `.code`, so the local stays.
export function keepsLocal(error: unknown): string | undefined {
  const data = (error as { data?: { code?: string } }).data;
  return data === undefined ? undefined : data.code;
}

export type Kept = Thing;
