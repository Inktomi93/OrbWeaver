// CT: the chatStyle variant mechanism — ONE MessageRow surface, three appearances driven by the skin
// table (§12.1). Asserts each style paints the right TOKEN utilities (the token NAME is stable + IS the
// mechanism; not a hardcoded oklch literal — the §13.7 spirit) and that the markdown body renders.
// Also covers #21 attribution chrome (name/avatar/color resolved from server-stamped ids, never body
// text) and its additive default: a row with no roster/persona maps threaded renders NO chrome at all,
// same as pre-#21 — the existing chatStyle assertions above never pass those props, so they double as
// a regression check for that default.

import type { ParticipantView } from "@orb/contracts/chat";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { ThemeScope } from "@orb/ui/theme-scope";
import { SNAPPED_LENGTH_BASE_PX, TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import type { ReactElement } from "react";
import type { MessageMetadataVisibility } from "../../../../../packages/client/src/features/chat/components/message-metadata-row.tsx";
import {
  MESSAGE_ACTIONS_MENU_NAME,
  MESSAGE_EDIT_NAME,
  MESSAGE_FORK_NAME,
  MESSAGE_REASONING_NAME,
  VARIANT_NEXT_NAME,
  VARIANT_PREV_NAME,
} from "../../../../../packages/client/src/features/chat/lib/message-action-names.ts";
import { projectViewForMember } from "../../../../../packages/server/src/domain/chat/substrate/member-visibility.ts";
import { pixelContrast } from "../../../../support/browser/pixel-contrast.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { GroupTranscriptAttributionStory, MessageRowStory, NarratorTranscriptStory } from "../_ct-stories.tsx";
import { CHAT_AMBIENT_ROUTES, CHAT_ROOM_ROUTES, makeMessageView } from "../fixtures.ts";

test("member hidden-body projection keeps native start/end paragraph boundaries on visible prose", async ({ mount }) => {
  const hidden = '<lie truth="private"/>';
  const message = projectViewForMember(
    makeMessageView({
      content: `Before.${hidden}After.${hidden}Done.`,
      toolCalls: [
        {
          toolCallId: "native",
          callOrdinal: 3,
          name: "draw",
          arguments: "{}",
          result: "Moon",
          isError: false,
          durationMs: 1,
          textOffset: 7 + hidden.length,
          exchangeTextEnd: 13 + hidden.length * 2,
          deleted: true,
        },
      ],
    }),
    false,
  );
  const component = await mount(<MessageRowStory chatStyle="bubble" content={message.content} toolCalls={message.toolCalls} />);
  await expect(component.getByText("Before.", { exact: true })).toBeVisible();
  await expect(component.getByText("After.", { exact: true })).toBeVisible();
  await expect(component.getByText("Done.", { exact: true })).toBeVisible();
  await expect(component.getByText("private", { exact: true })).toHaveCount(0);
});

test("tool-boundary prose renders as distinct paragraphs and deleted cards stay absent", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      content="with suspicion.I turn the card over"
      toolCalls={[{ toolCallId: "call-1", name: "draw", arguments: "{}", result: "Moon", isError: false, durationMs: 1, textOffset: 15, deleted: true }]}
    />,
  );
  await expect(component.getByText("with suspicion.", { exact: true })).toBeVisible();
  await expect(component.getByText("I turn the card over", { exact: true })).toBeVisible();
  await expect(component.locator('[data-slot="tool-call-block"]')).toHaveCount(0);
});

test("a native exchange's trailing prose stays separate from the next completion", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      content="Before.After.Done."
      toolCalls={[
        {
          toolCallId: "native",
          name: "draw",
          arguments: "{}",
          result: "Moon",
          isError: false,
          durationMs: 1,
          textOffset: 7,
          exchangeTextEnd: 13,
          deleted: true,
        },
      ]}
    />,
  );
  await expect(component.getByText("Before.", { exact: true })).toBeVisible();
  await expect(component.getByText("After.", { exact: true })).toBeVisible();
  await expect(component.getByText("Done.", { exact: true })).toBeVisible();
});

test("per-card prompt controls belong to the room host, retain hidden cards, and confirm deletion", async ({ mount, page }) => {
  const toolCalls = [
    {
      toolCallId: "call-hidden",
      name: "draw",
      displayName: "Draw a card",
      arguments: "{}",
      result: "Moon",
      isError: false,
      durationMs: 1,
      callOrdinal: 7,
      hidden: true,
    },
  ];
  const recorder = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.editToolCall": () => ({ toolCalls }) });
  const host = await mount(<MessageRowStory chatStyle="bubble" content="The moon rises." toolCalls={toolCalls} viewerIsHost={true} />);
  const card = host.getByRole("group", { name: "Draw a card", exact: true });
  await expect(card.getByText("Hidden from AI", { exact: true })).toBeVisible();
  await card.hover();
  await expect(card.getByRole("button", { name: "Show to AI", exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Show to AI", exact: true }).click();
  await expect.poll(() => recorder.lastInput("chat.editToolCall")).toMatchObject({ toolCallId: "call-hidden", callOrdinal: 7, action: "show" });
  await card.getByRole("button", { name: "Delete tool call", exact: true }).click();
  const dialog = host.page().getByRole("alertdialog", { name: "Delete this tool call?" });
  await expect(dialog).toContainText("The prose stays.");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(host.getByText("The moon rises.", { exact: true })).toBeVisible();
  await host.unmount();
  const member = await mount(<MessageRowStory chatStyle="bubble" content="The moon rises." toolCalls={toolCalls} />);
  await expect(member.getByRole("button", { name: "Show to AI", exact: true })).toHaveCount(0);
  await expect(member.getByRole("button", { name: "Delete tool call", exact: true })).toHaveCount(0);
});

const AI_BUBBLE = /bg-ai-bubble/u;
const USER_BUBBLE = /bg-user-bubble/u;
const PROSE_BODY = /text-prose-body/u;
const FULL_WIDTH = /w-full/u;
const ALIGN_END = /items-end/u;
const FONT_MONO = /font-mono/u;

const BUBBLE = '[data-slot="message-bubble"]';
const ROW = '[data-slot="message-row"]';
const ATTRIBUTION = '[data-slot="message-attribution"]';
const THEME_SCOPE = '[data-slot="theme-scope"]';
const SPEAKER_ACCENT_RE = /text-speaker/u;

/** Two blank-line-separated paragraphs — the minimum body that makes `tide` actually TRAIN (its pills are
 *  per-paragraph), i.e. the shape that exercises the one skin with no single container. */
const TIDE_TWO_PARAGRAPHS = "One.\n\nTwo.";

const ALICE_ID = castId<CharacterId>("char_alice");
const BOB_ID = castId<CharacterId>("char_bob");
const ALEX_PERSONA_ID = castId<PersonaId>("persona_alex");

function alice(): ParticipantView {
  return {
    id: castId("participant_alice"),
    chatId: castId("chat_1"),
    kind: "character",
    userId: null,
    characterId: ALICE_ID,
    role: "member",
    activePersonaId: null,
    talkativeness: 1,
    disabled: false,
    joinedAt: 0,
    joinSeq: 0,
    leftSeq: null,
    joinHistoryVisibility: "full",
    displayName: "Alice",
    handle: null,
    avatarAssetId: null,
    avatarHash: null,
  };
}

function bob(): ParticipantView {
  return { ...alice(), id: castId("participant_bob"), characterId: BOB_ID, displayName: "Bob" };
}

// `alice()`/`bob()` hardcode `avatarHash: null` (see file header) — silently no-ops Echo/Whisper's
// bled/banner decoration path (both bail to `null`/the plain stripe when `avatarHash === null`,
// message-row-variants.ts `echoDecoration`/`whisperDecoration`). This variant carries a real CAS hash
// so those two modes' art actually resolves.
function aliceWithAvatar(): ParticipantView {
  return { ...alice(), avatarHash: "ct_cas_hash_alice" };
}

// ── §B.2 immersive-mode geometry helpers ────────────────────────────────────────────────────────
// Root font-size is 16px (the `avatar.ct.tsx`/`skeleton.ct.tsx` precedent) — the `immersive.*` tokens
// (`@orb/ui/tokens` TOKENS, generated from tokens.json) are authored in rem; converting to px lets a
// dimension token compare directly against a `boundingBox()`/computed-style px reading.
const ROOT_PX = 16;
function remTokenPx(value: string): number {
  return Math.round(Number.parseFloat(value) * ROOT_PX);
}

/** A custom property's COMPUTED value off a real mounted element (never a hardcoded literal) — the
 *  `theme-scope.ct.tsx` precedent, generalized to any `--` var. */
function cssVar(locator: Locator, name: string): Promise<string> {
  return locator.evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);
}

// `getComputedStyle` on an UNRESOLVED custom property (`--color-speaker`) returns the literal author
// string (`colorForCharacter`'s `oklch(72% 0.16 318)`, L as a percentage); the SAME color read off a
// real resolved CSS property (`border-left-color`, which consumes `var(--color-speaker)`) is
// re-serialized by the engine with L as a bare 0–1 fraction (`oklch(0.72 0.16 318)`) — verified live,
// not assumed. Parse both to numbers so the comparison is format-independent.
const OKLCH_RE = /oklch\(\s*(?<l>[\d.]+)(?<pct>%)?\s+(?<c>[\d.]+)\s+(?<h>[\d.]+)(?:\s*\/\s*(?<a>[\d.]+))?/u;
function parseOklch(value: string): readonly [number, number, number, number] {
  const match = OKLCH_RE.exec(value);
  if (match?.groups === undefined) {
    throw new Error(`not an oklch() color: ${value}`);
  }
  const rawL = Number.parseFloat(match.groups["l"] ?? "0");
  const l = match.groups["pct"] === "%" ? rawL / 100 : rawL;
  // Alpha is part of the identity: `--color-backdrop` and `--color-reading-plate` share L/C/H on the
  // base palette and differ ONLY in alpha (0.6 vs 0.65) — an alpha-blind compare could not catch the
  // plate regressing to the dimmer token (#204).
  return [l, Number.parseFloat(match.groups["c"] ?? "0"), Number.parseFloat(match.groups["h"] ?? "0"), Number.parseFloat(match.groups["a"] ?? "1")];
}

test("bubble style tints the assistant bubble with the ai-bubble token", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" />);
  await expect(component.locator(BUBBLE)).toHaveClass(AI_BUBBLE);
  await expect(component.locator(ROW)).toHaveAttribute("data-role", "assistant");
});

test("bubble style tints a user row with the user-bubble token + right-alignment", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="user" />);
  await expect(component.locator(BUBBLE)).toHaveClass(USER_BUBBLE);
  await expect(component.locator(ROW)).toHaveClass(ALIGN_END);
});

// ── D66 N3: content-sized bubbles (w-fit) + quiet metadata + name-row timestamp ────────────────────
const METADATA_ROW = '[data-slot="message-metadata-row"]';
const TIMESTAMP = '[data-slot="message-metadata-timestamp"]';
const TOKENS_SLOT = '[data-slot="message-metadata-tokens"]';

/** All metadata toggles off by default — flip only what a test needs (the story omits ⇒ hidden). */
function meta(overrides: Partial<MessageMetadataVisibility>): MessageMetadataVisibility {
  return {
    showTimestamps: false,
    showMessageId: false,
    showModelIcon: false,
    showTokenCount: false,
    showGenerationTimer: false,
    showGenerationCost: false,
    ...overrides,
  };
}

// #288 TRUTH-REPAIR OF THE COMPARAND, not of the law. D66 N3 says a bubble is CONTENT-SIZED (`w-fit`),
// never stretched to fill the room. This measured that against the CONTENT COLUMN — correct while the
// column's max-content was the name row and the bubble's was its text. Since #288 the header IS the
// bubble's first child, so the two share one max-content and "bubble < 0.6 × column" is no longer a claim
// about anything (measured: 166.59 vs 166.59). The comparand moves to the TRACK — the room's actual width
// budget, which is what "never stretched to fill" always meant — and the ST refs agree: a short reply's
// pill is as wide as its header and no wider. The bubble is still `w-fit`; nothing about the fill changed.
test("bubble: a two-word reply is content-sized — bubble width well under the room's track (w-fit, N3)", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory chatStyle="bubble" messageRole="assistant" content="Hi there" characterId={ALICE_ID} participants={[alice()]} />,
  );
  const readBubbleBoxAtAssertion = async (): Promise<typeof bubbleBox> => await component.locator(BUBBLE).boundingBox();
  const bubbleBox = await component.locator(BUBBLE).boundingBox();
  const trackBox = await component.locator(ROW).boundingBox();
  await expect.poll(async () => (await readBubbleBoxAtAssertion())?.width).toBeGreaterThan(0);
  expect(bubbleBox?.width ?? 0).toBeLessThan((trackBox?.width ?? 0) * 0.6);
  // …and the header it now contains is what sets that width — the bubble hugs the WIDER of its two
  // children, so a two-word reply is header-wide rather than stretched. (Without this the assertion
  // above would also pass on a bubble that had silently lost its header.)
  const headerBox = await component.locator(NAME_ROW).boundingBox();
  expect(headerBox?.width ?? 0).toBeGreaterThan(0);
  expect(bubbleBox?.width ?? 0).toBeGreaterThanOrEqual(headerBox?.width ?? 0);
});

test("showTimestamps: the timestamp is micro-mono text INSIDE the name row, not a pill (P5)", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      characterId={ALICE_ID}
      participants={[alice()]}
      metadataVisibility={meta({ showTimestamps: true })}
    />,
  );
  // Lives beside the speaker name in the name row (P5's "inline time"), not in the metadata footer.
  const ts = component.locator(NAME_ROW).locator(TIMESTAMP);
  await expect(ts).toHaveCount(1);
  await expect(ts).toHaveClass(FONT_MONO);
  // A quiet <span> Text (P5 voice), never a @orb/ui Badge — the slot is preserved (rule 0.7).
  await expect.poll(() => ts.evaluate((el) => el.tagName.toLowerCase())).toBe("span");
});

test("showTimestamps off: no timestamp element (respecting the toggle)", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} metadataVisibility={meta({})} />,
  );
  await expect(component.locator(TIMESTAMP)).toHaveCount(0);
});

// #1032 — the EDITED marker. `MessageView.editedAt` was stamped by the edit verb and read by no client
// file, so a rewritten reply was indistinguishable from the one the model produced. It rides the name row
// beside the timestamp (it is a fact about WHEN this text became what it is), never the prose block.
test("editedAt: the name row carries an `edited` marker beside the timestamp", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      characterId={ALICE_ID}
      participants={[alice()]}
      editedAt={1_700_000_000_000}
      metadataVisibility={meta({ showTimestamps: true })}
    />,
  );
  const edited = component.locator(NAME_ROW).locator('[data-slot="message-metadata-edited"]');
  await expect(edited).toHaveCount(1);
  await expect(edited).toHaveText("edited");
});

test("a never-edited row carries no marker (absence, not an empty span)", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      characterId={ALICE_ID}
      participants={[alice()]}
      metadataVisibility={meta({ showTimestamps: true })}
    />,
  );
  await expect(component.locator(NAME_ROW).locator(TIMESTAMP)).toHaveCount(1);
  await expect(component.locator('[data-slot="message-metadata-edited"]')).toHaveCount(0);
});

test("showTokenCount: the token count is inline micro-mono text (no Badge pill); the metadata row renders", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      characterId={ALICE_ID}
      participants={[alice()]}
      metadataVisibility={meta({ showTokenCount: true })}
    />,
  );
  await expect(component.locator(METADATA_ROW)).toHaveCount(1);
  const tok = component.locator(TOKENS_SLOT);
  await expect(tok).toContainText("128 tok");
  await expect(tok).toHaveClass(FONT_MONO);
});

test("every metadata toggle off: the metadata row renders nothing at all (no empty shell)", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} metadataVisibility={meta({})} />,
  );
  await expect(component.locator(METADATA_ROW)).toHaveCount(0);
});

test("document style drops the bubble for prose-body", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="document" messageRole="assistant" />);
  const bubble = component.locator(BUBBLE);
  await expect(bubble).toHaveClass(PROSE_BODY);
  await expect(bubble).not.toHaveClass(AI_BUBBLE);
});

test("flat style renders a full-width row, no bubble tint", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="flat" messageRole="assistant" />);
  const bubble = component.locator(BUBBLE);
  await expect(bubble).toHaveClass(FULL_WIDTH);
  await expect(bubble).not.toHaveClass(AI_BUBBLE);
});

test("renders the markdown body", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="bubble" content="**strong words**" />);
  await expect(component.getByText("strong words")).toBeVisible();
});

// ── #21 attribution chrome ─────────────────────────────────────────────────────────────────────

test("no roster/persona maps threaded: no attribution chrome at all (pre-#21 default)", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={ALICE_ID} />);
  await expect(component.locator(ATTRIBUTION)).toHaveCount(0);
  await expect(component.locator(THEME_SCOPE)).toHaveCount(0);
});

test("assistant row resolves name from the roster + colors the bubble via ThemeScope", async ({ mount }) => {
  // Arrays, not a `Map`: a `Map`/`Set` prop does not survive the Playwright CT serialization
  // boundary (arrives empty, no error) — `MessageRowStory` builds the `Map` post-mount instead.
  const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} />);
  await expect(component.locator(ATTRIBUTION)).toContainText("Alice");
  // TWO ThemeScopes now (UIP-304): one (display:contents) tints the speaker NAME with `--color-speaker`
  // (the accent), one wraps the bubble CONTENT — both from the same per-character `attribution.tokens`.
  await expect(component.locator(THEME_SCOPE)).toHaveCount(2);
  // The speaker name carries the accent color hook.
  await expect(component.locator(ATTRIBUTION).getByText("Alice")).toHaveClass(SPEAKER_ACCENT_RE);
});

// #2420 — THE SETTLED ROW'S ATTRIBUTION SITS ON A BASELINE, like the streaming ghost's copy of the same
// cluster and like the appearance contract that judges this row (`appearance-invariant-manifest.ts`
// #dark-name-time-short-bubble declares the tailwind-core merge `items-center` -> `items-baseline` on
// `[data-slot="message-attribution"]`, owner `message-row-header.tsx`). The settled arm rendered
// `align="center"`, so `pnpm snap --matrix` v01 reported `appearance-fails=1` with "configured merge winner
// missing". Computed, not class-checked: the class is how it is spelled, the resolved value is the law.
test("the settled attribution cluster resolves align-items: baseline (the ghost and the appearance row both require it)", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} />);
  const attribution = component.locator(ATTRIBUTION);
  await expect(attribution).toContainText("Alice");
  await expect(attribution).toHaveCSS("align-items", "baseline");
});

test("a null characterId in a multi-character room shows a neutral Narrator, uncolored", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={null} participants={[alice(), bob()]} />);
  await expect(component.locator(ATTRIBUTION)).toContainText("Narrator");
  await expect(component.locator(THEME_SCOPE)).toHaveCount(0);
});

test("user row resolves the message's personaId against the macro-name producer", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory chatStyle="bubble" messageRole="user" personaId={ALEX_PERSONA_ID} personas={[{ id: ALEX_PERSONA_ID, name: "Alex" }]} />,
  );
  await expect(component.locator(ATTRIBUTION)).toContainText("Alex");
  // User-row attribution carries no color wrap — the per-role user-bubble token owns that already.
  await expect(component.locator(THEME_SCOPE)).toHaveCount(0);
});

// ── #31 appearance: showInChatAvatars gates ONLY the avatar image (the name survives) ─────────────

const AVATAR = '[data-slot="avatar-root"]';

test("showInChatAvatars=false hides the avatar image but KEEPS the speaker name", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} showInChatAvatars={false} />,
  );
  // The attribution row + name stay; only the avatar image is dropped (ST "show avatars" parity).
  await expect(component.locator(ATTRIBUTION)).toContainText("Alice");
  await expect(component.locator(AVATAR)).toHaveCount(0);
});

