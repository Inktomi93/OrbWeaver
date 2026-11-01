import { notify, testId, trpcErrorCode } from "#lib";

export function isConflict(error: unknown): boolean {
  return trpcErrorCode(error) === "CONFLICT";
}

export function code(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return "unknown";
  }
  const found = trpcErrorCode(error);
  return found;
}

export const keep = [notify, testId];
