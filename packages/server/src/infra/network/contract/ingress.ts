import type { getConnInfo } from "@hono/node-server/conninfo";

/** The physical adapter's peer address, independent of caller-authored forwarding headers. */
export type PhysicalPeerRead = (context: Parameters<typeof getConnInfo>[0]) => ReturnType<typeof getConnInfo>["remote"]["address"];
