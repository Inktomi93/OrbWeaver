// CT: the streaming ghost row + ghost isolation. Drives the chat-stream store in-browser (begin →
// token…) and asserts: the §6.4 phase affordances (pending → typing dots, streaming → the 2px primary
// caret, neither at rest, both static under reduced motion); streaming reveals paced markdown; and more
// tokens grow ONLY the ghost while the surface-level lifecycle read (`phase`) stays "streaming" — the
// ghost-isolation invariant (token churn never leaves the one subscribed row).
//
// The golden streaming-safety tests below (UI-Gates §11.6 hard checkpoint, the #402/#473 cluster) feed
// an exact, hand-scripted delta sequence through `GhostRowScriptedStory` — an unterminated code fence, a
// torn `<speaker` tag, unpaired markdown emphasis — and assert the render never flashes the raw literal
// syntax and never white-screens (the `MarkdownErrorBoundary` fallback text never appears). A final
// reduced-motion test asserts the pacer's passthrough: the full text lands with no reveal lag.

import type { MountResult } from "@playwright/experimental-ct-react";
import { expect, test } from "@playwright/experimental-ct-react";
import { GhostRowScriptedStory, GhostRowStory } from "../_ct-stories.tsx";

const ERROR_FALLBACK = "Content failed to render.";

/** Click `begin`, then `next-chunk` once per scripted chunk (each click appends exactly one delta) —
 *  sequential by construction (chunk N+1 must land after chunk N is applied to the store). */
async function driveScript(component: MountResult, chunkCount: number): Promise<void> {
  await component.getByTestId("begin").click();
  for (let i = 0; i < chunkCount; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each click must land before the next (the store's appendDelta order is the scripted sequence) — not a parallelizable batch.
    await component.getByTestId("next-chunk").click();
  }
}

const THREE_HI = /Hi\s+Hi\s+Hi/u;

test("pending shows the typing dots, then streaming reveals paced markdown", async ({ mount }) => {
  const component = await mount(<GhostRowStory />);
  const phase = component.getByTestId("phase");

  await component.getByTestId("begin").click();
  await expect(phase).toHaveText("pending");
  // The pending affordance is the three-dot typing pulse (role=status), not the shimmer.
  await expect(component.locator('[data-slot="typing-dots"]')).toBeVisible();
  await expect(component.locator(".orb-typing-dot")).toHaveCount(3);

  await component.getByTestId("token").click();
  await expect(phase).toHaveText("streaming");
  await expect(component.getByText("Hi")).toBeVisible();
});

// The §6.4 phase affordances: dots only while pending, caret only while streaming, neither at rest.
test("§6.4 phase affordances: dots pending-only, caret streaming-only, neither at rest", async ({ mount }) => {
  const component = await mount(<GhostRowStory />);
  const dots = component.locator('[data-slot="typing-dots"]');
  // The caret is OUR `::after` (globals.css owns it — #42 dropped Streamdown's caret prop) on the LAST
  // LEAF BLOCK inside the dir wrapper, so the bar trails the final glyph instead of dropping to a new
  // line. Assert via its computed left border (a pseudo-element — no caret element exists to query).
  const caretHost = component.locator('[data-slot="ghost-stream-body"] > * > *:last-child > [dir]:last-child > *:last-child');
  const caretBorder = (): Promise<string> => caretHost.evaluate((el) => getComputedStyle(el, "::after").borderLeftWidth);

  // At rest (idle): no ghost body at all.
  await expect(dots).toHaveCount(0);
  await expect(component.locator('[data-slot="ghost-stream-body"]')).toHaveCount(0);

  // Pending: dots visible, no stream body (so no caret).
  await component.getByTestId("begin").click();
  await expect(dots).toBeVisible();
  await expect(component.locator('[data-slot="ghost-stream-body"]')).toHaveCount(0);

  // Streaming: dots gone; the caret's 2px left border is painted on the last streamed block.
  await component.getByTestId("token").click();
  await expect(dots).toHaveCount(0);
  await expect(component.getByText("Hi")).toBeVisible();
  await expect.poll(caretBorder).toBe("2px");
  // The #42 position pin: the carrier is the last LEAF block (the <p> holding the streamed text), not
  // the display:contents dir wrapper — an ::after on the wrapper lands BELOW the paragraph (own line).
  await expect.poll(() => caretHost.evaluate((el) => el.tagName)).toBe("P");

  // Settled (completeTurn → the slot leaves the live phases): the ghost row unmounts, no caret.
  await component.getByTestId("complete").click();
  await expect(component.locator('[data-slot="ghost-stream-body"]')).toHaveCount(0);
});

// Reduced motion: both affordances render their STATIC form — the dots visible (frozen, not blank) and
// the caret a steady 2px bar (no blink). Under the reduced-motion floor `animation-duration` collapses
// to ~0, so the computed animation state reads as effectively frozen at its resting frame.
test("reduced motion: dots render static and the caret renders steady (no blink)", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const component = await mount(<GhostRowStory />);

  await component.getByTestId("begin").click();
  const dots = component.locator(".orb-typing-dot").first();
  await expect(dots).toBeVisible();
  // The floor freezes the pulse: animation-duration collapses to the 0.01ms !important floor.
  await expect.poll(() => dots.evaluate((el) => getComputedStyle(el).animationDuration)).toBe("1e-05s");

  await component.getByTestId("token").click();
  await expect(component.getByText("Hi")).toBeVisible();
  const caret = component.locator('[data-slot="ghost-stream-body"] > * > *:last-child > [dir]:last-child > *:last-child');
  // The caret bar still paints (2px primary), but its blink is frozen by the same floor.
  await expect.poll(() => caret.evaluate((el) => getComputedStyle(el, "::after").borderLeftWidth)).toBe("2px");
  await expect.poll(() => caret.evaluate((el) => getComputedStyle(el, "::after").animationDuration)).toBe("1e-05s");
});