// The GROUP arm of the same promise. The switch's own gloss reads "Hide to show only the speaker's name
// on each message", so with avatars off a multi-speaker room must still name EVERY turn — the single-row
// pin above cannot see two consecutive turns running together unattributed, which is what a reader in a
// group room would actually be hurt by. Runs across the non-immersive modes that name a speaker (the
// document page names nobody, as stock does; its own pin is below) because the skin table is where a
// per-mode chrome suppression would land.
//
// HONEST LABEL: this is a FENCE, not a defect proof. It passes against the pre-fix source too — the
// behaviour was already correct, and side-eye 2026-08-16's "the fallback never renders" was read off a
// transcript scrolled past the name rows (live receipt in the lane report). It exists so the next
// avatars-off change cannot quietly take attribution with it.
for (const chatStyle of ["bubble", "flat"] as const) {
  test(`group transcript, avatars off, ${chatStyle}: every row still names its own speaker`, async ({ mount }) => {
    const component = await mount(
      <GroupTranscriptAttributionStory
        chatStyle={chatStyle}
        participants={[alice(), bob()]}
        persona={{ id: ALEX_PERSONA_ID, name: "Alex" }}
        showInChatAvatars={false}
      />,
    );
    await expect(component.locator(AVATAR)).toHaveCount(0);
    const names = component.locator(ATTRIBUTION);
    await expect(names).toHaveCount(3);
    await expect(names.nth(0)).toHaveText("Alice");
    await expect(names.nth(1)).toHaveText("Alex");
    await expect(names.nth(2)).toHaveText("Bob");
    // Rendered, not merely present: a name row collapsed to 0px is the same defect as a missing one.
    const box = await names.nth(2).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(0);
    expect(box?.width ?? 0).toBeGreaterThan(0);
  });
}

test("showInChatAvatars=true (default) renders the attribution avatar", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} showInChatAvatars={true} />,
  );
  await expect(component.locator(ATTRIBUTION)).toContainText("Alice");
  await expect(component.locator(AVATAR)).toHaveCount(1);
});

// ── P2 transcript integrity (side-eye 2026-07-25): a REMOVED character keeps its historical portrait ──
// A character removed from the room leaves NO `ParticipantView`, but its messages stay in the transcript
// ("Their messages stay in the transcript" — member-row.tsx removal promise). The historical avatar must
// resolve from the participant-independent character-avatar producer, never degrade to bare initials.
// The distinguishing DOM fact: `@orb/ui/avatar` renders the `avatar-image` element ONLY when a `src`
// (i.e. an avatarHash) resolves (avatar.tsx: `src === undefined ? null : <Image>`). No image element =
// initials-only = the bug. (The <img> never actually loads in CT — asserting the element + its src is
// the load-independent proof the PORTRAIT path was chosen, not the fallback.)
const AVATAR_IMAGE = '[data-slot="avatar-image"]';
const BLOB_HASH_ALICE_RE = /\/api\/blob\/hash_alice$/u;
// `@orb/ui`'s Avatar (Base UI) only mounts the `avatar-image` element once the image STATUS is "loaded"
// (AvatarImage returns null otherwise); a 404 in the CT harness would never load, so the blob route is
// fulfilled with a real 1×1 PNG. That makes the assertion load-independent proof the PORTRAIT path was
// chosen off the character-avatar producer (a removed character with no participant row) — not the
// initials fallback the bug produced.
const ONE_BY_ONE_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

test("a removed character (no participant row) keeps its portrait from the character-avatar producer, not bare initials", async ({ mount, page }) => {
  // Serve any blob request a real PNG so Base UI's Avatar actually reaches the "loaded" status.
  await page.route("**/api/blob/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: ONE_BY_ONE_PNG }));
  // No `participants` for Alice — she was removed; only the chat's character data (name + avatar) survives.
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      characterId={ALICE_ID}
      characters={[{ id: ALICE_ID, name: "Alice", avatarHash: "hash_alice" }]}
    />,
  );
  // The name still resolves off the character-name producer (the transcript stays legible).
  await expect(component.locator(ATTRIBUTION)).toContainText("Alice");
  // The PORTRAIT survives: the image element renders (loaded) with the producer's hash — the fix's point.
  const image = component.locator(AVATAR_IMAGE);
  await expect(image).toHaveCount(1);
  await expect(image).toHaveAttribute("src", BLOB_HASH_ALICE_RE);
});

test("a removed character with NO stored avatar shows initials (no phantom image element) — the fix doesn't fabricate a portrait", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={ALICE_ID} characters={[{ id: ALICE_ID, name: "Alice", avatarHash: null }]} />,
  );
  await expect(component.locator(ATTRIBUTION)).toContainText("Alice");
  // A genuinely image-less character correctly renders no <img>; the fallback tile carries the initial.
  await expect(component.locator(AVATAR_IMAGE)).toHaveCount(0);
  await expect(component.locator(`${AVATAR} ${FALLBACK}`)).toContainText("A");
});

// ── §B.1 message-row redesign: avatar-LEFT, a sibling of the content column ────────────────────────

const ROW_BODY = '[data-slot="message-row-body"]';
const CONTENT_COLUMN = '[data-slot="message-content-column"]';
const NAME_ROW = '[data-slot="message-name-row"]';

/** The name row's OUTER extent — border box PLUS its own block margins — and BOTH arms of a layout-
 *  neutrality comparison must be read this way (#1873). The height-only read the sticky comparisons used
 *  on their non-sticky arm was blind to the box that actually moved: an inside header once reserved the
 *  action rail's paint with a bottom margin that the sticky arm dropped, taking it out of the row at the
 *  exact moment the verdict landed — and since `exceedsViewport`
 *  (the verdict's own input) IS the measured row height, that inverted the verdict and oscillated the
 *  transcript. The margins are the whole question, so neither arm may omit them. */
async function nameRowOuterExtent(nameRow: Locator): Promise<number> {
  return await nameRow.evaluate((el: HTMLElement) => {
    const cs = getComputedStyle(el);
    return el.getBoundingClientRect().height + Number.parseFloat(cs.marginTop) + Number.parseFloat(cs.marginBottom);
  });
}

// A body several viewports tall (prose + a code block + a table + a blockquote, the shapes a real reply
// carries), for the mounts that drive a real scroll under a sticky header.
const STUCK_BAND_BODY = ((): string => {
  const prose = Array.from({ length: 20 }, (_, i) => `Line ${i} of a long reply that scrolls under the pinned band.`).join("\n\n");
  return `${prose}\n\n\`\`\`js\nconst x = 1;\n\`\`\`\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n> a quotation\n\n${prose}`;
})();

const STUCK_BAND_SCROLLPORT_PX = 240;
const PINNED_SCROLL_TOP_PX = 400;

/** Scrolls a sticky row's own scrollport into the turn and waits until its header reports pinned. The
 *  band paints only while pinned, so every assertion about the band's paint starts here. */
async function pinHeader(port: Locator): Promise<Locator> {
  await expect.poll(() => port.evaluate((el: HTMLElement) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(PINNED_SCROLL_TOP_PX);
  await port.evaluate((el: HTMLElement, y: number) => {
    el.scrollTop = y;
  }, PINNED_SCROLL_TOP_PX);
  const nameRow = port.locator(NAME_ROW);
  await expect(nameRow).toHaveAttribute("data-pinned", "");
  return nameRow;
}

/** A sticky-verdict row in its own bounded scrollport, tall enough for {@link pinHeader} to pin. */
function pinnableRow(chatStyle: (typeof THEME_CHAT_STYLES)[number], participant: ParticipantView): ReactElement {
  return (
    <MessageRowStory
      chatStyle={chatStyle}
      messageRole="assistant"
      characterId={ALICE_ID}
      participants={[participant]}
      stickyAttribution={true}
      content={STUCK_BAND_BODY}
      width={360}
      scrollportHeight={STUCK_BAND_SCROLLPORT_PX}
    />
  );
}

test("the avatar is a SIBLING of the content column, never nested inside the name row (§B.1)", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} />);
  const body = component.locator(ROW_BODY);
  // The avatar is a direct child of the row-body, a sibling of the content column — not a descendant
  // of the name row (which holds only the name-group + actions).
  await expect(body.locator(`> ${AVATAR}`)).toHaveCount(1);
  await expect(component.locator(NAME_ROW).locator(AVATAR)).toHaveCount(0);
  // Name + actions share ONE row atop the content column.
  await expect(component.locator(`${NAME_ROW}:has-text("Alice")`)).toHaveCount(1);
});

test("an assistant avatar sits BEFORE the content column (§B.1)", async ({ mount }) => {
  const assistant = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} />);
  const assistantChildren = assistant.locator(`${ROW_BODY} > *`);
  await expect(assistantChildren.first()).toHaveAttribute("data-slot", "avatar-root");
  await expect(assistantChildren.last()).toHaveAttribute("data-slot", "message-content-column");
});

// Separate mount: Playwright-CT allows one mount per test (a second mount into the same root throws
// "container already has a React root"). The mirror is its own test rather than a second mount above.
test("a user row mirrors it — avatar AFTER the content column (§B.1 own-message mirroring)", async ({ mount }) => {
  const user = await mount(
    <MessageRowStory chatStyle="bubble" messageRole="user" personaId={ALEX_PERSONA_ID} personas={[{ id: ALEX_PERSONA_ID, name: "Alex" }]} />,
  );
  const userChildren = user.locator(`${ROW_BODY} > *`);
  await expect(userChildren.first()).toHaveAttribute("data-slot", "message-content-column");
  await expect(userChildren.last()).toHaveAttribute("data-slot", "avatar-root");
});

// WHICH STYLES MIRROR THE PERSONA (owner ruling, after Moonlit Echoes): bubble, echo and tide put a user row's
// identity on the trailing edge; flat, document, whisper, hush and ripple keep it leading like every other row.
// The identity is the gutter chip, or ripple's welded portrait.
const MIRRORED_USER_STYLES: ReadonlySet<string> = new Set(["bubble", "echo", "tide"]);
for (const chatStyle of THEME_CHAT_STYLES) {
  test(`${chatStyle}: a user row's identity sits ${MIRRORED_USER_STYLES.has(chatStyle) ? "trailing" : "leading"}`, async ({ mount }) => {
    test.skip(chatStyle === "document", "the document page names nobody, as stock does; its own pins are the document block");
    const component = await mount(
      <MessageRowStory chatStyle={chatStyle} messageRole="user" personaId={ALEX_PERSONA_ID} personas={[{ id: ALEX_PERSONA_ID, name: "Alex" }]} width={720} />,
    );
    const avatar = component.locator(AVATAR).first();
    await expect(avatar).toBeVisible();
    const side = async (): Promise<"leading" | "trailing"> => {
      const avatarBox = await avatar.boundingBox();
      const proseBox = await component.locator(`${BUBBLE} p`).first().boundingBox();
      return (avatarBox?.x ?? 0) < (proseBox?.x ?? 0) ? "leading" : "trailing";
    };
    await expect.poll(side).toBe(MIRRORED_USER_STYLES.has(chatStyle) ? "trailing" : "leading");
  });
}

// PHONE CAPS (owner ruling, after Moonlit Echoes): below the row's `md` step a bubble takes at most 80% of its
// column and a tide pill 90%; ripple's portrait narrows to its phone token.
const PHONE_CAP_BODY = "A long enough reply that it would run the full width of a phone column if nothing capped it at all.";
for (const { chatStyle, share } of [
  { chatStyle: "bubble", share: 0.8 },
  { chatStyle: "tide", share: 0.9 },
] as const) {
  test(`${chatStyle}: at a phone width the message box is capped at ${String(share * 100)}% of its column`, async ({ mount }) => {
    const component = await mount(
      <MessageRowStory chatStyle={chatStyle} messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} width={360} content={PHONE_CAP_BODY} />,
    );
    const ratio = async (): Promise<number> => {
      const bubble = await component.locator(BUBBLE).first().boundingBox();
      const column = await component.locator(CONTENT_COLUMN).boundingBox();
      return (bubble?.width ?? 0) / (column?.width ?? 1);
    };
    await expect.poll(ratio).toBeLessThanOrEqual(share + 0.005);
    await expect.poll(ratio).toBeGreaterThan(share - 0.05);
  });
}

// …and in a MIRRORED user row the capped box sits flush against its own trailing chip, the cap's gap on the
// far side. A start-aligned box left the gap between the message and its own identity (verifier: a 99-char
// bubble at 0..264 with its chip at 336..360).
for (const chatStyle of ["bubble", "echo", "tide"] as const) {
  for (const [length, content] of [
    ["short", "Hi there."],
    ["long", PHONE_CAP_BODY],
  ] as const) {
    test(`${chatStyle}: at a phone width a ${length} user message sits flush against its trailing chip`, async ({ mount }) => {
      const component = await mount(
        <MessageRowStory
          chatStyle={chatStyle}
          messageRole="user"
          personaId={ALEX_PERSONA_ID}
          personas={[{ id: ALEX_PERSONA_ID, name: "Alex" }]}
          width={360}
          content={content}
        />,
      );
      const gapToChip = async (): Promise<number> => {
        const bubble = await component.locator(BUBBLE).last().boundingBox();
        const chip = await component.locator(`${ROW_BODY} > ${AVATAR}`).boundingBox();
        return (chip?.x ?? 0) - ((bubble?.x ?? 0) + (bubble?.width ?? 0));
      };
      // The row body's own gap at a phone width is `spacing.field`; nothing else may sit between the two.
      await expect.poll(gapToChip).toBeGreaterThanOrEqual(-0.5);
      await expect.poll(gapToChip).toBeLessThanOrEqual(SNAPPED_LENGTH_BASE_PX["spacing.field"] + 0.5);
    });
  }
}

test("ripple: at a phone width the welded portrait narrows to its phone width", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory chatStyle="ripple" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} width={360} content={PHONE_CAP_BODY} />,
  );
  const portrait = component.locator(`${BUBBLE} ${AVATAR}`).first();
  // The token resolved in place, so the pin follows the token rather than a copied number.
  const phoneWidth = await portrait.evaluate((el) => {
    const probe = document.createElement("span");
    probe.style.display = "block";
    probe.style.width = "var(--immersive-ripple-portrait-width-phone)";
    el.parentElement?.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  });
  // A zero token would make "close to it" vacuous, so the read only counts once the token resolved.
  await expect.poll(async () => phoneWidth > 0 && Math.abs(((await portrait.boundingBox())?.width ?? 0) - phoneWidth) < 0.5).toBe(true);
});

test("avatars-off drops the avatar element entirely; the content column is unaffected (§B.1)", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} showInChatAvatars={false} />,
  );
  await expect(component.locator(AVATAR)).toHaveCount(0);
  // The name + actions structure is untouched — only the row's leading slot is gone.
  await expect(component.locator(CONTENT_COLUMN)).toHaveCount(1);
  await expect(component.locator(ATTRIBUTION)).toContainText("Alice");
});

test("avatarShape=rounded / avatarAspect=portrait / avatarRing=accent thread through to the avatar (§B.3)", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      characterId={ALICE_ID}
      participants={[alice()]}
      avatarShape="rounded"
      avatarAspect="portrait"
      avatarRing="accent"
    />,
  );
  const root = component.locator(AVATAR);
  await expect(root).toHaveCSS("border-radius", "8px"); // rounded = --radius-base, the PORTRAIT step (density S2 / D6)
  await expect(root).toHaveCSS("aspect-ratio", "2 / 3");
  await expect.poll(async () => root.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
  // RENDERED geometry, not just class presence — a collapse-to-0 regression (avatar/variants.ts'
  // header documents this avatar bit ONCE already: a bare icon-left avatar's `h-full` resolved against
  // an undefined parent height and collapsed to ~0px) would pass every assertion above silently.
  const readBoxAtAssertion = async (): Promise<typeof box> => await root.boundingBox();
  const box = await root.boundingBox();
  await expect.poll(async () => (await readBoxAtAssertion())?.width).toBeGreaterThan(0);
  await expect.poll(async () => (await readBoxAtAssertion())?.height).toBeGreaterThan(0);
});

// ── Macro DISPLAY pass (the `{{char}}`/`{{user}}` bug) ─────────────────────────────────────────────

test("a message with {{char}}/{{user}} resolves real names once the roster + anchor persona are threaded", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      content="{{char}} waves at {{user}}."
      characterId={ALICE_ID}
      participants={[alice()]}
      personas={[{ id: ALEX_PERSONA_ID, name: "Alex" }]}
      anchorPersonaId={ALEX_PERSONA_ID}
    />,
  );
  await expect(component.getByText("Alice waves at Alex.")).toBeVisible();
  await expect(component.getByText("{{char}}", { exact: false })).toHaveCount(0);
  await expect(component.getByText("{{user}}", { exact: false })).toHaveCount(0);
});

// The row's OWN stamps are what the atom resolves against — not "whoever is speaking right now" — so a
// row stamped for a DIFFERENT cast member than the turn's current speaker still resolves to ITS OWN
// speaker (Chat-Macro-Resolution.md §2's "a past line by Aria stays Aria" rule).
test("a row's own characterId wins over another roster member also present", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory chatStyle="bubble" messageRole="assistant" content="{{char}} nods." characterId={BOB_ID} participants={[alice(), bob()]} />,
  );
  await expect(component.getByText("Bob nods.")).toBeVisible();
});

// The `{{user}}` floor is the ONE unresolved-persona name (`DEFAULT_PERSONA_NAME`, @orb/kit/persona) — the
// same word this row's own attribution renders and the server stamps on the wire. `{{char}}` keeps its own
// "Character" literal: a nameless CHARACTER is a different question from a nameless human.
test("no roster/persona threaded: {{char}}/{{user}} resolve to the kit floors, never left literal", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" content="{{char}} waves at {{user}}." characterId={ALICE_ID} />);
  await expect(component.getByText(`Character waves at ${DEFAULT_PERSONA_NAME}.`)).toBeVisible();
  await expect(component.getByText("{{char}}", { exact: false })).toHaveCount(0);
  await expect(component.getByText("{{user}}", { exact: false })).toHaveCount(0);
});

// ── §B.2 the 5 immersive chatStyle modes — RENDERED geometry, not the pure-object unit test
// (message-row-variants.test.ts) that only ever exercises the skin table as plain function calls.
// These mount the real DOM and assert against the RESOLVED `--immersive-*`/`--color-speaker` custom
// properties (never a hardcoded px/hex literal — the golden rule), same as `theme-scope.ct.tsx`.

test("whisper: the header band renders a 3:1 aspect box (matches the server's banner crop); its art is the banner variant", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="whisper" messageRole="assistant" characterId={ALICE_ID} participants={[aliceWithAvatar()]} />);
  const band = component.locator('[data-slot="message-band"]');
  await expect(band).toBeVisible();
  // The band is an `--aspect-banner` (3:1) box — height DERIVES from the bubble width so the displayed
  // box always matches the server's 3:1 crop at ANY width (never a fixed height that drifts the aspect).
  // Assert the RENDERED ratio (done ≠ rendered), which is width-independent by construction.
  await expect.poll(async () => band.boundingBox()).not.toBeNull();
  const box = await band.boundingBox();
  expect(Math.abs((box?.width ?? 0) / (box?.height ?? 1) - 3)).toBeLessThan(0.1);
  await expect.poll(async () => band.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("?v=banner&w=");
});

// ⚑ THIS PAIR REPLACES TWO PINS THAT HELD THE #212 DEFECTS IN PLACE, and the reversal is stated rather
// than hidden. The first asserted "padding-right resolves to `--immersive-echo-feather`, a PERCENTAGE of
// the content column" — that percentage (55%) is exactly what left 239px of a 558px box for prose, i.e.
// 28 characters per line against the house 65-75ch law. The second asserted "a persona-kind row never
// bleeds portrait art (hide-user-portrait)"; measured against the owner's reference renders, that rule is
// why echo was "half-built" — the references decorate BOTH roles, mirrored to each row's outer edge
// (#212-3/-5). The MECHANISM both pins really guarded is intact and still pinned below: the decoration is
// kind-gated, and the reading geometry of the with-art and no-art arms is identical.
test("echo: the art pane is a FIXED column outside the prose measure, sized to the art-width token", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  const component = await mount(<MessageRowStory chatStyle="echo" messageRole="assistant" characterId={ALICE_ID} participants={[aliceWithAvatar()]} />);
  const bubble = component.locator(BUBBLE);
  const artWidthPx = remTokenPx(TOKENS["immersive.echo-art-width"].value);
  await expect.poll(async () => bubble.evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingRight))).toBe(artWidthPx);
  // The art layer is sized to that pane and anchored to its TOP outer corner — never `cover` over the
  // whole bubble, which upscaled a 400x600 portrait 4.94x and cropped past the subject on a long turn.
  const [bgSize, bgPos] = await bubble.evaluate((el) => {
    const cs = getComputedStyle(el);
    return [cs.backgroundSize, cs.backgroundPosition];
  });
  // Chrome serialises a `<width> auto` layer as the bare width, so the assertion is the layer pair:
  // the fade covers the box, the ART layer is the pane's width (never `cover`, the 4.94x upscale).
  expect(bgSize).toBe(`100% 100%, ${artWidthPx}px`);
  // …anchored to the pane's top OUTER corner (Chrome serialises `right top` as `100% 0%`).
  expect(bgPos).toBe("0px 0px, 100% 0%");
});

