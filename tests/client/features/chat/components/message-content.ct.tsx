// CT: the #21 `<speaker>NAME</speaker>` split + per-span `<ThemeScope>` coloring (§12.4). Asserts the
// byte-identical no-op (zero markers → no `ThemeScope`/span wrapper, exactly the pre-#21 single
// `<Markdown>` render) and the tagged-body path (each span gets its own `data-slot="theme-scope"`
// wrapper, in document order, with the text routed to the right span).

import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { MessageContentChoicesStory, MessageContentSpansStory } from "../_ct-stories.tsx";

const THEME_SCOPE = '[data-slot="theme-scope"]';
const SPANS_CONTAINER = '[data-slot="message-content-spans"]';

// ── The NARRATOR plain-`Name:` span grammar (the TOLERANCE + RETROACTIVE half of §12.4) ───────────
// The `<speaker>` wire format is INSTRUCTED, not guaranteed: the shipped demo transcripts (generated live
// against a real model, `@orb/default-content`'s `demo-chats/second-opinion.jsonl`) attribute with plain `JFC:` /
// `Charlotte:` line-start labels and carry ZERO markers. The bodies below are that real shape.

const CHARLOTTE_ID = castId<CharacterId>("char_charlotte");
const JFC_ID = castId<CharacterId>("char_jfc");

function participant(characterId: CharacterId, displayName: string): ParticipantView {
  return {
    id: castId(`participant_${displayName}`),
    chatId: castId("chat_1"),
    kind: "character",
    userId: null,
    characterId,
    role: "member",
    activePersonaId: null,
    talkativeness: 1,
    disabled: false,
    joinedAt: 0,
    joinSeq: 0,
    leftSeq: null,
    joinHistoryVisibility: "full",
    displayName,
    handle: null,
    avatarAssetId: null,
    avatarHash: null,
  };
}

const CAST: readonly ParticipantView[] = [participant(CHARLOTTE_ID, "Charlotte"), participant(JFC_ID, "JFC")];

// Verbatim in shape from the shipped narrator transcript: a scene-set preamble, then two labelled voices.
const NARRATOR_BODY = "*a foreleg taps once against the thread*\n\nJFC: Four devices is not an answer.\n\nCharlotte: I'll take this one.";

test("NARRATOR: a tagless body splits on plain `Name:` labels for the present characters", async ({ mount }) => {
  const component = await mount(<MessageContentSpansStory narratorVoiced={true} participants={CAST} content={NARRATOR_BODY} />);
  // Two attributed spans (JFC, Charlotte); the scene-set preamble stays un-themed.
  await expect(component.locator(THEME_SCOPE)).toHaveCount(2);
  await expect(component.getByText("a foreleg taps once against the thread")).toBeVisible();
  const scopes = component.locator(THEME_SCOPE);
  await expect(scopes.nth(0)).toContainText("Four devices is not an answer.");
  await expect(scopes.nth(1)).toContainText("I'll take this one.");
  // The label TEXT stays — it is prose the reader already sees, and the only non-color attribution a
  // low-vision reader has. (A `<speaker>` tag is markup and IS consumed; a `Name:` label is not.)
  await expect(scopes.nth(0)).toContainText("JFC:");
  await expect(scopes.nth(1)).toContainText("Charlotte:");
});

test("NARRATOR: each speaker's span carries its OWN dialogue tint", async ({ mount }) => {
  const component = await mount(<MessageContentSpansStory narratorVoiced={true} participants={CAST} content={NARRATOR_BODY} />);
  const scopes = component.locator(THEME_SCOPE);
  const read = (index: number): Promise<string> => scopes.nth(index).evaluate((el) => getComputedStyle(el).getPropertyValue("--color-dialogue").trim());
  const jfc = await read(0);
  const charlotte = await read(1);
  expect(jfc).not.toBe("");
  expect(charlotte).not.toBe("");
  expect(jfc).not.toBe(charlotte);
});

test("NON-narrator: the SAME body never splits — a per-speaker row is one voice (a `Name:` line is prose)", async ({ mount }) => {
  const component = await mount(<MessageContentSpansStory participants={CAST} content={NARRATOR_BODY} />);
  await expect(component.locator(THEME_SCOPE)).toHaveCount(0);
  await expect(component.locator(SPANS_CONTAINER)).toHaveCount(0);
  await expect(component.getByText("JFC: Four devices is not an answer.")).toBeVisible();
});

