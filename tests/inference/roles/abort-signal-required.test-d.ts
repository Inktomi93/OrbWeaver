// A cancel cannot be left out: the role clients, the runtime resolve, the search ops and a prompt transform all take
// their AbortSignal as a required field or parameter (docs/law/Spine-TypeScript-and-Patterns.md).
import type { PromptTransform } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { SearchDocumentsOp } from "@orb/contracts/search";
import type { InferenceRuntime, RoleClientsWithSignal } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

declare const roleClients: RoleClientsWithSignal;
declare const runtime: InferenceRuntime;
declare const documents: SearchDocumentsOp<AbortSignal>;
declare const principal: Principal;
declare const ownerId: UserId;
declare const signal: AbortSignal;

test("a role-client call names its signal", () => {
  expectTypeOf(roleClients.rerank).toBeCallableWith("q", [], { signal });
  // @ts-expect-error a rerank pick with no signal cannot be stopped by the turn that asked for it
  expectTypeOf(roleClients.rerank).toBeCallableWith("q", [], {});
  expectTypeOf(roleClients.resolved).toBeCallableWith("embed", signal);
  // @ts-expect-error a resolve can wake a model, so it takes the caller's signal
  expectTypeOf(roleClients.resolved).toBeCallableWith("embed");
  expectTypeOf(roleClients.summarize).parameter(1).toHaveProperty("signal").toEqualTypeOf<AbortSignal>();
});

test("the runtime resolve and a search op name their signal", () => {
  expectTypeOf(runtime.resolve).toBeCallableWith({ task: "chat", principal, signal });
  // @ts-expect-error the resolve is the model wake a cancel must reach
  expectTypeOf(runtime.resolve).toBeCallableWith({ task: "chat", principal });
  expectTypeOf(documents).toBeCallableWith({ scope: { ownerId }, ownerId, queryText: "q", signal });
  // @ts-expect-error a document search embeds and reranks on the caller's cancel
  expectTypeOf(documents).toBeCallableWith({ scope: { ownerId }, ownerId, queryText: "q" });
  expectTypeOf(runtime.resolve).parameter(0).toHaveProperty("signal").toEqualTypeOf<AbortSignal>();
});

test("the contracts signal type parameter has no default", () => {
  // @ts-expect-error a contracts op binds its runtime's signal type at every use
  expectTypeOf<SearchDocumentsOp>().toBeFunction();
  expectTypeOf<PromptTransform<AbortSignal>["apply"]>().parameter(2).toEqualTypeOf<AbortSignal>();
});