test("echo: a persona-kind (user) row is decorated too, mirrored to its own outer edge", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  const component = await mount(
    <MessageRowStory chatStyle="echo" messageRole="user" personaId={ALEX_PERSONA_ID} personas={[{ id: ALEX_PERSONA_ID, name: "Alex" }]} />,
  );
  const bubble = component.locator(BUBBLE);
  const artWidthPx = remTokenPx(TOKENS["immersive.echo-art-width"].value);
  const [paddingLeft, paddingRight] = await bubble.evaluate((el) => {
    const cs = getComputedStyle(el);
    return [Number.parseFloat(cs.paddingLeft), Number.parseFloat(cs.paddingRight)];
  });
  // The user's pane sits on the LEFT (the row's outer side for a right-aligned row) — the mirror of the
  // character arm above, at the same width.
  expect(paddingLeft).toBe(artWidthPx);
  expect(paddingRight).toBeLessThan(artWidthPx);
});

test("echo: an UNATTRIBUTED row still gets no art (the kind gate survives the both-roles change)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  const component = await mount(<MessageRowStory chatStyle="echo" messageRole="system" content="System notice." />);
  const bubble = component.locator(BUBBLE);
  await expect.poll(async () => bubble.evaluate((el) => (el as HTMLElement).style.paddingLeft)).toBe("");
  await expect.poll(async () => bubble.evaluate((el) => (el as HTMLElement).style.paddingRight)).toBe("");
});

test("ripple: the welded avatar's boundingBox width resolves to --immersive-ripple-portrait-width; position is sticky", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="ripple" messageRole="assistant" characterId={ALICE_ID} participants={[aliceWithAvatar()]} />);
  const avatar = component.locator(AVATAR);
  await expect.poll(async () => Math.round((await avatar.boundingBox())?.width ?? 0)).toBe(remTokenPx(TOKENS["immersive.ripple-portrait-width"].value));
  await expect(avatar).toHaveCSS("position", "sticky");
});

test("hush: the left stripe resolves to --immersive-stripe-width and the character's --color-speaker", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="hush" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} />);
  const bubble = component.locator(BUBBLE);
  await expect
    .poll(async () => bubble.evaluate((el) => Number.parseFloat(getComputedStyle(el).borderLeftWidth)))
    .toBe(remTokenPx(TOKENS["immersive.stripe-width"].value));
  const readBorderColorAtAssertion = async (): Promise<typeof borderColor> => await bubble.evaluate((el) => getComputedStyle(el).borderLeftColor);
  const borderColor = await bubble.evaluate((el) => getComputedStyle(el).borderLeftColor);
  const speakerColor = await cssVar(bubble, "--color-speaker");
  await expect.poll(async () => parseOklch(await readBorderColorAtAssertion())).toEqual(parseOklch(speakerColor));
});

test("tide: a blank-line-separated body renders N stacked, non-overlapping bubbles (a train, not one bubble)", async ({ mount }) => {
  const content = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.";
  const component = await mount(<MessageRowStory chatStyle="tide" messageRole="assistant" content={content} />);
  const bubbles = component.locator('[data-slot="message-bubble-train"] [data-slot="message-bubble"]');
  await expect(bubbles).toHaveCount(3);
  const ys = await bubbles.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().y));
  for (let i = 1; i < ys.length; i++) {
    expect(ys[i]).toBeGreaterThan(ys[i - 1] as number);
  }
});

// TIDE'S OWN SUBJECT (#212-1). The skin used to give up past 12 paragraphs and render one bubble — i.e.
// look exactly like `bubble` — on 69% of the drive chat's real assistant turns (census: 71/11/15/16/6/16/
// 24/10/44/19/17/4). A rendered pill count is the honest pin: the splitter's unit test can only prove the
// array, this proves the reader sees a train.
test("tide: a LONG-form turn (past the retired 12-paragraph cap) still trains every paragraph", async ({ mount }) => {
  const paragraphs = Array.from({ length: 24 }, (_, i) => `Paragraph ${i} of a long RP turn.`);
  const component = await mount(<MessageRowStory chatStyle="tide" messageRole="assistant" content={paragraphs.join("\n\n")} />);
  const bubbles = component.locator('[data-slot="message-bubble-train"] [data-slot="message-bubble"]');
  await expect(bubbles).toHaveCount(24);
});

// The orphan pill (#212-5): every ST-imported assistant message opens with `---`, which rendered as an
// `<hr>` inside its own 24x17px EMPTY pill above the train. A pill boundary already says what a rule says.
const RULE_LED_BODY = "---\n\nFirst.\n\nSecond.";

test("tide: a leading thematic break makes no empty orphan pill", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="tide" messageRole="assistant" content={RULE_LED_BODY} />);
  const bubbles = component.locator('[data-slot="message-bubble-train"] [data-slot="message-bubble"]');
  await expect(bubbles).toHaveCount(2);
  await expect(bubbles.first()).toContainText("First.");
  // No `<hr>` survives as a pill of its own, and no pill is empty.
  await expect(component.locator('[data-slot="message-bubble-train"] hr')).toHaveCount(0);
  const texts = await bubbles.evaluateAll((els) => els.map((el) => (el.textContent ?? "").trim()));
  expect(texts.every((t) => t.length > 0)).toBe(true);
});

// NARRATION IS NOT DIALOGUE (#212-4, side-eye C2). `colorForCharacter` returned ONE hash colour for
// speaker + dialogue + narration and the row's ThemeScope wrote all three, so an `<em>` narration run
// painted in the speaker's dialogue red — contradicting `markdown.tsx`'s own stated law ("the base
// className tints every rendered <em> with --color-narration") and collapsing the speech/emphasis
// distinction every reference render keeps.
test("narration ink is DISTINCT from the speaker's dialogue ink (the em run keeps the theme's narration colour)", async ({ mount }) => {
  const body = 'She looks up. *The lamp gutters.* "You came back," she says.';
  const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" content={body} characterId={ALICE_ID} participants={[alice()]} />);
  const bubble = component.locator(BUBBLE);
  const em = bubble.locator("em");
  await expect(em).toHaveText("The lamp gutters.");
  const dialogue = bubble.locator(DIALOGUE_SPAN);
  await expect(dialogue).toHaveCount(1);

  const dialogueColor = await dialogue.evaluate((el) => getComputedStyle(el).color);
  const speakerVar = await cssVar(bubble, "--color-speaker");
  const narrationVar = await cssVar(bubble, "--color-narration");
  // The two inks differ…
  await expect.poll(async () => em.evaluate((el) => getComputedStyle(el).color)).not.toBe(dialogueColor);
  // …because the row scope no longer overwrites the palette's narration token with the speaker hash.
  expect(parseOklch(narrationVar)).not.toEqual(parseOklch(speakerVar));
  await expect.poll(async () => parseOklch(await em.evaluate((el) => getComputedStyle(el).color))).toEqual(parseOklch(narrationVar));
});

// THE AVATARS-OFF RULING (owner, 2026-08-18 — #212-6): `showInChatAvatars` governs ALL identity art, not
// just the chip. It used to mean three different things: six skins dropped the chip, ripple lost its whole
// treatment, and echo/whisper ignored it entirely — so a reader who turned avatars off still got two of
// eight modes dominated by character art. Chrome that is not art of anybody (the speaker stripe) survives.
test("avatars OFF removes the IMMERSIVE art too — echo's pane, whisper's band, ripple's portrait", async ({ mount }) => {
  const echo = await mount(
    <MessageRowStory chatStyle="echo" messageRole="assistant" characterId={ALICE_ID} participants={[aliceWithAvatar()]} showInChatAvatars={false} />,
  );
  const echoBubble = echo.locator(BUBBLE);
  await expect.poll(() => echoBubble.evaluate((el) => (el as HTMLElement).style.paddingRight)).toBe("");
  await expect.poll(() => echoBubble.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe("none");
  await expect(echo.locator(EDGE_TILE)).toHaveCount(0);
  await echo.unmount();

  const whisper = await mount(
    <MessageRowStory chatStyle="whisper" messageRole="assistant" characterId={ALICE_ID} participants={[aliceWithAvatar()]} showInChatAvatars={false} />,
  );
  await expect(whisper.locator(BAND)).toHaveCount(0);
  // …but the speaker STRIPE is chrome, not identity art, and stays.
  await expect
    .poll(async () => whisper.locator(BUBBLE).evaluate((el) => Number.parseFloat(getComputedStyle(el).borderTopWidth)))
    .toBe(remTokenPx(TOKENS["immersive.stripe-width"].value));
  await whisper.unmount();

  const ripple = await mount(
    <MessageRowStory chatStyle="ripple" messageRole="assistant" characterId={ALICE_ID} participants={[aliceWithAvatar()]} showInChatAvatars={false} />,
  );
  await expect(ripple.locator(AVATAR)).toHaveCount(0);
  // The card degrades cleanly — no reserved-but-empty portrait column left behind.
  await expect(ripple.locator(BUBBLE)).toHaveCount(1);
});

// ── The no-avatar FALLBACK as a first-class avatar (owner ruling 2026-07-09) ──────────────────────
// `alice()` already carries `avatarHash: null` — it IS the no-image character. These pin: (a) the art
// modes paint the deterministic-hue + initial TILE at the with-image geometry (never a broken/empty
// slot or reserved-but-empty padding), (b) one entity = ONE hue everywhere (the chip AND the immersive
// tile, seeded off the id — never the pre-fix constant `alt=""` bucket), (c) gutter-avatar placement
// (avatar top ≈ name-row top) holds for BOTH real and fallback, and the with-image cases are UNCHANGED
// (the regression pins above never pass a null hash → they double as the with-art geometry lock).

const EDGE_TILE = '[data-slot="message-edge-tile"]';
const BAND = '[data-slot="message-band"]';
const FALLBACK = '[data-slot="avatar-fallback"]';
const LONG_BODY = "Line one is fairly long.\n\nLine two.\n\nLine three.\n\nLine four.\n\nLine five.";

// The hue is asserted via the RESOLVED `--color-chart-N` var read off the mounted element (never a
// hardcoded oklch literal — the §13.7 spirit), parsed to numbers so the author-string vs engine-
// serialized oklch formats compare equal. The bucket the SEED derives is verified out-of-band against
// `@orb/ui/avatar`'s `avatarFallbackHue` (djb2 → mod 5): `char_alice`→5, `char_bob`→4, `""`→2 (the
// pre-fix constant `alt=""` bucket every imageless speaker used to share). The @orb/ui/avatar import is
// deliberately NOT pulled into this .ct.tsx — its transitive `@base-ui/react/avatar` edge fails the CT
// rollup entry from the tests/ root; the golden bucket numbers stand in, cross-checked by the runtime.
const ALICE_HUE_BUCKET = 5;
const BOB_HUE_BUCKET = 4;
async function bgOf(locator: Locator): Promise<readonly [number, number, number, number]> {
  return parseOklch(await locator.evaluate((el) => getComputedStyle(el).backgroundColor));
}
// #103 (owner-ruled 2026-08-16, from decision #100): fallback identity paints IN-BAND — derived at
// computed-value time from the active theme's own `--color-primary` (hue held; lightness/chroma stepped
// per hash bucket — `@orb/ui/avatar` hue.ts is the one home). The old chart-ramp equality is therefore
// the WRONG assertion: a CT pins BAND MEMBERSHIP (rendered hue within the derivation's tolerance of the
// scope's primary) plus the entity's deterministic BUCKET (`data-hue` on the Avatar fallback), and the
// one-entity-one-hue equality between co-rendered surfaces. Tone distinctness across buckets is pinned
// by the palette × step matrix in tests/ui/tokens/index.test.ts, not re-proven per surface here.
const IN_BAND_HUE_TOLERANCE_DEG = 12;
function hueDeltaDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
async function expectInBand(locator: Locator): Promise<void> {
  const [, , bgHue] = await bgOf(locator);
  const [, , primaryHue] = parseOklch(await cssVar(locator, "--color-primary"));
  expect(hueDeltaDeg(bgHue, primaryHue)).toBeLessThanOrEqual(IN_BAND_HUE_TOLERANCE_DEG);
}

test("bubble: a no-avatar character's chip top-aligns with the name row + paints its DETERMINISTIC per-entity hue (not the constant bucket)", async ({
  mount,
}) => {
  const component = await mount(
    <MessageRowStory chatStyle="bubble" messageRole="assistant" content={LONG_BODY} characterId={ALICE_ID} participants={[alice()]} />,
  );
  const avatar = component.locator(AVATAR);
  // Placement: the gutter avatar pins to the TOP of the message group (aligned with the speaker name),
  // never vertically centered against a tall multi-line bubble (the items-center footgun).
  const readAvatarBoxAtAssertion = async (): Promise<typeof avatarBox> => await avatar.boundingBox();
  const avatarBox = await avatar.boundingBox();
  const nameBox = await component.locator(NAME_ROW).boundingBox();
  expect(Math.abs((avatarBox?.y ?? 0) - (nameBox?.y ?? 0))).toBeLessThan(2);
  // The fallback fills a real box (never collapsed to 0), with the entity's deterministic hue — and
  // NOT the pre-fix constant `alt=""` bucket every imageless speaker used to share.
  await expect.poll(async () => (await readAvatarBoxAtAssertion())?.width).toBeGreaterThan(0);
  await expect.poll(async () => (await readAvatarBoxAtAssertion())?.height).toBeGreaterThan(0);
  const fallback = avatar.locator(FALLBACK);
  await expect(fallback).toHaveAttribute("data-hue", String(ALICE_HUE_BUCKET));
  await expectInBand(fallback);
});

test("bubble: a different no-avatar character resolves a DISTINCT hue (per-entity, not one shared color)", async ({ mount }) => {
  // Bob (a different id) lands his OWN bucket (4), not Alice's (5) — the exact defect the owner reported
  // (every imageless speaker was the same teal `alt=""` bucket) is gone.
  const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={BOB_ID} participants={[bob()]} />);
  const fallback = component.locator(`${AVATAR} ${FALLBACK}`);
  await expect(fallback).toHaveAttribute("data-hue", String(BOB_HUE_BUCKET));
  await expectInBand(fallback);
});

test("echo (no avatar): the FALLBACK edge tile IS the art — hue field + initial, SAME feather padding as with-image, aligned to the bled edge", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  const component = await mount(
    <MessageRowStory chatStyle="echo" messageRole="assistant" content={LONG_BODY} characterId={ALICE_ID} participants={[alice()]} />,
  );
  const bubble = component.locator(BUBBLE);
  const tile = component.locator(EDGE_TILE);
  // The tile renders (not an empty/collapsed slot) and carries the initial in its visible zone.
  await expect(tile).toHaveCount(1);
  await expect(tile).toContainText("A");
  // Owner ruling 2026-07-09 (side-eye): the initial is a scannable identity mark, sized off the
  // hero-avatar glyph token (~4× the old 16px title), not an easter egg — RENDERED font-size, not a class.
  await expect
    .poll(async () => tile.locator('[data-slot="text"]').evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)))
    .toBe(SNAPPED_LENGTH_BASE_PX["spacing.avatar-hero"]);
  // Reading geometry is IDENTICAL to the with-image echo (the regression pin above): text is padded
  // clear by the art pane's own width token, never a reserved-but-empty gap.
  await expect.poll(async () => bubble.evaluate((el) => (el as HTMLElement).style.paddingRight)).toBe("min(var(--immersive-echo-art-width), 25cqi)");
  // The tile's field is the entity's deterministic hue — the SAME color the row's chip paints (one
  // entity, one hue everywhere).
  const chip = component.locator(`${AVATAR} ${FALLBACK}`);
  await expectInBand(tile);
  expect(await bgOf(tile)).toEqual(await bgOf(chip));
  // Placement: the tile hugs the bubble's bled (right) edge, no broken overflow.
  const tileBox = await tile.boundingBox();
  const bubbleBox = await bubble.boundingBox();
  const tileRight = (tileBox?.x ?? 0) + (tileBox?.width ?? 0);
  const bubbleRight = (bubbleBox?.x ?? 0) + (bubbleBox?.width ?? 0);
  expect(Math.abs(tileRight - bubbleRight)).toBeLessThan(2);
});

test("whisper (no avatar): the FALLBACK band renders at the SAME 3:1 geometry (hue field + initial), never a bare stripe or a stretched image", async ({
  mount,
}) => {
  const component = await mount(
    <MessageRowStory chatStyle="whisper" messageRole="assistant" content={LONG_BODY} characterId={ALICE_ID} participants={[alice()]} />,
  );
  const band = component.locator(BAND);
  await expect(band).toBeVisible();
  await expect(band).toContainText("A");
  // SAME 3:1 aspect box as the imaged band (the regression pin above) — height derives from width.
  await expect
    .poll(async () => {
      const box = await band.boundingBox();
      return Math.abs((box?.width ?? 0) / (box?.height ?? 1) - 3);
    })
    .toBeLessThan(0.1);
  // A hue FIELD, not a banner <img> (the with-image band's `?v=banner` URL must be absent here).
  await expect.poll(async () => band.evaluate((el) => getComputedStyle(el).backgroundImage)).not.toContain("?v=banner");
  await expectInBand(band);
});

test("ripple (no avatar): the welded VN portrait falls back to the hue tile at the SAME portrait geometry (sticky, portrait width), no broken image", async ({
  mount,
}) => {
  const component = await mount(
    <MessageRowStory chatStyle="ripple" messageRole="assistant" content={LONG_BODY} characterId={ALICE_ID} participants={[alice()]} />,
  );
  const avatar = component.locator(AVATAR);
  // No <img> renders (no hash) — the Avatar shows its fallback tile, at the UNCHANGED portrait width.
  await expect(avatar.locator('[data-slot="avatar-image"]')).toHaveCount(0);
  const box = await avatar.boundingBox();
  expect(Math.round(box?.width ?? 0)).toBe(remTokenPx(TOKENS["immersive.ripple-portrait-width"].value));
  await expect(avatar).toHaveCSS("position", "sticky");
  const fallback = avatar.locator(FALLBACK);
  await expect(fallback).toContainText("A");
  await expect(fallback).toHaveAttribute("data-hue", String(ALICE_HUE_BUCKET));
  await expectInBand(fallback);
});

// ── Reading scrim over a background photo (side-eye live P1, 2026-07-09) ───────────────────────────
// Flat/Hush/Document carry no bubble fill AND the shell strips their float halo — so text landed
// directly on the photo (2.0–2.4:1 on bright patches). When an ANCESTOR carries `data-has-bg-image`
// (the shell grid's flag), those three back the text with the derived `--color-reading-plate` + backdrop-blur; on
// a plain background the scrim is OFF (flat stays truly flat). `in-data-[has-bg-image]:` is an ancestor
// variant, so a plain wrapping `<div data-has-bg-image>` around the mount drives the ON case.
const TRANSPARENT = "rgba(0, 0, 0, 0)";

// NO BUILD-TIME SAFELIST IS NEEDED HERE, and this is the note that says so rather than a re-added one.
// The scrim's ancestor-variant utilities are authored in the client skin as WHOLE literals
// (message-row-backing.ts `BG_PHOTO_READING_PLATE`/`BG_PHOTO_CHROME_PLATE`, consumed by
// message-row-variants.ts), and the CT harness's Tailwind content-scan covers `packages/client/src` —
// `playwright/index.css` @sources it alongside `@orb/ui/src` and `tests/`, and says why in its own
// header — so the CT build emits them exactly as the client build does. This comment previously claimed
// the opposite and carried the literals to bridge a scan gap; the gap does not exist, and the
// computed-style assertions below were re-run green with the bridge removed (2026-08-17).

for (const style of ["flat", "hush", "document"] as const) {
  test(`${style} over a bg image: the reading text's backdrop is the scrim + blur (computed), never transparent`, async ({ mount }) => {
    const component = await mount(
      <div data-has-bg-image="">
        <MessageRowStory chatStyle={style} messageRole="assistant" content={LONG_BODY} characterId={ALICE_ID} participants={[alice()]} />
      </div>,
    );
    const bubble = component.locator(BUBBLE).first();
    const { bg, backdrop } = await bubble.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, backdrop: cs.backdropFilter };
    });
    // The nearest backdrop IS the derived reading plate (resolved off the element, never a literal),
    // not transparent — the reading-surface floor over ANY image region.
    expect(bg).not.toBe(TRANSPARENT);
    expect(parseOklch(bg)).toEqual(parseOklch(await cssVar(bubble, "--color-reading-plate")));
    // + the dialog-backdrop blur that collapses bright-patch peaks a flat scrim alone can't.
    expect(backdrop).not.toBe("none");
  });
}

test("without a bg image, flat stays truly flat — no scrim, no blur (don't scrim what doesn't need it)", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory chatStyle="flat" messageRole="assistant" content={LONG_BODY} characterId={ALICE_ID} participants={[alice()]} />,
  );
  const bubble = component.locator(BUBBLE).first();
  const { bg, backdrop } = await bubble.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, backdrop: cs.backdropFilter };
  });
  expect(bg).toBe(TRANSPARENT);
  expect(backdrop).toBe("none");
});

