import { createCharacterSchema } from "@orb/contracts/character";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { StreamFrame } from "@orb/contracts/stream";
import { createTagSchema } from "@orb/contracts/tag";
import { actionGroupGeometry, resolvedLength } from "@orb/testkit/browser/spec";
import { routeOrbSocket, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { SuggestionActionGroupsStory } from "./_suggestion-action-groups-stories.tsx";

const STORY = "tests/client/features/tag/surfaces/_suggestion-action-groups-stories/SuggestionActionGroupsStory";
type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
const REVIEW_WRITES = {
  apply: { label: "Apply", chosen: "tag.attachTag", other: "tag.detachTag" },
  reject: { label: "Reject", chosen: "tag.detachTag", other: "tag.attachTag" },
} as const;

async function tagChangeFrame(events: ReturnType<Root["app"]["liveBuses"]["user"]["subscribeUserEvents"]>): Promise<readonly StreamFrame[]> {
  for await (const event of events) {
    if (event.type === "tagsChanged") {
      return [{ channel: "user" as const, event }];
    }
  }
  return [];
}
const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop enlarged", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone landscape enlarged", width: 844, viewport: { width: 844, height: 390 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, hasTouch: regime.coarse, isMobile: regime.coarse });

    for (const decision of ["apply", "reject"] as const) {
      test(`${REVIEW_WRITES[decision].label} keeps its single-line partner and reviews only its named suggestion`, async ({ mount, page }, info) => {
        await using root = await createCorpusHarness();
        const caller = await root.internalCallerFor(root.ownerId);
        await caller.settings.updateUserSettingsSection({ section: "appearance", patch: regime.appearance });
        await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
        for (const pending of await caller.tag.listPendingSuggestions()) {
          await caller.tag.attachTag({ tagId: pending.id, targetType: "character", targetId: pending.characterId, status: "accepted" });
        }
        const [first, second] = (await caller.character.list({ limit: 2 })).items;
        const nameLimit = createTagSchema.shape.name.maxLength;
        const characterNameLimit = createCharacterSchema.shape.name.maxLength;
        if (first === undefined || second === undefined || nameLimit === null || characterNameLimit === null) {
          throw new Error("The corpus must expose two owned characters and the tag name boundary");
        }
        const firstName = `${"Northern province traveler ".repeat(characterNameLimit).slice(0, characterNameLimit - 2)} A`;
        const secondName = `${"Northern province traveler ".repeat(characterNameLimit).slice(0, characterNameLimit - 2)} B`;
        await caller.character.update({ characterId: first.id, input: { name: firstName } });
        await caller.character.update({ characterId: second.id, input: { name: secondName } });
        const tag = await caller.tag.createTag({ input: { name: "Action qualification label ".repeat(nameLimit).slice(0, nameLimit) } });
        await caller.tag.attachTag({ tagId: tag.id, targetType: "character", targetId: first.id, status: "pending" });
        await caller.tag.attachTag({ tagId: tag.id, targetType: "character", targetId: second.id, status: "pending" });
        const calls = await routeTrpc(page, {
          ...serveCorpusProcedures(caller, [
            "sessions.me",
            "settings.getUserSettings",
            "tag.listTagsWithUsage",
            "tag.listPendingSuggestions",
            "tag.attachTag",
            "tag.detachTag",
          ]),
          "stream.attach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
          "stream.detach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
        });
        const listening = Promise.withResolvers<void>();
        const joined = Promise.withResolvers<void>();
        const stop = new AbortController();
        let started = false;
        await using subscription = new AsyncDisposableStack();
        subscription.defer(async () => {
          stop.abort();
          if (started) {
            await joined.promise;
          }
        });
        await routeOrbSocket(page, {
          awaitAttaches: 1,
          frames: async (signal) => {
            started = true;
            const events = root.app.liveBuses.user.subscribeUserEvents(root.ownerId, AbortSignal.any([signal, stop.signal]));
            listening.resolve();
            try {
              return await tagChangeFrame(events);
            } catch (error) {
              if (!stop.signal.aborted) {
                throw error;
              }
              return [];
            } finally {
              joined.resolve();
            }
          },
        });
        const mounted = await mount<typeof SuggestionActionGroupsStory>(STORY, { width: regime.width, appearance: regime.appearance });
        const row = page.getByRole("group", { name: `Suggested ${tag.name} for ${firstName}`, exact: true });
        const apply = row.getByRole("button", { name: "Apply", exact: true });
        const reject = row.getByRole("button", { name: "Reject", exact: true });
        await apply.focus();
        await page.keyboard.press("Tab");
        await expect(reject).toBeFocused();
        const geometry = await actionGroupGeometry(row, [apply, reject]);
        await info.attach("suggestion-pair-geometry", { body: JSON.stringify(geometry), contentType: "application/json" });
        expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
        const tops = geometry.controls.map((box) => box.y);
        expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
        expect(
          (await actionGroupGeometry(page.getByRole("group", { name: "Suggestion action host", exact: true }), [apply, reject])).inlineOverflow,
        ).toBeLessThanOrEqual(1);
        const floor = await resolvedLength(page, "var(--size-control-sm)", row);
        for (const box of geometry.controls) {
          expect(box.height).toBeGreaterThanOrEqual(floor);
        }
        await listening.promise;
        await row.getByRole("button", { name: REVIEW_WRITES[decision].label, exact: true }).focus();
        await page.keyboard.press("Enter");
        await expect(row).toBeHidden();
        const remaining = page.getByRole("group", { name: `Suggested ${tag.name} for ${secondName}`, exact: true });
        await expect(remaining.getByRole("button", { name: "Apply", exact: true })).toBeFocused();
        expect((await caller.tag.listPendingSuggestions()).map((entry) => entry.characterId)).toEqual([second.id]);
        const adopted = await caller.tag.listAttachedEntities({ tagId: tag.id, targetType: "character" });
        const adoptedTargets = { apply: [first.id], reject: [] };
        expect(adopted.entities.map((entry) => entry.targetId)).toEqual(adoptedTargets[decision]);
        expect((await caller.tag.listTags()).some((entry) => entry.id === tag.id)).toBe(true);
        expect(calls.count(REVIEW_WRITES[decision].chosen)).toBe(1);
        expect(calls.count(REVIEW_WRITES[decision].other)).toBe(0);
        await mounted.unmount();
        await joined.promise;
      });
    }
  });
}
