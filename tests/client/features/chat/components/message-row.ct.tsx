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
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import type { MessageMetadataVisibility } from "../../../../../packages/client/src/features/chat/components/message-metadata-row";
import { MessageRowStory, NarratorTranscriptStory } from "../_ct-stories";

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
const OKLCH_RE = /oklch\(\s*(?<l>[\d.]+)(?<pct>%)?\s+(?<c>[\d.]+)\s+(?<h>[\d.]+)/u;
function parseOklch(value: string): readonly [number, number, number] {
  const match = OKLCH_RE.exec(value);
  if (match?.groups === undefined) {
    throw new Error(`not an oklch() color: ${value}`);
  }
  const rawL = Number.parseFloat(match.groups["l"] ?? "0");
  const l = match.groups["pct"] === "%" ? rawL / 100 : rawL;
  return [l, Number.parseFloat(match.groups["c"] ?? "0"), Number.parseFloat(match.groups["h"] ?? "0")];
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

test("bubble: a two-word reply hugs its text — bubble width well under the content column (w-fit, N3)", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory chatStyle="bubble" messageRole="assistant" content="Hi there" characterId={ALICE_ID} participants={[alice()]} />,
  );
  const bubbleBox = await component.locator(BUBBLE).boundingBox();
  const columnBox = await component.locator(CONTENT_COLUMN).boundingBox();
  expect(bubbleBox?.width).toBeGreaterThan(0);
  // The two-word bubble hugs its content (fit-content), never stretched to fill the reading column (its
  // flex parent would otherwise stretch it) — the exact w-fit behavior N3 adds to the bubble family.
  expect(bubbleBox?.width ?? 0).toBeLessThan((columnBox?.width ?? 0) * 0.6);
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

test("a null characterId in a multi-character room shows a neutral Narrator, uncolored", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={null} participants={[alice(), bob()]} />);
  await expect(component.locator(ATTRIBUTION)).toContainText("Narrator");
  await expect(component.locator(THEME_SCOPE)).toHaveCount(0);
});

test("user row resolves the message's personaId against the macro-name producer", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory chatStyle="bubble" messageRole="user" personaId={NATE_PERSONA_ID} personas={[{ id: NATE_PERSONA_ID, name: "Nate" }]} />,
  );
  await expect(component.locator(ATTRIBUTION)).toContainText("Nate");
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
    <MessageRowStory chatStyle="bubble" messageRole="user" personaId={NATE_PERSONA_ID} personas={[{ id: NATE_PERSONA_ID, name: "Nate" }]} />,
  );
  const userChildren = user.locator(`${ROW_BODY} > *`);
  await expect(userChildren.first()).toHaveAttribute("data-slot", "message-content-column");
  await expect(userChildren.last()).toHaveAttribute("data-slot", "avatar-root");
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
  const boxShadow = await root.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(boxShadow).not.toBe("none");
  // RENDERED geometry, not just class presence — a collapse-to-0 regression (avatar/variants.ts'
  // header documents this avatar bit ONCE already: a bare icon-left avatar's `h-full` resolved against
  // an undefined parent height and collapsed to ~0px) would pass every assertion above silently.
  const box = await root.boundingBox();
  expect(box?.width).toBeGreaterThan(0);
  expect(box?.height).toBeGreaterThan(0);
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
      personas={[{ id: NATE_PERSONA_ID, name: "Nate" }]}
      anchorPersonaId={NATE_PERSONA_ID}
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
    <MessageRowStory chatStyle="bubble" messageRole="assistant" content="{{char}} nods." characterId={BOB_ID} participants={[alice(), bob()]} />,
  );
  await expect(component.getByText("Bob nods.")).toBeVisible();
});

test("no roster/persona threaded: {{char}}/{{user}} resolve to the kit floor ('Character'/'User'), never left literal", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" content="{{char}} waves at {{user}}." characterId={ALICE_ID} />);
  await expect(component.getByText("Character waves at User.")).toBeVisible();
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
  const box = await band.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs((box?.width ?? 0) / (box?.height ?? 1) - 3)).toBeLessThan(0.1);
  const bgImage = await band.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bgImage).toContain("?v=banner&w=");
});