// ── THE ATTRIBUTION GUARANTEE over a bg photo (#167 · re-homed by #288) ────────────────────────────
// #167's RULING: the speaker name, the timestamp beside it and the action icons are a legibility
// GUARANTEE over ANY art in ANY skin — never a per-skin opt-in. It was measured live in the owner's room
// at 1.63:1 for the timestamp, with the USER row ("Traveler") the naked one.
//
// #167's MECHANISM was a second surface: a `BG_PHOTO_CHROME_PLATE` chip minted for a header that had none,
// because the header was a sibling ABOVE the bubble in every mode. #288 changed that premise — in seven of
// the eight skins the header is the CONTAINER's own header row now, so the box the prose already rides is
// what backs it, and minting a second plate beside the first is the very two-object read #288 removed.
//
// So the guarantee is pinned where it now lives: the header's NEAREST PAINTED BACKDROP over art, whichever
// element that is. `tide` (the one `outside` skin — a train of pills has no single container) still
// answers with its own chip; every other skin answers with the container. ALL EIGHT skins, BOTH roles —
// the coverage #167 minted, asserted through the anatomy #288 left.
const ACTIONS_ROW = '[data-slot="message-actions-row"]';
const ALL_CHAT_STYLES = ["bubble", "flat", "document", "echo", "whisper", "hush", "ripple", "tide"] as const;

/** The header's own fill if it paints one, else its container's — i.e. what a reader actually sees behind
 *  the speaker name. Returns the painted ancestor's fill + blur, so the assertion survives either anatomy. */
async function headerBackdrop(component: Locator): Promise<{ readonly bg: string; readonly backdrop: string }> {
  return await component.locator(NAME_ROW).evaluate((el: HTMLElement) => {
    for (let node: HTMLElement | null = el; node !== null; node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (cs.backgroundColor !== "rgba(0, 0, 0, 0)") {
        return { bg: cs.backgroundColor, backdrop: getComputedStyle(node).backdropFilter };
      }
    }
    return { bg: "rgba(0, 0, 0, 0)", backdrop: "none" };
  });
}

/** THE FLOOR ITSELF, stated once: a surface anchors chrome over art if it either OCCLUDES the photo
 *  outright (alpha 1 — the filled skins' `--color-ai-bubble`/`--color-user-bubble`, which is why they
 *  never needed a blur) or is the translucent reading plate WITH its blur (the no-fill skins' plate and
 *  tide's chip — the alpha floor `palette-contrast.suite.test.ts` proves is only sound with the blur that
 *  collapses the art's bright peaks). Asserting "not transparent" alone would pass a 5%-alpha wash;
 *  asserting "has a blur" alone would fail every opaque fill for no reader-visible reason. */
function expectAnchoredOverArt(surface: { readonly bg: string; readonly backdrop: string }): void {
  expect(surface.bg).not.toBe(TRANSPARENT);
  const [, , , alpha] = parseOklch(surface.bg);
  // One expect, not a branch: the failure prints the fill and the filter that actually rendered.
  expect({ ...surface, anchored: alpha === 1 || surface.backdrop !== "none" }).toMatchObject({ anchored: true });
}

for (const style of ALL_CHAT_STYLES) {
  test(`${style} over a bg image: the ASSISTANT name row's nearest backdrop is a real surface, not the raw photo`, async ({ mount }) => {
    const component = await mount(
      <div data-has-bg-image="">
        <MessageRowStory chatStyle={style} messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} />
      </div>,
    );
    // The action-icon row itself paints no bg; its backdrop is whatever backs the header that wraps it.
    const actionsRow = component.locator(ACTIONS_ROW);
    await expect(actionsRow).toHaveCount(1);
    expectAnchoredOverArt(await headerBackdrop(component));
  });

  test(`${style} over a bg image: the USER name row is backed too (the row the live defect showed naked)`, async ({ mount }) => {
    test.skip(style === "document", "the document page names nobody, as stock does; its own pins are the document block");
    const component = await mount(
      <div data-has-bg-image="">
        <MessageRowStory
          chatStyle={style}
          messageRole="user"
          personaId={ALEX_PERSONA_ID}
          personas={[{ id: ALEX_PERSONA_ID, name: "Alex" }]}
          metadataVisibility={meta({ showTimestamps: true })}
        />
      </div>,
    );
    const nameRow = component.locator(NAME_ROW);
    // The name AND the timestamp beside it — the two the live receipt measured at 16.57:1 / 1.63:1 — are
    // both inside this one backed box.
    await expect(nameRow.locator(ATTRIBUTION)).toContainText("Alex");
    await expect(nameRow.locator(TIMESTAMP)).toHaveCount(1);
    expectAnchoredOverArt(await headerBackdrop(component));
  });
}

// The chip mechanism itself is not gone, it is SCOPED — `tide` is the skin that still needs a surface
// minted for it, and it must still be the derived reading plate (the #204 derive law), still blurred,
// still a rounded CHIP rather than a full-bleed band. Pinned separately so "the guarantee holds" and
// "the chip is spelled correctly" cannot pass for each other.
test("#167/#288 tide's chip is still the derived reading plate — blurred, rounded, paired ink", async ({ mount }) => {
  const component = await mount(
    <div data-has-bg-image="">
      <MessageRowStory chatStyle="tide" messageRole="assistant" content={TIDE_TWO_PARAGRAPHS} characterId={ALICE_ID} participants={[alice()]} />
    </div>,
  );
  const nameRow = component.locator(NAME_ROW);
  const { bg, backdrop, radius } = await nameRow.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, backdrop: cs.backdropFilter, radius: cs.borderTopLeftRadius };
  });
  expect(parseOklch(bg)).toEqual(parseOklch(await cssVar(nameRow, "--color-reading-plate")));
  expect(backdrop).not.toBe("none");
  expect(Number.parseFloat(radius)).toBeGreaterThan(0);
});

test("the sticky chip SUPERSEDES the wallpaper one without doubling the box: a sticky row over art measures like the same row un-stuck", async ({ mount }) => {
  // #113's layout-neutrality invariant, now that the wallpaper chip lands on EVERY row (#167): the sticky
  // verdict arrives AFTER the virtualizer measures the row, so if turning it on changed the row's outer
  // extent the reflow would land on exactly the tall rows the pin exists to help. Since #168 the two are
  // ALTERNATIVES (an opaque fill supersedes the scrim one), and the arithmetic is the same either way:
  // over art both arms carry exactly one `py-row` — the measurement is the only honest check of that.
  const bare = await mount(
    <div data-has-bg-image="">
      <MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} />
    </div>,
  );
  const bareOuter = await nameRowOuterExtent(bare.locator(NAME_ROW));
  await bare.unmount();

  const stuck = await mount(
    <div data-has-bg-image="">
      <MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} stickyAttribution={true} />
    </div>,
  );
  const stuckRow = stuck.locator(NAME_ROW);
  await expect(stuckRow).toHaveCSS("position", "sticky");
  const stuckOuter = await nameRowOuterExtent(stuckRow);
  expect(Math.abs(stuckOuter - bareOuter)).toBeLessThan(1);
});

for (const style of ["flat", "bubble"] as const) {
  test(`without a bg image, ${style}'s chrome row carries NO chip (don't scrim what doesn't need it)`, async ({ mount }) => {
    const component = await mount(<MessageRowStory chatStyle={style} messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} />);
    const nameRow = component.locator(NAME_ROW);
    const { bg, backdrop } = await nameRow.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, backdrop: cs.backdropFilter };
    });
    expect(bg).toBe(TRANSPARENT);
    expect(backdrop).toBe("none");
  });
}

// ── THE MODEL CREDIT rides the reveal cluster and prints a NAME (#167, owner ruling 2026-08-18) ─────
// It used to be a datum in the metadata row printing the RAW identifier — for a self-hosted engine that
// is a 106-character absolute weights path, parked under every reply and measured at 1.59:1 over the
// owner's background art. Same `showModelIcon` gate, new home: the row's hover/focus reveal cluster,
// printed through `@orb/kit/model-name` with the full identifier on `title` only when the derivation
// shortened it.
const MODEL_SLOT = '[data-slot="message-metadata-model"]';
const LOCAL_WEIGHTS_PATH = "/mnt/models/storage/vllm-models/quantized/Huihui-ThinkingCap-Qwen3.6-27B-abliterated-W8A8-Dynamic-Per-Token";
const LOCAL_WEIGHTS_DIR_RE = /\/media\//u;
const LOCAL_WEIGHTS_DISPLAY_RE = /Huihui-ThinkingCap-Qwen3\.6-27B-abliterated · W8A8/u;
const HOSTED_MODEL_RE = /claude-sonnet-5/u;

test("showModelIcon on: the credit renders INSIDE the action cluster, and the metadata row carries none", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      characterId={ALICE_ID}
      participants={[alice()]}
      metadataVisibility={meta({ showModelIcon: true, showTokenCount: true })}
    />,
  );
  await expect(component.locator(`${ACTIONS_ROW} ${MODEL_SLOT}`)).toHaveCount(1);
  // The transcript's own flow keeps the machine facts it still owns (tokens) and loses the credit.
  await expect(component.locator(`${METADATA_ROW} ${MODEL_SLOT}`)).toHaveCount(0);
  await expect(component.locator(`${METADATA_ROW} ${TOKENS_SLOT}`)).toHaveCount(1);
});

// THE TEXT IS GONE, THE GLYPH REMAINS (owner ruling 2026-08-18): "we have our model icon with model name
// on hover, but we ALSO have a long-ass raw model name text — the latter is ugly and needs to go." The
// credit renders NO rest text at all now; its two doors are `title` (pointer) and an sr-only sentence (AT),
// and both carry the DERIVED name. These two tests used to pin the printed string and the #115 stutter
// rule that governed it — they pin the doors instead, on the same two fixtures (a local weights path, a
// hosted route), because those are the two shapes the derivation actually differs on.
test("a local weights path credits its DISPLAY NAME on hover — never the host's directory tree, never rest text", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      characterId={ALICE_ID}
      participants={[alice()]}
      model={LOCAL_WEIGHTS_PATH}
      metadataVisibility={meta({ showModelIcon: true })}
    />,
  );
  const credit = component.locator(`${ACTIONS_ROW} ${MODEL_SLOT}`);
  // The glyph is there and the datum is reachable — on hover, and to AT.
  await expect(credit).toHaveAttribute("title", LOCAL_WEIGHTS_DISPLAY_RE);
  await expect(credit).toHaveText(LOCAL_WEIGHTS_DISPLAY_RE);
  // …but nothing of it is VISIBLE at rest: the only text node is the sr-only sentence.
  const readVisibleTextAtAssertion = async (): Promise<typeof visibleText> =>
    await credit.evaluate((el) => {
      const sr = el.querySelector(".sr-only");
      const clone = el.cloneNode(true) as HTMLElement;
      for (const node of clone.querySelectorAll(".sr-only")) {
        node.remove();
      }
      return { sr: (sr?.textContent ?? "").trim(), visible: (clone.textContent ?? "").trim() };
    });
  const visibleText = await credit.evaluate((el) => {
    const sr = el.querySelector(".sr-only");
    const clone = el.cloneNode(true) as HTMLElement;
    for (const node of clone.querySelectorAll(".sr-only")) {
      node.remove();
    }
    return { sr: (sr?.textContent ?? "").trim(), visible: (clone.textContent ?? "").trim() };
  });
  await expect.poll(async () => (await readVisibleTextAtAssertion()).visible).toBe("");
  await expect.poll(async () => (await readVisibleTextAtAssertion()).sr).toMatch(LOCAL_WEIGHTS_DISPLAY_RE);
  // Never the host's directory tree, on the line OR on the tooltip.
  await expect(credit).not.toContainText("/media/");
  await expect(credit).not.toHaveAttribute("title", LOCAL_WEIGHTS_DIR_RE);
});

test("a hosted route names itself on hover too — `title` is UNCONDITIONAL now that nothing prints", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      characterId={ALICE_ID}
      participants={[alice()]}
      model="claude-sonnet-5"
      metadataVisibility={meta({ showModelIcon: true })}
    />,
  );
  const credit = component.locator(`${ACTIONS_ROW} ${MODEL_SLOT}`);
  // The #115 stutter rule dropped `title` when the derivation changed nothing — correct while the string
  // was also printed beside it, and a datum with NO door once it was not.
  await expect(credit).toHaveAttribute("title", HOSTED_MODEL_RE);
  await expect
    .poll(async () =>
      credit.evaluate((el) => {
        const clone = el.cloneNode(true) as HTMLElement;
        for (const node of clone.querySelectorAll(".sr-only")) {
          node.remove();
        }
        return (clone.textContent ?? "").trim();
      }),
    )
    .toBe("");
});

test("showModelIcon off: nothing is credited anywhere in the row (the toggle still gates it)", async ({ mount }) => {
  const off = await mount(
    <MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} metadataVisibility={meta({})} />,
  );
  await expect(off.locator(MODEL_SLOT)).toHaveCount(0);
});

test("a row with no model at all (a greeting/draft): the toggle is on and still nothing is credited", async ({ mount }) => {
  const noModel = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      characterId={ALICE_ID}
      participants={[alice()]}
      model={null}
      metadataVisibility={meta({ showModelIcon: true })}
    />,
  );
  await expect(noModel.locator(MODEL_SLOT)).toHaveCount(0);
});

// ── A3 hidden-at-rest reveal is NOT the Wave-1 opacity-0-in-flow starve (measured no-op) ────────────
// message-actions-reveal.ts's `"hover"` posture (D66 A3) now HIDES the cluster at rest (opacity-0 +
// pointer-events-none), revealing on hover/focus-within/coarse. The Wave-1 "opacity-0 in-flow starves a
// flex sibling" P0 is still absent: opacity + pointer-events change NO layout, so the cluster keeps its
// box (footprint identical at rest vs revealed) and a normal speaker name never overflows the name row.
test("action cluster is hidden-at-rest (opacity 0, in-flow, inert) and never starves a normal name (A3 geometry pin)", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} />);
  const actions = component.locator('[data-slot="message-actions-row"]');
  const nameRow = component.locator(NAME_ROW);
  // Hidden-at-rest via OPACITY + pointer-events (A3), never display:none — the cluster still lays out a
  // real box (so its footprint is stable, not a surprise on reveal), it's just invisible AND inert.
  await expect(actions).toHaveCSS("opacity", "0");
  await expect(actions).toHaveCSS("pointer-events", "none");
  const readActionsBoxAtAssertion = async (): Promise<typeof actionsBox> => await actions.boundingBox();
  const actionsBox = await actions.boundingBox();
  await expect.poll(async () => (await readActionsBoxAtAssertion())?.width).toBeGreaterThan(0); // in flow, occupying real space at rest
  // The name row doesn't overflow its own box — the icon+⋯ cluster leaves room for the name (no
  // sibling-starve). scrollWidth ≤ clientWidth ⇒ nothing clipped/pushed past the edge.
  await expect.poll(async () => nameRow.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
});

test.describe("#988 message action rail containment", () => {
  const containmentTolerancePx = 1;

  interface ActionRailRect {
    readonly height: number;
    readonly left: number;
    readonly top: number;
    readonly width: number;
  }

  interface BubbleRect {
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
    readonly top: number;
  }

  interface ActionButtonGeometry {
    readonly height: number;
    readonly hitOwned: boolean;
    readonly name: string | null;
    readonly width: number;
  }

  interface ActionGeometry {
    readonly actions: ActionRailRect;
    readonly bubble: BubbleRect;
    readonly buttons: readonly ActionButtonGeometry[];
    readonly content: BubbleRect;
    readonly targetFloor: number;
  }

  function actionGeometry(component: Locator): Promise<ActionGeometry> {
    return component.locator(ACTIONS_ROW).evaluate((element) => {
      const bubble = element.closest<HTMLElement>("[data-slot='message-bubble']");
      if (bubble === null) {
        throw new Error("Message actions have no owning bubble");
      }
      const content = bubble.closest<HTMLElement>("[data-slot='message-content-column']");
      if (content === null) {
        throw new Error("Message bubble has no owning content column");
      }

      const actionsRect = element.getBoundingClientRect();
      const bubbleRect = bubble.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      // A PROBE, not a `getPropertyValue` parse: since #1640 the token stream reads `round(up, 2.75rem, 1px)`
      // and `parseFloat` would answer NaN, making every floor comparison below vacuously true.
      const floorProbe = element.ownerDocument.createElement("div");
      floorProbe.style.position = "absolute";
      floorProbe.style.paddingTop = "var(--spacing-touch-target)";
      element.ownerDocument.body.append(floorProbe);
      const targetFloor = Number.parseFloat(getComputedStyle(floorProbe).paddingTop);
      floorProbe.remove();
      const visibleButtons = Array.from(element.querySelectorAll<HTMLButtonElement>("button")).filter((button) => {
        const style = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      });

      return {
        actions: {
          height: actionsRect.height,
          left: actionsRect.left,
          top: actionsRect.top,
          width: actionsRect.width,
        },
        bubble: {
          bottom: bubbleRect.bottom,
          left: bubbleRect.left,
          right: bubbleRect.right,
          top: bubbleRect.top,
        },
        buttons: visibleButtons.map((button) => {
          const rect = button.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          // A glyph button's touch target is its `::before` hit area, not its visible 32px box.
          const area = getComputedStyle(button, "::before");
          const areaWidth = area.content === "none" ? 0 : Number.parseFloat(area.width) || 0;
          const areaHeight = area.content === "none" ? 0 : Number.parseFloat(area.height) || 0;
          return {
            height: Math.max(rect.height, areaHeight),
            hitOwned: hit !== null && button.contains(hit),
            name: button.getAttribute("aria-label"),
            width: Math.max(rect.width, areaWidth),
          };
        }),
        content: {
          bottom: contentRect.bottom,
          left: contentRect.left,
          right: contentRect.right,
          top: contentRect.top,
        },
        targetFloor,
      };
    });
  }

  function expectContained(geometry: ActionGeometry): void {
    expect(geometry.actions.top).toBeGreaterThanOrEqual(geometry.bubble.top - containmentTolerancePx);
    expect(geometry.actions.left).toBeGreaterThanOrEqual(geometry.bubble.left - containmentTolerancePx);
    expect(geometry.actions.left + geometry.actions.width).toBeLessThanOrEqual(geometry.bubble.right + containmentTolerancePx);
    expect(geometry.actions.top + geometry.actions.height).toBeLessThanOrEqual(geometry.bubble.bottom + containmentTolerancePx);
    expect(geometry.bubble.top).toBeGreaterThanOrEqual(geometry.content.top - containmentTolerancePx);
    expect(geometry.bubble.left).toBeGreaterThanOrEqual(geometry.content.left - containmentTolerancePx);
    expect(geometry.bubble.right).toBeLessThanOrEqual(geometry.content.right + containmentTolerancePx);
    expect(geometry.bubble.bottom).toBeLessThanOrEqual(geometry.content.bottom + containmentTolerancePx);
  }

  function expectTargetAndHitOwnership(geometry: ActionGeometry): void {
    expect(geometry.targetFloor).toBeGreaterThan(0);
    expect(geometry.buttons.length).toBeGreaterThan(0);
    for (const button of geometry.buttons) {
      expect(button.name).not.toBeNull();
      expect(button.width).toBeGreaterThanOrEqual(geometry.targetFloor);
      expect(button.height).toBeGreaterThanOrEqual(geometry.targetFloor);
      expect(button.hitOwned).toBe(true);
    }
  }

  test("fine pointer keeps the full reveal rail inside its owning bubble", async ({ mount, page }) => {
    await expect.poll(async () => await page.evaluate(() => matchMedia("(pointer: fine)").matches)).toBe(true);
    const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" content="Contain these fine actions" />);
    const actions = component.locator(ACTIONS_ROW);

    await expect(actions).toHaveCSS("opacity", "0");
    await expect(actions).toHaveCSS("pointer-events", "none");
    const rest = await actionGeometry(component);

    await page.evaluate(() => {
      document.documentElement.dataset["orb988Cls"] = "0";
      let cls = 0;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as PerformanceEntry & { hadRecentInput: boolean }).hadRecentInput) {
            cls += (entry as PerformanceEntry & { value: number }).value;
          }
        }
        document.documentElement.dataset["orb988Cls"] = String(cls);
      });
      observer.observe({ buffered: false, type: "layout-shift" });
    });

    await component.locator(ROW).hover();
    await expect(actions).toHaveCSS("opacity", "1");
    await expect(actions).toHaveCSS("pointer-events", "auto");
    const revealed = await actionGeometry(component);

    expect(revealed.actions).toEqual(rest.actions);
    expectContained(revealed);
    expectTargetAndHitOwnership(revealed);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.locator("html")).toHaveAttribute("data-orb988-cls", "0");
  });

  test.describe("coarse pointer", () => {
    test.use({ hasTouch: true });

    test("keeps the always-visible named action door inside its owning bubble", async ({ mount, page }) => {
      await expect.poll(async () => await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      const component = await mount(
        <MessageRowStory chatStyle="bubble" messageRole="assistant" content="Contain these coarse actions" characterId={ALICE_ID} participants={[alice()]} />,
      );
      const actions = component.locator(ACTIONS_ROW);
      const namedDoor = actions.getByRole("button", { name: MESSAGE_ACTIONS_MENU_NAME });

      await expect(actions).toHaveCSS("opacity", "1");
      await expect(actions).toHaveCSS("pointer-events", "auto");
      await expect(namedDoor).toBeVisible();
      const rest = await actionGeometry(component);

      await namedDoor.focus();
      const focused = await actionGeometry(component);

      expect(focused.actions).toEqual(rest.actions);
      expectContained(focused);
      expectTargetAndHitOwnership(focused);
    });
  });
});

