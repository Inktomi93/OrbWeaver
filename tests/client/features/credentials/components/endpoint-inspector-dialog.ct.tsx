// CT: the custom-endpoint "Test endpoint" inspector — the client half of `credentials.inspectEndpoint`
// (PD-150). Proves the affordance opens the drawer, fires the verb with the row's id on open, renders the
// redacted request + raw response, and — the credential-surface belt — never leaks a raw key into the DOM.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { CustomCredentialKeyRowStory } from "../_ct-stories.tsx";

// An OpenAI-shaped secret key (`sk-…`) — asserted absent from the rendered inspection.
const SECRET_KEY_RE = /sk-[A-Za-z0-9]/;

// A representative server inspection: Authorization already masked (kit `redactHeaders`), a 200 response.
const REDACTED_INSPECTION = {
  ok: true,
  request: {
    url: "https://my-host.example/v1/chat/completions",
    headers: { "content-type": "application/json", authorization: "«redacted»" },
    body: '{\n  "model": "gpt-4o-mini",\n  "messages": [{ "role": "user", "content": "ping" }]\n}',
  },
  response: { status: 200, statusText: "OK", bodyPreview: '{"id":"chatcmpl-1","choices":[]}' },
};

test("opens on the row action, fires inspectEndpoint with the row id, renders the redacted round-trip", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "credentials.inspectEndpoint": () => REDACTED_INSPECTION,
  });

  await mount(<CustomCredentialKeyRowStory />);

  await page.getByRole("button", { name: "Test endpoint" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // The verb fired on open, with the custom row's credential id.
  await expect.poll(() => trpc.count("credentials.inspectEndpoint"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — the count was polled to target above, so lastInput is the settled call.
  expect((trpc.lastInput("credentials.inspectEndpoint") as { credentialId: string }).credentialId).toBe("user_credential_ctstory0002");

  // The redacted request + raw response render.
  await expect(dialog).toContainText("https://my-host.example/v1/chat/completions");
  await expect(dialog).toContainText("«redacted»");
  await expect(dialog).toContainText("200 OK");
  await expect(dialog.getByLabel("Response body preview")).toContainText("chatcmpl-1");
});

test("no raw credential leaks into the rendered inspection", async ({ mount, page }) => {
  await routeTrpc(page, {
    // The server ALWAYS redacts before this shape is built; assert the client never reconstructs a key.
    "credentials.inspectEndpoint": () => REDACTED_INSPECTION,
  });

  await mount(<CustomCredentialKeyRowStory />);
  await page.getByRole("button", { name: "Test endpoint" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Request headers (redacted)")).toContainText("«redacted»");

  // Belt-and-suspenders: nothing key-shaped (a Bearer token / sk- secret) anywhere in the dialog text.
  const text = (await dialog.textContent()) ?? "";
  expect(text).not.toContain("Bearer ");
  expect(text).not.toMatch(SECRET_KEY_RE);
});

test("a transport failure renders the error, not a response body", async ({ mount, page }) => {
  await routeTrpc(page, {
    "credentials.inspectEndpoint": () => ({
      ok: false,
      request: REDACTED_INSPECTION.request,
      response: null,
      error: "getaddrinfo ENOTFOUND my-host.example",
    }),
  });

  await mount(<CustomCredentialKeyRowStory />);
  await page.getByRole("button", { name: "Test endpoint" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("ENOTFOUND");
  await expect(dialog.getByTestId("endpoint-inspector-status")).toContainText("No response");
});
