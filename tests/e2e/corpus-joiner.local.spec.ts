// An invite joiner reaches the join dialog only once they can speak; the room, invite and account are real local-mode rows.
import { randomBytes } from "node:crypto";
import { testId } from "@orb/client/lib";
import { CSRF_HEADER, viewerViewSchema } from "@orb/contracts/identity";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Browser, Page, TestInfo } from "@playwright/test";
import { devices } from "@playwright/test";
import type { ActorClient } from "./support/actors.ts";
import { loginLocal } from "./support/actors.ts";
import { expect, test } from "./support/corpus-test.ts";
import { BROWSER_PROJECTS, CORPUS_LOCAL_PASSWORDS, firstRunAskHandle, SELECTED_LOCAL_CORPUS_FIXTURE } from "./support/modes.ts";
import { WAIT_SETTLE_MS } from "./support/timeouts.ts";

const PASSWORD_BYTES = 16;
const PERSONA_NAME = "Mira";

interface JoinerScenario {
  readonly handle: Handle;
  readonly joiner: ActorClient;
  readonly page: Page;
  readonly joinPath: string;
}

/** A real room, a share invite and a fresh local account whose signed-in browser has not yet opened the invite link. */
async function withInvitedJoiner(
  { browser, baseURL, info, handle }: { readonly browser: Browser; readonly baseURL: string; readonly info: TestInfo; readonly handle: Handle },
  run: (scenario: JoinerScenario) => Promise<void>,
): Promise<void> {
  const wire = SELECTED_LOCAL_CORPUS_FIXTURE?.wire;
  const owner = wire?.reads["sessions.me"][0]?.output;
  const ownerPassword = CORPUS_LOCAL_PASSWORDS.owner;
  const characterId = wire?.libraryRelations?.ids.characterId;
  const project = BROWSER_PROJECTS.find(({ name }) => name === info.project.name);
  if (owner === undefined || ownerPassword === undefined || characterId === undefined || project === undefined) {
    throw new Error("Local corpus joiner smoke requires its captured owner, run-owned password, library character and device project");
  }
  const host = await loginLocal(baseURL, viewerViewSchema.parse(owner).handle, ownerPassword);
  const started = await host.trpc.chat.startChat.mutate({ characterIds: [characterId] });
  const invite = await host.trpc.invites.createInvite.mutate({ chatId: started.chat.id, input: {} });
  const account = { handle, password: randomBytes(PASSWORD_BYTES).toString("hex") };
  await host.trpc.admin.createUser.mutate(account);
  const joiner = await loginLocal(baseURL, account.handle, account.password);
  const context = await browser.newContext({ ...devices[project.device], baseURL, locale: "en-US", timezoneId: "UTC" });
  try {
    const login = await context.request.post("/api/auth/login", { form: account, headers: { [CSRF_HEADER]: "1" } });
    expect(login.ok()).toBe(true);
    await run({ handle: account.handle, joiner, page: await context.newPage(), joinPath: `/join/${invite.token}` });
  } finally {
    await context.close();
    await host.trpc.chat.delete.mutate({ chatId: started.chat.id });
  }
}

test.describe("committed corpus joiner", () => {
  test.skip(SELECTED_LOCAL_CORPUS_FIXTURE === undefined, "Requires the committed local corpus");

  test(
    "control: a joiner who already speaks as a persona gets the join dialog at once, with no first-run ask",
    { tag: "@smoke" },
    async ({ browser, baseURL }, info) => {
      // The local stack's database is shared by every cell of a run, so each project mints its own joiner.
      const handle = castId<Handle>(`joiner-${info.project.name.replace("corpus-local-", "")}`);
      await withInvitedJoiner({ browser, baseURL: baseURL ?? "", info, handle }, async ({ joiner, page, joinPath }) => {
        const persona = await joiner.trpc.persona.create.mutate({ input: { name: PERSONA_NAME, description: "A joiner who already speaks." } });
        await joiner.trpc.settings.updateUserSettingsSection.mutate({
          section: "seeds",
          patch: { currentPersonaId: persona.id, defaultPersonaId: persona.id },
        });
        await page.goto(joinPath);
        await expect(page.getByTestId(testId("joinInviteDialog"))).toBeVisible({ timeout: WAIT_SETTLE_MS });
        await expect(page.getByTestId(testId("firstRunPersonaDialog"))).toHaveCount(0);
      });
    },
  );

  test("a joiner with no persona names one in the first-run ask before the join dialog opens", { tag: "@smoke" }, async ({ browser, baseURL }, info) => {
    // This handle is the one the harness stack leaves out of its persona auto-create (E2E_FIRST_RUN_ASK_HANDLES).
    await withInvitedJoiner(
      { browser, baseURL: baseURL ?? "", info, handle: castId<Handle>(firstRunAskHandle(info.project.name)) },
      async ({ joiner, page, joinPath }) => {
        expect(await joiner.trpc.persona.list.query()).toEqual([]);
        let previews = 0;
        page.on("request", (request) => {
          previews += request.url().includes("/api/trpc/invites.previewInvite") ? 1 : 0;
        });
        await page.goto(joinPath);
        const gate = page.getByTestId(testId("firstRunPersonaDialog"));
        const join = page.getByTestId(testId("joinInviteDialog"));
        // The gate renders only once both of its reads settled, so its presence is the barrier for the join's absence.
        await expect(gate).toBeVisible({ timeout: WAIT_SETTLE_MS });
        await expect(join).toHaveCount(0);
        expect(previews).toBe(0);

        await page.getByTestId(testId("firstRunPersonaName")).fill(PERSONA_NAME);
        await page.getByTestId(testId("firstRunPersonaCreate")).click();

        await expect(gate).toHaveCount(0);
        await expect(join).toBeVisible();
        await expect(join.getByTestId(testId("joinInviteConfirm"))).toBeVisible();
        expect((await joiner.trpc.persona.list.query()).map((persona) => persona.name)).toEqual([PERSONA_NAME]);
      },
    );
  });
});