// ── #204: the HEADER HUGS ITS TEXT — the invisible action cluster contributes NO height ─────────────
// The hover-reveal cluster is a ~34px row of icon buttons, opacity-0 at rest but in flow at full
// height, and it SET the painted chip's height: 50px around a 16px name (50 = 34 + 2×py-row). Over
// wallpaper that painted the owner's "phantom empty scrim bands" (the chip's empty top/bottom thirds)
// and the "name separated from the messages" gap. The cluster rides a zero-height slot: full WIDTH
// stays reserved (the A3 pin above), buttons still paint/hit at full size (overflow visible), and the
// header's height derives from the NAME.
//
// #288 TRUTH-REPAIR: the "+ 2×py-row" half of the old arithmetic was the CHIP's padding, and an inside
// header has no chip — so `flat` over art now measures the bare name line. The invariant #204 actually
// minted ("the invisible cluster adds no height") is unchanged and is what is asserted; the padding term
// moved to `tide`, the one skin still carrying the chip, which is asserted in the same test so the
// arithmetic keeps a live home. RED on the pre-#204 source in both arms (height was 50px).
test("#204/#288 the header's height derives from the name, not the invisible action cluster", async ({ mount }) => {
  const inside = await mount(
    <div data-has-bg-image="">
      <MessageRowStory chatStyle="flat" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} />
    </div>,
  );
  const rowPadPx = SNAPPED_LENGTH_BASE_PX["spacing.row"];
  const insideHeight = await inside.locator(NAME_ROW).evaluate((el) => el.getBoundingClientRect().height);
  const insideName = await inside.locator(ATTRIBUTION).evaluate((el) => el.getBoundingClientRect().height);
  const railHeight = await inside.locator(ACTIONS_ROW).evaluate((el) => el.getBoundingClientRect().height);
  // An INSIDE header takes no plate of its own. The rail spends the container's top inset and the row gap
  // below before it may add height, so the header is the name line or `rail - 2 * row`, whichever is taller.
  expect(Math.abs(insideHeight - Math.max(insideName, railHeight - 2 * rowPadPx))).toBeLessThan(1);
  // …while the cluster's buttons keep their full interactive box (they overflow the slot, not shrink).
  const buttonBox = await inside.getByRole("button", { name: MESSAGE_EDIT_NAME }).boundingBox();
  expect(buttonBox?.height ?? 0).toBeGreaterThan(insideHeight);
  await inside.unmount();

  const outside = await mount(
    <div data-has-bg-image="">
      <MessageRowStory chatStyle="tide" messageRole="assistant" content={TIDE_TWO_PARAGRAPHS} characterId={ALICE_ID} participants={[alice()]} />
    </div>,
  );
  const outsideHeight = await outside.locator(NAME_ROW).evaluate((el) => el.getBoundingClientRect().height);
  const outsideName = await outside.locator(ATTRIBUTION).evaluate((el) => el.getBoundingClientRect().height);
  // The OUTSIDE header still hugs `name + 2×py-row` — the chip's own padding and nothing else.
  expect(Math.abs(outsideHeight - (outsideName + 2 * rowPadPx))).toBeLessThan(2);
});

// ── No empty band between an inside header and its body ───────────────────────────────────────────
// The rail used to reserve a whole --spacing-section under the header (32px name-to-body against an 8px
// row gap). The body must follow the header at the container's own row gap, and the rail must still fit
// inside the bubble without reaching the prose, at both pointer sizes.
interface HeaderBodyGeometry {
  readonly placement: string | null;
  readonly headerBottom: number;
  readonly nameTop: number;
  readonly nameBottom: number;
  readonly bodyTop: number;
  readonly railTop: number;
  readonly railBottom: number;
  readonly bubbleTop: number;
}

function headerBodyGeometry(component: Locator): Promise<HeaderBodyGeometry> {
  return component.locator(NAME_ROW).evaluate((header: HTMLElement) => {
    const body = header.nextElementSibling;
    const name = header.querySelector("[data-slot='message-attribution']");
    const rail = header.querySelector("[data-slot='message-actions-row']");
    const bubble = header.closest("[data-slot='message-bubble']");
    if (body === null || name === null || rail === null || bubble === null) {
      throw new Error("inside header is missing its body, name, rail or bubble");
    }
    return {
      placement: header.getAttribute("data-placement"),
      headerBottom: header.getBoundingClientRect().bottom,
      nameTop: name.getBoundingClientRect().top,
      nameBottom: name.getBoundingClientRect().bottom,
      bodyTop: body.getBoundingClientRect().top,
      railTop: rail.getBoundingClientRect().top,
      railBottom: rail.getBoundingClientRect().bottom,
      bubbleTop: bubble.getBoundingClientRect().top,
    };
  });
}

const INSIDE_CHAT_STYLES = ALL_CHAT_STYLES.filter((style) => style !== "tide");

for (const coarse of [false, true] as const) {
  test.describe(`inside header-to-body gap, ${coarse ? "coarse" : "fine"} pointer`, () => {
    test.use({ hasTouch: coarse });
    for (const chatStyle of INSIDE_CHAT_STYLES) {
      test(`${chatStyle}: the body follows the header at the row gap and the rail stays clear of it`, async ({ mount, page }) => {
        test.skip(chatStyle === "document", "the document page names nobody, as stock does; its own pins are the document block");
        await expect.poll(async () => await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(coarse);
        const component = await mount(<MessageRowStory chatStyle={chatStyle} messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} />);
        const rowPx = SNAPPED_LENGTH_BASE_PX["spacing.row"];
        const g = await headerBodyGeometry(component);
        expect(g.placement).toBe("inside");
        expect(Math.abs(g.bodyTop - g.headerBottom - rowPx)).toBeLessThan(1);
        // The name is centred on a header no taller than the rail can borrow from the two insets, so the
        // only space under it beyond the row gap is half of what the rail could not borrow.
        const railPx = g.railBottom - g.railTop;
        const namePx = g.nameBottom - g.nameTop;
        const expectedNameGap = rowPx + Math.max(0, (railPx - 2 * rowPx - namePx) / 2);
        expect(Math.abs(g.bodyTop - g.nameBottom - expectedNameGap)).toBeLessThan(1);
        expect(g.railTop).toBeGreaterThanOrEqual(g.bubbleTop - 1);
        expect(g.railBottom).toBeLessThanOrEqual(g.bodyTop + 1);
      });
    }
  });
}

// ── #204: the DERIVE LAW — a plate's ink comes from the SAME palette as the plate ────────────────────
// flat/hush painted the reading plate with NO ink token at all, so their body prose INHERITED
// `.shell-grid`'s already-resolved viewer foreground while the plate followed the carried palette —
// dark carried plate under light viewer ink worked by luck; a light carried palette flipped the plate
// and left the ink (the two-polarity paragraph, measured 1.14:1 in the owner's room). The plate
// constant now carries `text-prose-body` (and the chrome plate `text-foreground`) in the same string.
for (const style of ["flat", "hush"] as const) {
  test(`#204 ${style} over a bg image: body prose takes the palette's prose ink, never inherited color`, async ({ mount }) => {
    const component = await mount(
      <div data-has-bg-image="">
        <MessageRowStory chatStyle={style} messageRole="assistant" content={LONG_BODY} characterId={ALICE_ID} participants={[alice()]} />
      </div>,
    );
    const bubble = component.locator(BUBBLE).first();
    const inkVar = await cssVar(bubble, "--color-prose-body");
    const readRenderedAtAssertion = async (): Promise<typeof rendered> => await bubble.evaluate((el) => getComputedStyle(el).color);
    const rendered = await bubble.evaluate((el) => getComputedStyle(el).color);
    await expect.poll(async () => parseOklch(await readRenderedAtAssertion())).toEqual(parseOklch(inkVar));
  });
}

test("#204 the name chip's ink rides the palette's foreground token over art (paired with its plate)", async ({ mount }) => {
  const component = await mount(
    <div data-has-bg-image="">
      <MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} />
    </div>,
  );
  const nameRow = component.locator(NAME_ROW);
  const inkVar = await cssVar(nameRow, "--color-foreground");
  const readRenderedAtAssertion = async (): Promise<typeof rendered> => await nameRow.evaluate((el) => getComputedStyle(el).color);
  const rendered = await nameRow.evaluate((el) => getComputedStyle(el).color);
  await expect.poll(async () => parseOklch(await readRenderedAtAssertion())).toEqual(parseOklch(inkVar));
});

test("#204 over art, metadata gloss steps up to the FULL foreground (the muted band cannot be floored on a translucent plate)", async ({ mount }) => {
  // The chip timestamp is gloss-voiced (`--color-muted-foreground`, the soft band) — over a wallpaper it
  // sits on the 0.65α reading plate, where the muted band mathematically cannot clear worst-case art on
  // either polarity (the last P1 of the #204 audit, 4.35:1). The `[data-slot^="message-metadata-"]`
  // step-up rule (client globals.css) lifts every metadata datum to the derived foreground — the ink the
  // plate's alpha floor is proven for. The outside/tide header keeps the quiet voice without art; an
  // inside header instead inherits its independently-picked role bubble ink (#935 custom-light receipt).
  const overArt = await mount(
    <div data-has-bg-image="">
      <MessageRowStory
        chatStyle="bubble"
        messageRole="assistant"
        characterId={ALICE_ID}
        participants={[alice()]}
        metadataVisibility={meta({ showTimestamps: true })}
      />
    </div>,
  );
  const stamp = overArt.locator(TIMESTAMP);
  await expect
    .poll(async () => parseOklch(await stamp.evaluate((el) => getComputedStyle(el).color)))
    .toEqual(parseOklch(await cssVar(stamp, "--color-foreground")));
  await overArt.unmount();
  const plain = await mount(
    <MessageRowStory
      chatStyle="tide"
      messageRole="assistant"
      characterId={ALICE_ID}
      participants={[alice()]}
      metadataVisibility={meta({ showTimestamps: true })}
    />,
  );
  const plainStamp = plain.locator(TIMESTAMP);
  await expect
    .poll(async () => parseOklch(await plainStamp.evaluate((el) => getComputedStyle(el).color)))
    .toEqual(parseOklch(await cssVar(plainStamp, "--color-muted-foreground")));
});

// ── D48 tool records reach the row (the wiring the transcript was silently dropping) ────────────────
// `MessageView.toolCalls` is the client's ONLY tool read surface and is present on EVERY message read
// (`[]` on a non-tool turn). These two pin the row-level ends of that seam: a record renders, and the
// empty array adds NOTHING to the row (no empty shell) — the byte-identical-when-absent floor every
// other CT in this file relies on.
test("a row with a persisted tool record renders it (name + result visible)", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      toolCalls={[{ toolCallId: "call_row_1", name: "lookup_lore", arguments: '{"q":"aria"}', result: '{"found":true}', isError: false, durationMs: 42 }]}
    />,
  );
  const block = component.locator('[data-slot="message-tool-calls"]');
  await expect(block).toBeVisible();
  await expect(block).toContainText("lookup_lore");
  // The <details> body holds arguments + result; open it so the result text is actually rendered/visible.
  await block.locator("summary").click();
  await expect(block).toContainText("found");
});

test("a row with an EMPTY toolCalls array renders no tool block at all", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" toolCalls={[]} />);
  await expect(component.locator('[data-slot="message-tool-calls"]')).toHaveCount(0);
  await expect(component.locator('[data-slot="tool-call-block"]')).toHaveCount(0);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// THE SETTLED REASONING DISCLOSURE. The live ghost row renders the streaming trace; before this the
// committed row rendered nothing, so a completed turn's reasoning vanished at commit and could never be
// re-read. These pin the durable half: `MessageView.reasoning` (the `message_variants.reasoning` column) is
// a collapsed, expandable block INSIDE the bubble — and, when the server withheld it (§3.6 strips the field
// to null for a member of a deception-active game), the row must show NO affordance at all: an empty
// disclosure would advertise the existence of a channel this viewer is not entitled to.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
const REASONING_TRACE = "Weighing the two openings before answering";
const THOUGHT_FOR_RE = /Thought for/u;
const THINKING_RE = /Thinking/u;

test("a committed row with a persisted reasoning trace renders it COLLAPSED, inside the bubble, and expands on click", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" reasoning={REASONING_TRACE} />);

  const trigger = component.getByRole("button", { name: MESSAGE_REASONING_NAME });
  await expect(trigger).toBeVisible();
  // Collapsed by default — the trace is NOT shown until the reader asks for it.
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(component.getByText(REASONING_TRACE)).toBeHidden();
  // It lives inside the bubble (where the streaming ghost puts it) — commit must not jump the affordance out.
  await expect(component.locator(`${BUBBLE} >> internal:role=button[name="Reasoning"i]`)).toHaveCount(1);

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(component.getByText(REASONING_TRACE)).toBeVisible();
});

test("a row whose reasoning was WITHHELD (null — the §3.6 member-stripped shape) renders no disclosure at all", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" reasoning={null} />);
  await expect(component.getByRole("button", { name: MESSAGE_REASONING_NAME })).toHaveCount(0);
  await expect(component.getByText(REASONING_TRACE)).toHaveCount(0);
});

test("the settled disclosure names the CHANNEL, never a fabricated duration (a canon-rehydrated row measured no think window)", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" reasoning={REASONING_TRACE} />);
  await expect(component.getByRole("button", { name: THOUGHT_FOR_RE })).toHaveCount(0);
  await expect(component.getByRole("button", { name: THINKING_RE })).toHaveCount(0);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// QUOTED-SPEECH TINTING × the per-character theme. The tint span consumes `--color-dialogue`, which the
// row's own `<ThemeScope>` re-binds from the card-embeddable part of the speaker's authored
// `themeOverride` — so an authored dialogueColor wins over the palette default WITHOUT the tinting code
// knowing anything about attribution. That is the whole per-character claim; a hardcoded color (or a tint
// mounted OUTSIDE the scope) fails it. Asserted on the COMPUTED color, never the class string (the Waystone
// lesson).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
const AUTHORED_DIALOGUE_COLOR = "oklch(0.72 0.19 25)";
const DIALOGUE_SPAN = '[data-slot="dialogue"]';
const QUOTED_BODY = 'She sets down the cup. "You came back," she says.';

function aliceWithDialogueTheme(): ParticipantView {
  return { ...alice(), themeOverride: { dialogueColor: AUTHORED_DIALOGUE_COLOR } };
}

test("the speaker's AUTHORED dialogueColor paints the quoted run (the theme scope wins, not the palette default)", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory chatStyle="bubble" messageRole="assistant" content={QUOTED_BODY} characterId={ALICE_ID} participants={[aliceWithDialogueTheme()]} />,
  );
  const tinted = component.locator(DIALOGUE_SPAN);
  await expect(tinted).toHaveText('"You came back,"');
  // The authored token, resolved by the SAME engine the class uses (paint a probe, read it back), must
  // equal the span's computed color — and must differ from the untinted narration around it.
  const { tint, authored, narration } = await tinted.evaluate((el, color) => {
    const probe = document.createElement("span");
    probe.style.color = color;
    el.append(probe);
    const authoredColor = getComputedStyle(probe).color;
    probe.remove();
    return {
      tint: getComputedStyle(el).color,
      authored: authoredColor,
      narration: getComputedStyle(el.parentElement ?? el).color,
    };
  }, AUTHORED_DIALOGUE_COLOR);
  expect(tint).toBe(authored);
  expect(tint).not.toBe(narration);
});