test("NARRATOR: a name that is NOT in the room's cast does not attribute", async ({ mount }) => {
  const component = await mount(<MessageContentSpansStory narratorVoiced={true} participants={CAST} content="Mallory: trust me, I live here." />);
  await expect(component.locator(THEME_SCOPE)).toHaveCount(0);
});

test("NARRATOR: a cast label INSIDE a fenced code block never splits the block", async ({ mount }) => {
  const body = "JFC: here:\n\n```python\n# JFC: this is a comment, not a turn\nprint(1)\n```";
  const component = await mount(<MessageContentSpansStory narratorVoiced={true} participants={CAST} content={body} />);
  // Exactly ONE span (the real leading label) — the in-fence lookalike is skipped, so the fence renders whole.
  await expect(component.locator(THEME_SCOPE)).toHaveCount(1);
  await expect(component.locator("pre code")).toHaveCount(1);
  await expect(component.locator("pre code")).toContainText("print(1)");
});

test("NARRATOR: a mid-sentence cast name never splits (the label must open a LINE)", async ({ mount }) => {
  const component = await mount(<MessageContentSpansStory narratorVoiced={true} participants={CAST} content="She turned to JFC: the man was already gone." />);
  await expect(component.locator(THEME_SCOPE)).toHaveCount(0);
});

test("zero markers: no ThemeScope, no spans container — the byte-identical no-op path", async ({ mount }) => {
  const component = await mount(<MessageContentSpansStory content="Just **plain** markdown." />);
  await expect(component.locator(THEME_SCOPE)).toHaveCount(0);
  await expect(component.locator(SPANS_CONTAINER)).toHaveCount(0);
  await expect(component.getByText("plain")).toBeVisible();
});

test("a single speaker marker wraps its span in one ThemeScope", async ({ mount }) => {
  const component = await mount(<MessageContentSpansStory content="<speaker>Alice</speaker>Hello there!" />);
  await expect(component.locator(THEME_SCOPE)).toHaveCount(1);
  await expect(component.getByText("Hello there!")).toBeVisible();
});

test("multiple speaker markers each get their own ThemeScope, in document order", async ({ mount }) => {
  const component = await mount(<MessageContentSpansStory content="<speaker>Alice</speaker>Hi!<speaker>Bob</speaker>Hey Alice." />);
  const scopes = component.locator(THEME_SCOPE);
  await expect(scopes).toHaveCount(2);
  // `component` IS the `[data-slot="message-content-spans"]` root itself (the mount point), so its
  // own text — not a re-query for the same selector as a descendant — is what's load-bearing here:
  // Alice's span text must precede Bob's in the rendered DOM.
  const readTextAtAssertion = async (): Promise<typeof text> => await component.innerText();
  const text = await component.innerText();
  await expect.poll(async () => (await readTextAtAssertion()).indexOf("Hi!")).toBeLessThan(text.indexOf("Hey Alice."));
});

test("a preamble before the first marker renders as an un-themed narrator span", async ({ mount }) => {
  const component = await mount(<MessageContentSpansStory content="The room falls silent.<speaker>Bob</speaker>Well then." />);
  // One ThemeScope for Bob's span; the preamble span carries no ThemeScope of its own.
  await expect(component.locator(THEME_SCOPE)).toHaveCount(1);
  await expect(component.getByText("The room falls silent.")).toBeVisible();
  await expect(component.getByText("Well then.")).toBeVisible();
});

// ── D44 §12.0 render-trust guardrails (#25) ───────────────────────────────────────────────────────

test("GUARDRAIL: <speaker> coloring SURVIVES the untrusted render tier (non-regression)", async ({ mount }) => {
  // The persona feature: a merged-narrator body's per-speaker colors come from the UPSTREAM speaker-span
  // split (`parseSpeakerSpans` → per-span `<ThemeScope>`), which runs BEFORE the markdown seal — so the
  // untrusted policy (which drops the `<speaker>` literal passthrough) does NOT regress the coloring,
  // because the markers never reach Streamdown on the settled path. Mount at `untrusted` and prove the
  // ThemeScope wrappers + routed text are still there.
  const component = await mount(<MessageContentSpansStory trust="untrusted" content="<speaker>Alice</speaker>Hi!<speaker>Bob</speaker>Hey Alice." />);
  await expect(component.locator(THEME_SCOPE)).toHaveCount(2);
  const readTextAtAssertion = async (): Promise<typeof text> => await component.innerText();
  const text = await component.innerText();
  await expect.poll(async () => (await readTextAtAssertion()).indexOf("Hi!")).toBeLessThan(text.indexOf("Hey Alice."));
});

