// A card the library already holds, dropped on the backup import, is named held on its row's icon, and a new card's icon says
// nothing of the kind. The section is the production backup-import body; the card goes to a real server's card import route, so the
// held card is the owner's own export, unchanged (D290). Only the route's transport is the page's own.
// @subject packages/client/src/features/workloads/components/import-report-summary.tsx
import { testId } from "@orb/client/lib";
import { CHARA_CARD_V2_SPEC, createCharacterSchema } from "@orb/contracts/character";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { exportCharacterPath, PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeAuthConfig, routeOrbSocket, routeToServer, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import { IMPORT_CONFIRM_NAMES } from "#client/features/workloads/lib/portability-model.ts";
import { IN_LIBRARY_DETAIL } from "#client/lib/in-library-copy.ts";
import type { ImportPreviewStory } from "./_import-preview-stories.tsx";

const STORY = "tests/client/features/workloads/components/_import-preview-stories/ImportPreviewStory";
const ROOT_OPTIONS = {
  env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  physicalPeer: () => "127.0.0.1",
  startJobs: false,
} as const;
const HTTP_OK = 200;
const HELD_FILE = "harbor-keeper.png";
const NEW_FILE = "lamp-warden.json";
const NEW_CARD = {
  name: NEW_FILE,
  mimeType: "application/json",
  buffer: Buffer.from(
    JSON.stringify({
      spec: CHARA_CARD_V2_SPEC,
      ["spec_version"]: "2.0",
      data: { name: "Lamp Warden", description: "Tends the lamps.", ["first_mes"]: "Lamps lit." },
    }),
  ),
};

for (const held of [true, false]) {
  test(`${held ? "a card the library holds" : "a new card"} is ${held ? "" : "not "}named held on its row's icon`, async ({ corpus, mount, page }) => {
    await using root = await createServerHarness(ROOT_OPTIONS);
    const principal = await root.principalFor(root.ownerId);
    const character = await root.services.character.create({
      principal,
      input: createCharacterSchema.parse({ handle: "harbor-keeper", name: "Harbor Keeper", description: "Keeps the light." }),
    });
    const exported = await root.http.request(exportCharacterPath(character.id));
    expect(exported.status).toBe(HTTP_OK);
    const file = held ? { name: HELD_FILE, mimeType: "image/png", buffer: Buffer.from(await exported.arrayBuffer()) } : NEW_CARD;
    await routeAuthConfig(page, corpus.auth.signedInConfig);
    await routeTrpc(page, {
      ...serveCorpusProcedures(await root.internalCallerFor(root.ownerId), ["settings.getUserSettings", "sessions.me", "workloads.list"]),
      "stream.attach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
      "stream.detach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
    });
    await routeOrbSocket(page);
    await routeToServer(page, root, PORTABILITY_ROUTES.importCards);
    await mount<typeof ImportPreviewStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}) });

    await page.locator('input[type="file"]').first().setInputFiles(file);
    await page.getByRole("button", { name: IMPORT_CONFIRM_NAMES.file, exact: true }).click();

    const icon = page.getByTestId(testId("importReport")).getByRole("listitem").filter({ hasText: file.name }).locator("svg");
    // The new card is the positive control: its row and icon are there, and the icon is named something other than held.
    await expect(icon).toHaveAttribute("aria-label", held ? IN_LIBRARY_DETAIL : new RegExp(`^(?!${RegExp.escape(IN_LIBRARY_DETAIL)}$).+`, "u"));
  });
}
