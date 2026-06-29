// The D22 member-card visibility clamp (chat.md Part III §7/§11).
import type { CharacterCard } from "@orb/contracts/character";
import type { MemberCardView, MemberCardVisibility } from "@orb/contracts/chat";
import type { AssetId, CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, expect, test } from "vitest";
import {
  clampMemberCard,
  resolveCardVisibility,
} from "../../../../../../packages/server/src/domain/chat/substrate/auth";

const CHAR = castId<CharacterId>("character_aria");
const AVATAR = castId<AssetId>("asset_aria");

// A fully-populated canonical card — every clampable field set, so a null in the output means "clamped out".
const FULL_CARD: CharacterCard = {
  name: "Aria",
  description: "a desc",
  personality: "curious",
  scenario: "a tavern",
  greetings: ["hello"],
  exampleMessages: "ex",
  systemPrompt: "sys",
  postHistoryInstructions: "jb",
  depthPrompt: { depth: 4, prompt: "note" },
  creatorNotes: "notes",
  creator: "nate",
  cardVersion: "1.0",
  regexScripts: [],
  extensions: null,
  avatarAssetId: AVATAR,
  refinery: null,
};

const TAGS = ["fantasy", "rogue"];
const LORE = ["lore entry"];

function clampAt(visibility: MemberCardVisibility): MemberCardView {
  return clampMemberCard({
    characterId: CHAR,
    card: FULL_CARD,
    tags: TAGS,
    lore: LORE,
    visibility,
  });
}

describe("clampMemberCard — each level reveals exactly its fields", () => {
  test("name-avatar: only the floor (name + avatar)", () => {
    const v = clampAt("name-avatar");
    expect(v.name).toBe("Aria");
    expect(v.avatarAssetId).toBe(AVATAR);
    expect(v.description).toBeNull();
    expect(v.tags).toBeNull();
    expect(v.lore).toBeNull();
    expect(v.systemPrompt).toBeNull();
    expect(v.authorsNoteDepth).toBeNull();
  });

  test("sheet: presentable identity, but no lore and no internals", () => {
    const v = clampAt("sheet");
    expect(v.description).toBe("a desc");
    expect(v.personality).toBe("curious");
    expect(v.scenario).toBe("a tavern");
    expect(v.greetings).toEqual(["hello"]);
    expect(v.exampleMessages).toBe("ex");
    expect(v.tags).toEqual(TAGS);
    expect(v.creatorNotes).toBe("notes");
    expect(v.lore).toBeNull();
    expect(v.systemPrompt).toBeNull();
    expect(v.postHistoryInstructions).toBeNull();
    expect(v.authorsNoteDepth).toBeNull();
  });

  test("sheet+lore: adds the rendered world-info, still no internals", () => {
    const v = clampAt("sheet+lore");
    expect(v.lore).toEqual(LORE);
    expect(v.description).toBe("a desc");
    expect(v.systemPrompt).toBeNull();
    expect(v.authorsNoteDepth).toBeNull();
  });

  test("full: the prompt-steering internals are revealed", () => {
    const v = clampAt("full");
    expect(v.systemPrompt).toBe("sys");
    expect(v.postHistoryInstructions).toBe("jb");
    expect(v.authorsNoteDepth).toBe(4);
    expect(v.lore).toEqual(LORE);
    expect(v.tags).toEqual(TAGS);
  });

  test("the projection echoes the level it was clamped to", () => {
    expect(clampAt("sheet").visibility).toBe("sheet");
    expect(clampAt("full").visibility).toBe("full");
  });
});

describe("resolveCardVisibility — the host always sees full", () => {
  test("host → full regardless of the configured level; a member → the configured level", () => {
    expect(resolveCardVisibility("host", "name-avatar")).toBe("full");
    expect(resolveCardVisibility("host", "sheet")).toBe("full");
    expect(resolveCardVisibility("member", "sheet")).toBe("sheet");
    expect(resolveCardVisibility("member", "name-avatar")).toBe("name-avatar");
  });
});