test("more tokens grow only the ghost; the lifecycle phase read stays stable", async ({ mount }) => {
  const component = await mount(<GhostRowStory />);
  await component.getByTestId("begin").click();
  await component.getByTestId("token").click();
  await expect(component.getByTestId("phase")).toHaveText("streaming");

  await component.getByTestId("token").click();
  await component.getByTestId("token").click();

  await expect(component.getByText(THREE_HI)).toBeVisible();
  // Never left "streaming" across the extra tokens → the surface-level read didn't churn per delta.
  await expect(component.getByTestId("phase")).toHaveText("streaming");
});

// ── Golden streaming-safety tests (UI-Gates §11.6 hard checkpoint) ─────────────────────────────────

test("an unterminated code fence never flashes literal backticks and renders as a code block", async ({ mount }) => {
  const component = await mount(<GhostRowScriptedStory chunks={["Here is code:\n```js\n", "const x = 1;\n", "function f() {\n"]} />);
  await driveScript(component, 3);

  await expect(component.locator("pre code")).toContainText("const x = 1;");
  await expect(component.getByText("```", { exact: false })).toHaveCount(0);
  await expect(component.getByText(ERROR_FALLBACK)).toHaveCount(0);
});

test("unpaired markdown emphasis never renders the literal ** marker", async ({ mount }) => {
  // Trailing space completes the word boundary for the pacer (`snapToWordBoundary` — UI-Arch §6.3.1)
  // so the reveal isn't held back waiting for a next chunk that never comes; the repair still has to
  // CLOSE the unpaired `**` for the assertion below to hold.
  const component = await mount(<GhostRowScriptedStory chunks={["This is **bold and not yet closed "]} />);
  await driveScript(component, 1);

  // Streamdown renders emphasis as `<span data-streamdown="strong">`, not a native `<strong>`.

  await expect(component.locator('[data-streamdown="strong"]')).toContainText("bold and not yet closed");
  await expect(component.getByText("**", { exact: false })).toHaveCount(0);
  await expect(component.getByText(ERROR_FALLBACK)).toHaveCount(0);
});

