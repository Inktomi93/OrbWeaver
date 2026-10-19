// A signed-out visitor's section alias survives the auth redirect: sign-in lands on the aliased Corpus mode.
import { CORPUS_MODE_LABELS } from "@orb/client/lib";
import { devices } from "@playwright/test";
import { waitForAppReady } from "./support/chat-room.ts";
import { expect, test } from "./support/corpus-test.ts";
import { BROWSER_PROJECTS, CORPUS_LOCAL_PASSWORDS, SELECTED_LOCAL_CORPUS_FIXTURE } from "./support/modes.ts";
import { WAIT_SETTLE_MS } from "./support/timeouts.ts";

test("the /analytics alias heals to Corpus Insights before the auth redirect and survives sign-in", { tag: "@smoke" }, async ({ browser, baseURL }, info) => {
  const owner = SELECTED_LOCAL_CORPUS_FIXTURE?.wire.reads["sessions.me"][0]?.output;
  const password = CORPUS_LOCAL_PASSWORDS.owner;
  if (owner === undefined || password === undefined) {
    throw new Error("Signed-out corpus smoke requires its captured owner and run-owned password");
  }
  const project = BROWSER_PROJECTS.find(({ name }) => name === info.project.name);
  if (project === undefined) {
    throw new Error("Signed-out smoke has no native device project");
  }
  // A loopback request with no relay tell resolves as the box owner even without a cookie; an empty `forwarded`
  // header is the tell that makes this browser the signed-out visitor it stands for.
  const context = await browser.newContext({
    ...devices[project.device],
    baseURL: baseURL ?? "",
    locale: "en-US",
    timezoneId: "UTC",
    extraHTTPHeaders: { forwarded: "" },
  });
  try {
    const page = await context.newPage();
    await page.goto("/analytics");
    await expect(page).toHaveURL(/\/login$/u, { timeout: WAIT_SETTLE_MS });
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Handle", exact: true }).fill(owner.handle);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await waitForAppReady(page);
    // The alias named a Corpus mode before the redirect; the signed-in app opens on it rather than on Home.
    await expect(page.getByRole("radio", { name: CORPUS_MODE_LABELS.insights, exact: true }).first()).toHaveAttribute("aria-checked", "true");
  } finally {
    await context.close();
  }
});
