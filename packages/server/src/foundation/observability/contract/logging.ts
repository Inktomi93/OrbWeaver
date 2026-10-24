import type { BoundedRing } from "@orb/kit/bounded-ring";
import type { UserId } from "@orb/kit/ids";
import type { HonoRequest } from "hono";
import type pino from "pino";

/** A root's pino logger; pino v10 exports it only as a member of the `pino` namespace. */
export type Logger = pino.Logger;

/** Request-ring metadata carries the resolved identity only after its existing request scope binds it. */
export interface RequestRecord {
  id: string;
  method: HonoRequest["method"];
  path: HonoRequest["path"];
  status: Response["status"];
  durationMs: number;
  at: number;
  userId?: UserId;
}

/** One root's flight recorders (`createObservabilityRings`). Log lines stay serialized; the debug reads parse them lazily. */
export interface ObservabilityRings {
  readonly logs: BoundedRing<string>;
  readonly requests: BoundedRing<RequestRecord>;
}

/** The foundation sink accepts opaque metadata without importing a domain's richer event vocabulary. */
export interface MemoryLogRecord {
  readonly event: string;
  readonly [field: string]: unknown;
}