test("#937 a card theme cannot stamp density through the ordinary row ThemeScopes", async ({ mount }) => {
  const component = await mount(
    <div data-testid="viewer-density" data-density="comfortable">
      <MessageRowStory
        chatStyle="bubble"
        messageRole="assistant"
        content={QUOTED_BODY}
        characterId={ALICE_ID}
        participants={[{ ...aliceWithDialogueTheme(), themeOverride: { dialogueColor: AUTHORED_DIALOGUE_COLOR, density: "compact" } }]}
      />
    </div>,
  );

  const viewer = component;
  await expect(viewer).toHaveAttribute("data-density", "comfortable");
  const rowScopes = viewer.locator(THEME_SCOPE);
  await expect(rowScopes).toHaveCount(2);
  await expect(viewer.locator(`${THEME_SCOPE}[data-density]`)).toHaveCount(0);
  await expect
    .poll(async () => rowScopes.evaluateAll((scopes) => scopes.map((scope) => scope.closest("[data-density]")?.getAttribute("data-density"))))
    .toEqual(["comfortable", "comfortable"]);

  // Projection removes viewer ergonomics, not the card's authored prose palette.
  await expect.poll(async () => parseOklch(await cssVar(viewer.locator(BUBBLE), "--color-dialogue"))).toEqual(parseOklch(AUTHORED_DIALOGUE_COLOR));
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// ONE HASH INPUT — the same character is the same COLOR everywhere. The tint fallback is a deterministic
// hash, and its seed is the CHARACTER ID at every site (`characterTint`, attribution.ts). It used to fork:
// a row hashed the id while that character's span inside a merged-narrator row hashed the display NAME, so
// one character wore two colors in one transcript. These two mounts read the SAME resolved custom property
// off the two paths and require them equal — the fork cannot come back without going red here.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
const NARRATOR_CAST_BODY = "*the room stills*\n\nAlice: I'll take this one.\n\nBob: Fine.";

test("the same character resolves the SAME dialogue color in a narrator span and in their own row", async ({ mount }) => {
  const component = await mount(
    <NarratorTranscriptStory participants={[alice(), bob()]} narratorContent={NARRATOR_CAST_BODY} ownRowCharacterId={ALICE_ID} ownRowContent="Just prose." />,
  );
  const narratorRow = component.getByTestId("narrator-row");
  const ownRow = component.getByTestId("own-row");

  // Alice's own row: the tint rides the row-level ThemeScope the bubble sits inside.
  const ownColor = await cssVar(ownRow.locator(BUBBLE), "--color-dialogue");
  // The narrator row has NO single author (characterId null in a multi-character room), so its only
  // theme scopes are the per-speaker spans; `.last()` is the innermost match (the span, not an ancestor).
  const aliceSpan = narratorRow.locator(THEME_SCOPE).filter({ hasText: "I'll take this one." }).last();
  const spanColor = await cssVar(aliceSpan, "--color-dialogue");

  expect(ownColor).not.toBe("");
  expect(spanColor).toBe(ownColor);
  // Bob's span must NOT share it — the two speakers stay distinguishable inside the one bubble.
  const bobColor = await cssVar(narratorRow.locator(THEME_SCOPE).filter({ hasText: "Fine." }).last(), "--color-dialogue");
  expect(bobColor).not.toBe(spanColor);
  // The narrator row still says who is narrating: the outer label is unconditional (owner ruling,
  // 2026-08-03 — the narrator narrates, so the unattributed prose between spans needs its attribution).
  await expect(narratorRow.locator(ATTRIBUTION)).toContainText("Narrator");
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// THE STAMPED PRODUCER IS NOT A CAST MEMBER (side-eye 2026-08-03 P1, driven live on `Example — Second
// Opinion`). A narrator turn is persisted against the room's SYNTHETIC group character — a real
// `characters` row named "Group" — so it rides the chat's name producer, `resolveAssistantAttribution`
// resolved it like anyone else, and every merged row in a narrator room was labelled "Group" in a magenta
// id-hashed tint. `NARRATOR_ATTRIBUTION` was unreachable in the exact room it exists for. This mounts the
// row EXACTLY as the server ships it and reads the rendered label.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
const GROUP_PRODUCER = { id: castId<CharacterId>("char_group_room"), name: "Group" };

test("a narrator row stamped with the synthetic GROUP producer still reads Narrator, with no cast tint", async ({ mount }) => {
  const component = await mount(
    <NarratorTranscriptStory
      participants={[alice(), bob()]}
      narratorContent={NARRATOR_CAST_BODY}
      narratorProducer={GROUP_PRODUCER}
      ownRowCharacterId={ALICE_ID}
      ownRowContent="Just prose."
    />,
  );
  const narratorRow = component.getByTestId("narrator-row");
  await expect(narratorRow.locator(ATTRIBUTION)).toContainText("Narrator");
  await expect(narratorRow.locator(ATTRIBUTION)).not.toContainText("Group");
  // …and it is the same row the plain `characterId: null` narrator produces — one label, whatever the write
  // stamped. (`tokens: null` — no cast tint — is pinned on the pure resolver, attribution.test.ts.)
  await expect(narratorRow.getByText("I'll take this one.")).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// PURPOSE IS PER-ROW (D129). The chrome used to key on the ROOM's `group.output` dial, so every assistant
// row in a room got the same answer — flip the dial and all of history re-classified, and there was no way
// to render a narrator row beside an ordinary one at all. This mounts exactly that pair, with the SAME
// stamped producer on both, and only the declared kind differing: one reads Narrator, the other reads the
// card it was written under.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
test("two rows, one producer, different DECLARED kinds: narrator reads Narrator, standard reads its card", async ({ mount }) => {
  const component = await mount(
    <NarratorTranscriptStory
      participants={[alice(), bob()]}
      narratorContent={NARRATOR_CAST_BODY}
      narratorProducer={GROUP_PRODUCER}
      ownRowCharacterId={GROUP_PRODUCER.id}
      ownRowContent="Just prose."
    />,
  );
  await expect(component.getByTestId("narrator-row").locator(ATTRIBUTION)).toContainText("Narrator");
  await expect(component.getByTestId("own-row").locator(ATTRIBUTION)).toContainText("Group");
  // The span grammar follows the same declaration: only the narrator body splits its speakers.
  await expect(component.getByTestId("narrator-row").locator(THEME_SCOPE).filter({ hasText: "I'll take this one." }).last()).toBeVisible();
});

// ── THE PHONE'S READING COLUMN (side-eye leg-4 P2) ───────────────────────────────────────────────────
// "stop treating a phone as a narrow desktop." Measured on a real room at 430px: the avatar gutter took
// 76px, one paragraph ran 22 CHARACTERS over 12 lines (§2 wants 65–75ch) and the speaker name wrapped to
// two lines. The row is its own `@container` now, so the gutter shrinks at a phone-width column and the
// reading measure gets the difference.
//
// ⚑ WHAT THIS DOES NOT DO, and why: the review asked for the gutter to FOLD INTO the name row. §B.1 —
// pinned three tests above — says the avatar is a SIBLING of the content column and NEVER a descendant of
// the name row. Reversing a recorded anatomy law is the owner's call, not this lane's, so the fork is
// reported and this is the anatomy-preserving half.

const PHONE_COLUMN = 320;
const DESKTOP_COLUMN = 720;

test("at a phone-width column the chip keeps its 40px and only the gutter gap tightens", async ({ mount }) => {
  const narrow = await mount(
    <MessageRowStory chatStyle="bubble" characterId={ALICE_ID} messageRole="assistant" participants={[alice()]} width={PHONE_COLUMN} />,
  );
  // MEASURE THE GUTTER, not the column: in bubble style the column hugs its text (the `w-fit` pin two
  // screens up), so a column-share assertion would measure the FIXTURE's sentence rather than the row's
  // composition. The gutter is what this change moves.
  const readMeasuredAtAssertion = async (): Promise<typeof measured> =>
    await narrow.locator(CONTENT_COLUMN).evaluate((el: HTMLElement) => {
      const row = el.closest('[data-slot="message-row-body"]') as HTMLElement;
      const avatar = row.querySelector('[data-slot="avatar-root"]') as HTMLElement | null;
      return {
        gap: Number.parseFloat(getComputedStyle(row).columnGap),
        row: (row.closest('[data-slot="message-row"]') as HTMLElement).getBoundingClientRect().width,
        avatar: avatar === null ? 0 : avatar.getBoundingClientRect().width,
      };
    });
  const measured = await narrow.locator(CONTENT_COLUMN).evaluate((el: HTMLElement) => {
    const row = el.closest('[data-slot="message-row-body"]') as HTMLElement;
    const avatar = row.querySelector('[data-slot="avatar-root"]') as HTMLElement | null;
    return {
      gap: Number.parseFloat(getComputedStyle(row).columnGap),
      row: (row.closest('[data-slot="message-row"]') as HTMLElement).getBoundingClientRect().width,
      avatar: avatar === null ? 0 : avatar.getBoundingClientRect().width,
    };
  });
  // The portrait still renders (a phone does not lose the character) …
  await expect.poll(async () => (await readMeasuredAtAssertion()).avatar).toBeGreaterThan(0);
  // … at the same 40px chip as a desktop (the Glimmer preset's size), and the gutter costs well under a
  // sixth of the row (it was 76 of 320 before the gap tightened).
  await expect.poll(async () => (await readMeasuredAtAssertion()).avatar).toBe(40);
  expect((measured.avatar + measured.gap) / measured.row).toBeLessThan(0.15);
});

test("at a desktop-width column the portrait keeps its full size — the step-down is a WIDTH answer, not a mode", async ({ mount }) => {
  const wide = await mount(
    <MessageRowStory chatStyle="bubble" characterId={ALICE_ID} messageRole="assistant" participants={[alice()]} width={DESKTOP_COLUMN} />,
  );
  // The `sm` avatar token is 32px; the narrow step is 24px. Asserting ">= 32" pins that the wide arm is
  // untouched without hardcoding the narrow number on both sides.
  await expect
    .poll(async () =>
      wide
        .locator(AVATAR)
        .first()
        .evaluate((el: HTMLElement) => el.getBoundingClientRect().width),
    )
    .toBeGreaterThanOrEqual(32);
});

// ── #113: the sticky attribution holds in EVERY standard mode ─────────────────────────────────────
// The done-criterion is "all standard modes or a receipted per-mode exemption", so this is driven off
// the skin table itself: adding a chatStyle without deciding how its name row behaves fails HERE.
// No exemption is taken — every mode renders the name row as the same sibling above the bubble, so the
// same pin works for all eight (`ripple` already stickies its portrait beside it; the two coexist).

// Driven off the CONTRACTS tuple `MESSAGE_ROW_SKINS` is itself keyed by (`Record<ThemeChatStyle, …>`) —
// importing the skin table directly into a spec drags a second copy of the client module graph into the
// CT bundle and breaks its build; the tuple is the same axis with no such cost.
for (const chatStyle of THEME_CHAT_STYLES) {
  test(`#113 ${chatStyle}: a viewport-exceeding row makes its name row sticky without changing the row's height`, async ({ mount }) => {
    const bare = await mount(<MessageRowStory chatStyle={chatStyle} messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} />);
    const bareOuter = await nameRowOuterExtent(bare.locator(NAME_ROW));
    await expect(bare.locator(NAME_ROW)).toHaveCSS("position", "static");
    await bare.unmount();

    const stuck = await mount(
      <MessageRowStory chatStyle={chatStyle} messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} stickyAttribution={true} />,
    );
    await expect(stuck.locator(NAME_ROW)).toHaveCSS("position", "sticky");
    // One pixel above the scrollport edge: the pin detector reads a pinned header as a one-pixel top clip.
    await expect(stuck.locator(NAME_ROW)).toHaveCSS("top", "-1px");
    // …AND IT IS ACTUALLY RAISED (side-eye #102, 2026-08-17). The chrome shipped `z-raised`, which
    // generates NO utility — `--z-raised` is a plain custom property, not a `--z-index-*` theme entry —
    // so the class was inert, `snap` reported it as dead CSS on every drive, and the chip stuck at
    // `z-index: auto` over the prose it exists to sit above. Asserted as the resolved TOKEN, so this
    // cannot go green on any spelling that fails to resolve.
    const readRaisedAtAssertion = async (): Promise<typeof raised> =>
      await stuck.locator(NAME_ROW).evaluate((el: HTMLElement) => ({
        z: getComputedStyle(el).zIndex,
        token: getComputedStyle(document.documentElement).getPropertyValue("--z-raised").trim(),
      }));
    const raised = await stuck.locator(NAME_ROW).evaluate((el: HTMLElement) => ({
      z: getComputedStyle(el).zIndex,
      token: getComputedStyle(document.documentElement).getPropertyValue("--z-raised").trim(),
    }));
    await expect.poll(async () => (await readRaisedAtAssertion()).token).not.toBe("");
    await expect.poll(async () => (await readRaisedAtAssertion()).z).toBe(raised.token);
    // LAYOUT-NEUTRAL: the band's padding is cancelled and the inside header's minimum height stands in
    // BOTH arms (#1873), so the virtualizer's measured extent cannot move when the sticky verdict
    // lands — which happens AFTER measurement, so any change re-enters the verdict as its own input.
    // Both arms are read as OUTER extent (`nameRowOuterExtent`): the margins ARE the invariant.
    const stuckOuter = await nameRowOuterExtent(stuck.locator(NAME_ROW));
    expect(Math.abs(stuckOuter - bareOuter)).toBeLessThan(1);
  });
}

// ── ONE CARD AT REST: the band paints only while the header is pinned ──────────────────────────────
// The sticky verdict is true for every reply taller than the scrollport, including while its header sits
// at rest at the top of the reply. A band painted there drew a second object over the bubble: a strip in
// the reading-band tone, with base/speaker ink instead of the bubble's. At rest the header must be the
// container's own surface and ink, exactly like a short reply's. Once pinned over the prose, the band paints,
// and toggling it changes no box. RED on the pre-fix source: the at-rest header painted the band.
// The seven INSIDE skins: `tide`'s header is outside any container, and its `-my-row` box starts above the
// row, so in this flush mount it is already pinned at scroll 0.
for (const chatStyle of INSIDE_CHAT_STYLES) {
  test(`${chatStyle}: a long reply's header is unbacked at rest and backed once pinned, with no box change`, async ({ mount }) => {
    test.skip(chatStyle === "document", "the document page names nobody; its pinned chip is the designed-edges suite");
    const component = await mount(
      <MessageRowStory
        chatStyle={chatStyle}
        messageRole="assistant"
        characterId={ALICE_ID}
        participants={[alice()]}
        stickyAttribution={true}
        content={STUCK_BAND_BODY}
        width={360}
        scrollportHeight={STUCK_BAND_SCROLLPORT_PX}
      />,
    );
    const nameRow = component.locator(NAME_ROW);
    await expect(nameRow).toHaveCSS("position", "sticky");
    const paint = async (): Promise<{ readonly bg: string; readonly nameInk: string; readonly bubbleInk: string; readonly outer: number }> =>
      await nameRow.evaluate((el: HTMLElement) => {
        const cs = getComputedStyle(el);
        const name = el.querySelector("[data-slot='message-attribution'] *");
        const bubble = el.closest("[data-slot='message-bubble']");
        return {
          bg: cs.backgroundColor,
          nameInk: name === null ? "" : getComputedStyle(name).color,
          bubbleInk: bubble === null ? "" : getComputedStyle(bubble).color,
          outer: el.getBoundingClientRect().height + Number.parseFloat(cs.marginTop) + Number.parseFloat(cs.marginBottom),
        };
      });

    await expect(nameRow).not.toHaveAttribute("data-pinned");
    const rest = await paint();
    expect(rest.bg).toBe(TRANSPARENT);
    // Inside its container the header takes the container's own ink.
    expect(parseOklch(rest.nameInk)).toEqual(parseOklch(rest.bubbleInk));

    await pinHeader(component);
    const pinned = await paint();
    expect(pinned.bg).not.toBe(TRANSPARENT);
    expect(Math.abs(pinned.outer - rest.outer)).toBeLessThan(1);
  });
}

// ── #106: the chrome BELOW the bubble gets the wallpaper scrim ────────────────────────────────────
// The metadata row is a sibling UNDER the bubble box, outside any fill, in EVERY chatStyle — so over a
// bright wallpaper it rendered pale grey on white (the 2026-07-09 exemption of the "floating chrome" was
// measured under a DARK wallpaper and did not survive re-measurement). `BG_PHOTO_CHROME_PLATE` self-gates
// on the shell's `data-has-bg-image`, so both arms below are the same mount with and without that flag —
// which is also the planted control: if the assertion could not see the difference, the "no wallpaper"
// arm would not read transparent.

const BLUR_BACKDROP = /blur/;

async function metadataRowBackground(component: Locator): Promise<string> {
  return await component.locator(METADATA_ROW).evaluate((el: HTMLElement) => getComputedStyle(el).backgroundColor);
}

test("#106 metadata row: over a background photo it paints a scrim backing, not bare text on the wallpaper", async ({ mount, page }) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      characterId={ALICE_ID}
      participants={[alice()]}
      metadataVisibility={meta({ showTokenCount: true })}
    />,
  );
  // The shell stamps this on the grid; planting it on <body> is the same ANCESTOR the `in-*` variant reads.
  await page.evaluate(() => document.body.setAttribute("data-has-bg-image", ""));
  await expect.poll(async () => await metadataRowBackground(component)).not.toBe(TRANSPARENT);
  await expect(component.locator(METADATA_ROW)).toHaveCSS("backdrop-filter", BLUR_BACKDROP);
});

// ── #168: the pinned band OWNS ITS SLICE ───────────────────────────────────────────────────────────
// Owner, live 2026-08-18: the sticky attribution "lets some partial of the message you are on go above
// it". It shipped a translucent 60%-alpha overlay fill (the then-`bg-scrim`) — so the prose
// running under the pinned band stayed visible through it. These two mount a REAL bounded scrollport with
// a body several viewports tall (prose + a code block + a table + a blockquote, the shapes a real reply
// carries) and drive an actual scroll under the band.
for (const overArt of [false, true] as const) {
  test(`#168 ${overArt ? "over art" : "plain"}: the pinned band OCCLUDES the prose scrolling under it (its pixels do not move with the scroll)`, async ({
    mount,
    page,
  }) => {
    const row = (
      <MessageRowStory
        chatStyle="bubble"
        messageRole="assistant"
        characterId={ALICE_ID}
        participants={[alice()]}
        stickyAttribution={true}
        content={STUCK_BAND_BODY}
        width={360}
        scrollportHeight={STUCK_BAND_SCROLLPORT_PX}
      />
    );
    // The wallpaper arm is the mount the live receipt came from — and the one where a translucent chip
    // outranks a plain fill on specificity, so a fix that only covers the plain arm goes green here and
    // stays broken for the owner.
    const component = await mount(overArt ? <div data-has-bg-image="">{row}</div> : row);
    const port = overArt ? component.getByTestId("row-scrollport") : component;
    const nameRow = await pinHeader(port);
    await expect(nameRow).toHaveCSS("position", "sticky");

    // The comparison rect is the band's FULLY-OWNED region: since #204 the chip's height derives from
    // its text line, which is FRACTIONAL (≈32.25px at the label line-height; the old 50px was integral
    // only because the 34px action cluster set it). An element screenshot CEILS the rect, so its last
    // row lies past the band's own paint entirely — raw prose, no band pixel in it — and byte-equality
    // reads that sub-pixel rasterization edge as an occlusion failure (measured: exactly row 32 of 33
    // differed, unblended prose rgb). Flooring the height compares every row the band actually paints;
    // the sub-pixel bottom edge is not a slice the band can own on ANY fractional-height sticky.
    const box = await nameRow.boundingBox();
    if (box === null) {
      throw new Error("#168: the pinned band has no box");
    }
    const clip = { x: box.x, y: box.y, width: box.width, height: Math.floor(box.height) };
    const shotAt = async (top: number): Promise<Buffer> => {
      await port.evaluate((el: HTMLElement, y: number) => {
        el.scrollTop = y;
      }, top);
      await expect.poll(() => port.evaluate((el: HTMLElement) => el.scrollTop)).toBe(top);
      await expect(nameRow).toHaveAttribute("data-pinned", "");
      return await page.screenshot({ clip });
    };
    // Two scroll depths deep inside the same turn: the band's OWN content (name, timestamp, actions) is
    // byte-identical between them, so any pixel difference in its box is the message showing through it.
    const early = await shotAt(400);
    const late = await shotAt(900);
    expect(early.equals(late)).toBe(true);
  });
}

test("#168 FENCE (green before the fix): nothing in the row's content out-paints the pinned band", async ({ mount }) => {
  // #167 predicted #168's cause as a row-content sibling minting its own stacking context. Measured dead:
  // at four scroll depths, over prose + a code block + a table + a blockquote, the band wins the hit test
  // at every point of its own box. This is therefore a REGRESSION FENCE, not the defect proof above — it
  // is what keeps a future `transform`/`opacity`/`z-index` inside the bubble subtree from reopening #168
  // through the door #167 named.
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      characterId={ALICE_ID}
      participants={[alice()]}
      stickyAttribution={true}
      content={STUCK_BAND_BODY}
      width={360}
      scrollportHeight={STUCK_BAND_SCROLLPORT_PX}
    />,
  );
  await expect.poll(() => component.evaluate((el: HTMLElement) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(400);
  const nameRow = component.locator(NAME_ROW);
  for (const top of [200, 600, 1000, 1400]) {
    await component.evaluate((el: HTMLElement, y: number) => {
      el.scrollTop = y;
    }, top);
    await expect
      .poll(async () =>
        nameRow.evaluate((band: HTMLElement) => {
          const r = band.getBoundingClientRect();
          return [0.05, 0.5, 0.95].every((fy) => {
            const el = document.elementFromPoint(r.left + r.width * 0.5, r.top + r.height * fy);
            return el !== null && band.contains(el);
          });
        }),
      )
      .toBe(true);
  }
});

test("#106 CONTROL: with no background photo the same row is byte-identically bare (the scrim is inert)", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      characterId={ALICE_ID}
      participants={[alice()]}
      metadataVisibility={meta({ showTokenCount: true })}
    />,
  );
  expect(await metadataRowBackground(component)).toBe(TRANSPARENT);
  await expect(component.locator(METADATA_ROW)).toHaveCSS("backdrop-filter", "none");
});

// ── THE SWIPE FOOT: the message's own last line, per chat style (owner ruling, SillyTavern's inline swipe) ──
// ‹ sits at the container's leading edge and the count beside › at its trailing edge, as the message's own
// foot rather than a separate card under it. Each style decides where that foot lives (`RowSkin.swipeFoot`):
// inside the container for the seven single-container styles, under the train for tide. The count is the
// position and nothing else.
const SWIPE_STRIP = '[data-slot="swipe-strip"]';
const SWIPE_COUNTER_SLOT = '[data-slot="swipe-strip-counter"]';
const PAGER_COUNTER_TEXT = "2 / 3";
const SWIPE_BODY = "The pale light of the second moon slid across the courtyard flagstones, and Alice counted the guards again before she answered.";
/** The foot's container as the chevrons see it: its content box, i.e. its reading inset on each side. Echo's
 *  inset on the art side is its art pane and hush's leading edge is its stripe, which is why the law is
 *  stated against the container's own border and padding. */
function readFootContainer(foot: Locator): Promise<{ readonly contentLeft: number; readonly contentRight: number }> {
  return foot.evaluate((element) => {
    // Skip the strip's own wrapper: the container is the first ancestor that owns a reading inset, or the
    // content column for the one style (tide) whose foot sits under a train with no container.
    let parent = element.parentElement;
    while (parent !== null && Number.parseFloat(getComputedStyle(parent).paddingLeft) === 0 && parent.dataset["slot"] !== "message-content-column") {
      parent = parent.parentElement;
    }
    if (parent === null) {
      throw new Error("the swipe foot has no container");
    }
    const box = parent.getBoundingClientRect();
    const style = getComputedStyle(parent);
    const left = box.left + Number.parseFloat(style.borderLeftWidth) + Number.parseFloat(style.paddingLeft);
    const right = box.right - Number.parseFloat(style.borderRightWidth) - Number.parseFloat(style.paddingRight);
    return { contentLeft: left, contentRight: right };
  });
}

/** The trailing edge of the header bar's last action: where the foot's › must line up. */
async function headerActionsRight(component: Locator): Promise<number> {
  return await component.locator(`${NAME_ROW} ${ACTIONS_ROW}`).evaluate((row) => {
    const buttons = [...row.querySelectorAll("button")].filter((button) => getComputedStyle(button).display !== "none");
    return buttons.at(-1)?.getBoundingClientRect().right ?? Number.NaN;
  });
}

/** A computed background as comparable OKLCH, or the transparent sentinel. */
function parseOklchOrTransparent(value: string): unknown {
  return value === TRANSPARENT ? TRANSPARENT : parseOklch(value);
}

for (const chatStyle of THEME_CHAT_STYLES) {
  test(`the swipe foot sits at its container's edges and shows only the position (${chatStyle})`, async ({ mount, page }) => {
    await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.listMessageVariants": () => [] });
    const component = await mount(
      <MessageRowStory
        chatStyle={chatStyle}
        messageRole="assistant"
        showSwipes={true}
        characterId={ALICE_ID}
        participants={[alice()]}
        width={720}
        content={SWIPE_BODY}
      />,
    );
    const foot = component.locator(SWIPE_STRIP);
    await expect(foot).toHaveCount(1);
    // THE 0831 RULING: no label beside the count.
    await expect(foot).toHaveText(PAGER_COUNTER_TEXT);
    // Placement: the container's own last line, or under the train where there is no single container.
    const inside = await component.locator(`${BUBBLE} ${SWIPE_STRIP}`).count();
    expect(inside, "tide alone seats the foot under its train").toBe(chatStyle === "tide" ? 0 : 1);
    // One settled read of the whole arrangement, retried until the row has laid out.
    const footLaw = async (): Promise<Record<string, boolean>> => {
      const container = await readFootContainer(foot);
      const prev = await foot.getByRole("button", { name: VARIANT_PREV_NAME }).boundingBox();
      const next = await foot.getByRole("button", { name: VARIANT_NEXT_NAME }).boundingBox();
      const counter = await foot.locator(SWIPE_COUNTER_SLOT).boundingBox();
      const footBox = await foot.boundingBox();
      if (prev === null || next === null || counter === null || footBox === null) {
        return { rendered: false };
      }
      return {
        rendered: true,
        // ‹ and › sit on the container's reading inset, the same inset the header bar's actions sit on.
        leading: Math.abs(prev.x - container.contentLeft) < 1,
        trailing: Math.abs(next.x + next.width - container.contentRight) < 1,
        matchesHeader: Math.abs(next.x + next.width - (await headerActionsRight(component))) < 1,
        countBesideNext: counter.x > prev.x + prev.width && counter.x + counter.width <= next.x + 0.5,
        // One glyph line, not a card: the foot is as tall as its chevrons.
        oneLine: Math.abs(footBox.height - next.height) < 0.5,
      };
    };
    await expect.poll(footLaw).toEqual({ rendered: true, leading: true, trailing: true, matchesHeader: true, countBesideNext: true, oneLine: true });
    // Echo's foot rides the card's fill across the art pane; every other inside foot sits on its container.
    const fill = await foot.evaluate((el) => getComputedStyle(el).backgroundColor);
    // @orb-waive ct-no-oneshot-live-read-assert(expect): the foot law above polled the row to its settled layout; its fill is a static class.
    expect(parseOklchOrTransparent(fill)).toEqual(chatStyle === "echo" ? parseOklch(await cssVar(foot, "--color-ai-bubble")) : TRANSPARENT);
  });
}

test("over a wallpaper the bubble foot rides the bubble's own fill, and its count stays legible", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.listMessageVariants": () => [] });
  const component = await mount(
    <div data-has-bg-image="">
      <MessageRowStory chatStyle="bubble" messageRole="assistant" showSwipes={true} characterId={ALICE_ID} participants={[alice()]} />
    </div>,
  );
  const foot = component.locator(`${BUBBLE} ${SWIPE_STRIP}`);
  await expect(foot).toHaveCount(1);
  await expect(foot).toHaveCSS("background-color", TRANSPARENT);
  const counterContrast = await pixelContrast(page, foot.locator(SWIPE_COUNTER_SLOT));
  expect(counterContrast.ratio, counterContrast.describe).toBeGreaterThanOrEqual(4.5);
});

