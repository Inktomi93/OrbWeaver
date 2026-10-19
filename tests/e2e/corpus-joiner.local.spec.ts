// An invite joiner who can already speak gets the join dialog at once; the room, invite and account are real local-mode rows.
import { randomBytes } from "node:crypto";
import { testId } from "@orb/client/lib";
import { CSRF_HEADER, viewerViewSchema } from "@orb/contracts/identity";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { devices } from "@playwright/test";
import { loginLocal } from "./support/actors.ts";
import { expect, test } from "./support/corpus-test.ts";
import { BROWSER_PROJECTS, CORPUS_LOCAL_PASSWORDS, SELECTED_LOCAL_CORPUS_FIXTURE } from "./support/modes.ts";
import { WAIT_SETTLE_MS } from "./support/timeouts.ts";

const PASSWORD_BYTES = 16;

test.describe("committed corpus joiner", () => {
  test.skip(SELECTED_LOCAL_CORPUS_FIXTURE === undefined, "Requires the committed local corpus");

  test(
    "control: a joiner who already speaks as a persona gets the join dialog at once, with no first-run ask",
    { tag: "@smoke" },
    async ({ browser, baseURL }, info) => {
      const wire = SELECTED_LOCAL_CORPUS_FIXTURE?.wire;
      const owner = wire?.reads["sessions.me"][0]?.output;
      const ownerPassword = CORPUS_LOCAL_PASSWORDS.owner;
      const characterId = wire?.libraryRelations?.ids.characterId;
      const project = BROWSER_PROJECTS.find(({ name }) => name === info.project.name);
      if (owner === undefined || ownerPassword === undefined || characterId === undefined || project === undefined) {
        throw new Error("Local corpus joiner smoke requires its captured owner, run-owned password, library character and device project");
      }
      const host = await loginLocal(baseURL ?? "", viewerViewSchema.parse(owner).handle, ownerPassword);
      const started = await host.trpc.chat.startChat.mutate({ characterIds: [characterId] });
      const invite = await host.trpc.invites.createInvite.mutate({ chatId: started.chat.id, input: {} });
      // The local stack's database is shared by every cell of a run, so each project mints its own joiner.
      const joiner = {
        handle: castId<Handle>(`joiner-${info.project.name.replace("corpus-local-", "")}`),
        password: randomBytes(PASSWORD_BYTES).toString("hex"),
      };
      await host.trpc.admin.createUser.mutate(joiner);
      const actor = await loginLocal(baseURL ?? "", joiner.handle, joiner.password);
      const persona = await actor.trpc.persona.create.mutate({ input: { name: "Mira", description: "A joiner who already speaks." } });
      await actor.trpc.settings.updateUserSettingsSection.mutate({
        section: "seeds",
        patch: { currentPersonaId: persona.id, defaultPersonaId: persona.id },
      });
      const context = await browser.newContext({ ...devices[project.device], baseURL: baseURL ?? "", locale: "en-US", timezoneId: "UTC" });
      try {
        const login = await context.request.post("/api/auth/login", {
          form: { handle: joiner.handle, password: joiner.password },
          headers: { [CSRF_HEADER]: "1" },
        });
        expect(login.ok()).toBe(true);
        const page = await context.newPage();
        await page.goto(`/join/${invite.token}`);
        await expect(page.getByTestId(testId("joinInviteDialog"))).toBeVisible({ timeout: WAIT_SETTLE_MS });
        await expect(page.getByTestId(testId("firstRunPersonaDialog"))).toHaveCount(0);
      } finally {
        await context.close();
        await host.trpc.chat.delete.mutate({ chatId: started.chat.id });
      }
    },
  );
});