test("echo: the bubble's padding-right resolves to --immersive-echo-feather (of the content column's width)", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="echo" messageRole="assistant" characterId={ALICE_ID} participants={[aliceWithAvatar()]} />);
  const bubble = component.locator(BUBBLE);
  const column = component.locator(CONTENT_COLUMN);
  // The feather is authored as a PERCENTAGE (of the bubble's containing block width, message-row-
  // variants.ts) — read the resolved token off the element, then compare the rendered padding against
  // that percentage of the real containing block (`message-content-column`, since the ThemeScope
  // wrapper between them is `display: contents` and contributes no box of its own).
  const featherPct = await cssVar(bubble, "--immersive-echo-feather");
  const pct = Number.parseFloat(featherPct) / 100;
  expect(pct).toBeGreaterThan(0);
  const paddingRightPx = await bubble.evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingRight));
  const columnBox = await column.boundingBox();
  const expectedPx = (columnBox?.width ?? 0) * pct;
  expect(paddingRightPx).toBeGreaterThan(0);
  expect(Math.abs(paddingRightPx - expectedPx)).toBeLessThan(2);
});

test("echo: a persona-kind (user) row never bleeds portrait art — padding-right reverts to the base (hide-user-portrait)", async ({ mount }) => {
  const component = await mount(
    <MessageRowStory chatStyle="echo" messageRole="user" personaId={NATE_PERSONA_ID} personas={[{ id: NATE_PERSONA_ID, name: "Nate" }]} />,
  );
  const bubble = component.locator(BUBBLE);
  // No decoration ⇒ no inline paddingRight override (echoDecoration returns null for a non-character
  // kind, message-row-variants.ts) — only the symmetric `px-block` utility applies.
  const inlinePaddingRight = await bubble.evaluate((el) => (el as HTMLElement).style.paddingRight);
  expect(inlinePaddingRight).toBe("");
  const [paddingLeft, paddingRight] = await bubble.evaluate((el) => {
    const cs = getComputedStyle(el);
    return [Number.parseFloat(cs.paddingLeft), Number.parseFloat(cs.paddingRight)];
  });
  expect(paddingRight).toBe(paddingLeft);
});

test("ripple: the welded avatar's boundingBox width resolves to --immersive-ripple-portrait-width; position is sticky", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="ripple" messageRole="assistant" characterId={ALICE_ID} participants={[aliceWithAvatar()]} />);
  const avatar = component.locator(AVATAR);
  const box = await avatar.boundingBox();
  expect(Math.round(box?.width ?? 0)).toBe(remTokenPx(TOKENS["immersive.ripple-portrait-width"].value));
  await expect(avatar).toHaveCSS("position", "sticky");
});

test("hush: the left stripe resolves to --immersive-stripe-width and the character's --color-speaker", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="hush" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} />);
  const bubble = component.locator(BUBBLE);
  const stripeWidthPx = await bubble.evaluate((el) => Number.parseFloat(getComputedStyle(el).borderLeftWidth));
  expect(stripeWidthPx).toBe(remTokenPx(TOKENS["immersive.stripe-width"].value));
  const borderColor = await bubble.evaluate((el) => getComputedStyle(el).borderLeftColor);
  const speakerColor = await cssVar(bubble, "--color-speaker");
  expect(parseOklch(borderColor)).toEqual(parseOklch(speakerColor));
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
const CONSTANT_ALT_BUCKET = 2; // the pre-fix shared color (hashed `alt=""`)
async function bgOf(locator: Locator): Promise<readonly [number, number, number]> {
  return parseOklch(await locator.evaluate((el) => getComputedStyle(el).backgroundColor));
}
async function chartHue(locator: Locator, bucket: number): Promise<readonly [number, number, number]> {
  return parseOklch(await cssVar(locator, `--color-chart-${bucket}`));
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
  const avatarBox = await avatar.boundingBox();
  const nameBox = await component.locator(NAME_ROW).boundingBox();
  expect(Math.abs((avatarBox?.y ?? 0) - (nameBox?.y ?? 0))).toBeLessThan(2);
  // The fallback fills a real box (never collapsed to 0), with the entity's deterministic hue — and
  // NOT the pre-fix constant `alt=""` bucket every imageless speaker used to share.
  expect(avatarBox?.width).toBeGreaterThan(0);
  expect(avatarBox?.height).toBeGreaterThan(0);
  const fallback = avatar.locator(FALLBACK);
  expect(await bgOf(fallback)).toEqual(await chartHue(fallback, ALICE_HUE_BUCKET));
  expect(await bgOf(fallback)).not.toEqual(await chartHue(fallback, CONSTANT_ALT_BUCKET));
});

