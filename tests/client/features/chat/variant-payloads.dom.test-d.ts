import { expectTypeOf, test } from "vitest";
import type { ComposerGuidedClusterProps } from "#client/features/chat/components/composer-guided-cluster.tsx";
import type { ComposerSendControlProps } from "#client/features/chat/components/composer-send-control.tsx";
import type { ChatRowProjection } from "#client/features/chat/hooks/use-message-items.ts";
import type { SendGate } from "#client/features/chat/hooks/use-send-availability.ts";
import type { RowAttribution } from "#client/features/chat/lib/attribution.ts";

test("send refusal stays correlated through the hook and both control projections", () => {
  expectTypeOf<{ unavailable: true; reason: undefined; cause: null; failed: false }>().not.toExtend<SendGate>();
  expectTypeOf<{ unavailable: false; reason: undefined; cause: undefined; failed: true }>().toExtend<SendGate>();
  expectTypeOf<{ unavailable: false; reason: undefined; cause: null; failed: false }>().toExtend<SendGate>();
  expectTypeOf<{ unavailable: true; reason: string; cause: "no-connection"; failed: false }>().toExtend<SendGate>();
  expectTypeOf<{ unavailable: true; reason: undefined }>().not.toExtend<ComposerSendControlProps["availability"]>();
  expectTypeOf<{ unavailable: true; reason: undefined }>().not.toExtend<ComposerGuidedClusterProps["sendAvailability"]>();
  expectTypeOf<{ unavailable: false; reason: undefined }>().toExtend<ComposerSendControlProps["availability"]>();
  expectTypeOf<{ unavailable: true; reason: string }>().toExtend<ComposerGuidedClusterProps["sendAvailability"]>();
});

test("resolved attribution keeps absent, persona and character chrome distinct", () => {
  type Common = Pick<RowAttribution, "avatarHash" | "hueSeed">;
  expectTypeOf<Common & { name: null; kind: "persona"; avatarAssetId: null; tokens: null }>().not.toExtend<RowAttribution>();
  expectTypeOf<Common & { name: null; kind: null; avatarHash: string; avatarAssetId: null; tokens: null }>().not.toExtend<RowAttribution>();
  expectTypeOf<Common & { name: string; kind: "persona"; avatarAssetId: null; tokens: NonNullable<RowAttribution["tokens"]> }>().not.toExtend<RowAttribution>();
  expectTypeOf<Common & { name: null; kind: null; avatarHash: null; avatarAssetId: null; tokens: null }>().toExtend<RowAttribution>();
  expectTypeOf<Common & { name: string; kind: "persona"; avatarAssetId: null; tokens: null }>().toExtend<RowAttribution>();
  expectTypeOf<Common & { name: string; kind: "character"; avatarAssetId: null; tokens: null }>().toExtend<RowAttribution>();
});

test("minimal message readers retain the canonical ghost versus required-view relationship", () => {
  expectTypeOf<{ kind: "message" }>().not.toExtend<ChatRowProjection<"role">>();
  expectTypeOf<{ kind: "message" }>().not.toExtend<ChatRowProjection<"content">>();
  expectTypeOf<{ kind: "ghost" }>().toExtend<ChatRowProjection<"role">>();
  expectTypeOf<{ kind: "message"; view: { role: "user" } }>().toExtend<ChatRowProjection<"role">>();
  expectTypeOf<{ kind: "message"; view: { content: string } }>().toExtend<ChatRowProjection<"content">>();
});
