import type { RpgTraceRecord } from "@orb/contracts/rpg";
import type { EffectiveAppConfig, GlobalSettingView } from "@orb/contracts/settings";
import type { DatabaseHandle } from "@orb/db/wiring";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { Context } from "hono";

export interface AssetInspector {
  fsck: () => Promise<object>;
}

/**
 * True means a presented credential belongs to the box owner (D17), never a delegated administrator
 * or an inferred principal. This verdict short-circuits both token verification and the disabled-token
 * refusal, so an origin or ambient identity alone must not grant it.
 * The synchronous context port uses the principal already resolved with the raw TCP peer; resolving
 * bare headers again loses that evidence. A throwing implementation falls through to token verification.
 */
export interface AdminAuthChecker {
  isAdmin: (c: Context) => boolean;
}

interface RecorderFilter {
  chatId?: ChatId;
  limit?: number;
}

interface RpgRecorderFilter extends RecorderFilter {
  turnId?: string;
}

export interface RpgTraceInspector {
  recent: (filter: RpgRecorderFilter) => readonly RpgTraceRecord[];
}

export interface MemoryRecallInspector {
  recent: (filter: RecorderFilter) => readonly object[];
}

export interface SocketInspector {
  liveSocketCount: (userId?: UserId) => number;
}

export interface DebugAuthOptions {
  expectedToken: string | undefined;
  adminAuth?: AdminAuthChecker;
}

export interface DebugRoutesOptions {
  /** Required selection prevents a configured app from silently omitting its stored settings view. */
  readonly appSettingRows: (() => Promise<readonly GlobalSettingView[]>) | null;
  db?: DatabaseHandle;
  assets?: AssetInspector;
  rpgTrace?: RpgTraceInspector;
  memoryRecall?: MemoryRecallInspector;
  sockets?: SocketInspector;
  effectiveConfig?: () => EffectiveAppConfig;
  /** The live capture decision for both wire reads; it includes composition overrides unavailable to foundation. */
  wireCaptureEnabled?: () => boolean;
  auth?: DebugAuthOptions | string;
}

interface BugReportRecorder {
  readonly recent: (filter: Pick<RecorderFilter, "limit">) => readonly object[];
}

/** Opaque recorder output is preserved; absence remains an explicit unavailable source in the bundle. */
export interface BugReportInspectors {
  readonly rpgTrace?: BugReportRecorder;
  readonly memoryRecall?: BugReportRecorder;
}
