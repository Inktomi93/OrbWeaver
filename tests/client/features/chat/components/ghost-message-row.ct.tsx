// CT: the streaming ghost row + ghost isolation. Drives the chat-stream store in-browser (begin →
// token…) and asserts: pending shows the TTFT shimmer; streaming reveals paced markdown; and more
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
import { GhostRowScriptedStory, GhostRowStory } from "../_ct-stories";

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

test("pending shows the TTFT shimmer, then streaming reveals paced markdown", async ({ mount }) => {
  const component = await mount(<GhostRowStory />);
  const phase = component.getByTestId("phase");

  await component.getByTestId("begin").click();
  await expect(phase).toHaveText("pending");
  await expect(component.getByRole("status")).toBeVisible();

  await component.getByTestId("token").click();
  await expect(phase).toHaveText("streaming");
  await expect(component.getByText("Hi")).toBeVisible();
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

test("reduced motion: the full streamed text lands immediately, with no pacing lag", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const longChunk = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
  const component = await mount(<GhostRowScriptedStory chunks={[longChunk]} />);
  await driveScript(component, 1);

  await expect(component.getByText(longChunk)).toBeVisible();
});