test("over a wallpaper tide's foot, which has no container, takes the opaque pager plate (#221)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.listMessageVariants": () => [] });
  const component = await mount(
    <div data-has-bg-image="">
      <MessageRowStory chatStyle="tide" messageRole="assistant" showSwipes={true} characterId={ALICE_ID} participants={[alice()]} />
    </div>,
  );
  const foot = component.locator(SWIPE_STRIP);
  await expect(foot).toHaveCount(1);
  const card = parseOklch(await cssVar(foot, "--color-card"));
  await expect.poll(async () => parseOklch(await foot.evaluate((el) => getComputedStyle(el).backgroundColor))).toEqual(card);
  const counterContrast = await pixelContrast(page, foot.locator(SWIPE_COUNTER_SLOT));
  expect(counterContrast.ratio, counterContrast.describe).toBeGreaterThanOrEqual(4.5);
});

test.describe("the swipe foot at a coarse pointer", () => {
  test.use({ hasTouch: true });

  // The chevrons are compact glyph boxes, so the finger's floor rides the glyph arm's hit-area pseudo.
  test("each chevron keeps a touch-floor hit area around its compact glyph", async ({ mount, page }) => {
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.listMessageVariants": () => [] });
    const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" showSwipes={true} content="Ok" width={360} />);
    const next = component.locator(SWIPE_STRIP).getByRole("button", { name: VARIANT_NEXT_NAME });
    const touchTarget = SNAPPED_LENGTH_BASE_PX["spacing.touch-target"];
    const hitSide = (): Promise<number> =>
      next.evaluate((el) => {
        const before = getComputedStyle(el, "::before");
        return Math.min(Number.parseFloat(before.width), Number.parseFloat(before.height));
      });
    await expect.poll(hitSide).toBeGreaterThanOrEqual(touchTarget - 0.5);
    // A short reply still contains its foot: neither chevron leaves the bubble.
    const bubble = await component.locator(BUBBLE).boundingBox();
    const prev = await component.locator(SWIPE_STRIP).getByRole("button", { name: VARIANT_PREV_NAME }).boundingBox();
    const nextBox = await next.boundingBox();
    expect(prev?.x ?? 0).toBeGreaterThanOrEqual((bubble?.x ?? 0) - 0.5);
    expect((nextBox?.x ?? 0) + (nextBox?.width ?? 0)).toBeLessThanOrEqual((bubble?.x ?? 0) + (bubble?.width ?? 0) + 0.5);
  });
});

// ── #220: THE MOBILE NAME BAND'S BUDGET — identity first, chrome second ──────────────────────────────
//
// MEASURED on --mobile (chats-rescore 2026-08-18): the speaker name held 65×49px — 16% of the band,
// wrapping to THREE lines — while the coarse-forced action cluster took 297px (73%) and "Generated by
// claude-sonnet-5" sat centre-stage between them. The affordances are right; the BUDGET is inverted, and
// it is the same mechanism the coarse collapse was minted for (`row-reveal.ts`): `REVEAL_AT_COARSE` turns
// every hover-revealed control permanently ON at a touch pointer, where each one is a ≥44px box.
//
// So this row takes the ruled collapse: Edit + Fork stand down at coarse (`ROW_ACTION_INLINE`) with the ⋯
// menu carrying both verbs at EVERY pointer (the chats row's mirror-parity ruling — one item, not a
// coarse-only twin), and the model CREDIT — a datum whose whole #167 ruling is "nothing at rest, name on
// hover" — stands down with them, because at a coarse pointer there is no hover for it to be revealed BY.
//
// `hasTouch: true` is what flips `matchMedia("(pointer: coarse)")` in chromium (`page.emulateMedia` has no
// `pointer` feature); the first assertion PROVES the emulation landed before any geometry is trusted.

const PHONE_BAND_WIDTH = 430;
const LONG_SPEAKER_NAME = "Calamity, Doomblade of the Ninth Epoch";
const HOSTED_MODEL = "claude-sonnet-5";

function calamity(): ParticipantView {
  return { ...alice(), displayName: LONG_SPEAKER_NAME };
}

/** The band's split: how much of the name row each cluster actually holds, and how many lines the name
 *  had to wrap to. One settled read — the cluster is opacity-revealed, never re-laid, so no poll. */
async function nameBandSplit(
  component: Locator,
): Promise<{ readonly band: number; readonly identity: number; readonly actions: number; readonly lines: number }> {
  return await component.locator(NAME_ROW).evaluate((el: HTMLElement) => {
    const identity = el.querySelector('[data-slot="message-attribution"]');
    const actions = el.querySelector('[data-slot="message-actions-row"]');
    const identityBox = identity === null ? null : identity.getBoundingClientRect();
    const lineHeight = identity === null ? 1 : Number.parseFloat(getComputedStyle(identity).lineHeight);
    return {
      band: el.getBoundingClientRect().width,
      identity: identityBox === null ? 0 : identityBox.width,
      actions: actions === null ? 0 : actions.getBoundingClientRect().width,
      lines: identityBox === null ? 0 : Math.round(identityBox.height / lineHeight),
    };
  });
}

test.describe("#220 coarse name band", () => {
  test.use({ hasTouch: true });

  test("the speaker name gets the band, not the action cluster (identity first at a phone width)", async ({ mount, page }) => {
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const component = await mount(
      <MessageRowStory
        chatStyle="flat"
        messageRole="assistant"
        characterId={ALICE_ID}
        participants={[calamity()]}
        model={HOSTED_MODEL}
        metadataVisibility={meta({ showModelIcon: true })}
        width={PHONE_BAND_WIDTH}
      />,
    );
    await expect(component.locator(ATTRIBUTION)).toBeVisible();

    const split = await nameBandSplit(component);
    // The name is the point of the band: it holds the MAJORITY of it (measured 16% pre-fix)…
    expect(split.identity / split.band).toBeGreaterThan(0.5);
    // …and reads as a name, not a paragraph (measured 3 wrapped lines pre-fix).
    expect(split.lines).toBeLessThanOrEqual(2);
    // …while the chrome that has to be reachable — the ⋯ menu — costs one touch target, not five
    // (measured 297px of 407 pre-fix).
    expect(split.actions).toBeLessThan(split.band / 3);
  });

  test("a phone's bar keeps Edit inline beside the ⋯, and the ⋯ still carries Edit and Fork", async ({ mount, page }) => {
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const component = await mount(
      <MessageRowStory chatStyle="flat" messageRole="assistant" characterId={ALICE_ID} participants={[calamity()]} width={PHONE_BAND_WIDTH} />,
    );
    // Edit is the one inline verb at a touch pointer; Fork stood down (`display:none`, so it leaves the
    // a11y tree too) and the menu is its one door.
    await expect(component.getByRole("button", { name: MESSAGE_EDIT_NAME })).toBeVisible();
    await expect(component.getByRole("button", { name: MESSAGE_FORK_NAME })).toBeHidden();

    await component.getByRole("button", { name: MESSAGE_ACTIONS_MENU_NAME }).click();
    await expect(page.getByRole("menuitem", { name: MESSAGE_EDIT_NAME })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: MESSAGE_FORK_NAME })).toBeVisible();
  });

  test("the model credit does not sit centre-stage on a phone (no hover to reveal it BY — #167)", async ({ mount, page }) => {
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const component = await mount(
      <MessageRowStory
        chatStyle="flat"
        messageRole="assistant"
        characterId={ALICE_ID}
        participants={[calamity()]}
        model={HOSTED_MODEL}
        metadataVisibility={meta({ showModelIcon: true })}
        width={PHONE_BAND_WIDTH}
      />,
    );
    await expect(component.locator(MODEL_SLOT)).toBeHidden();
  });
});

// ── #288: THE HEADER IS THE CONTAINER'S OWN HEADER ROW, NOT A PILL FLOATING ABOVE IT ───────────────
// Owner, three raisings and two evidence rounds (2026-08-19): "the split header from message thing".
// ST renders name + timestamp + actions INSIDE the bubble as its header row — ONE container; we rendered
// a name pill with its OWN backing above a separate bubble — TWO. The polarity report is the same
// mechanism seen from one side: the pill's #167 legibility chip dissolves into a dark room and reads as a
// hard second object over a light/art one.
//
// The fix is anatomical, so it is pinned anatomically: for every skin with a single container box the
// name row is a CHILD of `message-bubble`, and it carries NO backing of its own — the container's fill
// (or, over art, the container's plate) is what backs it. `tide` is the one skin with no single container
// (`bubbleLayout: "trains"` — N per-paragraph pills), and its ST reference also puts the name above the
// train, so it keeps the sibling row + the #167 chip. That split is declared in the skin table
// (`RowSkin.headerPlacement`), which is why this loop is driven off the same axis as the #113 one.
const HEADER_INSIDE_STYLES = ["bubble", "flat", "document", "echo", "whisper", "hush", "ripple"] as const;

for (const style of HEADER_INSIDE_STYLES) {
  test(`#288 ${style}: the name row is INSIDE the message container, not a sibling above it`, async ({ mount }) => {
    test.skip(style === "document", "the document page names nobody, as stock does; its own pins are the document block");
    const component = await mount(<MessageRowStory chatStyle={style} messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} />);
    // The header is a descendant of the container the body renders in …
    await expect(component.locator(BUBBLE).first().locator(NAME_ROW)).toHaveCount(1);
    // … and there is no second name row left floating in the column beside it (half a migration is rot).
    // Asserted as "not inside the bubble" rather than as a DIRECT child of the column: since #2425 the
    // speaker scope is the COLUMN's, so a themed row carries a `display: contents` wrapper between the two
    // and a `>` combinator would report the header as absent in every arm.
    await expect(component.locator(CONTENT_COLUMN).locator(NAME_ROW)).toHaveCount(1);
    await expect(component.locator(NAME_ROW)).toHaveCount(1);
    await expect(component.locator(NAME_ROW)).toContainText("Alice");
  });

  test(`#288 ${style} over art: the header takes NO backing of its own — the container backs it`, async ({ mount }) => {
    const component = await mount(
      <div data-has-bg-image="">
        <MessageRowStory chatStyle={style} messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} />
      </div>,
    );
    const nameRow = component.locator(NAME_ROW);
    // The second plate is GONE: no fill, no blur, no chip radius on the header itself …
    const readOwnAtAssertion = async (): Promise<typeof own> =>
      await nameRow.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, backdrop: cs.backdropFilter, radius: cs.borderTopLeftRadius };
      });
    const own = await nameRow.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, backdrop: cs.backdropFilter, radius: cs.borderTopLeftRadius };
    });
    await expect.poll(async () => (await readOwnAtAssertion()).bg).toBe(TRANSPARENT);
    await expect.poll(async () => (await readOwnAtAssertion()).backdrop).toBe("none");
    await expect.poll(async () => Number.parseFloat((await readOwnAtAssertion()).radius)).toBe(0);
    // … while the legibility GUARANTEE #167 minted is intact, one box out: the container the header now
    // lives in paints a real backing over the wallpaper.
    await expect
      .poll(async () =>
        component
          .locator(BUBBLE)
          .first()
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      )
      .not.toBe(TRANSPARENT);
  });
}

test("#288 tide keeps the sibling header + its chip — a train has no single container to be inside", async ({ mount }) => {
  const component = await mount(
    <div data-has-bg-image="">
      <MessageRowStory chatStyle="tide" messageRole="assistant" content={TIDE_TWO_PARAGRAPHS} characterId={ALICE_ID} participants={[alice()]} />
    </div>,
  );
  // In the column and NOT in any pill — `tide`'s header is the one that stayed a sibling above the box.
  // Not a `>` combinator: since #2425 the speaker scope wraps the column's header + bubble together
  // (`display: contents`), so the header is one wrapper below the column in every themed row.
  await expect(component.locator(CONTENT_COLUMN).locator(NAME_ROW)).toHaveCount(1);
  await expect(component.locator(BUBBLE).locator(NAME_ROW)).toHaveCount(0);
  const nameRow = component.locator(NAME_ROW);
  await expect
    .poll(async () => parseOklch(await nameRow.evaluate((el) => getComputedStyle(el).backgroundColor)))
    .toEqual(parseOklch(await cssVar(nameRow, "--color-reading-plate")));
});

// THE DARK CONTROL. The owner's dark rooms read fine today and are sacred, so the claim being pinned is
// not "it changed for the better" but "the header is on the SAME surface as the prose, in both
// polarities" — which is what makes the light arm stop reading as two objects without touching the dark
// one's tone. Measured through the rendered fill, never the class.
for (const theme of ["light", "mocha"] as const) {
  test(`#288 ${theme}: the header and the body paint on ONE surface (the container's own fill)`, async ({ mount }) => {
    const component = await mount(
      <div data-theme={theme}>
        <MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} />
      </div>,
    );
    const bubble = component.locator(BUBBLE).first();
    const nameRow = component.locator(NAME_ROW);
    await expect(bubble.locator(NAME_ROW)).toHaveCount(1);
    // The header paints nothing itself, so what is behind it IS the bubble fill — no second tone, on
    // either polarity. (`--color-ai-bubble` differs per seed; the assertion is the token, not a literal.)
    await expect.poll(async () => await nameRow.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(TRANSPARENT);
    await expect
      .poll(async () => parseOklch(await bubble.evaluate((el) => getComputedStyle(el).backgroundColor)))
      .toEqual(parseOklch(await cssVar(bubble, "--color-ai-bubble")));
  });
}

test("#935 custom-light inside headers inherit the role bubble's paired ink, not base/speaker ink", async ({ mount }) => {
  const tokens = {
    background: "oklch(0.97 0.004 80)",
    userBubble: { bg: "oklch(0.18 0.02 40)" },
    aiBubble: { bg: "oklch(0.21 0.02 250)" },
    speaker: "oklch(0.24 0.02 40)",
  } as const;
  const cases = [
    {
      role: "user" as const,
      row: (
        <MessageRowStory
          chatStyle="bubble"
          messageRole="user"
          personaId={ALEX_PERSONA_ID}
          personas={[{ id: ALEX_PERSONA_ID, name: "Traveler" }]}
          metadataVisibility={meta({ showTimestamps: true })}
        />
      ),
    },
    {
      role: "assistant" as const,
      row: (
        <MessageRowStory
          chatStyle="bubble"
          messageRole="assistant"
          characterId={ALICE_ID}
          participants={[{ ...alice(), themeOverride: { speaker: tokens.speaker } }]}
          metadataVisibility={meta({ showTimestamps: true })}
        />
      ),
    },
  ];

  for (const arm of cases) {
    // The real failing room carries wallpaper. That activates client globals' unlayered metadata step-up,
    // which outranks layered utilities and must itself narrow back to the inside bubble's paired ink.
    const component = await mount(
      <div data-has-bg-image="">
        <ThemeScope tokens={tokens}>{arm.row}</ThemeScope>
      </div>,
    );
    const bubble = component.locator(BUBBLE).first();
    // Assert the rendered carrier, not the relative-colour token's unresolved serialization. The bubble
    // is the surface and its computed `color` is the role-paired ink every nested header datum must ride.
    const expected = parseOklch(await bubble.evaluate((el) => getComputedStyle(el).color));
    const name = component.locator(`${ATTRIBUTION} span`).last();
    const timestamp = component.locator(TIMESTAMP);

    await expect.poll(async () => parseOklch(await name.evaluate((el) => getComputedStyle(el).color))).toEqual(expected);
    await expect.poll(async () => parseOklch(await timestamp.evaluate((el) => getComputedStyle(el).color))).toEqual(expected);
    await component.unmount();
  }
});

// ST's user-side header is MIRRORED (`datetime · name · actions`, packed to the trailing edge) — the
// report's :219 MINOR row. Taken here rather than deferred, but as PAINT: the identity cluster reverses
// with `flex-row-reverse`, so the DOM (and every assistive reading order) still names the SPEAKER first
// and the timestamp second, exactly as the assistant row does.
test("#288 a user row mirrors its header like the ST ref — time paints before the name, DOM order unchanged", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES });
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="user"
      personaId={ALEX_PERSONA_ID}
      personas={[{ id: ALEX_PERSONA_ID, name: "Alex" }]}
      metadataVisibility={meta({ showTimestamps: true })}
    />,
  );
  const nameBox = await component.locator(ATTRIBUTION).boundingBox();
  const timeBox = await component.locator(TIMESTAMP).boundingBox();
  expect(timeBox?.x ?? 0).toBeLessThan(nameBox?.x ?? 0);
  const headerBox = await component.locator(NAME_ROW).boundingBox();
  expect(Math.abs((nameBox?.x ?? 0) + (nameBox?.width ?? 0) - (headerBox?.x ?? 0) - (headerBox?.width ?? 0))).toBeLessThan(1);
  // The a11y order is the one that did NOT flip: the speaker still comes first in the tree.
  await expect
    .poll(async () =>
      component
        .locator(NAME_ROW)
        .evaluate((el) =>
          [...el.querySelectorAll('[data-slot="message-attribution"], [data-slot="message-metadata-timestamp"]')].map((n) => n.getAttribute("data-slot")),
        ),
    )
    .toEqual(["message-attribution", "message-metadata-timestamp"]);
});

