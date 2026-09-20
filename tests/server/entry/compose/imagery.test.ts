// entry/compose/imagery — the seam that wires imagery's injected ops onto the sibling front doors and
// registers the D48 `generate_image` tool. "Owns no business logic" is again true of the shape only: three
// of the ops it assembles carry decisions the imagery domain cannot make for itself, and one of them is a
// leak gate that lives NOWHERE ELSE.
//
//   • THE extractQuiet MEMBERSHIP *AND* HISTORY-FLOOR GATE. `imagery.extractPrompt` hands the model's
//     distillation of a room's recent canon straight back on the wire, and it is a CHAT-scoped op with no
//     asset-owner join to gate on. The gate is this wrapper: `resolveViewerVisibility(chatId, callerUserId)`
//     → `null` ⇒ a leak-free `NOT_FOUND` (a non-member and a missing chat get the identical answer, so a
//     foreigner learns nothing), non-null ⇒ the extractor runs UNDER THAT VIEWER'S `historyFloorSeq`. The
//     older gate was membership-only, which let a `from-join`-clamped member read a summary of canon their
//     own `listMessages` withholds. Both halves are pinned, including that the side-LLM is never reached on
//     the refusal path.
//   • THE ⑫ FOREIGN-INPUTS SEAM. Every per-mode template / caption instruction / negative base resolves off
//     the CALLER's own `UserSettings`, never the room host's — one human's request about their own settings.
//   • EC-B: the avatar byte read is OWNER-GATED on the caller (`readOwnedAssetBytes(caller, …)`), so the
//     caption lane cannot be pointed at somebody else's asset.
//
// The caption ladder is driven end-to-end through `extractPrompt` in a multimodal mode (every op on that
// path is one this seam wired), and the chat-bound lane through an extraction mode.

import type { Principal } from "@orb/contracts/identity";
import type { UserSettings } from "@orb/contracts/settings";
import { parseUserSettings } from "@orb/contracts/settings";
import type { AssetId, CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Mock } from "vitest";
import { describe, vi } from "vitest";
import { imageryToolDefinitions } from "../../../../packages/server/src/domain/imagery/index.ts";
import type { ImageryComposeDeps } from "../../../../packages/server/src/entry/compose/imagery.ts";
import { buildImagery } from "../../../../packages/server/src/entry/compose/imagery.ts";
import { principal } from "../../../support/factories/principal.ts";
import { expect, test } from "../../../support/fixtures.ts";

const CALLER = principal(castId<UserId>("usr_caller"), { handle: castId<Handle>("caller") });
const CHAT = castId<ChatId>("chat_room");
const SUBJECT = castId<CharacterId>("chr_subject");
const AVATAR = castId<AssetId>("ast_avatar");
/** The REAL parsed defaults, not a hand-shaped literal: unset ⇒ the shipped catalog bytes, and a settings
 *  section growing a field cannot silently make this fake diverge from what production reads. */
const DEFAULT_SETTINGS = parseUserSettings({});

type Visibility = { readonly historyFloorSeq: number } | null;

interface Fakes {
  readonly resolveViewerVisibility: Mock<(chatId: ChatId, userId: UserId) => Promise<Visibility>>;
  readonly summarize: Mock<(...args: readonly unknown[]) => Promise<{ items: readonly { text: string; usage: { costUsd: number | null } }[] }>>;
  readonly loadUserSettings: Mock<(userId: UserId) => Promise<UserSettings>>;
  readonly resolveUserPresetParams: Mock<(userId: UserId) => Promise<Record<string, never>>>;
  readonly characterGet: Mock<(args: { principal: Principal; characterId: CharacterId }) => Promise<{ avatarAssetId: AssetId | null }>>;
  readonly readOwnedAssetBytes: Mock<(caller: Principal, assetId: AssetId) => Promise<{ bytes: Uint8Array; mime: string }>>;
  readonly register: Mock<(def: { name: string }) => void>;
}

