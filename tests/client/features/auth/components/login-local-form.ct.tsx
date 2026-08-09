// CT: the local-mode credential form (features/auth/components/login-local-form.tsx — FINAL-Auth-Modes
// §7 P0; the surface a `local`-mode deploy boots into, unreachable in the single-user dev stack). Pins
// the RENDERED behavior: the handle pre-fill (and the discreet blank state), submit disabled until both
// fields carry text, the generic server refusal rendered as a live error (no enumeration copy added
// client-side), and a minted cookie resolving to `onLoggedIn`. The network edge is stubbed with
// `page.route` at `/api/auth/login` (the form posts urlencoded — asserted, because the server route
// parses a FORM body, not JSON).

import { expect, test } from "@playwright/experimental-ct-react";
import { LoginLocalFormStory } from "../_ct-stories.tsx";

test("pre-fills the handle and gates submit on a non-empty password", async ({ mount, page }) => {
  await mount(<LoginLocalFormStory defaultHandle="owner" />);
  await expect(page.getByTestId("login-handle")).toHaveValue("owner");
  await expect(page.getByTestId("login-submit")).toBeDisabled();
  await page.getByTestId("login-password").fill("hunter22");
  await expect(page.getByTestId("login-submit")).toBeEnabled();
});

test("discreet login (null defaultHandle) starts blank — and an empty handle keeps submit disabled", async ({ mount, page }) => {
  await mount(<LoginLocalFormStory defaultHandle={null} />);
  await expect(page.getByTestId("login-handle")).toHaveValue("");
  await page.getByTestId("login-password").fill("hunter22");
  await expect(page.getByTestId("login-submit")).toBeDisabled();
});

test("a refused login renders the server's generic error and stays on the form", async ({ mount, page }) => {
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "invalid credentials" }),
    }),
  );
  await mount(<LoginLocalFormStory defaultHandle="owner" />);
  await page.getByTestId("login-password").fill("wrong");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("login-error")).toHaveText("invalid credentials");
  await expect(page.getByTestId("login-submit")).toBeEnabled(); // recoverable — not stuck pending
});

test("a successful login posts an urlencoded credential form and fires onLoggedIn", async ({ mount, page }) => {
  let postedBody = "";
  await page.route("**/api/auth/login", (route) => {
    postedBody = route.request().postData() ?? "";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
  await mount(<LoginLocalFormStory defaultHandle="owner" />);
  await page.getByTestId("login-password").fill("hunter22");
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("ct-logged-in")).toBeVisible();
  // The server route parses a FORM body (`parseBody`) — a JSON post would silently 400.
  expect(postedBody).toBe(new URLSearchParams({ handle: "owner", password: "hunter22" }).toString());
});

// The AUTOFILL ANATOMY guard (owner flag, 2026-08-09 — the visual layer must never break Chrome's
// password-save heuristics). Chrome's form-identity heuristic keys on: a REAL <form> ancestor, real
// <input> controls (the sealed @orb/ui Field+Input, not bespoke editables), the exact `autocomplete`
// tokens, and `type="password"` on the secret. Pinned so a future skin can't silently kill autofill.
test("AUTOFILL ANATOMY: real <form>, real inputs, autocomplete=username/current-password, type=password", async ({ mount, page }) => {
  await mount(<LoginLocalFormStory defaultHandle="owner" />);
  const form = page.locator("form");
  await expect(form).toHaveCount(1);
  const handle = form.getByTestId("login-handle");
  const password = form.getByTestId("login-password");
  await expect(handle).toBeVisible();
  await expect(password).toBeVisible();
  // The N9 identity tokens, verbatim (§13.10): username + current-password.
  await expect(handle).toHaveAttribute("autocomplete", "username");
  await expect(password).toHaveAttribute("autocomplete", "current-password");
  await expect(password).toHaveAttribute("type", "password");
  // Both are REAL <input> elements rendered by the sealed primitive — not styled editables.
  const tags = await form.evaluate((el) => [...el.querySelectorAll("[data-testid=login-handle],[data-testid=login-password]")].map((n) => n.tagName));
  // ONESHOT-OK: static DOM structure, already awaited visible above.
  expect(tags).toEqual(["INPUT", "INPUT"]);
});