test("bubble: a different no-avatar character resolves a DISTINCT hue (per-entity, not one shared color)", async ({ mount }) => {
  // Bob (a different id) lands his OWN bucket (4), not Alice's (5) — the exact defect the owner reported
  // (every imageless speaker was the same teal `alt=""` bucket) is gone.
  const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" characterId={BOB_ID} participants={[bob()]} />);
  const fallback = component.locator(`${AVATAR} ${FALLBACK}`);
  expect(await bgOf(fallback)).toEqual(await chartHue(fallback, BOB_HUE_BUCKET));
  expect(await bgOf(fallback)).not.toEqual(await chartHue(fallback, ALICE_HUE_BUCKET));
});

test("echo (no avatar): the FALLBACK edge tile IS the art — hue field + initial, SAME feather padding as with-image, aligned to the bled edge", async ({
  mount,
}) => {
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
  const glyphPx = await tile.locator('[data-slot="text"]').evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  expect(glyphPx).toBe(remTokenPx(TOKENS["spacing.avatar-hero"].value));
  // Reading geometry is IDENTICAL to the with-image echo (the regression pin above): text is padded
  // clear by the feather token, never a reserved-but-empty gap.
  const inlinePaddingRight = await bubble.evaluate((el) => (el as HTMLElement).style.paddingRight);
  expect(inlinePaddingRight).toBe("var(--immersive-echo-feather)");
  // The tile's field is the entity's deterministic hue — the SAME color the row's chip paints (one
  // entity, one hue everywhere).
  const chip = component.locator(`${AVATAR} ${FALLBACK}`);
  expect(await bgOf(tile)).toEqual(await chartHue(tile, ALICE_HUE_BUCKET));
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
  const box = await band.boundingBox();
  expect(Math.abs((box?.width ?? 0) / (box?.height ?? 1) - 3)).toBeLessThan(0.1);
  // A hue FIELD, not a banner <img> (the with-image band's `?v=banner` URL must be absent here).
  const bgImage = await band.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bgImage).not.toContain("?v=banner");
  expect(await bgOf(band)).toEqual(await chartHue(band, ALICE_HUE_BUCKET));
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
  expect(await bgOf(fallback)).toEqual(await chartHue(fallback, ALICE_HUE_BUCKET));
});

// ── Reading scrim over a background photo (side-eye live P1, 2026-07-09) ───────────────────────────
// Flat/Hush/Document carry no bubble fill AND the shell strips their float halo — so text landed
// directly on the photo (2.0–2.4:1 on bright patches). When an ANCESTOR carries `data-has-bg-image`
// (the shell grid's flag), those three back the text with the theme `--color-scrim` + backdrop-blur; on
// a plain background the scrim is OFF (flat stays truly flat). `in-data-[has-bg-image]:` is an ancestor
// variant, so a plain wrapping `<div data-has-bg-image>` around the mount drives the ON case.
const TRANSPARENT = "rgba(0, 0, 0, 0)";

// BUILD-TIME SAFELIST (not runtime): the CT's Tailwind content-scan covers `tests/` + `@orb/ui/src`
// (playwright/index.css `@source`s), NOT `packages/client/src` — so the scrim's ancestor-variant
// utilities, authored in the client skin (message-row-variants.ts `BG_PHOTO_READING_SCRIM`), aren't
// emitted for the CT build and the computed-style assertions below would read a missing rule. Naming the
// exact literals in this comment makes Tailwind's byte-scanner emit them HERE (the real app's client
// tailwind `@source`s client src, so production generates them natively — this only bridges the harness).
// The reading scrim (bubble) + the chrome-chip variant utilities (name-row, side-eye P1 follow-up):
//   in-data-[has-bg-image]:bg-scrim in-data-[has-bg-image]:backdrop-blur-sm
//   in-data-[has-bg-image]:rounded-card in-data-[has-bg-image]:px-field in-data-[has-bg-image]:py-row

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
    // The nearest backdrop IS the theme scrim (resolved off the element, never a hardcoded literal),
    // not transparent — the reading-surface floor over ANY image region.
    expect(bg).not.toBe(TRANSPARENT);
    expect(parseOklch(bg)).toEqual(parseOklch(await cssVar(bubble, "--color-scrim")));
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

