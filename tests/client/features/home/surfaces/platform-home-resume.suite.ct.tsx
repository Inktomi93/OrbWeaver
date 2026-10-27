import { HOME_RECENT_CHATS_LIMIT } from "@orb/contracts/chat";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { HomeGridRefStory } from "./_grid-ref-stories.tsx";

const NAMES = [
  { label: "ordinary", title: "The Ashen Spire", wraps: false },
  { label: "long unbroken", title: "W".repeat(160), wraps: true },
] as const;

for (const device of [
  { label: "desktop", width: 1440, height: 1000, coarse: false },
  { label: "phone", width: 390, height: 844, coarse: true },
] as const) {
  test.describe(device.label, () => {
    test.use({ hasTouch: device.coarse, isMobile: device.coarse, viewport: { width: device.width, height: device.height } });

    for (const name of NAMES) {
      test(`${name.label} resume title keeps its identity and two-line bounds`, async ({ corpus, mount, page }) => {
        await using root = await createCorpusHarness();
        const caller = await root.internalCallerFor(root.ownerId);
        await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
        await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
        const recent = await caller.chat.listChats({ limit: HOME_RECENT_CHATS_LIMIT });
        const hearth = recent.items[0];
        if (hearth === undefined) {
          throw new Error("The corpus must expose a recent room for Home's resume surface");
        }
        await routeTrpc(page, {
          ...createShellAmbientReads(corpus, root.ownerId),
          ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, "chat.getChat"]),
          "chat.listChats": (input) => {
            expect(input).toEqual({ limit: HOME_RECENT_CHATS_LIMIT });
            return { ...recent, items: [{ ...hearth, title: name.title }] };
          },
        });
        await mount<typeof HomeGridRefStory>("tests/client/features/home/surfaces/_grid-ref-stories/HomeGridRefStory", { width: device.width });
        const resume = page.getByRole("button", { name: `Resume ${name.title}`, exact: true });
        await expect(resume).toBeVisible();
        const title = resume.getByText(name.title, { exact: true });
        await expect(title).toBeVisible();
        await expect
          .poll(async () =>
            title.evaluate((node) => {
              const box = node.getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(node);
              // Clamped-away lines are not painted; the visible lines must fit without horizontal clipping.
              const visible = [...range.getClientRects()].filter((rect) => rect.top < box.bottom && rect.bottom > box.top);
              return Math.max(0, ...visible.map((rect) => Math.max(box.left - rect.left, rect.right - box.right)));
            }),
          )
          .toBeLessThanOrEqual(1);
        const geometry = await title.evaluate((node) => ({
          height: node.getBoundingClientRect().height,
          lineHeight: Number.parseFloat(getComputedStyle(node).lineHeight),
        }));
        expect(geometry.height).toBeLessThanOrEqual(geometry.lineHeight * 2 + 1);
        expect(geometry.height).toBeGreaterThanOrEqual(geometry.lineHeight * (name.wraps ? 2 : 1) - 1);
      });
    }
  });
}
