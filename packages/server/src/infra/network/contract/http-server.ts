import type { serve } from "@hono/node-server";

/** The installed adapter's actual request/response streams, never a caller-authored peer fact. */
export type NativeHttpBindings = Parameters<Parameters<typeof serve>[0]["fetch"]>[1];

/** The bounded HTTP drain's minimal logger shape — the root's logger via `getLog` in production, a spy in tests. */
export interface DrainLog {
  readonly warn: (fields: Record<string, unknown>, msg: string) => void;
}
