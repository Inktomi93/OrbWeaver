// Type-level pins for the chat wire contract's D48 seams (tool-use-design/02 §2–§4). The load-bearing
// one: the `agent-sdk` arm carries NO tools/toolChoice/responseFormat — tools reach the SDK only via
// `project-mcp`/`mcpServers` (the SDK owns its loop, D47/D8), and structured output lands on that arm
// only with its first consumer (04 §1). A field appearing there is the "second tool plumbing" D48 rejects.
import type { AgentSdkChatRequest, ChatRequest, HISTORY_ROLES, HistoryRole, ToolChoice } from "@orb/server/infra/providers";
import { expectTypeOf, test } from "vitest";

/** Distributes over each union member M; collapses to `false` only when NO member has K (the
 *  index.test-d.ts helper — stronger than not.toHaveProperty, which only sees shared keys). */
type UnionMemberHasKey<U, K extends PropertyKey> = U extends unknown ? (K extends keyof U ? true : false) : never;

type WireArm = ChatRequest & { api: "chat-completions" | "responses" };

test("the agent-sdk arm has NO tools/toolChoice/responseFormat (mcpServers is its only tool path)", () => {
  expectTypeOf<UnionMemberHasKey<AgentSdkChatRequest, "tools">>().toEqualTypeOf<false>();
  expectTypeOf<UnionMemberHasKey<AgentSdkChatRequest, "toolChoice">>().toEqualTypeOf<false>();
  expectTypeOf<UnionMemberHasKey<AgentSdkChatRequest, "responseFormat">>().toEqualTypeOf<false>();
});

test("both wire arms carry the three optional D48 fields", () => {
  expectTypeOf<UnionMemberHasKey<WireArm, "tools">>().toEqualTypeOf<true>();
  expectTypeOf<UnionMemberHasKey<WireArm, "toolChoice">>().toEqualTypeOf<true>();
  expectTypeOf<UnionMemberHasKey<WireArm, "responseFormat">>().toEqualTypeOf<true>();
});

test("HistoryRole derives from the tuple; toolChoice is the four-mode union", () => {
  // The exact member set is pinned at RUNTIME (chat.test.ts toStrictEqual on HISTORY_ROLES) — the
  // no-inline-union-redecl gate forbids re-spelling the tuple here; this pins only the derivation.
  expectTypeOf<HistoryRole>().toEqualTypeOf<(typeof HISTORY_ROLES)[number]>();
  expectTypeOf<ToolChoice["mode"]>().toEqualTypeOf<"auto" | "none" | "required" | "tool">();
});
