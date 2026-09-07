// imagine-body CT (interaction-direction-spec.md §7 B5) — the /imagine preview-before-spend surface.
// Free mode: Generate requests chat.generateImage with the typed prompt verbatim. Extraction mode: Preview
// fills the prompt from imagery.extractPrompt, then Generate sends that resolved prompt as free mode. Asserts
// the RECORDED tRPC inputs (routeTrpc is the spy) against the exact seed the story used.

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcHold } from "../../../../support/node/route-trpc.ts";
import { ImagineExtractStory, ImagineFreeStory } from "../_ct-stories.tsx";

/** The read-the-chat button's accessible name. It used to be "Preview prompt", a 13px ghost tucked into the
 *  Prompt LABEL row where it read as a caption rather than as the LLM call it is (#623 P1). */
const READ_THE_CHAT = { name: "Read the chat first" };

// The pre-spend cost cue and elapsed-counter shape; the changing digit proves the surface is live.
const SPENDS_A_CALL = /Spends a small text call now/u;
const GENERATING_ELAPSED = /Generating the image… \d+s/u;

test("imagine free mode: Generate requests chat.generateImage with the verbatim prompt", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  const rec = await routeTrpc(page, { "chat.generateImage": {} });
  const cmp = await mount(<ImagineFreeStory chatId={chatId} />);

  const generate = cmp.getByRole("button", { name: "Generate" });
  await expect(generate).toBeEnabled();
  await generate.click();

  await expect.poll(() => rec.count("chat.generateImage")).toBe(1);
  // ONESHOT-OK: the preceding expect.poll(rec.count).toBe(1) barriers on the call being recorded, so this reads a settled input.
  expect(rec.lastInput("chat.generateImage")).toMatchObject({ mode: "free", prompt: "a dragon over the castle" });
});

test("imagine extraction mode: Preview fills the prompt from extractPrompt, then Generate sends it verbatim", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  const extracted = "a dim tavern, wooden beams, candlelight";
  const rec = await routeTrpc(page, {
    "imagery.extractPrompt": { prompt: extracted, mode: "scenario", source: "extracted", costUsd: 0.001 },
    "chat.generateImage": {},
  });
  const cmp = await mount(<ImagineExtractStory chatId={chatId} />);

  const preview = cmp.getByRole("button", READ_THE_CHAT);
  await expect(preview).toBeVisible();
  await preview.click();

  const prompt = cmp.getByRole("textbox", { name: "Image prompt" });
  await expect(prompt).toHaveValue(extracted);
  // ONESHOT-OK: toHaveValue(extracted) only passes AFTER extractPrompt resolved and set the prompt, so its input is recorded and settled.
  expect(rec.lastInput("imagery.extractPrompt")).toMatchObject({ mode: "scenario" });

  await cmp.getByRole("button", { name: "Generate" }).click();
  await expect.poll(() => rec.count("chat.generateImage")).toBe(1);
  // A resolved prompt IS the image — sent verbatim as free mode even though the mode strip said "scenario".
  // ONESHOT-OK: the preceding expect.poll(rec.count).toBe(1) barriers on the call being recorded, so this reads a settled input.
  expect(rec.lastInput("chat.generateImage")).toMatchObject({ mode: "free", prompt: extracted });
});

// ── #623 P1: the cost boundary ────────────────────────────────────────────────────────────────────────
// `imagery.extractPrompt` returns `{prompt, mode, source, costUsd}` and the modal used to keep only `prompt`
// — the server handed the client the exact price of a call it had just made and the client dropped it. These
// pin the two halves the reviewer measured: the PRICE of the read once it is known, and the fact that an
// extraction mode with an empty prompt charges TWICE (the read, then the image) stated as prose, not as the
// smallest gloss on the surface. The generate cost is NOT here and cannot be: `chat.generateImage` returns a
// `MessageView`, so the image's own price surfaces in the lightbox provenance strip, which owns it.

