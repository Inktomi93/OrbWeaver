import type { ToolCallRecord } from "@orb/contracts/chat";
import type { GenerationUsageLeg } from "@orb/contracts/inference";
import type { auditLogs } from "@orb/db";
import type {
  AdminAuthChecker,
  AuditEntry,
  DebugAuthOptions,
  DebugRoutesOptions,
  MemoryLogRecord,
  RequestRecord,
  RequestTrace,
  RpgTraceInspector,
  SerializedSpan,
  SerializedSpanEvent,
  SpanAttrs,
  span,
  WireCaptureFilter,
  WireOutcome,
  WireToolCall,
  WireWarning,
} from "@orb/server/foundation/observability";
import type { Context, HonoRequest } from "hono";
import { expectTypeOf, test } from "vitest";

type NativeSpan = Parameters<Parameters<typeof span>[1]>[0];
type NativeSpanContext = ReturnType<NativeSpan["spanContext"]>;

test("recorded native fields derive their actual owners without copying native readonly modifiers", () => {
  expectTypeOf<SerializedSpan["spanId"]>().toEqualTypeOf<NativeSpanContext["spanId"]>();
  expectTypeOf<SerializedSpan["parentSpanId"]>().toEqualTypeOf<NativeSpanContext["spanId"] | undefined>();
  // biome-ignore lint/complexity/noBannedTypes: The type assertion tests property presence against the empty object type.
  expectTypeOf<{}>().not.toExtend<Pick<SerializedSpan, "parentSpanId">>();
  expectTypeOf<Pick<SerializedSpan, "spanId">>().toEqualTypeOf<{ spanId: NativeSpanContext["spanId"] }>();
  expectTypeOf<SerializedSpanEvent["attributes"]>().toEqualTypeOf<SerializedSpan["attributes"] | undefined>();
  // biome-ignore lint/complexity/noBannedTypes: The type assertion tests property presence against the empty object type.
  expectTypeOf<{}>().toExtend<Pick<SerializedSpanEvent, "attributes">>();
  expectTypeOf<RequestTrace["status"]>().toEqualTypeOf<SerializedSpan["status"]>();
  expectTypeOf<RequestRecord["method"]>().toEqualTypeOf<HonoRequest["method"]>();
  expectTypeOf<RequestRecord["path"]>().toEqualTypeOf<HonoRequest["path"]>();
  expectTypeOf<AuditEntry["actorUserId"]>().toEqualTypeOf<(typeof auditLogs.$inferSelect)["actorUserId"]>();
  expectTypeOf<AuditEntry["metadata"]>().toEqualTypeOf<NonNullable<(typeof auditLogs.$inferSelect)["metadata"]> | undefined>();
});

test("diagnostic inputs preserve opaque metadata, raw strings and explicit optional-value semantics", () => {
  expectTypeOf<{ probe: string | number | boolean | undefined }>().toExtend<SpanAttrs>();
  expectTypeOf<{ probe: string[] }>().not.toExtend<SpanAttrs>();
  expectTypeOf<MemoryLogRecord["opaqueMetadata"]>().toEqualTypeOf<unknown>();
  expectTypeOf<WireToolCall["name"]>().toEqualTypeOf<ToolCallRecord["name"]>();
  expectTypeOf<WireToolCall["args"]>().toEqualTypeOf<ToolCallRecord["arguments"]>();
  expectTypeOf<WireToolCall>().toEqualTypeOf<{ readonly name: ToolCallRecord["name"]; readonly args: ToolCallRecord["arguments"] }>();
  expectTypeOf<WireWarning>().toEqualTypeOf<{ readonly code: string; readonly message: string }>();
  expectTypeOf<Pick<WireOutcome, "tokensOut" | "modelCalls" | "maxOutputTokens">>().toEqualTypeOf<
    Readonly<Pick<GenerationUsageLeg, "tokensOut" | "modelCalls" | "maxOutputTokens">>
  >();
  expectTypeOf<WireWarning["code"]>().toEqualTypeOf<string>();
  expectTypeOf<WireOutcome["finishReason"]>().toEqualTypeOf<string | null>();
  expectTypeOf<WireOutcome["reasoningEffort"]>().toEqualTypeOf<string | null>();
  expectTypeOf<{ providerId: undefined }>().toExtend<WireCaptureFilter>();
  expectTypeOf<{ turnId: undefined }>().not.toExtend<Parameters<RpgTraceInspector["recent"]>[0]>();
});

test("debug admission remains synchronous and context-based with required nullable settings selection", () => {
  expectTypeOf<Parameters<AdminAuthChecker["isAdmin"]>[0]>().toEqualTypeOf<Context>();
  expectTypeOf<ReturnType<AdminAuthChecker["isAdmin"]>>().toEqualTypeOf<boolean>();
  // biome-ignore lint/complexity/noBannedTypes: The type assertion tests property presence against the empty object type.
  expectTypeOf<{}>().not.toExtend<DebugAuthOptions>();
  expectTypeOf<{ expectedToken: undefined }>().toExtend<DebugAuthOptions>();
  // biome-ignore lint/complexity/noBannedTypes: The type assertion tests property presence against the empty object type.
  expectTypeOf<{}>().not.toExtend<DebugRoutesOptions>();
  expectTypeOf<{ appSettingRows: null }>().toExtend<DebugRoutesOptions>();
});
