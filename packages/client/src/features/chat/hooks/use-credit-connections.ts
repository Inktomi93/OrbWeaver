// The viewer's own connection rows for the room's connection readouts (the swipe credit and the composer's
// next-turn line). One cache-first `connection.list` read, deduplicated by key across every row.

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import type { CreditConnections } from "../lib/swipe-attribution.ts";

export function useCreditConnections(): CreditConnections {
  const trpc = useTRPC();
  const { data, isError } = useQuery(trpc.connection.list.queryOptions());
  return { rows: Array.isArray(data) ? data : undefined, failed: isError };
}
