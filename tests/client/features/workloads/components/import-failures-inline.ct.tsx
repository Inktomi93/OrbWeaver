// A backup or card upload the server refuses shows its failure as one inline line where the person is looking, and no toast says it
// again. The same holds for an import the server answers but takes nothing from: the report is inline, says in the Characters import's
// own plain sentence why a picture is not a card, and no toast repeats its tally.
// The section is the production backup-import body; the upload really leaves the page for its route. When the server refuses, only the
// answer is the test's, because a refusal is the external edge; a card the server reads goes to a real server's import route.
// @subject packages/client/src/features/workloads/hooks/use-library-import.ts

import { testId } from "@orb/client/lib";
import { CHARA_CARD_V2_SPEC } from "@orb/contracts/character";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import type { CardImportResult, FailedCardReason } from "@orb/contracts/import";
import { CARD_REFUSAL_CODES, cardImportResultSchema, FAILED_CARD_REASONS } from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { absenceWindow, routeAuthConfig, routeOrbSocket, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, createServerHarness } from "@orb/testkit/node/composed";
import { IMPORT_RESULT_NAME } from "#client/features/workloads/lib/import-library-names.ts";
import { cardImportFailedDetail, cardImportRefusalLine } from "#client/lib/card-import-copy.ts";
import type { ImportPreviewStory } from "./_import-preview-stories.tsx";

const STORY = "tests/client/features/workloads/components/_import-preview-stories/ImportPreviewStory";
const TOAST_WINDOW_MS = 300;
// Short enough that the pane's last section renders its outcome below the fold.
const SHORT_WINDOW_PX = 320;
// Counted by slot, not role: a modal marks the toaster aria-hidden, so a role query would miss a toast behind it.
const TOAST_ROOT = '[data-slot="toast-root"]';
const REFUSAL = "The server could not take that upload.";
const CARD = JSON.stringify({
  spec: CHARA_CARD_V2_SPEC,
  ["spec_version"]: "2.0",
  data: { name: "Harbor Keeper", description: "Keeps the light.", ["first_mes"]: "Lamp lit." },
});
const ROOT_OPTIONS = {
  env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  physicalPeer: () => "127.0.0.1",
  startJobs: false,
} as const;
// An eight-pixel PNG with no card chunk in it: a picture the server reads and finds no card in.
const PLAIN_PICTURE = {
  name: "portrait.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGM4ISeHFTEMLQkAkL9BAbKfPiIAAAAASUVORK5CYII=",
    "base64",
  ),
};
const UPLOADS = [
  { name: "a character card", route: PORTABILITY_ROUTES.importCards, file: { name: "keeper.json", mimeType: "application/json", buffer: Buffer.from(CARD) } },
  {
    name: "a backup archive",
    route: PORTABILITY_ROUTES.importBundle,
    file: { name: "backup.zip", mimeType: "application/zip", buffer: Buffer.from("not a real archive") },
  },
] as const;

for (const upload of UPLOADS) {
  test(`${upload.name} the server refuses is one inline line, with no toast`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness(undefined, { startJobs: false });
    const caller = await root.internalCallerFor(root.ownerId);
    await routeAuthConfig(page, corpus.auth.signedInConfig);
    await routeTrpc(page, {
      ...serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me", "workloads.list"]),
      "stream.attach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
      "stream.detach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
    });
    await routeOrbSocket(page);
    let sent = 0;
    await page.route(`**${upload.route}`, async (route) => {
      sent += 1;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: REFUSAL }) });
    });
    await mount<typeof ImportPreviewStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}) });

    await page.locator('input[type="file"]').first().setInputFiles(upload.file);
    await page.getByRole("button", { name: /^Import(?! a (folder|backup))/u }).click();

    await expect(page.getByRole("alert")).toHaveCount(1);
    expect(sent).toBe(1);
    await absenceWindow(page, TOAST_WINDOW_MS);
    await expect(page.locator(TOAST_ROOT)).toHaveCount(0);
  });
}

// Far past any character name cap, so the card decodes and then fails the canonical schema.
const OVERLONG_NAME_LENGTH = 10_000;
const [UNREADABLE, INVALID] = CARD_REFUSAL_CODES;
const SCRIPTED_SERVER_SENTENCE = "SQLITE_CONSTRAINT: scripted storage refusal";
// A character the storage edge refuses is a database fault, which a component spec cannot plant, so that one answer is the
// test's own; the server's own `failed` answer is proved in the import-card-failures integration test.
const STORAGE_REFUSED_ANSWER = {
  imported: [],
  failed: [{ filename: "keeper.json", reason: "failed", error: SCRIPTED_SERVER_SENTENCE }],
} as const satisfies CardImportResult;

