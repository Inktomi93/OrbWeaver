import type { Thing } from "#lib";

export function isBadRequest(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return false;
  }
  const data = (error as { data?: { code?: string } }).data;
  return data?.code === "BAD_REQUEST";
}

// `data` is read beyond `.code`, so the local stays.
export function keepsLocal(error: unknown): string | undefined {
  const data = (error as { data?: { code?: string } }).data;
  return data === undefined ? undefined : data.code;
}

export type Kept = Thing;
