// Unit: the BG-C carried-background cascade + source resolvers (features/app-shell/lib/resolve-theme-background).
// Pins the load-bearing DONE criteria: in a TRUE-SOLO room the carried source paints (chat-set > card-carried);
// in ANY other composition the carried source is INERT (the viewer's own appearance wins). Composition is the
// ONE shared `CarriedAppearanceCast` — the resolveRoomTheme twin — so these cases mirror attribution.test's
// Layer-2 cases by construction. Post-F-P0-2: carried sources are `asset` (an external URL is materialized to
// an asset BEFORE it can be persisted/carried), and the URL resolver has NO `external` arm.
//
// The DRAFT block below is the 2026-08-06 dogfood pin: a pre-send draft projects the SAME cast from its
// founding CARDS, so a card's background paints from the moment the character is picked — the old
// `ParticipantView[]` signature could only be satisfied by a committed roster, which is exactly why the
// background used to appear only after the first message.

import { blobUrl } from "@orb/contracts/assets";
import type { CarriedAppearanceCast } from "@orb/contracts/chat";
import { carriedCastFromParticipants } from "@orb/contracts/chat";
import type { AppearanceSettings } from "@orb/contracts/settings";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import {
  appearanceBackgroundSource,
  resolveChatBackgroundSource,
  resolveThemeBackgroundUrl,
} from "../../../../../packages/client/src/features/app-shell/lib/resolve-theme-background.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeParticipant } from "../../chat/lib/_support.ts";

const CHAT_BG: ThemeBackground = {
  kind: "asset",
  seededId: "",
  externalUrl: "",
  assetId: "asset_chat",
  assetHash: "hash_chat",
  mime: "image/png",
  provenanceUrl: "",
};
const CARD_BG: ThemeBackground = {
  kind: "asset",
  seededId: "",
  externalUrl: "",
  assetId: "asset_card",
  assetHash: "hash_card",
  mime: "image/png",
  provenanceUrl: "",
};
const NONE: ThemeBackground = { kind: "none", seededId: "", externalUrl: "", assetId: "", assetHash: "", mime: "", provenanceUrl: "" };

const HUMAN = makeParticipant({ kind: "human", characterId: null, displayName: "Nate" });
const HUMAN2 = makeParticipant({ kind: "human", characterId: null, displayName: "Sam" });

/** The COMMITTED-room arm: a `getChat` roster projected into the cast the resolver reads. */
const cast = carriedCastFromParticipants;

/** A pre-send draft's human seats: the viewer, alone — nobody can be invited into a chat that does not
 *  exist yet, so a draft is single-human BY CONSTRUCTION. */
const DRAFT_HUMAN_SEATS = 1;

/** The DRAFT arm: the viewer's one seat + the founding CARDS — exactly what `useCarriedAppearanceCast`
 *  builds before a chat row exists. A draft never carries a chat-set source (that column is written by a
 *  post-creation verb), so every draft case below passes `null` for it. */
function draftCast(...backgroundOverrides: readonly (ThemeBackground | null)[]): CarriedAppearanceCast {
  return {
    humanCount: DRAFT_HUMAN_SEATS,
    characters: backgroundOverrides.map((backgroundOverride, index) => ({
      displayName: `Card ${index}`,
      themeOverride: null,
      backgroundOverride,
    })),
  };
}

test("true-solo: the chat-set background wins over the card-carried (cascade order)", () => {
  const alice = makeParticipant({ displayName: "Alice", backgroundOverride: CARD_BG });
  expect(resolveChatBackgroundSource(cast([HUMAN, alice]), CHAT_BG)).toEqual(CHAT_BG);
});

test("true-solo: with no chat-set, the card-carried background cascades in", () => {
  const alice = makeParticipant({ displayName: "Alice", backgroundOverride: CARD_BG });
  expect(resolveChatBackgroundSource(cast([HUMAN, alice]), null)).toEqual(CARD_BG);
});

test("true-solo: a kind:none chat-set falls through to the card-carried", () => {
  const alice = makeParticipant({ displayName: "Alice", backgroundOverride: CARD_BG });
  expect(resolveChatBackgroundSource(cast([HUMAN, alice]), NONE)).toEqual(CARD_BG);
});

test("true-solo: no carried source at either level ⇒ undefined (viewer appearance wins)", () => {
  const alice = makeParticipant({ displayName: "Alice", backgroundOverride: null });
  expect(resolveChatBackgroundSource(cast([HUMAN, alice]), null)).toBeUndefined();
  expect(resolveChatBackgroundSource(cast([HUMAN, alice]), NONE)).toBeUndefined();
});

