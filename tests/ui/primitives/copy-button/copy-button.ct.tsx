// CT: the copy-button seal — the write, the announced outcome, keyboard operation, and the manual-copy
// fallback for a page with no Clipboard API (plain http) or a refused write. Messages are compared with
// each other, never with literals: the contract is that each outcome says something different.

import { CopyButton } from "@orb/ui/copy-button";
import { copyActionName } from "@orb/ui/lib";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";

const TEXT = "AUTH_MODE=local";
const WHAT = "the environment line AUTH_MODE=local";
const MULTILINE = "first line\nsecond line";
const REFUSED = "the refused line";
const INSECURE = "the insecure line";

function statusOf(page: Page): Locator {
  return page.getByRole("status");
}

function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

function removeClipboardApi(page: Page): Promise<void> {
  // What an insecure (plain http) origin looks like: the [SecureContext] API is absent, not rejecting.
  return page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    Object.defineProperty(globalThis, "isSecureContext", { configurable: true, value: false });
  });
}

function refuseWrites(page: Page): Promise<void> {
  return page.evaluate(() => {
    navigator.clipboard.writeText = (): Promise<void> => Promise.reject(new Error("denied"));
  });
}

test.describe("with clipboard permission", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("a press writes the text and announces success in a polite live region that was mounted empty", async ({ mount, page }) => {
    await mount(<CopyButton text={TEXT} what={WHAT} />);
    const status = statusOf(page);
    // The region exists before anything happens: a live region inserted WITH its text is not reliably announced.
    await expect(status).toHaveAttribute("aria-live", "polite");
    await expect(status).toBeEmpty();

    await page.getByRole("button", { name: copyActionName(WHAT), exact: true }).click();

    await expect.poll(() => readClipboard(page)).toBe(TEXT);
    await expect(status).not.toBeEmpty();
    await expect(status).toHaveAttribute("data-outcome", "copied");
    // No fallback on success.
    await expect(page.getByRole("textbox")).toHaveCount(0);
  });

  test("the accessible name is the same before and after a copy (label in name)", async ({ mount, page }) => {
    await mount(<CopyButton text={TEXT} what={WHAT} />);
    const button = page.getByRole("button", { name: copyActionName(WHAT), exact: true });
    await button.click();
    await expect(statusOf(page)).not.toBeEmpty();
    await expect(button).toBeVisible();
    await expect(page.getByRole("button")).toHaveCount(1);
  });

  test("Enter and Space both copy from the keyboard", async ({ mount, page }) => {
    await mount(<CopyButton text={TEXT} what={WHAT} />);
    const button = page.getByRole("button", { name: copyActionName(WHAT), exact: true });

    await page.keyboard.press("Tab");
    await expect(button).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(() => readClipboard(page)).toBe(TEXT);

    await page.evaluate(() => navigator.clipboard.writeText("overwritten"));
    await expect.poll(() => readClipboard(page)).toBe("overwritten");
    await page.keyboard.press("Space");
    await expect.poll(() => readClipboard(page)).toBe(TEXT);
  });

  test("a repeated press with the same outcome clears the region first, so it is announced again", async ({ mount, page }) => {
    await mount(<CopyButton text={TEXT} what={WHAT} />);
    const button = page.getByRole("button", { name: copyActionName(WHAT), exact: true });
    await button.click();
    await expect(statusOf(page)).not.toBeEmpty();

    const recorder = await statusOf(page).evaluateHandle((node) => {
      const texts: string[] = [];
      new MutationObserver(() => texts.push(node.textContent ?? "")).observe(node, { characterData: true, childList: true, subtree: true });
      return texts;
    });
    await button.click();

    // The first change empties the region; the last one fills it again.
    await expect.poll(() => recorder.evaluate((recorded) => [recorded[0], recorded.length >= 2 && recorded.at(-1) !== ""])).toEqual(["", true]);
  });
});

test("an insecure page selects the text in a read-only field and says so", async ({ mount, page }) => {
  await mount(<CopyButton text={MULTILINE} what={WHAT} />);
  await removeClipboardApi(page);

  await page.getByRole("button", { name: copyActionName(WHAT), exact: true }).click();

  const field = page.getByRole("textbox", { name: WHAT, exact: true });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue(MULTILINE);
  await expect(field).not.toBeEditable();
  await expect.poll(() => field.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, MULTILINE.length]);
  await expect(statusOf(page)).toHaveAttribute("data-outcome", "insecure");
  await expect(statusOf(page)).not.toBeEmpty();
});

test("a repeated failure is announced again and re-selects the text", async ({ mount, page }) => {
  await mount(<CopyButton text={TEXT} what={WHAT} />);
  await removeClipboardApi(page);
  const button = page.getByRole("button", { name: copyActionName(WHAT), exact: true });
  const field = page.getByRole("textbox", { name: WHAT, exact: true });
  await button.click();
  await expect(field).toBeFocused();

  const recorder = await statusOf(page).evaluateHandle((node) => {
    const texts: string[] = [];
    new MutationObserver(() => texts.push(node.textContent ?? "")).observe(node, { characterData: true, childList: true, subtree: true });
    return texts;
  });
  await button.click();

  await expect(field).toBeFocused();
  await expect.poll(() => field.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, TEXT.length]);
  await expect.poll(() => recorder.evaluate((recorded) => [recorded[0], recorded.length >= 2 && recorded.at(-1) !== ""])).toEqual(["", true]);
});