function fakes(): Fakes {
  return {
    resolveViewerVisibility: vi.fn<(chatId: ChatId, userId: UserId) => Promise<Visibility>>(() => Promise.resolve({ historyFloorSeq: 42 })),
    summarize: vi.fn<(...args: readonly unknown[]) => Promise<{ items: readonly { text: string; usage: { costUsd: number | null } }[] }>>(() =>
      Promise.resolve({ items: [{ text: "  a lantern, rain  ", usage: { costUsd: 0.25 } }] }),
    ),
    loadUserSettings: vi.fn<(userId: UserId) => Promise<UserSettings>>(() => Promise.resolve(DEFAULT_SETTINGS)),
    resolveUserPresetParams: vi.fn<(userId: UserId) => Promise<Record<string, never>>>(() => Promise.resolve({})),
    characterGet: vi.fn<(args: { principal: Principal; characterId: CharacterId }) => Promise<{ avatarAssetId: AssetId | null }>>(() =>
      Promise.resolve({ avatarAssetId: AVATAR }),
    ),
    readOwnedAssetBytes: vi.fn<(caller: Principal, assetId: AssetId) => Promise<{ bytes: Uint8Array; mime: string }>>(() =>
      Promise.resolve({ bytes: new Uint8Array([7, 7]), mime: "image/png" }),
    ),
    register: vi.fn<(def: { name: string }) => void>(),
  };
}

function build(f: Fakes): ReturnType<typeof buildImagery> {
  // @orb-waive no-test-fabrication(unknown): inert structural stand-ins for the db/connection/executor/assets front doors this Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  // seam threads; only the ops the pins below drive are ever called.
  const deps = {
    db: {},
    now: () => 1000,
    connection: { resolveRole: vi.fn() },
    executor: { generateImage: vi.fn() },
    assets: { store: vi.fn(), readOwnedAssetBytes: f.readOwnedAssetBytes },
    character: { getCard: vi.fn(), get: f.characterGet },
    // The per-FUNDER role-client binder (§8.5b) — only `summarize` is read on this seam.
    roleClientsFor: (_funderUserId: UserId) => Promise.resolve({ summarize: f.summarize }),
    resolveUserPresetParams: f.resolveUserPresetParams,
    resolveChatPresetParams: vi.fn(() => Promise.resolve({})),
    resolveUserMacroDefs: vi.fn(() => Promise.resolve({})),
    loadUserSettings: f.loadUserSettings,
    maxImageBytes: () => 1024,
    resolveViewerVisibility: f.resolveViewerVisibility,
    toolUse: { register: f.register },
  } as unknown as ImageryComposeDeps;
  return buildImagery(deps);
}

describe("buildImagery — the extractQuiet gate is membership AND the history floor, refused leak-free", () => {
  test("a caller the room does not admit gets NOT_FOUND, and the side-LLM is never reached", async () => {
    const f = fakes();
    f.resolveViewerVisibility.mockResolvedValue(null);
    const imagery = build(f);

    await expect(imagery.extractPrompt({ caller: CALLER, chatId: CHAT, mode: "character", subjectCharacterId: SUBJECT })).rejects.toMatchObject({
      // The same answer a MISSING chat produces — a foreigner learns nothing about whether the room exists.
      name: "DomainNotFoundError",
    });
    expect(f.summarize).not.toHaveBeenCalled();
  });

  test("the visibility question is asked about THE CALLER and THAT chat — never the room's host", async () => {
    const f = fakes();
    f.resolveViewerVisibility.mockResolvedValue(null);
    const imagery = build(f);

    await expect(imagery.extractPrompt({ caller: CALLER, chatId: CHAT, mode: "character" })).rejects.toThrow();

    expect(f.resolveViewerVisibility).toHaveBeenCalledWith(CHAT, CALLER.userId);
  });

  test("the gate is consulted BEFORE the per-mode template is spent on (nothing runs for a refused caller)", async () => {
    const f = fakes();
    const order: string[] = [];
    f.loadUserSettings.mockImplementation(() => {
      order.push("loadUserSettings");
      return Promise.resolve(DEFAULT_SETTINGS);
    });
    f.resolveViewerVisibility.mockImplementation(() => {
      order.push("resolveViewerVisibility");
      return Promise.resolve(null);
    });

    await expect(build(f).extractPrompt({ caller: CALLER, chatId: CHAT, mode: "character" })).rejects.toThrow();

    // The template read is the caller's own settings (cheap, caller-scoped); the ROOM read never happens.
    expect(order.at(-1)).toBe("resolveViewerVisibility");
    expect(f.summarize).not.toHaveBeenCalled();
  });

  // NOT PINNED HERE, deliberately: the "extraction mode with no chat" refusal (`ImageryNotConfiguredError`)
  // is unreachable through `extractPrompt` — `ExtractPromptParams.chatId` is a REQUIRED `ChatId`, so only the
  // `generatePicture` lane can present a chat-less request. That arm belongs to `domain/imagery`, not to this
  // seam. (An earlier revision of this file asserted it here and compiled only because the value was forced.)
});