test("a torn <speaker> tag mid-stream is held back — never flashes the raw tag or its content", async ({ mount }) => {
  // The trailing space after "Bob" completes the pacer's word boundary (so the reveal isn't merely
  // waiting on the NEXT chunk) — it's `repairStreamingTail`'s `holdTornSpeaker`, not the pacer, that
  // must strip the unclosed tag from what's actually rendered.
  const component = await mount(<GhostRowScriptedStory chunks={["Alice said ", "<speaker>Bob "]} />);
  await driveScript(component, 2);

  // The unclosed open tag + its content are held back entirely until the close tag arrives.
  await expect(component.getByText("Alice said", { exact: false })).toBeVisible();
  await expect(component.getByText("Bob")).toHaveCount(0);
  await expect(component.getByText("<speaker", { exact: false })).toHaveCount(0);
  await expect(component.getByText(ERROR_FALLBACK)).toHaveCount(0);
});

test("closing the <speaker> tag settles the render without white-screening", async ({ mount }) => {
  const component = await mount(<GhostRowScriptedStory chunks={["Alice said ", "<speaker>Bob</speaker> hi"]} />);
  await driveScript(component, 2);

  await expect(component.getByText(ERROR_FALLBACK)).toHaveCount(0);
});

// ── D44 §12.0 stream-trust guardrail (#25 — the streaming path is the highest-exposure window) ─────

test("SECURITY: a streamed markdown image never emits an <img> — the live stream renders UNTRUSTED", async ({ mount }) => {
  // A prompt-injected turn streams an inline image ref. Under the pre-fix `trust="trusted"` posture the
  // ghost rendered it live → the browser fetched the attacker URL mid-stream (D21 tracking-pixel exfil)
  // BEFORE commit-time sanitization ever ran. The stream tier is now untrusted: the untrusted allowlist
  // drops `<img>` at the element level, so no image element (and no preload) is ever emitted.
  const component = await mount(<GhostRowScriptedStory chunks={["Look: ![x](https://attacker.example/p.png) done "]} />);
  await driveScript(component, 1);

  await expect(component.getByText("Look:", { exact: false })).toBeVisible();
  await expect(component.locator("img")).toHaveCount(0);
  await expect(component.getByText(ERROR_FALLBACK)).toHaveCount(0);
});

test("a complete <speaker> marker mid-stream shows the name as plain text (untrusted drops the tag)", async ({ mount }) => {
  // Untrusted drops the `<speaker>` element AND its child, so the stream pre-passes `speakerTagsToPlain`
  // to keep the narrator's name visible as a plain `Name:` prefix while streaming (the settled row
  // re-parses the marker for per-speaker coloring on turn-complete).
  const component = await mount(<GhostRowScriptedStory chunks={["<speaker>Bob</speaker> hello there "]} />);
  await driveScript(component, 1);

  await expect(component.getByText("Bob:", { exact: false })).toBeVisible();
  await expect(component.getByText("hello there", { exact: false })).toBeVisible();
  await expect(component.getByText("<speaker", { exact: false })).toHaveCount(0);
  await expect(component.getByText(ERROR_FALLBACK)).toHaveCount(0);
});

test("P1: the model's own `Name:` prefix never flashes in the bubble mid-stream", async ({ mount }) => {
  // In a speakerTags group turn the model echoes its own `JFC: ` prefix at the start of the stream; the
  // server strips it at finalize, so without the ghost-row leading strip the raw prefix would flash in the
  // bubble for the WHOLE turn (leaked implementation detail). Mount WITH attribution so the strip has a name.
  const component = await mount(<GhostRowScriptedStory chunks={["JFC: I own one mug and it says 'no.' "]} speakerName="JFC" />);
  await driveScript(component, 1);

  await expect(component.getByText("I own one mug", { exact: false })).toBeVisible();
  await expect(component.getByText("JFC:", { exact: false })).toHaveCount(0);
  await expect(component.getByText(ERROR_FALLBACK)).toHaveCount(0);
});

// ── §4.5 the FENCE-CLOSE card upgrade (owner dogfood 2026-08-14: "interactive html cards pop up in rpg
// lite but they wont render fully until the message is done ... even when the html is done being written")
//
// The chip is the placeholder for a card whose BODY IS STILL ARRIVING — not for one that is finished. Once
// the closing `:::` line lands (terminated), the card's bytes are final and the real card mounts, while the
// message keeps streaming below it. These pin all four sides: the upgrade, the still-forming hold, the
// no-reload invariant, and the abort drop. The GHOST's frame posture is pinned too — srcdoc floor,
// `sandbox=""`, no external media — because "mount the card earlier" must not also mean "widen it".

