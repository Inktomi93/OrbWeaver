// CT: the hint-trigger primitive (§16, 2026-08-09 report card — extracted from field.tsx's label
// hint + section.tsx's heading hint, which each covered this atom only through their own composite).
// Exercises both call-site anatomies directly: Field's "inline" (no-vertical-cost) sizing and
// Section's "icon" sizing, plus the accname sibling-not-descendant contract the component's own
// doc-comment states — the button MUST be a sibling of the labeled element, never a descendant, or
// "More info" leaks into the labeled element's accessible name (W3C accname subtree concatenation).
import { HintTrigger } from "@orb/ui/hint-trigger";
import { expect, test } from "@playwright/experimental-ct-react";
import { LabeledFixture } from "./hint-trigger.fixtures.tsx";

test("inline size (Field's anatomy): renders the locator, derives its name from subject, opens the tooltip", async ({ mount, page }) => {
  // The mount ROOT is the trigger itself (Tooltip.Root renders no DOM wrapper) — `page.locator`, not
  // `component.locator` (which only searches descendants; the avatar-stack.ct.tsx group-role precedent).
  await mount(<HintTrigger className="test-trigger" hint="Saved every 30 seconds" size="inline" subject="Display name" />);
  await expect(page.locator('[data-slot="hint-trigger"]')).toHaveCount(1);
  const button = page.getByRole("button", { name: "More info about Display name" });
  await expect(button).toBeVisible();
  await button.hover();
  await expect(page.locator('[data-slot="tooltip-popup"]')).toHaveText("Saved every 30 seconds");
});

test("icon size (Section's anatomy): same locator, same accname/tooltip contract under the other size", async ({ mount, page }) => {
  await mount(<HintTrigger className="test-trigger" hint="How the sampler shapes the distribution." size="icon" subject="Sampling" />);
  await expect(page.locator('[data-slot="hint-trigger"]')).toHaveCount(1);
  const button = page.getByRole("button", { name: "More info about Sampling" });
  await expect(button).toBeVisible();
  await button.hover();
  await expect(page.locator('[data-slot="tooltip-popup"]')).toHaveText("How the sampler shapes the distribution.");
});

test("an optional onClick fires on activation AND the tooltip still shows on hover (#866 S3 — the teacher's door)", async ({ mount, page }) => {
  let clicks = 0;
  await mount(
    <HintTrigger
      className="test-trigger"
      hint="Opens the teacher"
      onClick={(): void => {
        clicks += 1;
      }}
      subject="Chat width"
    />,
  );
  const button = page.getByRole("button", { name: "More info about Chat width" });
  await button.hover();
  await expect(page.locator('[data-slot="tooltip-popup"]')).toHaveText("Opens the teacher");
  await button.click();
  expect(clicks).toBe(1);
});

test("falls back to the bare name when subject is not a plain string", async ({ mount, page }) => {
  await mount(<HintTrigger className="test-trigger" hint="x" subject={<span>Notes</span>} />);
  await expect(page.getByRole("button", { name: "More info", exact: true })).toBeVisible();
});

test("falls back to the bare name when subject is absent", async ({ mount, page }) => {
  await mount(<HintTrigger className="test-trigger" hint="x" />);
  await expect(page.getByRole("button", { name: "More info", exact: true })).toBeVisible();
});

test("accname sibling-not-descendant: mounted as a SIBLING of a labeled control, the label's own accname stays clean", async ({ mount, page }) => {
  // Mirrors the shape both call sites enforce (field.tsx's labelRow / section.tsx's headingRow): the
  // trigger sits BESIDE the labeled element in the DOM, never nested inside it.
  await mount(<LabeledFixture />);
  // The control's accname is EXACTLY the label text — no "More info" suffix leaked from the sibling
  // trigger (the defect this atom's whole doc-comment exists to prevent).
  await expect(page.getByRole("textbox", { name: "Notes", exact: true })).toBeVisible();
  // The trigger itself is independently reachable with its OWN derived name.
  await expect(page.getByRole("button", { name: "More info about Notes" })).toBeVisible();
});

// THE PRESS DOOR (#2443). Base UI 1.7.0's tooltip hover is `mouseOnly: true` and its focus fallback
// gates on `:focus-visible`, so a tap reached neither and the hint was unreachable at 92 call sites.
// These run under an emulated TOUCH device (`hasTouch` flips `matchMedia("(pointer: coarse)")` in
// chromium and makes `locator.tap()` dispatch a real touch sequence — the tokens/index.ct.tsx
// precedent), which is the pointer the defect was reported on.
test.describe("the press door at a coarse pointer", () => {
  test.use({ hasTouch: true });

  test("a TAP discloses the hint, and the hint is already the trigger's resolving description at rest", async ({ mount, page }) => {
    await mount(<HintTrigger className="test-trigger" hint="Affects every reply that stops at the length cap." subject="Reply length" />);
    const button = page.getByRole("button", { name: "More info about Reply length" });
    // AT REST: the description resolves to real text — the defect was an `aria-describedby` pointing
    // only at the unmounted tooltip popup, so a virtual cursor read the name and nothing else.
    const restText = (): Promise<string> =>
      button.evaluate((el: HTMLElement): string =>
        (el.getAttribute("aria-describedby") ?? "")
          .split(/\s+/)
          .filter((id) => id.length > 0)
          .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? "")
          .join(" ")
          .trim(),
      );
    // POLLED: the description's carrier is mounted by the seal's own effect, so the resolved text arrives a
    // frame after the trigger does — a single read samples the empty string by timing luck.
    await expect.poll(restText).toContain("Affects every reply that stops at the length cap.");
    // ON TAP: a rendered dialog carries the same sentence.
    await button.tap();
    const popup = page.locator('[data-slot="hint-popup"]');
    await expect(popup).toBeVisible();
    await expect(popup).toContainText("Affects every reply that stops at the length cap.");
    // And it is dismissable without a keyboard.
    await page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
  });

  test("the onClick escape hatch OWNS the press — no second popup opens behind the caller's own door", async ({ mount, page }) => {
    let clicks = 0;
    await mount(
      <HintTrigger
        className="test-trigger"
        hint="Opens the teacher"
        onClick={(): void => {
          clicks += 1;
        }}
        subject="Chat width"
      />,
    );
    await page.getByRole("button", { name: "More info about Chat width" }).tap();
    expect(clicks).toBe(1);
    await expect(page.locator('[data-slot="hint-popup"]')).toHaveCount(0);
  });
});

test("a mouse CLICK discloses the hint too (the fine-pointer half of the same defect)", async ({ mount, page }) => {
  await mount(<HintTrigger className="test-trigger" hint="Saved every 30 seconds" size="inline" subject="Display name" />);
  const button = page.getByRole("button", { name: "More info about Display name" });
  await button.click();
  await expect(page.locator('[data-slot="hint-popup"]')).toContainText("Saved every 30 seconds");
});
