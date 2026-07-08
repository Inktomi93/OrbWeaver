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
const SPEAKER_ACCENT_RE = /text-speaker/u;

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
    avatarHash: null,
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
  // TWO ThemeScopes now (UIP-304): one (display:contents) tints the speaker NAME with `--color-speaker`
  // (the accent), one wraps the bubble CONTENT — both from the same per-character `attribution.tokens`.
  await expect(component.locator(THEME_SCOPE)).toHaveCount(2);
  // The speaker name carries the accent color hook.
  await expect(component.locator(ATTRIBUTION).getByText("Alice")).toHaveClass(SPEAKER_ACCENT_RE);
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

test("user row resolves the message's personaId against the macro-name producer", async ({
  mount,
}) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="user"
      personaId={NATE_PERSONA_ID}
      personas={[{ id: NATE_PERSONA_ID, name: "Nate" }]}
    />,
  );
  await expect(component.locator(ATTRIBUTION)).toContainText("Nate");
  // User-row attribution carries no color wrap — the per-role user-bubble token owns that already.
  await expect(component.locator(THEME_SCOPE)).toHaveCount(0);
});

// ── #31 appearance: showInChatAvatars gates ONLY the avatar image (the name survives) ─────────────

const AVATAR = '[data-slot="avatar-root"]';

test("showInChatAvatars=false hides the avatar image but KEEPS the speaker name", async ({
  mount,
}) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      characterId={ALICE_ID}
      participants={[alice()]}
      showInChatAvatars={false}
    />,
  );
  // The attribution row + name stay; only the avatar image is dropped (ST "show avatars" parity).
  await expect(component.locator(ATTRIBUTION)).toContainText("Alice");
  await expect(component.locator(AVATAR)).toHaveCount(0);
});

test("showInChatAvatars=true (default) renders the attribution avatar", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      characterId={ALICE_ID}
      participants={[alice()]}
      showInChatAvatars={true}
    />,
  );
  await expect(component.locator(ATTRIBUTION)).toContainText("Alice");
  await expect(component.locator(AVATAR)).toHaveCount(1);
});

// ── §B.1 message-row redesign: avatar-LEFT, a sibling of the content column ────────────────────────

const ROW_BODY = '[data-slot="message-row-body"]';
const CONTENT_COLUMN = '[data-slot="message-content-column"]';
const NAME_ROW = '[data-slot="message-name-row"]';

test("the avatar is a SIBLING of the content column, never nested inside the name row (§B.1)", async ({
  mount,
}) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      characterId={ALICE_ID}
      participants={[alice()]}
    />,
  );
  const body = component.locator(ROW_BODY);
  // The avatar is a direct child of the row-body, a sibling of the content column — not a descendant
  // of the name row (which holds only the name-group + actions).
  await expect(body.locator(`> ${AVATAR}`)).toHaveCount(1);
  await expect(component.locator(NAME_ROW).locator(AVATAR)).toHaveCount(0);
  // Name + actions share ONE row atop the content column.
  await expect(component.locator(`${NAME_ROW}:has-text("Alice")`)).toHaveCount(1);
});

test("assistant avatar sits BEFORE the content column; a user row mirrors it AFTER (§B.1 own-message mirroring)", async ({
  mount,
}) => {
  const assistant = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      characterId={ALICE_ID}
      participants={[alice()]}
    />,
  );
  const assistantChildren = assistant.locator(`${ROW_BODY} > *`);
  await expect(assistantChildren.first()).toHaveAttribute("data-slot", "avatar-root");
  await expect(assistantChildren.last()).toHaveAttribute("data-slot", "message-content-column");

  const user = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="user"
      personaId={NATE_PERSONA_ID}
      personas={[{ id: NATE_PERSONA_ID, name: "Nate" }]}
    />,
  );
  const userChildren = user.locator(`${ROW_BODY} > *`);
  await expect(userChildren.first()).toHaveAttribute("data-slot", "message-content-column");
  await expect(userChildren.last()).toHaveAttribute("data-slot", "avatar-root");
});

test("avatars-off drops the avatar element entirely; the content column is unaffected (§B.1)", async ({
  mount,
}) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      characterId={ALICE_ID}
      participants={[alice()]}
      showInChatAvatars={false}
    />,
  );
  await expect(component.locator(AVATAR)).toHaveCount(0);
  // The name + actions structure is untouched — only the row's leading slot is gone.
  await expect(component.locator(CONTENT_COLUMN)).toHaveCount(1);
  await expect(component.locator(ATTRIBUTION)).toContainText("Alice");
});

test("avatarShape=rounded / avatarAspect=portrait / avatarRing=accent thread through to the avatar (§B.3)", async ({
  mount,
}) => {
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
  await expect(root).toHaveCSS("border-radius", "10px"); // rounded = --radius-card
  await expect(root).toHaveCSS("aspect-ratio", "2 / 3");
  const boxShadow = await root.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(boxShadow).not.toBe("none");
});

// ── Macro DISPLAY pass (the `{{char}}`/`{{user}}` bug) ─────────────────────────────────────────────

test("a message with {{char}}/{{user}} resolves real names once the roster + active persona are threaded", async ({
  mount,
}) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      content="{{char}} waves at {{user}}."
      characterId={ALICE_ID}
      participants={[alice()]}
      personas={[{ id: NATE_PERSONA_ID, name: "Nate" }]}
      activePersonaId={NATE_PERSONA_ID}
    />,
  );
  await expect(component.getByText("Alice waves at Nate.")).toBeVisible();
  await expect(component.getByText("{{char}}", { exact: false })).toHaveCount(0);
  await expect(component.getByText("{{user}}", { exact: false })).toHaveCount(0);
});

// The row's OWN stamps are what the atom resolves against — not "whoever is speaking right now" — so a
// row stamped for a DIFFERENT cast member than the turn's current speaker still resolves to ITS OWN
// speaker (Chat-Macro-Resolution.md §2's "a past line by Aria stays Aria" rule).
test("a row's own characterId wins over another roster member also present", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      content="{{char}} nods."
      characterId={BOB_ID}
      participants={[alice(), bob()]}
    />,
  );
  await expect(component.getByText("Bob nods.")).toBeVisible();
});

test("no roster/persona threaded: {{char}}/{{user}} resolve to the kit floor ('Character'/'User'), never left literal", async ({
  mount,
}) => {
  const component = await mount(
    <MessageRowStory
      chatStyle="bubble"
      messageRole="assistant"
      content="{{char}} waves at {{user}}."
      characterId={ALICE_ID}
    />,
  );
  await expect(component.getByText("Character waves at User.")).toBeVisible();
  await expect(component.getByText("{{char}}", { exact: false })).toHaveCount(0);
  await expect(component.getByText("{{user}}", { exact: false })).toHaveCount(0);
});