test("GUARDRAIL: an external image is GATED (click-to-load, no auto-fetch) when allowExternal=false", async ({ mount }) => {
  // D44 §12.3 — an external `![](https://…)` projects to a `media` block routed through `<MessageMedia>`;
  // with the resolved gate closed it renders the click-to-load placeholder and issues NO network request
  // (never a raw <img>). Mounts untrusted + gated (the safe floor).
  const component = await mount(
    <MessageContentSpansStory trust="untrusted" allowExternal={false} content="look ![evil](https://tracker.example/pixel.png) here" />,
  );
  // The gated placeholder (a button), NOT a loaded <img>.
  await expect(component.locator('[data-slot="message-media-placeholder"]')).toHaveCount(1);
  await expect(component.locator("img")).toHaveCount(0);
});

test("an external image LOADS (renders an <img>) when allowExternal=true", async ({ mount, page }) => {
  // Serve a REAL 1x1 png for the fixture URL: without interception the dead cdn.example request's
  // pending-vs-error timing decided the outcome (green only while the request PENDED — it flipped
  // under trace instrumentation and full-suite parallelism, 2026-07-24). Now "LOADS" means loads.
  const PixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  await page.route("https://cdn.example/ok.png", (route) => route.fulfill({ contentType: "image/png", body: PixelPng }));
  const component = await mount(<MessageContentSpansStory trust="untrusted" allowExternal={true} content="look ![ok](https://cdn.example/ok.png) here" />);
  await expect(component.locator('[data-slot="message-media"]')).toHaveCount(1);
  await expect(component.locator('[data-slot="message-media-placeholder"]')).toHaveCount(0);
});

test("COMMITTED trust=trusted still renders a raw HTML <img> — the resolved-trust settled path is unchanged", async ({ mount }) => {
  // The counterpart to the ghost's stream-untrusted pin (ghost-message-row.ct.tsx): the #25 fix flips the
  // LIVE stream to untrusted WITHOUT touching the committed path — a message whose resolved policy is
  // `trusted` (own-user input / a character that opted into rich HTML) still renders permissively. Raw
  // HTML `<img>` is literal text to the D51 tokenizer (not the `![]()` media grammar), so it reaches the
  // trusted markdown seal and renders — proving the two tiers stay distinct and the settled side didn't
  // regress to untrusted.
  const component = await mount(<MessageContentSpansStory trust="trusted" content='hi <img src="https://cdn.example/ok.png"> bye' />);
  await expect(component.locator("img")).toHaveCount(1);
});

test("COMMITTED trust=untrusted drops the same raw HTML <img> (fail-closed floor)", async ({ mount }) => {
  const component = await mount(<MessageContentSpansStory trust="untrusted" content='hi <img src="https://cdn.example/ok.png"> bye' />);
  await expect(component.locator("img")).toHaveCount(0);
});

// ── Macro DISPLAY pass (the `{{char}}`/`{{user}}` bug) ─────────────────────────────────────────────

test("with no renderContext, {{char}}/{{user}} render LITERALLY — the pre-fix default", async ({ mount }) => {
  const component = await mount(<MessageContentSpansStory content="{{char}} doesn't look up. So here's the deal, {{user}}:" />);
  await expect(component.getByText("{{char}} doesn't look up. So here's the deal, {{user}}:")).toBeVisible();
});

test("with a renderContext, {{char}}/{{user}} resolve to real names before Markdown", async ({ mount }) => {
  const component = await mount(
    <MessageContentSpansStory content="{{char}} doesn't look up. So here's the deal, {{user}}:" characterName="Kira" userName="Nate" />,
  );
  await expect(component.getByText("Kira doesn't look up. So here's the deal, Nate:")).toBeVisible();
  await expect(component.getByText("{{char}}", { exact: false })).toHaveCount(0);
  await expect(component.getByText("{{user}}", { exact: false })).toHaveCount(0);
});

// ── P4 — the immersive html-card lifecycle chrome (parity-plus §4.7) ──────────────────────────────
//
// TIER MAPPING (D44 §12.2), and why these mount TRUSTED: Tier B — the sandboxed ImmersiveCard with the
// card's own CSS — is the OPT-IN per-character trust tier. Tier A is the DEFAULT inert allowlist, which
// forbids `<style>`, so a card cannot render as a card there.
//
// These tests mounted `untrusted` until 2026-08-04 because the client's mapping was INVERTED. The whole
// card suite therefore exercised only the tier the inversion left working, and the trusted path — the one
// every real character actually takes — had ZERO coverage. That gap is why a deployment with the global
// `trustHtml` opt-in ON rendered zero cards without a single red test. Both tiers are pinned below now;
// keep it that way.