test("a failed copy stamps the failed state and replaces the subject with the field", async ({ mount, page }) => {
  const component = await mount(
    <CopyButton text={TEXT} what={WHAT}>
      <span data-testid="subject">{TEXT}</span>
    </CopyButton>,
  );
  await expect(component).toHaveAttribute("data-state", "idle");
  await expect(page.getByTestId("subject")).toBeVisible();
  await removeClipboardApi(page);
  await page.getByRole("button", { name: copyActionName(WHAT), exact: true }).click();
  await expect(component).toHaveAttribute("data-state", "failed");
  await expect(page.getByTestId("subject")).toBeHidden();
  const field = page.getByRole("textbox", { name: WHAT, exact: true });
  await expect(field).toBeFocused();
  // The field is described by the status that says why and how to copy by hand.
  await expect(field).toHaveAttribute("aria-describedby", (await statusOf(page).getAttribute("id")) ?? "missing");
});

test("on a wide page the failed field keeps a line of its own, with the button below it", async ({ mount, page }) => {
  await mount(
    <CopyButton text={TEXT} what={WHAT}>
      <span>{TEXT}</span>
    </CopyButton>,
  );
  await removeClipboardApi(page);
  const button = page.getByRole("button", { name: copyActionName(WHAT), exact: true });
  await button.click();
  const field = page.getByRole("textbox", { name: WHAT, exact: true });
  await expect(field).toBeFocused();
  await expect
    .poll(async () => {
      const [fieldBox, buttonBox] = await Promise.all([field.boundingBox(), button.boundingBox()]);
      return fieldBox !== null && buttonBox !== null && buttonBox.y >= fieldBox.y + fieldBox.height;
    })
    .toBe(true);
});

test("a refused write falls back the same way, with its own reason", async ({ mount, page }) => {
  await mount(
    <div>
      <CopyButton text={TEXT} what={REFUSED} />
      <CopyButton text={TEXT} what={INSECURE} />
    </div>,
  );
  await refuseWrites(page);
  await page.getByRole("button", { name: copyActionName(REFUSED), exact: true }).click();
  const refusedField = page.getByRole("textbox", { name: REFUSED, exact: true });
  await expect(refusedField).toBeFocused();
  await expect.poll(() => refusedField.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, TEXT.length]);

  await removeClipboardApi(page);
  await page.getByRole("button", { name: copyActionName(INSECURE), exact: true }).click();
  await expect(page.getByRole("textbox", { name: INSECURE, exact: true })).toBeFocused();

  // Each control reports its own outcome, and the two messages differ.
  await expect(page.getByRole("status").nth(0)).toHaveAttribute("data-outcome", "refused");
  await expect(page.getByRole("status").nth(1)).toHaveAttribute("data-outcome", "insecure");
  await expect
    .poll(async () => {
      const [refused = "", insecure = ""] = await page.getByRole("status").allTextContents();
      return refused !== "" && insecure !== "" && refused !== insecure;
    })
    .toBe(true);
});

test("a secure page without the Clipboard API is a refusal, not an insecure page", async ({ mount, page }) => {
  await mount(<CopyButton text={TEXT} what={WHAT} />);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    Object.defineProperty(globalThis, "isSecureContext", { configurable: true, value: true });
  });
  await page.getByRole("button", { name: copyActionName(WHAT), exact: true }).click();
  await expect(statusOf(page)).toHaveAttribute("data-outcome", "refused");
  await expect(page.getByRole("textbox", { name: WHAT, exact: true })).toBeFocused();
});

test("a stale press that settles after a newer one cannot overwrite the newer result", async ({ mount, page }) => {
  await mount(<CopyButton text={TEXT} what={WHAT} />);
  // Each write waits until the test settles it, in any order: `true` resolves it, `false` rejects it.
  const settlers = await page.evaluateHandle(() => {
    const pending: ((ok: boolean) => void)[] = [];
    navigator.clipboard.writeText = (): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        pending.push((ok) => (ok ? resolve() : reject(new Error("denied"))));
      });
    return pending;
  });
  const button = page.getByRole("button", { name: copyActionName(WHAT), exact: true });
  await button.click();
  await button.click();
  await expect.poll(() => settlers.evaluate((pending) => pending.length)).toBe(2);

  await settlers.evaluate((pending) => pending[1]?.(true));
  await expect(statusOf(page)).toHaveAttribute("data-outcome", "copied");

  await settlers.evaluate((pending) => pending[0]?.(false));
  // Two frames for the stale rejection to reach a commit if the guard were missing.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(statusOf(page)).toHaveAttribute("data-outcome", "copied");
  await expect(page.getByRole("textbox")).toHaveCount(0);
});

test("a later success removes the manual-copy field", async ({ mount, page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await mount(<CopyButton text={TEXT} what={WHAT} />);
  await refuseWrites(page);
  const button = page.getByRole("button", { name: copyActionName(WHAT), exact: true });
  await button.click();
  await expect(page.getByRole("textbox")).toHaveCount(1);

  await page.evaluate(() => {
    // Restore the prototype method the refusal shadowed on the instance.
    Reflect.deleteProperty(navigator.clipboard, "writeText");
  });
  await button.click();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(statusOf(page)).toHaveAttribute("data-outcome", "copied");
  await expect.poll(() => readClipboard(page)).toBe(TEXT);
});

test("a disabled control is disabled and writes nothing", async ({ mount, page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await mount(<CopyButton disabled={true} text={TEXT} what={WHAT} />);
  await page.evaluate(() => navigator.clipboard.writeText("untouched"));
  const button = page.getByRole("button", { name: copyActionName(WHAT), exact: true });
  await expect(button).toBeDisabled();
  await button.click({ force: true });
  await expect(statusOf(page)).toBeEmpty();
  await expect.poll(() => readClipboard(page)).toBe("untouched");
});