interface ReasonCase {
  readonly name: string;
  readonly file: { readonly name: string; readonly mimeType: string; readonly buffer: Buffer };
  /** The answer the route gives when the server's own cannot be provoked from a component spec. */
  readonly scripted?: CardImportResult;
}

// A total `Record` over the wire's reason tuple, so a new reason fails `tsc` until it has a case here.
const REASON_CASES: Record<FailedCardReason, ReasonCase> = {
  [UNREADABLE]: { name: "a plain picture the server takes no card from", file: PLAIN_PICTURE },
  [INVALID]: {
    name: "a card whose data the server finds invalid",
    file: {
      name: "overlong.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          spec: CHARA_CARD_V2_SPEC,
          ["spec_version"]: "2.0",
          data: { name: "x".repeat(OVERLONG_NAME_LENGTH), description: "d", ["first_mes"]: "hi" },
        }),
      ),
    },
  },
  ["failed"]: { name: "a card the server's storage refuses", file: UPLOADS[0].file, scripted: STORAGE_REFUSED_ANSWER },
};

for (const reason of FAILED_CARD_REASONS) {
  const { name, file, scripted } = REASON_CASES[reason];
  test(`${name} is refused in that reason's sentence, in one inline report with no toast`, async ({ corpus, mount, page }) => {
    await using root = await createServerHarness(ROOT_OPTIONS);
    const caller = await root.internalCallerFor(root.ownerId);
    await routeAuthConfig(page, corpus.auth.signedInConfig);
    await routeTrpc(page, {
      ...serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me", "workloads.list"]),
      "stream.attach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
      "stream.detach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
    });
    await routeOrbSocket(page);
    let sent = 0;
    const serverSentences: string[] = [];
    await page.route(`**${PORTABILITY_ROUTES.importCards}`, async (route) => {
      sent += 1;
      if (scripted !== undefined) {
        serverSentences.push(...scripted.failed.map((card) => card.error));
        await route.fulfill({ status: 200, json: scripted });
        return;
      }
      const incoming = route.request();
      const upload = incoming.postDataBuffer();
      const answer = await root.http.request(
        new Request(`http://127.0.0.1${PORTABILITY_ROUTES.importCards}`, {
          method: "POST",
          headers: incoming.headers(),
          body: upload === null ? null : new Uint8Array(upload),
        }),
      );
      const body = Buffer.from(await answer.arrayBuffer());
      const failed = cardImportResultSchema.parse(JSON.parse(body.toString("utf8"))).failed;
      expect(failed.map((card) => card.reason)).toEqual([reason]);
      serverSentences.push(...failed.map((card) => card.error));
      await route.fulfill({ status: answer.status, headers: Object.fromEntries(answer.headers), body });
    });
    await page.setViewportSize({ width: 960, height: SHORT_WINDOW_PX });
    await mount<typeof ImportPreviewStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}) });

    await page.locator('input[type="file"]').first().setInputFiles(file);
    await page.getByRole("button", { name: /^Import(?! a (folder|backup))/u }).click();

    const report = page.getByTestId(testId("importReport"));
    await expect(report).toBeVisible();
    // The outcome takes focus, and it is on screen however short the window: the person who pressed Import looks there.
    await expect(page.getByRole("group", { name: IMPORT_RESULT_NAME })).toBeFocused();
    await expect(report).toBeInViewport();
    await expect(report.getByText(cardImportRefusalLine([{ reason }]), { exact: true })).toHaveCount(1);
    await expect(report.getByText(cardImportFailedDetail(reason), { exact: true })).toHaveCount(1);
    expect(sent).toBe(1);
    // The positive control: the server did refuse the file in its own sentence, which the report must not repeat.
    expect(serverSentences).toHaveLength(1);
    for (const sentence of serverSentences) {
      await expect(report).not.toContainText(sentence);
    }
    await absenceWindow(page, TOAST_WINDOW_MS);
    await expect(page.locator(TOAST_ROOT)).toHaveCount(0);
  });
}
