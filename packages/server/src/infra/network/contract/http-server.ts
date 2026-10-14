import type { serve } from "@hono/node-server";

/** The installed adapter's actual request/response streams, never a caller-authored peer fact. */
export type NativeHttpBindings = Parameters<Parameters<typeof serve>[0]["fetch"]>[1];
