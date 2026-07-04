// CT: the chatStyle variant mechanism — ONE MessageRow surface, three appearances driven by the skin
// table (§12.1). Asserts each style paints the right TOKEN utilities (the token NAME is stable + IS the
// mechanism; not a hardcoded oklch literal — the §13.7 spirit) and that the markdown body renders.
// Also covers #21 attribution chrome (name/avatar/color resolved from server-stamped ids, never body
// text) and its additive default: a row with no roster/persona maps threaded renders NO chrome at all,
// same as pre-#21 — the existing chatStyle assertions above never pass those props, so they double as
// a regression check for that default.

import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { MessageRowStory } from "../_ct-stories";

const AI_BUBBLE = /bg-ai-bubble/u;
const USER_BUBBLE = /bg-user-bubble/u;
const PROSE_BODY = /text-prose-body/u;
const FULL_WIDTH = /w-full/u;
const ALIGN_END = /items-end/u;

const BUBBLE = '[data-slot="message-bubble"]';
const ROW = '[data-slot="message-row"]';
const ATTRIBUTION = '[data-slot="message-attribution"]';
const THEME_SCOPE = '[data-slot="theme-scope"]';

const ALICE_ID = castId<CharacterId>("char_alice");
const BOB_ID = castId<CharacterId>("char_bob");
const NATE_PERSONA_ID = castId<PersonaId>("persona_nate");

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
  };
}

function bob(): ParticipantView {
  return { ...alice(), id: castId("participant_bob"), characterId: BOB_ID, displayName: "Bob" };
}

test("bubble style tints the assistant bubble with the ai-bubble token", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" />);
  await expect(component.locator(BUBBLE)).toHaveClass(AI_BUBBLE);
  await expect(component.locator(ROW)).toHaveAttribute("data-role", "assistant");
});

test("bubble style tints a user row with the user-bubble token + right-alignment", async ({
  mount,
}) => {
  const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="user" />);
  await expect(component.locator(BUBBLE)).toHaveClass(USER_BUBBLE);
  await expect(component.locator(ROW)).toHaveClass(ALIGN_END);
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

test("no roster/persona maps threaded: no attribution chrome at all (pre-#21 default)", async ({
  mount,
}) => {
  const component = await mount(
    <MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={ALICE_ID} />,
  );
  await expect(component.locator(ATTRIBUTION)).toHaveCount(0);
  await expect(component.locator(THEME_SCOPE)).toHaveCount(0);
});

test("assistant row resolves name from the roster + colors the bubble via ThemeScope", async ({
  mount,
}) => {
  // Arrays, not a `Map`: a `Map`/`Set` prop does not survive the Playwright CT serialization
  // boundary (arrives empty, no error) — `MessageRowStory` builds the `Map` post-mount instead.
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      characterId={ALICE_ID}
      participants={[alice()]}
    />,
  );
  await expect(component.locator(ATTRIBUTION)).toContainText("Alice");
  await expect(component.locator(THEME_SCOPE)).toHaveCount(1);
});

test("a null characterId in a multi-character room shows a neutral Narrator, uncolored", async ({
  mount,
}) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      characterId={null}
      participants={[alice(), bob()]}
    />,
  );
  await expect(component.locator(ATTRIBUTION)).toContainText("Narrator");
  await expect(component.locator(THEME_SCOPE)).toHaveCount(0);
});

test("user row resolves the message's personaId against the persona library", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="user"
      personaId={NATE_PERSONA_ID}
      personas={[{ id: NATE_PERSONA_ID, name: "Nate", avatarAssetId: null }]}
    />,
  );
  await expect(component.locator(ATTRIBUTION)).toContainText("Nate");
  // User-row attribution carries no color wrap — the per-role user-bubble token owns that already.
  await expect(component.locator(THEME_SCOPE)).toHaveCount(0);
});
