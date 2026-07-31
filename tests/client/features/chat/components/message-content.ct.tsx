// CT: the #21 `<speaker>NAME</speaker>` split + per-span `<ThemeScope>` coloring (§12.4). Asserts the
// byte-identical no-op (zero markers → no `ThemeScope`/span wrapper, exactly the pre-#21 single
// `<Markdown>` render) and the tagged-body path (each span gets its own `data-slot="theme-scope"`
// wrapper, in document order, with the text routed to the right span).

import { expect, test } from "@playwright/experimental-ct-react";
import { MessageContentChoicesStory, MessageContentSpansStory } from "../_ct-stories";

const THEME_SCOPE = '[data-slot="theme-scope"]';
const SPANS_CONTAINER = '[data-slot="message-content-spans"]';

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
  const text = await component.innerText();
  expect(text.indexOf("Hi!")).toBeLessThan(text.indexOf("Hey Alice."));
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
  const text = await component.innerText();
  expect(text.indexOf("Hi!")).toBeLessThan(text.indexOf("Hey Alice."));
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

const LETTER_CARD_BODY = 'before\n:::card title="Zandik\'s letter"\n<div>secret page</div>\n:::\nafter';
const TERMINAL_CARD_BODY = ':::card title="Terminal"\n<div>x</div>\n:::';
const POSTER_CARD_BODY = ':::card title="Poster"\n<div>x</div>\n:::';

test("an untrusted card fence renders the tierB ImmersiveCard chrome around a sandboxed iframe", async ({ mount }) => {
  const component = await mount(<MessageContentSpansStory trust="untrusted" content={LETTER_CARD_BODY} />);
  const card = component.locator('[data-slot="immersive-card"]');
  await expect(card).toHaveCount(1);
  // The chrome: title label + the sandboxed frame (an iframe, never main-DOM HTML).
  await expect(card.locator('[data-slot="immersive-card-title"]')).toContainText("Zandik's letter");
  await expect(card.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(1);
  // The card's HTML never lands in the main DOM.
  await expect(component.locator("div", { hasText: "secret page" })).toHaveCount(0);
});

test("the VIEW-RAW toggle swaps the sandbox for the exact stored source (and back)", async ({ mount }) => {
  const component = await mount(<MessageContentSpansStory trust="untrusted" content={TERMINAL_CARD_BODY} />);
  const card = component.locator('[data-slot="immersive-card"]');
  await card.getByRole("button", { name: "View raw source" }).click();
  await expect(card.locator('[data-slot="immersive-card-raw"]')).toContainText("<div>x</div>");
  await expect(card.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(0);
  await card.getByRole("button", { name: "Show rendered card" }).click();
  await expect(card.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(1);
});

test("the EXPAND affordance opens the lightbox dialog labelled by the card title", async ({ mount, page }) => {
  const component = await mount(<MessageContentSpansStory trust="untrusted" content={POSTER_CARD_BODY} />);
  await component.locator('[data-slot="immersive-card"]').getByRole("button", { name: "Expand card" }).click();
  const dialog = page.locator('[data-slot="dialog-popup"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-slot="immersive-card-lightbox-header"]')).toContainText("Poster");
  await expect(dialog.locator('iframe[data-slot="sandbox-frame"]')).toHaveCount(1);
});

// RV-1 — a card in the TRANSCRIPT collapses to its title bar, per viewer. The prose around it is
// untouched (the collapse is card chrome, not a message-level fold), and the sandbox attributes on the
// re-shown frame are the SAME scripts-off, null-origin pair (the collapse must not re-open the boundary).
test("a transcript card COLLAPSES to its title bar and re-shows the SAME scripts-off sandbox", async ({ mount }) => {
  const component = await mount(<MessageContentSpansStory trust="untrusted" content={LETTER_CARD_BODY} />);
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
  const sandbox = await frame.getAttribute("sandbox");
  expect(sandbox).not.toBeNull();
  expect(sandbox).not.toContain("allow-scripts");
  expect(sandbox).not.toContain("allow-same-origin");
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
