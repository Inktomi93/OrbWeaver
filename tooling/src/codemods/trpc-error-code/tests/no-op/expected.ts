import { notify } from "#lib";

// A different cast shape, a non-code read and an already-migrated read must all stay.
export function innerData(inner: unknown): unknown {
  return (inner as { readonly data: unknown }).data;
}

export function numericCode(error: unknown): number | undefined {
  return (error as { data?: { code?: number } }).data?.code;
}

export function reason(error: unknown): unknown {
  return (error as { data?: { reason?: string } }).data?.reason;
}

export const done = [notify];