test("multi-human room: the chat/card background is INERT (undefined), never forcing another viewer's viewport", () => {
  const alice = makeParticipant({ displayName: "Alice", backgroundOverride: CARD_BG });
  // Two humans + one character — a host's chat-set background must not paint for the second human. THE
  // load-bearing refusal: the 08-03 widening moved the gate to "no OTHER human seat", so this case is the
  // pin proving the widening did not decay into "anything paints".
  expect(resolveChatBackgroundSource(cast([HUMAN, HUMAN2, alice]), CHAT_BG)).toBeUndefined();
});

test("multi-human GROUP room (two humans, two characters): still INERT", () => {
  const alice = makeParticipant({ displayName: "Alice", backgroundOverride: CARD_BG });
  const bob = makeParticipant({ characterId: castId<CharacterId>("char_bob"), displayName: "Bob", backgroundOverride: CARD_BG });
  expect(resolveChatBackgroundSource(cast([HUMAN, HUMAN2, alice, bob]), CHAT_BG)).toBeUndefined();
});

test("single-human group room: the CHAT-SET background paints (08-03 widening — no other viewport to force)", () => {
  const alice = makeParticipant({ displayName: "Alice", backgroundOverride: CARD_BG });
  const bob = makeParticipant({ characterId: castId<CharacterId>("char_bob"), displayName: "Bob" });
  expect(resolveChatBackgroundSource(cast([HUMAN, alice, bob]), CHAT_BG)).toEqual(CHAT_BG);
});

test("single-human group room: the CARD-carried arm stays true-solo-only (no arbitrary pick among cards)", () => {
  const alice = makeParticipant({ displayName: "Alice", backgroundOverride: CARD_BG });
  const bob = makeParticipant({ characterId: castId<CharacterId>("char_bob"), displayName: "Bob", backgroundOverride: CARD_BG });
  expect(resolveChatBackgroundSource(cast([HUMAN, alice, bob]), null)).toBeUndefined();
  expect(resolveChatBackgroundSource(cast([HUMAN, alice, bob]), NONE)).toBeUndefined();
});

test("no cast (landing, or a read that has not settled) ⇒ undefined", () => {
  expect(resolveChatBackgroundSource(undefined, CHAT_BG)).toBeUndefined();
});

test("no participants ⇒ undefined (an empty roster is not a single-human room)", () => {
  expect(resolveChatBackgroundSource(cast(undefined), CHAT_BG)).toBeUndefined();
});

// ── DRAFT PARITY (owner dogfood 2026-08-06) ───────────────────────────────────────────────────────
// A pre-send draft's founding cast decides the carried background under the SAME rules a committed room
// uses — the whole point of keying the cascade on the phase-independent cast.

test("DRAFT: a solo founding card's background paints before the chat row exists", () => {
  expect(resolveChatBackgroundSource(draftCast(CARD_BG), null)).toEqual(CARD_BG);
});

test("DRAFT: a solo founding card with no background ⇒ the viewer's own appearance still wins", () => {
  expect(resolveChatBackgroundSource(draftCast(null), null)).toBeUndefined();
  expect(resolveChatBackgroundSource(draftCast(NONE), null)).toBeUndefined();
});

test("DRAFT: a GROUP founding cast carries nothing — the same no-arbitrary-pick refusal the committed room makes", () => {
  expect(resolveChatBackgroundSource(draftCast(CARD_BG, CARD_BG), null)).toBeUndefined();
});

test("DRAFT: a blank (cast-less) draft carries nothing", () => {
  expect(resolveChatBackgroundSource(draftCast(), null)).toBeUndefined();
});

test("resolveThemeBackgroundUrl resolves an asset to its blob url; none/external → null (external never paints — F-P0-2)", () => {
  expect(resolveThemeBackgroundUrl(CHAT_BG)).toBe(blobUrl("hash_chat"));
  expect(resolveThemeBackgroundUrl(NONE)).toBeNull();
  // A stray persisted `external` source carries NO paintable arm — it degrades to "no image" (the invariant).
  expect(
    resolveThemeBackgroundUrl({
      kind: "external",
      seededId: "",
      externalUrl: "https://cdn.example/x.jpg",
      assetId: "",
      assetHash: "",
      mime: "",
      provenanceUrl: "",
    }),
  ).toBeNull();
});

test("appearanceBackgroundSource projects the flat appearance fields onto the nested source shape", () => {
  const appearance = {
    backgroundImageKind: "asset",
    backgroundSeededId: "",
    backgroundAssetId: "asset_bg1",
    backgroundAssetHash: "hash_bg1",
    backgroundAssetMime: "video/mp4",
  } satisfies Pick<AppearanceSettings, "backgroundImageKind" | "backgroundSeededId" | "backgroundAssetId" | "backgroundAssetHash" | "backgroundAssetMime">;
  expect(appearanceBackgroundSource(appearance)).toEqual({
    kind: "asset",
    seededId: "",
    externalUrl: "",
    provenanceUrl: "",
    assetId: "asset_bg1",
    assetHash: "hash_bg1",
    mime: "video/mp4",
  });
});
