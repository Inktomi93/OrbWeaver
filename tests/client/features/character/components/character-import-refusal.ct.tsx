// Plain pictures dropped on the character import dialog are refused in one sentence on the dropzone's own error line, which says what
// a card is, and no toast repeats it: the dialog is open and the line is where the person is looking. The shell, the characters list
// band and its dialog are the production ones, and the file really goes to the import route of a real server, so the refusal is the
// one the server gives a PNG with no card in it.
// @subject packages/client/src/features/character/components/character-import-dialog.tsx
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { absenceWindow, routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import { CARD_IMPORT_REFUSED_MANY, CARD_IMPORT_REFUSED_ONE } from "#client/features/character/lib/character-import-copy.ts";
import { CHARACTER_IMPORT_NAME } from "#client/features/character/lib/character-names.ts";

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

const REFUSALS = [
  { name: "a plain picture", files: ["portrait.png"], line: CARD_IMPORT_REFUSED_ONE },
  { name: "several plain pictures", files: ["portrait.png", "banner.png"], line: CARD_IMPORT_REFUSED_MANY },
] as const;

test.use({ viewport: { width: 1440, height: 1000 } });

for (const refusal of REFUSALS) {
  test(`${refusal.name} is refused on the dropzone's error line with what a card is, and raises no toast`, async ({ corpus, mount, page }) => {
    await using root = await createServerHarness(ROOT_OPTIONS);
    const caller = await root.internalCallerFor(root.ownerId);
    await routeAuthConfig(page, corpus.auth.signedInConfig);
    await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES]));
    // The page's upload goes to the real server's import route; only the transport between them is the test's.
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
      await route.fulfill({ status: answer.status, headers: Object.fromEntries(answer.headers), body: Buffer.from(await answer.arrayBuffer()) });
    });
    await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "collapsed" } } });
    await mount<typeof ShellAmbientStory>(STORY, {});

    await page.getByRole("button", { name: CHARACTER_IMPORT_NAME, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: CHARACTER_IMPORT_NAME, exact: true });
    const chooser = page.waitForEvent("filechooser");
    await dialog.locator(FILE_INPUT).click();
    await (await chooser).setFiles(refusal.files.map((name) => ({ name, mimeType: "image/png", buffer: PLAIN_PICTURE })));

    await expect(dialog.getByRole("alert")).toHaveText(refusal.line);
    await expect(dialog.locator(FILE_INPUT)).toHaveAttribute("aria-invalid", "true");
    expect(sent).toBe(1);
    await absenceWindow(page, TOAST_WINDOW_MS);
    await expect(page.locator(TOAST_ROOT)).toHaveCount(0);
    await expect(dialog).toBeVisible();
  });
}
