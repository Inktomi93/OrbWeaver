// CT: the B4 first-run owner-password setup form (features/auth/components/login-first-run-form.tsx — the
// surface a FRESH local box boots into instead of the credential form). Pins the RENDERED behavior: submit
// gated until a valid (≥8-char) password is confirmed-matching, the too-short + mismatch inline errors, the
// server refusal (409 already-set) rendered live, and a successful POST firing `onDone`. The network edge is
// stubbed with `page.route` at `/api/auth/first-run` (the form posts urlencoded — the server parses a FORM body).

import { expect, test } from "@playwright/experimental-ct-react";
import { LoginFirstRunFormStory } from "../_ct-stories.tsx";

test("gates submit until a valid password is confirmed-matching", async ({ mount, page }) => {
  await mount(<LoginFirstRunFormStory ownerHandle="owner" />);
  await expect(page.getByTestId("first-run-submit")).toBeDisabled();
  await page.getByTestId("first-run-password").fill("hunter2password");
  // Password valid but confirm empty → still disabled.
  await expect(page.getByTestId("first-run-submit")).toBeDisabled();
  await page.getByTestId("first-run-confirm").fill("hunter2password");
  await expect(page.getByTestId("first-run-submit")).toBeEnabled();
});

test("a too-short password shows the min-length error and keeps submit disabled", async ({ mount, page }) => {
  await mount(<LoginFirstRunFormStory ownerHandle="owner" />);
  await page.getByTestId("first-run-password").fill("short");
  await expect(page.getByTestId("first-run-error")).toContainText("at least 8 characters");
  await expect(page.getByTestId("first-run-submit")).toBeDisabled();
});

test("a mismatched confirm shows the mismatch error", async ({ mount, page }) => {
  await mount(<LoginFirstRunFormStory ownerHandle="owner" />);
  await page.getByTestId("first-run-password").fill("hunter2password");
  await page.getByTestId("first-run-confirm").fill("hunter2different");
  await expect(page.getByTestId("first-run-error")).toContainText("don't match");
  await expect(page.getByTestId("first-run-submit")).toBeDisabled();
});

test("a server refusal (already set) renders live and stays on the form", async ({ mount, page }) => {
  await page.route("**/api/auth/first-run", (route) =>
    route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "the owner password is already set" }) }),
  );
  await mount(<LoginFirstRunFormStory ownerHandle="owner" />);
  await page.getByTestId("first-run-password").fill("hunter2password");
  await page.getByTestId("first-run-confirm").fill("hunter2password");
  await page.getByTestId("first-run-submit").click();
  await expect(page.getByTestId("first-run-error")).toHaveText("the owner password is already set");
  await expect(page.getByTestId("first-run-submit")).toBeEnabled(); // recoverable
});

test("a successful setup posts an urlencoded password and fires onDone", async ({ mount, page }) => {
  let postedBody = "";
  await page.route("**/api/auth/first-run", (route) => {
    postedBody = route.request().postData() ?? "";
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await mount(<LoginFirstRunFormStory ownerHandle="owner" />);
  await page.getByTestId("first-run-password").fill("hunter2password");
  await page.getByTestId("first-run-confirm").fill("hunter2password");
  await page.getByTestId("first-run-submit").click();
  await expect(page.getByTestId("ct-first-run-done")).toBeVisible();
  expect(postedBody).toBe(new URLSearchParams({ password: "hunter2password" }).toString());
});

// The AUTOFILL ANATOMY guard (owner flag, 2026-08-09 — the twin of login-local-form.ct.tsx's): a
// REAL <form>, sealed inputs, `type="password"`, and BOTH fields carrying `autocomplete="new-password"`
// — the token that makes Chrome OFFER TO SAVE the owner password instead of trying to fill an old one.
test("AUTOFILL ANATOMY: owner + confirm are real password inputs inside a <form>, both new-password", async ({ mount, page }) => {
  await mount(<LoginFirstRunFormStory ownerHandle="owner" />);
  const form = page.locator("form");
  await expect(form).toHaveCount(1);
  const owner = form.getByTestId("first-run-password");
  const confirm = form.getByTestId("first-run-confirm");
  await expect(owner).toBeVisible();
  await expect(confirm).toBeVisible();
  await expect(owner).toHaveAttribute("type", "password");
  await expect(confirm).toHaveAttribute("type", "password");
  await expect(owner).toHaveAttribute("autocomplete", "new-password");
  await expect(confirm).toHaveAttribute("autocomplete", "new-password");
  const tags = await form.evaluate((el) => [...el.querySelectorAll("[data-testid=first-run-password],[data-testid=first-run-confirm]")].map((n) => n.tagName));
  // ONESHOT-OK: static DOM structure, already awaited visible above.
  expect(tags).toEqual(["INPUT", "INPUT"]);
});
