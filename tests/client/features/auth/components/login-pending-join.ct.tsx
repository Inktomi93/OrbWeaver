import { CSRF_HEADER } from "@orb/contracts/identity";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page, Request, Route } from "@playwright/test";
import { PendingJoinStory } from "./_pending-join-stories.tsx";
import {
  APPROVAL_RESPONSE,
  JOIN_CONFIRM_LABEL,
  JOIN_DESTINATION_LABEL,
  JOIN_NAME_LABEL,
  JOIN_PERSONA,
  JOINED_RESPONSE,
  PENDING_AUTH_CONFIG,
  PENDING_CONFIRM_PATH,
  PENDING_PREVIEW_PATH,
  PENDING_ROOM,
  REFUSED_RESPONSE,
  UNAVAILABLE_RESPONSE,
} from "./pending-join-fixtures.ts";

async function captureConfirms(page: Page, respond: (route: Route) => Promise<void>): Promise<Request[]> {
  const requests: Request[] = [];
  await page.route(PENDING_CONFIRM_PATH, async (route) => {
    requests.push(route.request());
    await respond(route);
  });
  return requests;
}

async function previewRoom(page: Page): Promise<void> {
  await page.route(PENDING_PREVIEW_PATH, (route) => route.fulfill({ status: 200, json: PENDING_ROOM }));
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/config", (route) => route.fulfill({ status: 200, json: PENDING_AUTH_CONFIG }));
  await page.evaluate(() => globalThis.history.replaceState(null, "", "/login?pendingJoin=1"));
});

test("a held preview offers no Join until the room is available", async ({ mount, page }) => {
  const requested = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const deliveries = new Set<Promise<void>>();
  const confirms = await captureConfirms(page, (route) => route.fulfill({ status: 200, json: JOINED_RESPONSE }));
  await page.route(PENDING_PREVIEW_PATH, async (route) => {
    const delivered = Promise.withResolvers<void>();
    deliveries.add(delivered.promise);
    try {
      requested.resolve();
      await release.promise;
      await route.fulfill({ status: 200, json: PENDING_ROOM });
    } finally {
      delivered.resolve();
    }
  });
  try {
    await mount(<PendingJoinStory />);
    await requested.promise;
    await expect(page.getByLabel("Loading your invite", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: JOIN_CONFIRM_LABEL, exact: true })).toHaveCount(0);
    expect(confirms).toHaveLength(0);
    release.resolve();
    await expect(page.getByRole("heading", { name: "You're invited", exact: true })).toBeVisible();
    await expect(page.getByText(PENDING_ROOM.roomName, { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: JOIN_CONFIRM_LABEL, exact: true })).toBeEnabled();
  } finally {
    release.resolve();
    await Promise.all(deliveries);
  }
});

test("an unavailable pending join exposes no persona or confirmation", async ({ mount, page }) => {
  const confirms = await captureConfirms(page, (route) => route.fulfill({ status: 404, json: UNAVAILABLE_RESPONSE }));
  await page.route(PENDING_PREVIEW_PATH, (route) => route.fulfill({ status: 404, json: UNAVAILABLE_RESPONSE }));
  await mount(<PendingJoinStory />);
  await expect(page.getByRole("heading", { name: "This invite isn't available", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: JOIN_NAME_LABEL, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: JOIN_CONFIRM_LABEL, exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: JOIN_DESTINATION_LABEL, exact: true })).toHaveCount(0);
  expect(confirms).toHaveLength(0);
});

test("an unnamed persona focuses its error without a request, then submits only the canonical persona and CSRF", async ({ mount, page }) => {
  await previewRoom(page);
  const confirms = await captureConfirms(page, (route) => route.fulfill({ status: 200, json: JOINED_RESPONSE }));
  await mount(<PendingJoinStory />);
  const name = page.getByRole("textbox", { name: JOIN_NAME_LABEL, exact: true });
  const submit = page.getByRole("button", { name: JOIN_CONFIRM_LABEL, exact: true });
  await name.fill("   ");
  await submit.click();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toBeFocused();
  await expect(page.getByText("Give your persona a name.", { exact: true })).toBeVisible();
  expect(confirms).toHaveLength(0);

  await name.fill(`  ${JOIN_PERSONA.name}  `);
  await page.getByRole("textbox", { name: "Description", exact: true }).fill(`  ${JOIN_PERSONA.description}  `);
  await submit.click();
  await expect(page.getByRole("heading", { name: JOIN_DESTINATION_LABEL, exact: true })).toBeVisible();
  await expect(page.getByText(`chat=${PENDING_ROOM.chatId} section=chats`, { exact: true })).toBeVisible();
  expect(confirms).toHaveLength(1);
  for (const request of confirms) {
    const body: unknown = request.postDataJSON();
    expect(body).toEqual({ persona: JOIN_PERSONA });
    expect(request.method()).toBe("POST");
    expect(request.headers()[CSRF_HEADER]).toBe("1");
  }
});

test("a held confirm cannot submit twice and a non-signed-in result waits for approval", async ({ mount, page }) => {
  await previewRoom(page);
  const requested = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const deliveries = new Set<Promise<void>>();
  const confirms = await captureConfirms(page, async (route) => {
    const delivered = Promise.withResolvers<void>();
    deliveries.add(delivered.promise);
    try {
      requested.resolve();
      await release.promise;
      await route.fulfill({ status: 200, json: APPROVAL_RESPONSE });
    } finally {
      delivered.resolve();
    }
  });
  try {
    await mount(<PendingJoinStory />);
    await page.getByRole("textbox", { name: JOIN_NAME_LABEL, exact: true }).fill(JOIN_PERSONA.name);
    await page.getByRole("button", { name: JOIN_CONFIRM_LABEL, exact: true }).click();
    await requested.promise;
    const joining = page.getByRole("button", { name: "Joining…", exact: true });
    await expect(joining).toBeDisabled();
    await joining.evaluate((button) => {
      const form = button.closest("form");
      if (form === null) {
        throw new Error("the pending join submit control has no form");
      }
      form.requestSubmit();
      form.requestSubmit();
    });
    await expect(page.getByRole("heading", { name: JOIN_DESTINATION_LABEL, exact: true })).toHaveCount(0);
    release.resolve();
    await expect(page.getByRole("heading", { name: "Waiting for approval", exact: true })).toBeVisible();
    await expect(page.getByText("An admin must approve it before you can sign in.", { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: JOIN_DESTINATION_LABEL, exact: true })).toHaveCount(0);
    expect(confirms).toHaveLength(1);
  } finally {
    release.resolve();
    await Promise.all(deliveries);
  }
});

test("a refused confirm stays unsigned and renders the server refusal inline", async ({ mount, page }) => {
  await previewRoom(page);
  const confirms = await captureConfirms(page, (route) => route.fulfill({ status: 409, json: REFUSED_RESPONSE }));
  await mount(<PendingJoinStory />);
  await page.getByRole("textbox", { name: JOIN_NAME_LABEL, exact: true }).fill(JOIN_PERSONA.name);
  await page.getByRole("button", { name: JOIN_CONFIRM_LABEL, exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("An account already exists for this identity.");
  await expect(page.getByRole("heading", { name: JOIN_DESTINATION_LABEL, exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Waiting for approval", exact: true })).toHaveCount(0);
  expect(confirms).toHaveLength(1);
});