// ── Chrome (name + action-icon row) backing over a bg photo (side-eye P1 follow-up) ────────────────
// The name/actions row is a sibling ABOVE the bubble, so in the no-fill modes it floated on the raw
// photo — the interactive action icons hit 1.83:1 (WCAG 1.4.11). Those three modes now back it with the
// same `in-data-[has-bg-image]:` scrim + blur, as its own rounded chip.
const ACTIONS_ROW = '[data-slot="message-actions-row"]';

for (const style of ["flat", "hush", "document"] as const) {
  test(`${style} over a bg image: the action row's nearest backdrop is the scrim chip, not the raw photo`, async ({ mount }) => {
    const component = await mount(
      <div data-has-bg-image="">
        <MessageRowStory chatStyle={style} messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} />
      </div>,
    );
    // The action-icon row itself paints no bg; its NEAREST backdrop is the name-row chip that wraps it.
    const actionsRow = component.locator(ACTIONS_ROW);
    await expect(actionsRow).toHaveCount(1);
    const nameRow = component.locator(NAME_ROW);
    const { bg, backdrop, radius } = await nameRow.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        bg: cs.backgroundColor,
        backdrop: cs.backdropFilter,
        radius: cs.borderTopLeftRadius,
      };
    });
    expect(bg).not.toBe(TRANSPARENT);
    expect(parseOklch(bg)).toEqual(parseOklch(await cssVar(nameRow, "--color-scrim")));
    expect(backdrop).not.toBe("none");
    // A backed CHIP (rounded), not a full-bleed band.
    expect(Number.parseFloat(radius)).toBeGreaterThan(0);
  });
}

test("without a bg image, the chrome row carries NO chip (unchanged) — flat", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="flat" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} />);
  const nameRow = component.locator(NAME_ROW);
  const { bg, backdrop } = await nameRow.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, backdrop: cs.backdropFilter };
  });
  expect(bg).toBe(TRANSPARENT);
  expect(backdrop).toBe("none");
});

test("a FILLED mode (echo) does NOT chip its chrome — scoped to the no-fill modes (bubble anchors it)", async ({ mount }) => {
  const component = await mount(
    <div data-has-bg-image="">
      <MessageRowStory chatStyle="echo" messageRole="assistant" characterId={ALICE_ID} participants={[alice()]} />
    </div>,
  );
  const bg = await component.locator(NAME_ROW).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe(TRANSPARENT);
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
  const actionsBox = await actions.boundingBox();
  expect(actionsBox?.width).toBeGreaterThan(0); // in flow, occupying real space at rest
  // The name row doesn't overflow its own box — the icon+⋯ cluster leaves room for the name (no
  // sibling-starve). scrollWidth ≤ clientWidth ⇒ nothing clipped/pushed past the edge.
  const overflow = await nameRow.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(overflow).toBe(false);
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

  const trigger = component.getByRole("button", { name: "Reasoning" });
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
  await expect(component.getByRole("button", { name: "Reasoning" })).toHaveCount(0);
  await expect(component.getByText(REASONING_TRACE)).toHaveCount(0);
});

test("the settled disclosure names the CHANNEL, never a fabricated duration (a canon-rehydrated row measured no think window)", async ({ mount }) => {
  const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="assistant" reasoning={REASONING_TRACE} />);
  await expect(component.getByRole("button", { name: THOUGHT_FOR_RE })).toHaveCount(0);
  await expect(component.getByRole("button", { name: THINKING_RE })).toHaveCount(0);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// QUOTED-SPEECH TINTING × the per-character theme. The tint span consumes `--color-dialogue`, which the
// row's own `<ThemeScope>` re-binds from the speaker's authored `themeOverride` — so an authored
// dialogueColor wins over the palette default WITHOUT the tinting code knowing anything about
// attribution. That is the whole per-character claim; a hardcoded color (or a tint mounted OUTSIDE the
// scope) fails it. Asserted on the COMPUTED color, never the class string (the Waystone lesson).
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
