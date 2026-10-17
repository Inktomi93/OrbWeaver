// @subject packages/server/src/entry/compose/services.ts
import type { Db } from "@orb/db";
import type { AwaitableStatementToken, BatchHandle, DatabaseHandle, StatementToken } from "@orb/db/wiring";
import type { GenerationObservationCallback } from "@orb/inference";
import type { createChatBus, createGenerationObservationSink } from "@orb/server/domain/chat";
import type { NotificationsService } from "@orb/server/domain/notifications";
import type { SessionsService } from "@orb/server/domain/sessions";
import type { createSettingsContext } from "@orb/server/domain/settings";
import type { ServicesDeps } from "@orb/server/entry/compose";
import { expectTypeOf, test } from "vitest";

test("the real composition input and returned settings binding have no named query capability", () => {
  expectTypeOf<Extract<keyof ServicesDeps["db"], string>>().toEqualTypeOf<never>();
  expectTypeOf<ServicesDeps["db"]>().toEqualTypeOf<DatabaseHandle>();
  expectTypeOf<Extract<keyof ReturnType<typeof createSettingsContext>["db"], string>>().toEqualTypeOf<never>();
  expectTypeOf<Db>().not.toExtend<ServicesDeps["db"]>();
});

test("atomic wiring operands are inert and awaitable results require their producer's distinct token", () => {
  expectTypeOf<Extract<keyof DatabaseHandle, string>>().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof BatchHandle, string>>().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof StatementToken, string>>().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof AwaitableStatementToken<readonly string[]>, string>>().toEqualTypeOf<never>();
  expectTypeOf<StatementToken>().not.toExtend<AwaitableStatementToken<void>>();
  expectTypeOf<AwaitableStatementToken<readonly string[]>>().toExtend<StatementToken>();
  expectTypeOf<AwaitableStatementToken<readonly string[]>>().not.toExtend<PromiseLike<readonly string[]>>();
});

test("actual public statement producers and atomic companion consumers expose only inert tokens", () => {
  expectTypeOf<"createGenerationObservationSession">().not.toExtend<keyof typeof import("@orb/server/domain/chat")>();
  expectTypeOf<ReturnType<typeof createGenerationObservationSink>>().toEqualTypeOf<GenerationObservationCallback>();
  expectTypeOf<ReturnType<SessionsService["signupUserStatement"]>["statement"]>().toEqualTypeOf<
    AwaitableStatementToken<{ id: ReturnType<SessionsService["signupUserStatement"]>["userId"] }[]>
  >();
  expectTypeOf<ReturnType<SessionsService["revokeAllForUserStatement"]>>().toEqualTypeOf<StatementToken>();
  expectTypeOf<Parameters<ReturnType<typeof createChatBus>["emitAfterClaim"]>[1]>().toEqualTypeOf<StatementToken>();
  expectTypeOf<ReturnType<ReturnType<typeof createChatBus>["prepareCreation"]>["statement"]>().toEqualTypeOf<StatementToken>();
  expectTypeOf<NonNullable<Parameters<NotificationsService["record"]>[0]["coStatements"]>[number]>().toEqualTypeOf<StatementToken>();
});