test("#288 an assistant row is NOT mirrored — name then time, leading edge (the ST character side)", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      characterId={ALICE_ID}
      participants={[alice()]}
      metadataVisibility={meta({ showTimestamps: true })}
    />,
  );
  const nameBox = await component.locator(ATTRIBUTION).boundingBox();
  const timeBox = await component.locator(TIMESTAMP).boundingBox();
  expect(nameBox?.x ?? 0).toBeLessThan(timeBox?.x ?? 0);
});

// The FINE arm is untouched: the same row at the same width still offers Edit + Fork inline, so the
// collapse is a pointer answer and not a width one (and the desktop pins above keep holding).
test("#220 at a FINE pointer the inline Edit/Fork pair is untouched", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory chatStyle="flat" messageRole="assistant" characterId={ALICE_ID} participants={[calamity()]} width={PHONE_BAND_WIDTH} />,
  );
  await expect(component.getByRole("button", { name: MESSAGE_EDIT_NAME })).toBeVisible();
  await expect(component.getByRole("button", { name: MESSAGE_FORK_NAME })).toBeVisible();
});

// ── #1728 arm B: WHERE THE READING COLUMN SITS IN ITS ROW (owner ruling 2026-09-05) ─────────────────
// The defect: the CENTRED skins (`flat`/`hush` via `flatOuter`, and `document`) centred the row BODY —
// chip plus column as one unit — so the prose sat off-centre by the chip and SLID when a reader toggled
// `appearance.showInChatAvatars`. Measured on the unmodified source at a 1280px row, the column spanned
// 285..1035 (285 left / 245 right) with avatars on and 265/265 with them off; at 1024 it read 157/117
// against 137/137. The fix seats the column in the MIDDLE rail of `@orb/ui`'s `gutterCentred` tracks so
// it centres on its own and the chip hangs in the rail beside it — the avatar stays a SIBLING of the
// column, so §B.1 is intact and only the placement mechanism changed.
//
// EACH ARM IS ITS OWN TEST WITH ONE MOUNT AND ONE STORY REFERENCE, twice-forced: playwright-ct refuses a
// second `mount()` in a test ("Attempting to mount a component into a container that already has a React
// root"), and `ct-story-single-import` refuses a second reference to the same story in one JSX tree. The
// "does not slide on toggle" claim is therefore proved as TWO symmetry facts rather than as an A/B diff:
// symmetric with avatars ON and symmetric with them OFF is the same statement as "identical", and it is
// the stronger one to pin because it also names where the column should be.
const READING_COLUMN = '[data-slot="message-content-column"]';
/** The `@4xl` container step the row's two placement arms meet at (56rem at the 16px root). */
const GUTTER_CROSSOVER_PX = 896;
/** Long enough that the column reaches its `--reading-measure` cap at every width under test. */
const MEASURE_FILLING_BODY =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.";

/** The column's inset from each edge of its ROW, in whole pixels, read off the RENDERED boxes (never a
 *  class string) so it fails against the unmodified source rather than against a missing API. */
async function readingColumnInsets(component: Locator): Promise<readonly [number, number]> {
  return await component.evaluate((root): readonly [number, number] => {
    const row = root.querySelector('[data-slot="message-row"]');
    const column = root.querySelector('[data-slot="message-content-column"]');
    if (row === null || column === null) {
      return [Number.NaN, Number.NaN];
    }
    const r = row.getBoundingClientRect();
    const c = column.getBoundingClientRect();
    return [Math.round(c.left - r.left), Math.round(r.right - c.right)];
  });
}

for (const chatStyle of ["flat", "document"] as const) {
  for (const width of [GUTTER_CROSSOVER_PX, 1024, 1280]) {
    for (const avatars of [true, false]) {
      test(`#1728: ${chatStyle} centres the reading column at ${String(width)}px with avatars ${avatars ? "ON" : "OFF"}`, async ({ mount }) => {
        const component = await mount(
          <MessageRowStory
            width={width}
            chatStyle={chatStyle}
            messageRole="assistant"
            content={MEASURE_FILLING_BODY}
            characterId={ALICE_ID}
            participants={[alice()]}
            showInChatAvatars={avatars}
          />,
        );
        await expect(component.locator(READING_COLUMN)).toBeVisible();
        // Polled, not a one-shot live read: the row measures itself and its container query resolves
        // after mount, so a single sample can catch the pre-resolution box (the DEF-14 class).
        await expect.poll(async () => (await readingColumnInsets(component))[0]).toBe((await readingColumnInsets(component))[1]);
      });
    }
  }
}

test("#1728: the bubble skin KEEPS its edge-anchored identity gutter at a desktop width", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory
      width={1280}
      chatStyle="bubble"
      messageRole="assistant"
      content={MEASURE_FILLING_BODY}
      characterId={ALICE_ID}
      participants={[alice()]}
      showInChatAvatars={true}
    />,
  );
  await expect(component.locator(READING_COLUMN)).toBeVisible();
  // The 40px `avatar-lg` chip + its 8px `spacing.row` gap.
  await expect.poll(async () => (await readingColumnInsets(component))[0]).toBe(48);
});

test("#1728: the bubble skin KEEPS its edge-anchored identity gutter at a phone width", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory
      width={320}
      chatStyle="bubble"
      messageRole="assistant"
      content={MEASURE_FILLING_BODY}
      characterId={ALICE_ID}
      participants={[alice()]}
      showInChatAvatars={true}
    />,
  );
  await expect(component.locator(READING_COLUMN)).toBeVisible();
  // The chip keeps its 40px on a phone; the row's own `@max-md` step tightens only the gap, to `spacing.field`.
  await expect.poll(async () => (await readingColumnInsets(component))[0]).toBe(46);
});

test("#1728: below the crossover the centred skins keep the IN-FLOW gutter", async ({ mount }) => {
  // 768px is inside the band where the column already fills the track: there is no margin for a chip to
  // hang in, so arm B must not engage. Arm B applies where a margin EXISTS, and where the track is the
  // viewport it cannot — a fact of the ruling's input rather than a deviation from it.
  const component = await mount(
    <MessageRowStory
      width={768}
      chatStyle="flat"
      messageRole="assistant"
      content={MEASURE_FILLING_BODY}
      characterId={ALICE_ID}
      participants={[alice()]}
      showInChatAvatars={true}
    />,
  );
  await expect(component.locator(READING_COLUMN)).toBeVisible();
  await expect.poll(async () => (await readingColumnInsets(component))[0]).toBe(48);
  await expect.poll(async () => (await readingColumnInsets(component))[1]).toBe(0);
});

// ── THE MESSAGE'S DESIGNED TOP EDGE: the pinned header bar, per chat style ───────────────────────────
// A long reply's header pins as one compact bar in the row's OWN surface: the cards' role fill, tide's pill,
// the reading band for the unboxed styles, and a trailing actions chip for the document page, which names
// nobody. Below the bar its surface fades out, so the line passing under the bar's edge dissolves instead of
// being cut, and the bar lets go where the message ends. The bar's paint is `RowSkin.pinnedHeader`.

type ChatStyle = (typeof THEME_CHAT_STYLES)[number];

/** The surface each style's pinned bar paints, and the ink paired with it. */
const PINNED_SURFACE: Record<ChatStyle, { readonly fill: string; readonly ink: string }> = {
  bubble: { fill: "--color-ai-bubble", ink: "--color-ai-bubble-foreground" },
  echo: { fill: "--color-ai-bubble", ink: "--color-ai-bubble-foreground" },
  whisper: { fill: "--color-ai-bubble", ink: "--color-ai-bubble-foreground" },
  ripple: { fill: "--color-ai-bubble", ink: "--color-ai-bubble-foreground" },
  tide: { fill: "--color-ai-bubble", ink: "--color-ai-bubble-foreground" },
  flat: { fill: "--color-reading-band", ink: "--color-reading-plate-foreground" },
  hush: { fill: "--color-reading-band", ink: "--color-reading-plate-foreground" },
  document: { fill: "--color-reading-band", ink: "--color-reading-plate-foreground" },
};

/** How far the bar reaches: across the whole surface it pins in, a chip at the surface's trailing inset
 *  (document), or within the content column (tide, whose bar is a pill above its train). */
const PINNED_REACH: Record<ChatStyle, "surface" | "chip" | "column"> = {
  bubble: "surface",
  echo: "surface",
  whisper: "surface",
  ripple: "surface",
  flat: "surface",
  hush: "surface",
  document: "chip",
  tide: "column",
};

interface PinnedBarRead {
  readonly left: number;
  readonly right: number;
  readonly height: number;
  readonly surfaceLeft: number;
  readonly surfaceRight: number;
  readonly surfaceContentRight: number;
  readonly fade: string;
  readonly fadeHeight: number;
  readonly compactPx: number;
}

// The bar against the surface it pins in (its parent's padding box), plus its fade and the compact ceiling:
// one glyph box plus one row step, a single line of chrome with its breathing.
function readPinnedBar(bar: Locator): Promise<PinnedBarRead> {
  return bar.evaluate((el: HTMLElement) => {
    // The surface is the nearest box: a themed speaker scope wraps the bar in a `display: contents` layer.
    let parent = el.parentElement;
    while (parent !== null && getComputedStyle(parent).display === "contents") {
      parent = parent.parentElement;
    }
    if (parent === null) {
      throw new Error("the pinned bar has no surface");
    }
    const box = el.getBoundingClientRect();
    const surface = parent.getBoundingClientRect();
    const surfaceStyle = getComputedStyle(parent);
    const fade = getComputedStyle(el, "::after");
    const probe = document.createElement("div");
    probe.style.height = "calc(var(--spacing-glyph-lg) + var(--spacing-row))";
    document.body.append(probe);
    const compactPx = probe.getBoundingClientRect().height;
    probe.remove();
    const surfaceLeft = surface.left + parent.clientLeft;
    const surfaceRight = surfaceLeft + parent.clientWidth;
    return {
      left: box.left,
      right: box.right,
      height: box.height,
      surfaceLeft,
      surfaceRight,
      surfaceContentRight: surfaceRight - Number.parseFloat(surfaceStyle.paddingRight),
      fade: fade.content === "none" ? "none" : fade.backgroundImage,
      fadeHeight: fade.content === "none" ? 0 : Number.parseFloat(fade.height),
      compactPx,
    };
  });
}

function reachHolds(reach: "surface" | "chip" | "column", bar: PinnedBarRead): boolean {
  if (reach === "surface") {
    return Math.abs(bar.left - bar.surfaceLeft) < 1 && Math.abs(bar.right - bar.surfaceRight) < 1;
  }
  if (reach === "chip") {
    return Math.abs(bar.right - bar.surfaceContentRight) < 1 && bar.right - bar.left < (bar.surfaceRight - bar.surfaceLeft) / 2;
  }
  return bar.left >= bar.surfaceLeft - 1 && bar.right <= bar.surfaceRight + 1;
}

for (const chatStyle of THEME_CHAT_STYLES) {
  test(`${chatStyle}: the pinned bar is the row's own surface, one compact line, fading below`, async ({ mount }) => {
    const component = await mount(pinnableRow(chatStyle, alice()));
    const bar = await pinHeader(component);
    const surface = PINNED_SURFACE[chatStyle];
    await expect
      .poll(async () => parseOklch(await bar.evaluate((el) => getComputedStyle(el).backgroundColor)))
      .toEqual(parseOklch(await cssVar(bar, surface.fill)));
    await expect.poll(async () => parseOklch(await bar.evaluate((el) => getComputedStyle(el).color))).toEqual(parseOklch(await cssVar(bar, surface.ink)));
    const read = await readPinnedBar(bar);
    expect({
      reach: reachHolds(PINNED_REACH[chatStyle], read),
      compact: read.height <= read.compactPx,
      // The chip is small enough to sit over the page; every bar that spans its surface fades below.
      fades: read.fade.startsWith("linear-gradient") && read.fadeHeight > 0,
    }).toEqual({ reach: true, compact: true, fades: chatStyle !== "document" });
  });

  test(`${chatStyle}: the pinned bar lets go where the message ends`, async ({ mount }) => {
    const component = await mount(pinnableRow(chatStyle, alice()));
    const bar = await pinHeader(component);
    // The rows that follow in a real transcript, so the message's end can scroll up past the scrollport top.
    const geometry = await component.evaluate((port: HTMLElement) => {
      const row = port.querySelector('[data-slot="message-row"]');
      if (row === null) {
        throw new Error("no row to scroll past");
      }
      const spacer = document.createElement("div");
      spacer.style.cssText = `height:${String(port.clientHeight * 2)}px;flex-shrink:0`;
      row.after(spacer);
      const portTop = port.getBoundingClientRect().top;
      // Park the message's last pixels just under the scrollport top.
      port.scrollTop += row.getBoundingClientRect().bottom - portTop - 4;
      return { portTop, rowBottom: row.getBoundingClientRect().bottom };
    });
    const released = await bar.evaluate((el: HTMLElement) => {
      const parent = el.parentElement as HTMLElement;
      const surface = parent.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return { barTop: box.top, surfaceBottom: surface.bottom };
    });
    // It travelled up with the message end instead of staying pinned over the next message.
    expect(released.barTop, JSON.stringify({ ...geometry, ...released })).toBeLessThan(geometry.portTop - 1);
  });

  test(`${chatStyle}: the actions ride the header bar, one actions surface per row, name before actions`, async ({ mount }) => {
    const component = await mount(
      <MessageRowStory chatStyle={chatStyle} messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} lastRow={true} />,
    );
    await expect(component.locator(ACTIONS_ROW)).toHaveCount(1);
    await expect(component.locator(`${NAME_ROW} ${ACTIONS_ROW}`)).toHaveCount(1);
    // The last row shows its actions at rest.
    await expect(component.locator(ACTIONS_ROW)).toHaveCSS("opacity", "1");
    // Keyboard order is DOM order (nothing here carries a positive tabindex): the speaker, then the actions.
    const order = await component.locator(NAME_ROW).evaluate((bar) => {
      const name = bar.querySelector('[data-slot="message-attribution"]');
      const action = bar.querySelector('[data-slot="message-actions-row"] button');
      if (action === null) {
        return "no actions";
      }
      if (name === null) {
        return "actions only";
      }
      const all = [...bar.querySelectorAll("*")];
      return all.indexOf(name) < all.indexOf(action) ? "name, then actions" : "actions, then name";
    });
    // @orb-waive ct-no-oneshot-live-read-assert(expect): DOM order is fixed at render, and the actions' settled opacity was awaited above.
    expect(order).toBe(chatStyle === "document" ? "actions only" : "name, then actions");
  });
}

// ── THE STOCK DOCUMENT PAGE ──────────────────────────────────────────────────────────────────────────────
test.describe("the stock document page", () => {
  test("names nobody — no avatar, name or timestamp — and the page runs the full column", async ({ mount }) => {
    const component = await mount(
      <MessageRowStory
        chatStyle="document"
        messageRole="user"
        personaId={ALEX_PERSONA_ID}
        personas={[{ id: ALEX_PERSONA_ID, name: "Alex" }]}
        metadataVisibility={meta({ showTimestamps: true })}
        content={MEASURE_FILLING_BODY}
        width={1024}
      />,
    );
    await expect(component.locator(AVATAR)).toHaveCount(0);
    await expect(component.locator(ATTRIBUTION)).toHaveCount(0);
    await expect(component.locator(TIMESTAMP)).toHaveCount(0);
    const widths = await component.locator(BUBBLE).evaluate((bubble: HTMLElement) => {
      const column = bubble.closest('[data-slot="message-content-column"]') as HTMLElement;
      return { bubble: bubble.getBoundingClientRect().width, column: column.getBoundingClientRect().width };
    });
    expect(Math.abs(widths.bubble - widths.column)).toBeLessThan(1);
  });

  test("an earlier row's bar costs no height and its actions wait for hover or focus, even on a phone", async ({ mount, page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const component = await mount(<MessageRowStory chatStyle="document" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} />);
    expect(await nameRowOuterExtent(component.locator(NAME_ROW))).toBeLessThan(1);
    await expect(component.locator(ACTIONS_ROW)).toHaveCSS("opacity", "0");
    await component.getByRole("button", { name: MESSAGE_EDIT_NAME }).focus();
    await expect(component.locator(ACTIONS_ROW)).toHaveCSS("opacity", "1");
  });

  test("the last row's bar takes its own line above the page, with the actions shown", async ({ mount }) => {
    const component = await mount(
      <MessageRowStory chatStyle="document" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} lastRow={true} />,
    );
    await expect(component.locator(ACTIONS_ROW)).toHaveCSS("opacity", "1");
    await expect
      .poll(() =>
        component.locator(NAME_ROW).evaluate((bar: HTMLElement) => {
          const barBottom = bar.getBoundingClientRect().bottom;
          return (bar.nextElementSibling as HTMLElement).getBoundingClientRect().top >= barBottom - 0.5;
        }),
      )
      .toBe(true);
  });
});

test.describe("document actions at a touch pointer", () => {
  test.use({ hasTouch: true });

  test("an earlier row keeps its actions hidden at a touch pointer, as stock does", async ({ mount, page }) => {
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const component = await mount(<MessageRowStory chatStyle="document" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} />);
    await expect(component.locator(ACTIONS_ROW)).toHaveCSS("opacity", "0");
  });
});

// ── THE MESSAGE'S DESIGNED BOTTOM EDGE: the swipe foot's two quieter cases ─────────────────────────────
test("an earlier swiped reply shows its count alone, a quiet foot with no chevrons", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, "chat.listMessageVariants": () => [] });
  const component = await mount(
    <MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} variantCount={3} />,
  );
  const count = component.locator('[data-slot="swipe-count"]');
  await expect(count).toHaveText("1 / 3");
  await expect(count.getByRole("button")).toHaveCount(0);
  await expect(component.locator(SWIPE_STRIP)).toHaveCount(0);
});

test.describe("a short reply at a touch pointer", () => {
  test.use({ hasTouch: true });

  test("its swipe foot never sets the bubble's width: the bubble is as wide as its header", async ({ mount, page }) => {
    await routeTrpc(page, {
      ...CHAT_AMBIENT_ROUTES,
      ...CHAT_ROOM_ROUTES,
      "chat.listMessageVariants": () => [
        { variantId: "msgvar_hi_0", idx: 0 },
        { variantId: "msgvar_hi_1", idx: 1 },
        { variantId: "msgvar_hi_2", idx: 2 },
      ],
    });
    const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" content="Hi." showSwipes={true} width={390} />);
    const read = (): Promise<{ readonly content: number; readonly header: number; readonly footNatural: number }> =>
      component.locator(BUBBLE).evaluate((bubble: HTMLElement) => {
        const style = getComputedStyle(bubble);
        const bar = bubble.querySelector('[data-slot="message-name-row"]') as HTMLElement;
        const barGap = Number.parseFloat(getComputedStyle(bar).columnGap) || 0;
        const barParts = [...bar.children].filter((child) => getComputedStyle(child).display !== "none");
        const header = barParts.reduce((sum, child) => sum + child.getBoundingClientRect().width, 0) + barGap * Math.max(0, barParts.length - 1);
        const foot = bubble.querySelector('[data-slot="swipe-strip"]') as HTMLElement;
        const footNatural = [...foot.children].reduce((sum, child) => sum + child.getBoundingClientRect().width, 0);
        return {
          content: bubble.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight),
          header,
          footNatural,
        };
      });
    // The guard that makes this a real claim: the foot's own glyphs are wider than the header's.
    await expect
      .poll(async () => {
        const g = await read();
        return { footWiderThanHeader: g.footNatural > g.header, bubbleHugsHeader: Math.abs(g.content - g.header) < 1 };
      })
      .toEqual({ footWiderThanHeader: true, bubbleHugsHeader: true });
  });
});

// ── WIDE CONTENT SCROLLS INSIDE ITS MESSAGE, PER STYLE, AT A PHONE WIDTH ──────────────────────────────
const WIDE_CODE = `\`\`\`\n${"const aVeryLongIdentifierThatWillNotWrap = 1; ".repeat(8)}\n\`\`\``;

for (const chatStyle of THEME_CHAT_STYLES) {
  test(`${chatStyle}: a wide code block scrolls inside the message and never widens the row at 390px`, async ({ mount }) => {
    const component = await mount(
      <MessageRowStory chatStyle={chatStyle} messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} content={WIDE_CODE} width={390} />,
    );
    await expect(component.locator("pre").first()).toBeVisible();
    await expect
      .poll(() =>
        component.evaluate((port: HTMLElement) => {
          const row = port.querySelector('[data-slot="message-row"]') as HTMLElement;
          const pre = port.querySelector("pre") as HTMLElement;
          return { rowFits: row.scrollWidth <= port.clientWidth + 1, preScrolls: pre.scrollWidth > pre.clientWidth };
        }),
      )
      .toEqual({ rowFits: true, preScrolls: true });
  });
}
