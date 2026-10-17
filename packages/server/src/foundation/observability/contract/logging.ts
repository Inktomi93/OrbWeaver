import type { UserId } from "@orb/kit/ids";
import type { HonoRequest } from "hono";

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

/** The foundation sink accepts opaque metadata without importing a domain's richer event vocabulary. */
export interface MemoryLogRecord {
  readonly event: string;
  readonly [field: string]: unknown;
}
