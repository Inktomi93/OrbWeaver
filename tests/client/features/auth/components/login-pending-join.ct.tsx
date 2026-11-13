import { DIALOG_VERBS } from "@orb/client/lib";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { unnamedLandmarkElementFindings } from "@orb/testkit/browser/spec";
import { routeAuthConfig } from "@orb/testkit/ct";
import type { Page, Request, Route } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  BACK_TO_SIGN_IN_NAME,
  continueWithName,
  INVITE_LOADING_NAME,
  INVITE_UNAVAILABLE_TITLE,
  INVITED_HEADING,
  JOIN_CONFIRMING_NAME,
  JOIN_CREATE_ACCOUNT_NAME,
  JOINER_PERSONA_NAME_FIELD,
  JOINER_PERSONA_NAME_REQUIRED,
  PENDING_JOIN_ACCOUNT_EXISTS_LEAD,
  PENDING_JOIN_APPROVAL_NOTE,
  PENDING_JOIN_APPROVAL_TITLE,
  SIGN_IN_NAME,
} from "#client/features/auth/lib/pending-join-names.ts";
import type { PendingJoinStory } from "./_pending-join-stories.tsx";
import {
  APPROVAL_RESPONSE,
  JOIN_DESTINATION_LABEL,
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
  await routeAuthConfig(page, PENDING_AUTH_CONFIG);
  await page.addInitScript(() => {
    if (globalThis.top === globalThis.window) {
      globalThis.history.replaceState(null, "", "/login?pendingJoin=1");
    }
  });
});

test("the invite confirmation form is a named landmark", async ({ mount, page }) => {
  await previewRoom(page);
  await mount<typeof PendingJoinStory>("tests/client/features/auth/components/_pending-join-stories/PendingJoinStory", {});
  await expect(page.getByRole("heading", { name: INVITED_HEADING, exact: true })).toBeVisible();
  expect(await unnamedLandmarkElementFindings(page)).toEqual([]);
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
    await mount<typeof PendingJoinStory>("tests/client/features/auth/components/_pending-join-stories/PendingJoinStory", {});
    await requested.promise;
    await expect(page.getByLabel(INVITE_LOADING_NAME, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: JOIN_CREATE_ACCOUNT_NAME, exact: true })).toHaveCount(0);
    expect(confirms).toHaveLength(0);
    release.resolve();
    await expect(page.getByRole("heading", { name: INVITED_HEADING, exact: true })).toBeVisible();
    await expect(page.getByText(PENDING_ROOM.roomName, { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: JOIN_CREATE_ACCOUNT_NAME, exact: true })).toBeEnabled();
  } finally {
    release.resolve();
    await Promise.all(deliveries);
  }
});

test("a failed preview offers Retry, and the retried read opens the room", async ({ mount, page }) => {
  let failing = true;
  await page.route(PENDING_PREVIEW_PATH, (route) =>
    failing ? route.fulfill({ status: 503, json: { error: "unavailable" } }) : route.fulfill({ status: 200, json: PENDING_ROOM }),
  );
  await mount<typeof PendingJoinStory>("tests/client/features/auth/components/_pending-join-stories/PendingJoinStory", {});
  const retry = page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByRole("button", { name: JOIN_CREATE_ACCOUNT_NAME, exact: true })).toHaveCount(0);
  failing = false;
  await retry.click();
  await expect(page.getByRole("heading", { name: INVITED_HEADING, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: JOIN_CREATE_ACCOUNT_NAME, exact: true })).toBeEnabled();
});

test("an unavailable pending join exposes no persona or confirmation", async ({ mount, page }) => {
  const confirms = await captureConfirms(page, (route) => route.fulfill({ status: 404, json: UNAVAILABLE_RESPONSE }));
  await page.route(PENDING_PREVIEW_PATH, (route) => route.fulfill({ status: 404, json: UNAVAILABLE_RESPONSE }));
  await mount<typeof PendingJoinStory>("tests/client/features/auth/components/_pending-join-stories/PendingJoinStory", {});
  await expect(page.getByRole("heading", { name: INVITE_UNAVAILABLE_TITLE, exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: JOINER_PERSONA_NAME_FIELD, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: JOIN_CREATE_ACCOUNT_NAME, exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: JOIN_DESTINATION_LABEL, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: BACK_TO_SIGN_IN_NAME, exact: true }).click();
  await expect(page.getByRole("heading", { name: SIGN_IN_NAME, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: continueWithName(PENDING_AUTH_CONFIG.oidcProviderName), exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: JOIN_CREATE_ACCOUNT_NAME, exact: true })).toHaveCount(0);
  expect(confirms).toHaveLength(0);
});

test("an unnamed persona focuses its error without a request, then submits only the canonical persona and CSRF", async ({ mount, page }) => {
  await previewRoom(page);
  const confirms = await captureConfirms(page, (route) => route.fulfill({ status: 200, json: JOINED_RESPONSE }));
  await mount<typeof PendingJoinStory>("tests/client/features/auth/components/_pending-join-stories/PendingJoinStory", {});
  const name = page.getByRole("textbox", { name: JOINER_PERSONA_NAME_FIELD, exact: true });
  const submit = page.getByRole("button", { name: JOIN_CREATE_ACCOUNT_NAME, exact: true });
  await name.fill("   ");
  await submit.click();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toBeFocused();
  await expect(page.getByText(JOINER_PERSONA_NAME_REQUIRED, { exact: true })).toBeVisible();
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
    await mount<typeof PendingJoinStory>("tests/client/features/auth/components/_pending-join-stories/PendingJoinStory", {});
    await page.getByRole("textbox", { name: JOINER_PERSONA_NAME_FIELD, exact: true }).fill(JOIN_PERSONA.name);
    await page.getByRole("button", { name: JOIN_CREATE_ACCOUNT_NAME, exact: true }).click();
    await requested.promise;
    const joining = page.getByRole("button", { name: JOIN_CONFIRMING_NAME, exact: true });
    await expect(joining).toBeDisabled();
    await expect(page.getByRole("button", { name: JOIN_CREATE_ACCOUNT_NAME, exact: true })).toHaveCount(0);
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
    await expect(page.getByRole("heading", { name: PENDING_JOIN_APPROVAL_TITLE, exact: true })).toBeVisible();
    await expect(page.getByText(PENDING_JOIN_APPROVAL_NOTE, { exact: false })).toBeVisible();
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
  await mount<typeof PendingJoinStory>("tests/client/features/auth/components/_pending-join-stories/PendingJoinStory", {});
  await page.getByRole("textbox", { name: JOINER_PERSONA_NAME_FIELD, exact: true }).fill(JOIN_PERSONA.name);
  await page.getByRole("button", { name: JOIN_CREATE_ACCOUNT_NAME, exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(PENDING_JOIN_ACCOUNT_EXISTS_LEAD);
  await expect(page.getByRole("heading", { name: JOIN_DESTINATION_LABEL, exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: PENDING_JOIN_APPROVAL_TITLE, exact: true })).toHaveCount(0);
  expect(confirms).toHaveLength(1);
});
