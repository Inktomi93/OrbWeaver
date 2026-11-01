import { other } from "./other.ts";

export function isUnauthorized(error: unknown): boolean {
  return (error as { data?: { code?: string } } | null | undefined)?.data?.code === "UNAUTHORIZED";
}

export const used = other;