const CARD_OPEN = ':::card title="Terminal"\n';
const CARD_BODY = '<div id="t">ACCESS GRANTED</div>\n<style>#t{color:#0f0}</style>\n';
const CARD_CLOSE = ":::\n";
const FRAME = '[data-slot="sandbox-frame"]';
const CHIP = '[data-slot="forming-card-chip"]';

test("§4.5: a fence CLOSED mid-stream mounts the real card while the message is still streaming", async ({ mount }) => {
  const component = await mount(<GhostRowScriptedStory chunks={[CARD_OPEN, CARD_BODY, CARD_CLOSE, "The screen flickers. "]} cardTier="tierB" />);

  // Open line + body: the chip holds, no frame (the body is genuinely still forming).
  await driveScript(component, 2);
  await expect(component.locator(CHIP)).toBeVisible();
  await expect(component.locator(FRAME)).toHaveCount(0);

  // The CLOSE line lands — the bytes are final, so the real card mounts NOW, not at commit.
  await component.getByTestId("next-chunk").click();
  await expect(component.locator(FRAME)).toHaveCount(1);
  await expect(component.locator(CHIP)).toHaveCount(0);
  await expect(component.locator('[data-slot="immersive-card-title"]')).toContainText("Terminal");
  // …and the turn has NOT settled: the ghost row is still the live row.
  await expect(component.getByTestId("phase")).toHaveText("streaming");
  await expect(component.locator('[data-slot="ghost-message-row"]')).toHaveCount(1);

  // Prose continues to stream BELOW the mounted card.
  await component.getByTestId("next-chunk").click();
  await expect(component.getByText("The screen flickers", { exact: false })).toBeVisible();
  await expect(component.getByText(ERROR_FALLBACK)).toHaveCount(0);
});

test("§4.5: a fence still OPEN keeps the chip and never paints a byte of the partial HTML", async ({ mount }) => {
  const component = await mount(
    <GhostRowScriptedStory chunks={[CARD_OPEN, '<div>half-streamed <img src="https://attacker.example/p.png"']} cardTier="tierB" />,
  );
  await driveScript(component, 2);

  await expect(component.locator(CHIP)).toBeVisible();
  await expect(component.locator(FRAME)).toHaveCount(0);
  await expect(component.locator("iframe")).toHaveCount(0);
  await expect(component.locator("img")).toHaveCount(0);
  // Not as an iframe, not as literal text either — the accumulating body stays behind the chip.
  await expect(component.getByText("attacker.example", { exact: false })).toHaveCount(0);
  await expect(component.getByText("half-streamed", { exact: false })).toHaveCount(0);
});

test("SECURITY: an UNTERMINATED close line does not mount a card — the next token can still revoke it", async ({ mount }) => {
  // `:::` with no newline yet matches the close grammar but is not final: `:::x` on the next token turns it
  // back into body. Mounting on it would render a NON-final body and then flicker back to a chip.
  const component = await mount(<GhostRowScriptedStory chunks={[CARD_OPEN, CARD_BODY, ":::", "x\n"]} cardTier="tierB" />);
  await driveScript(component, 3);
  await expect(component.locator(CHIP)).toBeVisible();
  await expect(component.locator(FRAME)).toHaveCount(0);

  await component.getByTestId("next-chunk").click();
  await expect(component.locator(CHIP)).toBeVisible();
  await expect(component.locator(FRAME)).toHaveCount(0);
});

