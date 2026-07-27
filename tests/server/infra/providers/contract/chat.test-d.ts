// Type-level pins for the chat wire contract's D48 seams (tool-use-design/02 §2–§4). The load-bearing
// one: the `agent-sdk` arm carries NO wire `tools[]`/`toolChoice` — tools reach the SDK only via the
// `project-mcp` MCP projection (`toolServer`; the SDK owns its loop, D47/D8). An OpenAI-shaped tools
// array appearing there is the "second tool plumbing" D48 rejects. `responseFormat` DOES land on that
// arm (its first consumer: the chat pipeline's structured gate — 04 §1), mapped to the SDK's own
// `outputFormat: json_schema` at the runner.
import type { AgentSdkChatRequest, ChatRequest, HISTORY_ROLES, HistoryRole, ToolChoice } from "@orb/server/infra/providers";
import { expectTypeOf, test } from "vitest";

/** Distributes over each union member M; collapses to `false` only when NO member has K (the
 *  index.test-d.ts helper — stronger than not.toHaveProperty, which only sees shared keys). */
type UnionMemberHasKey<U, K extends PropertyKey> = U extends unknown ? (K extends keyof U ? true : false) : never;

type WireArm = ChatRequest & { api: "chat-completions" | "responses" };

test("the agent-sdk arm has NO wire tools/toolChoice (the MCP toolServer is its only tool path)", () => {
  expectTypeOf<UnionMemberHasKey<AgentSdkChatRequest, "tools">>().toEqualTypeOf<false>();
  expectTypeOf<UnionMemberHasKey<AgentSdkChatRequest, "toolChoice">>().toEqualTypeOf<false>();
});

test("the agent-sdk arm carries the stateful tool + structured channels", () => {
  expectTypeOf<UnionMemberHasKey<AgentSdkChatRequest, "toolServer">>().toEqualTypeOf<true>();
  expectTypeOf<UnionMemberHasKey<AgentSdkChatRequest, "toolTurnLimit">>().toEqualTypeOf<true>();
  expectTypeOf<UnionMemberHasKey<AgentSdkChatRequest, "responseFormat">>().toEqualTypeOf<true>();
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
