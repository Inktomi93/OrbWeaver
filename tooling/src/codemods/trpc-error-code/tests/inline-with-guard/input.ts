import { notify, testId } from "#lib";

export function isConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return false;
  }
  return (error as { data?: { code?: string } }).data?.code === "CONFLICT";
}

export function code(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return "unknown";
  }
  const found = (error as { data?: { code?: string } }).data?.code;
  return found;
}

export const keep = [notify, testId];