test("§4.5: prose streaming after a closed card never reloads the card's iframe", async ({ mount }) => {
  // A remount would re-fetch/re-paint the card on EVERY token — the ST flicker class the one-mount rule
  // exists to prevent. Stamp the live element, then prove the SAME element (same srcdoc) survives.
  const component = await mount(
    <GhostRowScriptedStory chunks={[CARD_OPEN, CARD_BODY, CARD_CLOSE, "The screen ", "flickers ", "and dies. "]} cardTier="tierB" />,
  );
  await driveScript(component, 3);
  const frame = component.locator(FRAME);
  await expect(frame).toHaveCount(1);

  await frame.evaluate((el) => el.setAttribute("data-ct-mount-stamp", "1"));
  const srcdocBefore = await frame.getAttribute("srcdoc");

  await component.getByTestId("next-chunk").click();
  await expect(component.getByText("The screen", { exact: false })).toBeVisible();
  await component.getByTestId("next-chunk").click();
  await component.getByTestId("next-chunk").click();
  await expect(component.getByText("and dies", { exact: false })).toBeVisible();

  await expect(frame).toHaveCount(1);
  // The stamp survives ⇒ React never unmounted the iframe; the srcdoc is byte-identical ⇒ no reload.
  await expect(frame).toHaveAttribute("data-ct-mount-stamp", "1");
  await expect.poll(() => frame.getAttribute("srcdoc")).toBe(srcdocBefore);
});

test("SECURITY: the ghost's card frame is the srcdoc FLOOR — sandbox='', no routed mint, no external media", async ({ mount }) => {
  // Mounting a card EARLIER must not also widen it. The ghost pins the two axes commit owns: delivery
  // (srcdoc, which additionally inherits the app document's img-src) and the external-media verdict. The
  // sandbox attribute is the shared `SANDBOX_ATTR` — every restriction on, no scripts, no same-origin.
  const component = await mount(<GhostRowScriptedStory chunks={[CARD_OPEN, CARD_BODY, CARD_CLOSE]} cardTier="tierB" />);
  await driveScript(component, 3);

  const frame = component.locator(FRAME);
  await expect(frame).toHaveAttribute("sandbox", "");
  await expect(frame).toHaveAttribute("data-delivery", "srcdoc");
  const srcdoc = (await frame.getAttribute("srcdoc")) ?? "";
  expect(srcdoc).toContain("default-src 'none'");
  expect(srcdoc).toContain("img-src 'self'");
  // No `https:` on the media directives — the row's external-media verdict arrives with the settled row.
  expect(srcdoc).not.toContain("https:");
  // The card's own CSS rides the sandboxed document, never the app DOM.
  expect(srcdoc).toContain("#t{color:#0f0}");
});

test("§4.5: a tierA row renders the closed card INERT (no iframe) — the tier is the resolver's, not the ghost's", async ({ mount }) => {
  // The default tier for a mount with no resolved policy is the fail-closed tierA: the sanitized allowlist
  // in the main DOM, which forbids <style> and drops <img> — never a sandbox the room did not consent to.
  const component = await mount(<GhostRowScriptedStory chunks={[CARD_OPEN, CARD_BODY, CARD_CLOSE]} />);
  await driveScript(component, 3);

  await expect(component.locator('[data-slot="inert-card"]')).toHaveCount(1);
  await expect(component.locator("iframe")).toHaveCount(0);
  await expect(component.locator(CHIP)).toHaveCount(0);
  await expect(component.getByText("ACCESS GRANTED", { exact: false })).toBeVisible();
});

test("§4.5: an ABORT after the card mounted drops the card with the ghost row (no false card)", async ({ mount }) => {
  const component = await mount(<GhostRowScriptedStory chunks={[CARD_OPEN, CARD_BODY, CARD_CLOSE]} cardTier="tierB" />);
  await driveScript(component, 3);
  await expect(component.locator(FRAME)).toHaveCount(1);

  await component.getByTestId("abort").click();
  await expect(component.getByTestId("phase")).toHaveText("aborted");
  await expect(component.locator('[data-slot="ghost-message-row"]')).toHaveCount(0);
  await expect(component.locator(FRAME)).toHaveCount(0);
  await expect(component.locator("iframe")).toHaveCount(0);
});

test("reduced motion: the full streamed text lands immediately, with no pacing lag", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const longChunk = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
  const component = await mount(<GhostRowScriptedStory chunks={[longChunk]} />);
  await driveScript(component, 1);

  await expect(component.getByText(longChunk)).toBeVisible();
});