const LETTER_CARD_BODY = 'before\n:::card title="Zandik\'s letter"\n<div>secret page</div>\n:::\nafter';
const TERMINAL_CARD_BODY = ':::card title="Terminal"\n<div>x</div>\n:::';
const POSTER_CARD_BODY = ':::card title="Poster"\n<div>x</div>\n:::';

test("a TRUSTED card fence renders the tierB ImmersiveCard chrome around a sandboxed iframe", async ({ mount }) => {
  const component = await mount(<MessageContentSpansStory trust="trusted" content={LETTER_CARD_BODY} />);
  const card = component.locator('[data-slot="immersive-card"]');
  await expect(card).toHaveCount(1);
  // The chrome: title label + the sandboxed frame (an iframe, never main-DOM HTML).
  await expect(card.locator('[data-slot="immersive-card-title"]')).toContainText("Zandik's letter");
  await expect(card.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(1);
  // The card's HTML never lands in the main DOM.
  await expect(component.locator("div", { hasText: "secret page" })).toHaveCount(0);
});

// ── The TIER-A (inert) card — the half that had no coverage at all ────────────────────────────────
// An UNTRUSTED card gets the default inert tier: sanitized content, no sandbox, CSS discarded by law. The
// requirement is that it REFUSES VISIBLY — the failure being fixed is that it used to render as bare
// unstyled HTML in the prose flow, indistinguishable from the model writing plain text ("cards vanish").

test("an UNTRUSTED card renders the inert frame — labelled, badged, and NOT the sandbox", async ({ mount }) => {
  const component = await mount(<MessageContentSpansStory trust="untrusted" content={LETTER_CARD_BODY} />);
  const inert = component.locator('[data-slot="inert-card"]');
  await expect(inert).toHaveCount(1);
  // It still says a CARD is here, and which one — the identity that was being lost.
  await expect(inert.locator('[data-slot="inert-card-title"]')).toContainText("Zandik's letter");
  await expect(inert.locator('[data-slot="inert-card-badge"]')).toContainText("Plain view");
  // No sandbox: tier A is main-DOM by definition.
  await expect(component.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(0);
  await expect(component.locator('[data-slot="immersive-card"]')).toHaveCount(0);
  // The content is NOT withheld — tier A is safe by construction, so the body still reads.
  await expect(inert.locator('[data-slot="inert-card-body"]')).toContainText("secret page");
  // The prose around the card is untouched.
  await expect(component.getByText("before")).toBeVisible();
  await expect(component.getByText("after")).toBeVisible();
});

test("the inert card states the REMEDY as visible text, not a hover-only tooltip", async ({ mount }) => {
  // The media gate has always said "External media — load from …?" in the open. This is its card twin:
  // a touch user with no hover must be able to READ why the card is plain and what turns it on.
  const component = await mount(<MessageContentSpansStory trust="untrusted" content={TERMINAL_CARD_BODY} />);
  const hint = component.locator('[data-slot="inert-card-hint"]');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText("rich HTML is off");
  await expect(hint).toContainText("Trust HTML");
});

// The card sandbox is the SAME external-media axis as MessageMedia — a srcdoc frame inherits the document
// CSP AND carries its own, so a `<img src="https://…">` inside a card needs both to allow it. These two pin
// that the row's resolved verdict actually reaches the frame policy (it used to be a hardcoded literal).
test("GUARDRAIL: with allowExternal=false the card's sandbox CSP admits no https: media", async ({ mount }) => {
  const component = await mount(<MessageContentSpansStory trust="trusted" allowExternal={false} content={TERMINAL_CARD_BODY} />);
  const srcdoc = (await component.locator('iframe[data-slot="sandbox-frame"]').getAttribute("srcdoc")) ?? "";
  expect(srcdoc).toContain("img-src 'self';");
  expect(srcdoc).not.toContain("https:");
});

test("with allowExternal=true the card's sandbox CSP gains https: on img-src + media-src only", async ({ mount }) => {
  const component = await mount(<MessageContentSpansStory trust="trusted" allowExternal={true} content={TERMINAL_CARD_BODY} />);
  const srcdoc = (await component.locator('iframe[data-slot="sandbox-frame"]').getAttribute("srcdoc")) ?? "";
  expect(srcdoc).toContain("img-src 'self' https:");
  expect(srcdoc).toContain("media-src 'self' https:");
  expect(srcdoc).toContain("default-src 'none'");
  expect(srcdoc).not.toContain("connect-src");
});

// CARD-EXTERNAL-MEDIA (dogfood, 2026-08-07). The report was that with "Block external media" ON, a card with
// ZERO external references still fails to render — i.e. that the restriction degrades LOCAL content instead of
// only blocking external URLs. The two tests above cannot see that: they read the CSP STRING off the srcdoc
// attribute and never look inside the frame, so a card that ships a correct policy and paints NOTHING passes
// both. `done ≠ rendered`. These two reach THROUGH the iframe and assert what the user actually sees.
//
// AUDIT RESULT: not reproduced. Inline-only content paints with the flag OFF, and the restriction is
// external-only exactly as designed. The original symptom is best explained by CARD-TRUST-INVERTED, which the
// entry itself names as a dependency ("cards don't reach ImmersiveCard at all until [it] is fixed") and which
// shipped in `9f30b7045`. Kept as the standing regression pin, because "the sandbox is too tight for its own
// content" is a failure that would otherwise only ever be found by a human looking at a blank card.
const INLINE_ONLY_CARD_BODY = ':::card title="Ledger"\n<div class="row"><span>Debt owed</span><b>40 marks</b></div>\n:::';

test("INLINE-ONLY content PAINTS with external media BLOCKED — the restriction is external-only", async ({ mount }) => {
  const component = await mount(<MessageContentSpansStory trust="trusted" allowExternal={false} content={INLINE_ONLY_CARD_BODY} />);
  const frame = component.locator('iframe[data-slot="sandbox-frame"]').contentFrame();
  // The card's own markup rendered inside the sandbox — text the user can read, not a policy string.
  await expect(frame.locator("b")).toHaveText("40 marks");
  await expect(frame.getByText("Debt owed")).toBeVisible();
  // …and it is not a zero-height ghost: the styled row occupies real space.
  const box = await frame.locator(".row").boundingBox();
  expect(box?.height ?? 0).toBeGreaterThan(0);
});

test("…and the SAME card's external image is the only thing the block costs it", async ({ mount }) => {
  // One card, both kinds of content. The local half must survive the external half being refused — the exact
  // "don't degrade local content" property the entry asks for.
  const mixed = ':::card title="Ledger"\n<div class="row"><span>Debt owed</span><img src="https://example.test/seal.png" alt="seal"></div>\n:::';
  const component = await mount(<MessageContentSpansStory trust="trusted" allowExternal={false} content={mixed} />);
  const frame = component.locator('iframe[data-slot="sandbox-frame"]').contentFrame();
  await expect(frame.getByText("Debt owed")).toBeVisible();
  // The <img> element still exists in the DOM — the CSP refuses the FETCH, it does not strip the markup. What
  // matters is that its refusal did not take the rest of the card down with it.
  await expect(frame.locator("img")).toHaveCount(1);
});

test("the VIEW-RAW toggle swaps the sandbox for the exact stored source (and back)", async ({ mount }) => {
  const component = await mount(<MessageContentSpansStory trust="trusted" content={TERMINAL_CARD_BODY} />);
  const card = component.locator('[data-slot="immersive-card"]');
  await card.getByRole("button", { name: "View raw source" }).click();
  await expect(card.locator('[data-slot="immersive-card-raw"]')).toContainText("<div>x</div>");
  await expect(card.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(0);
  await card.getByRole("button", { name: "Show rendered card" }).click();
  await expect(card.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(1);
});

test("the EXPAND affordance opens the lightbox dialog labelled by the card title", async ({ mount, page }) => {
  const component = await mount(<MessageContentSpansStory trust="trusted" content={POSTER_CARD_BODY} />);
  await component.locator('[data-slot="immersive-card"]').getByRole("button", { name: "Open card fullscreen" }).click();
  const dialog = page.locator('[data-slot="dialog-popup"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-slot="immersive-card-lightbox-header"]')).toContainText("Poster");
  await expect(dialog.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(1);
});

// RV-1 — a card in the TRANSCRIPT collapses to its title bar, per viewer. The prose around it is
// untouched (the collapse is card chrome, not a message-level fold), and the sandbox attributes on the
// re-shown frame are the SAME scripts-off, null-origin pair (the collapse must not re-open the boundary).
test("a transcript card COLLAPSES to its title bar and re-shows the SAME scripts-off sandbox", async ({ mount }) => {
  const component = await mount(<MessageContentSpansStory trust="trusted" content={LETTER_CARD_BODY} />);
  const card = component.locator('[data-slot="immersive-card"]');

  await card.getByRole("button", { name: "Collapse card" }).click();
  await expect(card.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(0);
  await expect(card.locator('[data-slot="immersive-card-title"]')).toContainText("Zandik's letter");
  // The message's own prose is unaffected — only the card body folded.
  await expect(component.getByText("before")).toBeVisible();
  await expect(component.getByText("after")).toBeVisible();

  await card.getByRole("button", { name: "Show card" }).click();
  const frame = card.locator('iframe[data-slot="sandbox-frame"]');
  await expect(frame).toHaveCount(1);
  await expect.poll(async () => frame.getAttribute("sandbox")).not.toBeNull();
  await expect.poll(async () => frame.getAttribute("sandbox")).not.toContain("allow-scripts");
  await expect.poll(async () => frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
});

// The committed EOF-close on the READING surface: a card the model never closed (generation truncated
// mid-attribute) used to leave the reader staring at the raw `:::card title="…"` line as prose. A stored
// body is final, so it renders as the card it was meant to be.
test("an UNTERMINATED card in a stored body renders the card chrome, not raw fence syntax", async ({ mount }) => {
  const truncated = ':::card title="Ashfell Night Market"\n\n<div style="font-family: \'Courier New';
  // Mounted TRUSTED so the assertion is about the EOF-close, not about the tier (D44 §12.2 — tier B is
  // the opt-in tier; see the P4 header). The untrusted twin below pins that the same recovery happens on
  // the inert tier, so a truncated card never regresses to raw fence syntax on EITHER path.
  const component = await mount(<MessageContentSpansStory trust="trusted" content={`Look:\n${truncated}`} />);
  const card = component.locator('[data-slot="immersive-card"]');
  await expect(card).toHaveCount(1);
  await expect(card.locator('[data-slot="immersive-card-title"]')).toContainText("Ashfell Night Market");
  // The fence syntax itself never reaches the reader.
  await expect(component.getByText(":::card", { exact: false })).toHaveCount(0);
});

test("an UNTERMINATED card on the INERT tier also recovers — framed, never raw fence syntax", async ({ mount }) => {
  const truncated = ':::card title="Ashfell Night Market"\n\n<div style="font-family: \'Courier New';
  const component = await mount(<MessageContentSpansStory trust="untrusted" content={`Look:\n${truncated}`} />);
  await expect(component.locator('[data-slot="inert-card-title"]')).toContainText("Ashfell Night Market");
  await expect(component.getByText(":::card", { exact: false })).toHaveCount(0);
});

// ── P5 §5.2-5.3 — the `:::choices` fence renders CLICKABLE send-affordances ───────────────────────

const CHOICE_OPTION = '[data-testid="message-choice-option"]';
const SENT_PROBE = '[data-testid="sent-choices"]';

test("a :::choices fence renders one button per option; a click SENDS that option's text (assert-the-mutation-fired)", async ({ mount }) => {
  const component = await mount(<MessageContentChoicesStory />);
  const options = component.locator(CHOICE_OPTION);
  await expect(options).toHaveCount(3);
  await expect(options.nth(1)).toContainText("2. Slip into the shadows.");
  // The raw fence never reaches the reading surface.
  await expect(component.getByText(":::choices")).toHaveCount(0);
  // The click's SEND is the assertion target — the option TEXT (sans numbering) fires as the user turn.
  await options.nth(1).click();
  await expect(component.locator(SENT_PROBE)).toHaveText("Slip into the shadows.");
  // A second pick sends again (the buttons stay live until a turn is actually in flight).
  await options.nth(0).click();
  await expect(component.locator(SENT_PROBE)).toHaveText("Slip into the shadows.|Draw your blade.");
});

test("choices DISABLE while a turn is in flight — a click sends nothing (§5.3 send-in-flight)", async ({ mount }) => {
  const component = await mount(<MessageContentChoicesStory mode="busy" />);
  const first = component.locator(CHOICE_OPTION).first();
  await expect(first).toBeDisabled();
  await expect(component.locator(SENT_PROBE)).toHaveText("");
});

test("a provider-less mount (preview/CT) renders the SAME buttons disabled — never a crash, never a send", async ({ mount }) => {
  const component = await mount(<MessageContentChoicesStory mode="none" />);
  await expect(component.locator(CHOICE_OPTION)).toHaveCount(3);
  await expect(component.locator(CHOICE_OPTION).first()).toBeDisabled();
});