test("#623: the read call's PRICE is rendered once it is known — the server sends costUsd and the modal keeps it", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  await routeTrpc(page, {
    "imagery.extractPrompt": { prompt: "a dim tavern, candlelight", mode: "scenario", source: "extracted", costUsd: 0.0012 },
  });
  const cmp = await mount(<ImagineExtractStory chatId={chatId} />);

  // BEFORE: the row states that pressing it spends, so the price is never a surprise.
  await expect(cmp.getByText(SPENDS_A_CALL)).toBeVisible();
  await cmp.getByRole("button", READ_THE_CHAT).click();

  // AFTER: the real number the server charged, in the feature's one cost voice (four decimals — a spend
  // surface that rounds $0.0012 to $0.00 is lying), plus the fact that the image is a SEPARATE charge.
  await expect(cmp.getByText("Read the chat: $0.0012 spent. The image is a separate charge.")).toBeVisible();
});

test("#623: a NULL costUsd is stated, never printed as $0.0000 (which would read as free)", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  await routeTrpc(page, { "imagery.extractPrompt": { prompt: "a dim tavern", mode: "scenario", source: "extracted", costUsd: null } });
  const cmp = await mount(<ImagineExtractStory chatId={chatId} />);
  await cmp.getByRole("button", READ_THE_CHAT).click();

  await expect(cmp.getByText("Read the chat. The image is a separate charge.")).toBeVisible();
  await expect(cmp.getByText("$0.0000")).toBeHidden();
});

test("#623: an extraction mode with an empty prompt says it charges TWICE — and stops saying so once one is typed", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  await routeTrpc(page, {});
  const cmp = await mount(<ImagineExtractStory chatId={chatId} />);

  const notice = cmp.locator('[data-slot="imagine-double-spend"]');
  await expect(notice).toContainText("charges TWICE");
  // Typing a prompt collapses the surface to ONE charge (the prompt is sent verbatim as free mode), so the
  // double-spend notice must go — a warning that never turns off is a warning nobody reads.
  await cmp.getByRole("textbox", { name: "Image prompt" }).fill("a dragon");
  await expect(notice).toBeHidden();
});

// ── #623 P1: a 5-60s spend is not a dead surface ──────────────────────────────────────────────────────
// The only feedback used to be a dimmed button whose label read "Generating…". A user who cannot tell
// working from hung presses Escape, assumes failure, and generates again — a second charge. `trpcHold` pins
// the in-flight arm as a stable settled state rather than trying to catch a flash.

test("#623: a generate IN FLIGHT carries a spinner, an elapsed count, a time expectation, and says closing is safe", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  const hold = trpcHold();
  await routeTrpc(page, { "chat.generateImage": hold });
  const cmp = await mount(<ImagineFreeStory chatId={chatId} />);
  await cmp.getByRole("button", { name: "Generate" }).click();
  await hold.requested;

  const pending = cmp.locator('[data-slot="imagine-generating"]');
  await expect(pending.getByRole("status")).toContainText("Generating the image");
  await expect(pending).toContainText(GENERATING_ELAPSED);
  // CLOSING MID-FLIGHT IS ALREADY SAFE — the generate is busDriven and the image posts into the room whether
  // or not this modal is open. Nothing said so, so users cancelled a spend they had already paid for.
  await expect(pending).toContainText("Usually 5-60 seconds. You can close this — the image posts into the chat when it's ready.");
});

test("#623: the mode strip is INERT mid-spend — the in-flight request already carries the old mode", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  const hold = trpcHold();
  await routeTrpc(page, { "chat.generateImage": hold });
  const cmp = await mount(<ImagineFreeStory chatId={chatId} />);
  await cmp.getByRole("button", { name: "Generate" }).click();
  await hold.requested;

  await expect(cmp.getByRole("button", { name: "Face" })).toBeDisabled();
});

test("#623: the mode strip is ONE named group, not five loose buttons", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  await routeTrpc(page, {});
  const cmp = await mount(<ImagineFreeStory chatId={chatId} />);

  await expect(cmp.getByRole("group", { name: "Mode" })).toBeVisible();
});
