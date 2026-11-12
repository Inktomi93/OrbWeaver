// A backup or card import's result is said once, where the person is looking: the report beside the focused Import result, with no
// success toast repeating it, and its reason lines hold the reading measure instead of running the pane's width.
// The section is the production backup-import body; the card upload goes to a real server's import route, and only the route's
// transport is the page's own.
// @subject packages/client/src/features/workloads/hooks/use-library-import.ts

import { testId } from "@orb/client/lib";
import { CHARA_CARD_V2_SPEC } from "@orb/contracts/character";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeAuthConfig, routeOrbSocket, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import { IMPORT_RESULT_NAME } from "#client/features/workloads/lib/import-library-names.ts";
import { IMPORT_CONFIRM_NAMES } from "#client/features/workloads/lib/portability-model.ts";
import type { ImportPreviewStory } from "./_import-preview-stories.tsx";

const STORY = "tests/client/features/workloads/components/_import-preview-stories/ImportPreviewStory";
const TOAST_ROOT = '[data-slot="toast-root"]';
const TOASTS_SEEN_KEY = "importResultToastsSeen";
// Wide enough that an unbounded line would run far past the reading measure.
const WIDE_PANE_PX = 1280;
const ROOT_OPTIONS = {
  env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  physicalPeer: () => "127.0.0.1",
  startJobs: false,
} as const;
const CARD = {
  name: "keeper.json",
  mimeType: "application/json",
  buffer: Buffer.from(
    JSON.stringify({
      spec: CHARA_CARD_V2_SPEC,
      ["spec_version"]: "2.0",
      data: { name: "Harbor Keeper", description: "Keeps the light.", ["first_mes"]: "Lamp lit." },
    }),
  ),
};
// An eight-pixel PNG with no card chunk in it: a picture the server reads and finds no card in.
const PLAIN_PICTURE = {
  name: "portrait.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGM4ISeHFTEMLQkAkL9BAbKfPiIAAAAASUVORK5CYII=",
    "base64",
  ),
};

test.describe("a card import's result", () => {
  for (const [name, file] of [
    ["a card the server takes", CARD],
    ["a picture the server finds no card in", PLAIN_PICTURE],
  ] as const) {
    test(`${name} is the focused report in place, holds the reading measure, and no toast repeats it`, async ({ corpus, mount, page }) => {
      await using root = await createServerHarness(ROOT_OPTIONS);
      const caller = await root.internalCallerFor(root.ownerId);
      await routeAuthConfig(page, corpus.auth.signedInConfig);
      await routeTrpc(page, {
        ...serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me", "workloads.list"]),
        "stream.attach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
        "stream.detach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
      });
      await routeOrbSocket(page);
      await page.route(`**${PORTABILITY_ROUTES.importCards}`, async (route) => {
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
      // A toast can come and go between two reads, so the page keeps the most toasts it ever held at once.
      await page.addInitScript(
        ({ key, selector }) => {
          const held = { seen: 0 };
          Reflect.set(globalThis, key, held);
          new MutationObserver(() => {
            held.seen = Math.max(held.seen, document.querySelectorAll(selector).length);
          }).observe(document, { childList: true, subtree: true });
        },
        { key: TOASTS_SEEN_KEY, selector: TOAST_ROOT },
      );
      await page.setViewportSize({ width: WIDE_PANE_PX, height: 900 });
      await mount<typeof ImportPreviewStory>(STORY, { width: WIDE_PANE_PX, appearance: appearanceSettingsSchema.parse({}) });

      await page.locator('input[type="file"]').first().setInputFiles(file);
      await page.getByRole("button", { name: IMPORT_CONFIRM_NAMES.file, exact: true }).click();

      const result = page.getByRole("group", { name: IMPORT_RESULT_NAME });
      const report = page.getByTestId(testId("importReport"));
      await expect(report).toBeVisible();
      await expect(result).toBeFocused();
      const toastsSeen = await page.evaluate((key) => {
        const held: unknown = Reflect.get(globalThis, key);
        return typeof held === "object" && held !== null && "seen" in held && typeof held.seen === "number" ? held.seen : -1;
      }, TOASTS_SEEN_KEY);
      expect(toastsSeen).toBe(0);

      // The reading measure as the browser resolves the token, taken from a probe inside the report so it inherits the same root.
      const measure = await report.evaluate((node, proseVar) => {
        const probe = document.createElement("div");
        probe.style.inlineSize = `var(${proseVar})`;
        node.append(probe);
        const resolved = probe.getBoundingClientRect().width;
        probe.remove();
        return resolved;
      }, TOKENS["reading.measure-prose"].cssVar);
      expect(measure).toBeGreaterThan(0);
      const lists = report.getByRole("list");
      const widths = await lists.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width));
      // The positive control: the report really has lists to measure (the outcome rows, and the notes when the server refused).
      expect(widths.length).toBeGreaterThan(0);
      for (const width of widths) {
        expect(width).toBeLessThanOrEqual(measure + 1);
      }
    });
  }
});
