// Plain pictures dropped on the character import dialog are refused in one sentence on the dropzone's own error line, which says what
// a card is, and no toast repeats it: the dialog is open and the line is where the person is looking. A batch that lands a card beside a
// refused file says how many came in and names the files that did not, in the sentence for the reason the server gave, never the server's
// own words. The shell, the
// characters list band and its dialog are the production ones, and the files really go to the import route of a real server, so the
// refusal is the one the server gives a PNG with no card in it.
// @subject packages/client/src/features/character/components/character-import-dialog.tsx
import { CHARA_CARD_V2_SPEC } from "@orb/contracts/character";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import type { FailedCardReason } from "@orb/contracts/import";
import { CARD_REFUSAL_CODES, cardImportResultSchema, FAILED_CARD_REASONS } from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { absenceWindow, routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { CHARACTER_IMPORT_NAME } from "#client/features/character/lib/character-names.ts";
import { CARD_IMPORT_REFUSED_MANY, CARD_IMPORT_REFUSED_ONE, cardImportPartialLine } from "#client/lib/card-import-copy.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const ROOT_OPTIONS = {
  env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  physicalPeer: () => "127.0.0.1",
  startJobs: false,
} as const;
const TOAST_WINDOW_MS = 300;
// Counted by slot, not role: a modal marks the toaster aria-hidden, so a role query would miss a toast behind it.
const TOAST_ROOT = '[data-slot="toast-root"]';
const FILE_INPUT = 'input[type="file"]';
// An eight-pixel PNG with no card chunk in it: a picture, and nothing a character card reader can use.
const PLAIN_PICTURE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGM4ISeHFTEMLQkAkL9BAbKfPiIAAAAASUVORK5CYII=",
  "base64",
);
const GOOD_CARD = Buffer.from(
  JSON.stringify({
    spec: CHARA_CARD_V2_SPEC,
    ["spec_version"]: "2.0",
    data: { name: "Harbor Keeper", description: "Keeps the light.", ["first_mes"]: "The lamp is lit." },
  }),
);
// Far past any character name cap, so the card decodes and then fails the canonical schema.
const OVERLONG_NAME_LENGTH = 10_000;
const OVERLONG_CARD = Buffer.from(
  JSON.stringify({
    spec: CHARA_CARD_V2_SPEC,
    ["spec_version"]: "2.0",
    data: { name: "x".repeat(OVERLONG_NAME_LENGTH), description: "d", ["first_mes"]: "hi" },
  }),
);
const [UNREADABLE, INVALID] = CARD_REFUSAL_CODES;
const picture = (name: string): { name: string; mimeType: string; buffer: Buffer } => ({ name, mimeType: "image/png", buffer: PLAIN_PICTURE });

const REFUSALS = [
  { name: "a plain picture", files: [picture("portrait.png")], line: CARD_IMPORT_REFUSED_ONE },
  { name: "several plain pictures", files: [picture("portrait.png"), picture("banner.png")], line: CARD_IMPORT_REFUSED_MANY },
] as const;

type Root = Awaited<ReturnType<typeof createServerHarness>>;

/** Serves the shell's reads, and sends the page's card uploads to the real server's import route; only the transport between them is the test's. */
async function routeImport(page: Page, root: Root, refusedAs?: FailedCardReason): Promise<() => number> {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES]));
  let sent = 0;
  await page.route(`**${PORTABILITY_ROUTES.importCards}`, async (route) => {
    sent += 1;
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
    // A card the storage refuses is a database fault a component spec cannot plant, so that one reason is the answer's own rewrite of a refusal the
    // server really gave; the server's own `failed` answer is proved in tests/server/entry/http/import-card-failures.int.test.ts.
    const result = refusedAs === undefined ? null : cardImportResultSchema.parse(JSON.parse(body.toString("utf8")));
    await route.fulfill({
      status: answer.status,
      headers: refusedAs === undefined ? Object.fromEntries(answer.headers) : { "content-type": "application/json" },
      body:
        result === null || refusedAs === undefined
          ? body
          : JSON.stringify({ ...result, failed: result.failed.map((card) => ({ ...card, reason: refusedAs })) }),
    });
  });
  await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "collapsed" } } });
  return (): number => sent;
}

/** Opens the import dialog from the characters list band and drops `files` on it. */
async function dropOnImportDialog(page: Page, files: readonly { name: string; mimeType: string; buffer: Buffer }[]): Promise<Locator> {
  await page.getByRole("button", { name: CHARACTER_IMPORT_NAME, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: CHARACTER_IMPORT_NAME, exact: true });
  const chooser = page.waitForEvent("filechooser");
  await dialog.locator(FILE_INPUT).click();
  await (await chooser).setFiles([...files]);
  return dialog;
}

test.use({ viewport: { width: 1440, height: 1000 } });

for (const refusal of REFUSALS) {
  test(`${refusal.name} is refused on the dropzone's error line with what a card is, and raises no toast`, async ({ corpus, mount, page }) => {
    await using root = await createServerHarness(ROOT_OPTIONS);
    await routeAuthConfig(page, corpus.auth.signedInConfig);
    const sent = await routeImport(page, root);
    await mount<typeof ShellAmbientStory>(STORY, {});
    const dialog = await dropOnImportDialog(page, refusal.files);

    await expect(dialog.getByRole("alert")).toHaveText(refusal.line);
    await expect(dialog.locator(FILE_INPUT)).toHaveAttribute("aria-invalid", "true");
    expect(sent()).toBe(1);
    await absenceWindow(page, TOAST_WINDOW_MS);
    await expect(page.locator(TOAST_ROOT)).toHaveCount(0);
    await expect(dialog).toBeVisible();
  });
}

interface PartialCase {
  readonly name: string;
  readonly file: { readonly name: string; readonly mimeType: string; readonly buffer: Buffer };
  /** The reason the route answers with when the server's own cannot be provoked from a component spec. */
  readonly refusedAs?: FailedCardReason;
}

// A total `Record` over the wire's reason tuple, so a new reason fails `tsc` until it has a case here.
const PARTIAL_CASES: Record<FailedCardReason, PartialCase> = {
  [UNREADABLE]: { name: "a picture", file: picture("portrait.png") },
  [INVALID]: { name: "a card whose data is invalid", file: { name: "overlong.json", mimeType: "application/json", buffer: OVERLONG_CARD } },
  ["failed"]: { name: "a file the server's storage refuses", file: picture("portrait.png"), refusedAs: "failed" },
};

for (const reason of FAILED_CARD_REASONS) {
  const { name, file, refusedAs } = PARTIAL_CASES[reason];
  test(`a card beside ${name} imports, and the toast says that file's reason in the client's words`, async ({ corpus, mount, page }) => {
    await using root = await createServerHarness(ROOT_OPTIONS);
    await routeAuthConfig(page, corpus.auth.signedInConfig);
    const sent = await routeImport(page, root, refusedAs);
    await mount<typeof ShellAmbientStory>(STORY, {});
    await dropOnImportDialog(page, [{ name: "keeper.json", mimeType: "application/json", buffer: GOOD_CARD }, file]);

    const toast = page.locator(TOAST_ROOT);
    await expect(toast).toContainText(cardImportPartialLine(1, [{ filename: file.name, reason }]));
    // Another reason's sentence for the same file is not what the person is told.
    for (const other of FAILED_CARD_REASONS.filter((candidate) => candidate !== reason)) {
      await expect(toast).not.toContainText(cardImportPartialLine(1, [{ filename: file.name, reason: other }]));
    }
    expect(sent()).toBe(1);
  });
}
