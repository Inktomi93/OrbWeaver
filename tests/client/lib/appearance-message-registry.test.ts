// Every case here tears down through the REAL door — the disposer `registerAppearanceMessageSnapshot`
// hands back, which is the same one a MessageRow's effect cleanup calls — so the registry needs no
// test-only reset export and the suite proves the production cleanup path while it is at it (#1847).
import { describe } from "vitest";
import type { AppearanceMessageCarrierSnapshot } from "../../../packages/client/src/lib/appearance-message-registry.ts";
import { readAppearanceMessageSnapshots, registerAppearanceMessageSnapshot } from "../../../packages/client/src/lib/appearance-message-registry.ts";
import { expect, test } from "../../support/fixtures.ts";

const SNAPSHOT_A: AppearanceMessageCarrierSnapshot = {
  avatarAspect: "square",
  avatarRing: "none",
  avatarShape: "round",
  avatarSize: "sm",
  autoFixMarkdown: false,
  chatStyle: "bubble",
  colorQuotedSpeech: true,
  messageActions: "hover",
  metadataVisibility: {
    showGenerationCost: false,
    showGenerationTimer: false,
    showMessageId: false,
    showModelIcon: false,
    showTimestamps: true,
    showTokenCount: false,
  },
  showInChatAvatars: true,
  showLLMReasoningIcon: false,
};

const SNAPSHOT_B: AppearanceMessageCarrierSnapshot = {
  ...SNAPSHOT_A,
  avatarAspect: "portrait",
  avatarRing: "accent",
  avatarShape: "square",
  avatarSize: "lg",
  chatStyle: "document",
  messageActions: "expanded",
  metadataVisibility: { ...SNAPSHOT_A.metadataVisibility, showTimestamps: false, showTokenCount: true },
  showInChatAvatars: false,
};

describe("live MessageRow appearance registry", () => {
  test("absence is empty and every mounted instance retains its actual nested values", () => {
    expect(readAppearanceMessageSnapshots()).toEqual([]);
    const removeA = registerAppearanceMessageSnapshot("message-a", SNAPSHOT_A);
    const removeB = registerAppearanceMessageSnapshot("message-b", SNAPSHOT_B);

    expect(readAppearanceMessageSnapshots()).toEqual([
      { instanceId: "message-a", snapshot: SNAPSHOT_A },
      { instanceId: "message-b", snapshot: SNAPSHOT_B },
    ]);

    removeA();
    expect(readAppearanceMessageSnapshots()).toEqual([{ instanceId: "message-b", snapshot: SNAPSHOT_B }]);
    removeB();
    expect(readAppearanceMessageSnapshots()).toEqual([]);
  });

  test("a stale virtualized-row cleanup cannot erase the newer registration for the same id", () => {
    const removeStale = registerAppearanceMessageSnapshot("message-a", SNAPSHOT_A);
    const removeCurrent = registerAppearanceMessageSnapshot("message-a", SNAPSHOT_B);

    removeStale();
    expect(readAppearanceMessageSnapshots()).toEqual([{ instanceId: "message-a", snapshot: SNAPSHOT_B }]);

    removeCurrent();
    expect(readAppearanceMessageSnapshots()).toEqual([]);
  });
});