describe("buildImagery — the caption lane reads the CALLER's own asset and the CALLER's own settings", () => {
  test("captions the subject's avatar under the caller, trims the model's reply and carries its cost", async () => {
    const f = fakes();

    const result = await build(f).extractPrompt({ caller: CALLER, chatId: CHAT, mode: "character_multimodal", subjectCharacterId: SUBJECT });

    expect(result).toStrictEqual({ prompt: "a lantern, rain", mode: "character_multimodal", source: "captioned", costUsd: 0.25 });
    // EC-B: the byte read is owner-gated on the CALLER — not a synthetic host principal, not an id-only read.
    expect(f.readOwnedAssetBytes).toHaveBeenCalledWith(CALLER, AVATAR);
    // …and the card read goes through the character front door under the CALLER's own Principal, so a
    // foreign/missing subject throws there rather than being resolved by a synthetic host identity.
    expect(f.characterGet).toHaveBeenCalledWith({ principal: CALLER, characterId: SUBJECT });
    // ⑫: the per-mode caption instruction resolves off the CALLER's settings.
    expect(f.loadUserSettings).toHaveBeenCalledWith(CALLER.userId);
    // The side-gen sampling ladder's middle rung is the CALLER's default-preset params.
    expect(f.resolveUserPresetParams).toHaveBeenCalledWith(CALLER.userId);
  });

  test("the vision call carries the avatar BYTES as multimodal content and the resolved instruction", async () => {
    const f = fakes();

    await build(f).extractPrompt({ caller: CALLER, chatId: CHAT, mode: "face_multimodal", subjectCharacterId: SUBJECT });

    const [batch] = f.summarize.mock.calls[0] as [readonly { systemPrompt: string; userPrompt: string; images: readonly Uint8Array[] }[]];
    expect(batch[0]?.images).toStrictEqual([new Uint8Array([7, 7])]);
    expect(batch[0]?.userPrompt).toBe("Describe the attached image.");
    expect(typeof batch[0]?.systemPrompt).toBe("string");
    expect(batch[0]?.systemPrompt.length).toBeGreaterThan(0);
  });

  test("a model reply with no usable keywords fails typed, it does not return an empty prompt", async () => {
    const f = fakes();
    f.summarize.mockResolvedValue({ items: [{ text: "   ", usage: { costUsd: null } }] });

    await expect(build(f).extractPrompt({ caller: CALLER, chatId: CHAT, mode: "character_multimodal", subjectCharacterId: SUBJECT })).rejects.toMatchObject({
      name: "PromptExtractionFailedError",
    });
  });

  test("an ABSENT model item degrades to an empty caption (never a crash on `items[0]`)", async () => {
    const f = fakes();
    f.summarize.mockResolvedValue({ items: [] });

    await expect(build(f).extractPrompt({ caller: CALLER, chatId: CHAT, mode: "character_multimodal", subjectCharacterId: SUBJECT })).rejects.toMatchObject({
      name: "PromptExtractionFailedError",
    });
  });

  test("a subject with NO avatar falls back to the sibling extraction mode — and that lane IS gated", async () => {
    const f = fakes();
    f.characterGet.mockResolvedValue({ avatarAssetId: null });
    f.resolveViewerVisibility.mockResolvedValue(null);

    // The fallback is a chat read, so it must land on the SAME membership gate rather than sliding past it.
    await expect(build(f).extractPrompt({ caller: CALLER, chatId: CHAT, mode: "character_multimodal", subjectCharacterId: SUBJECT })).rejects.toMatchObject({
      name: "DomainNotFoundError",
    });
    expect(f.resolveViewerVisibility).toHaveBeenCalledWith(CHAT, CALLER.userId);
    expect(f.readOwnedAssetBytes).not.toHaveBeenCalled();
  });
});

describe("buildImagery — the D48 tool registers into the ONE registry passed in", () => {
  test("registers exactly the imagery tool definitions, by their contracts-owned wire names", () => {
    const f = fakes();

    build(f);

    const registered = f.register.mock.calls.map((c) => (c[0] as { name: string }).name);
    // ONE home for the definition set: whatever `imageryToolDefinitions` declares is what gets registered.
    expect(registered).toStrictEqual(imageryToolDefinitions({ generatePicture: vi.fn() }).map((d) => d.name));
    expect(registered.length).toBeGreaterThan(0);
  });
});
