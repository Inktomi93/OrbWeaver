import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { actionGroupGeometry, resolvedLength } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { StalenessActionGroupsStory } from "./_staleness-action-groups-stories.tsx";

const STORY = "tests/client/features/preset/components/_staleness-action-groups-stories/StalenessActionGroupsStory";
const DECISION_LABELS = { keep: "Keep", clear: "Clear" } as const;
const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop enlarged", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone landscape enlarged", width: 844, viewport: { width: 844, height: 390 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;
const READS = [
  "settings.getUserSettings",
  "sessions.me",
  "preset.get",
  "preset.list",
  "preset.resolveEffective",
  "connection.resolveChatCapability",
  "connection.providersAvailable",
  "connection.list",
  "preset.update",
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });

    for (const decision of ["keep", "clear"] as const) {
      const writeCount = decision === "clear" ? 1 : 0;
      const completionCount = decision === "clear" ? 1 : 0;
      test(`stored-but-dropped controls retain both keyboard actions and ${decision} preserves its distinct write semantics`, async ({
        mount,
        page,
      }, testInfo) => {
        await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
        await using root = await createServerHarness({ startJobs: false, secretBoxKey: Buffer.alloc(32, 17) });
        const caller = await root.internalCallerFor(root.ownerId);
        await caller.settings.updateUserSettingsSection({ section: "appearance", patch: regime.appearance });
        await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
        const credential = await caller.credentials.add({ provider: "openai", key: "synthetic-staleness-layout-key" });
        const connection = await caller.connection.create({
          providerId: "openai",
          credentialId: credential.id,
          baseUrl: null,
          model: "gpt-4o",
          label: "Staleness layout target",
        });
        await caller.connection.setBinding({ task: "chat", connectionId: connection.id });
        const preset = await caller.preset.create({
          name: "Stored sampling controls",
          kind: "chat",
          config: { ...DEFAULT_PROMPT_CONFIG, params: { topK: 42, minP: 0.5, dryMultiplier: 1.25 } },
        });
        const effective = await caller.preset.resolveEffective({ id: preset.id });
        expect(effective.stale.map((entry) => entry.knob)).toEqual(expect.arrayContaining(["topK", "minP", "dryMultiplier"]));
        const calls = await routeTrpc(page, serveCorpusProcedures(caller, READS));
        await mount<typeof StalenessActionGroupsStory>(STORY, { width: regime.width, appearance: regime.appearance, presetId: preset.id });
        await page.getByRole("tab", { name: "Params", exact: true }).click();
        const keep = page.getByRole("button", { name: DECISION_LABELS.keep, exact: true });
        const clear = page.getByRole("button", { name: DECISION_LABELS.clear, exact: true });
        const group = keep.locator("..");
        await expect(page.getByText(/^Set but not honored by this model:/u)).toBeVisible();
        await keep.focus();
        await page.keyboard.press("Tab");
        await expect(clear).toBeFocused();
        const geometry = await actionGroupGeometry(group, [keep, clear]);
        await testInfo.attach("actual-staleness-action-boxes", { body: JSON.stringify(geometry), contentType: "application/json" });
        expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
        expect(
          (await actionGroupGeometry(page.getByRole("group", { name: "Preset action host", exact: true }), [keep, clear])).inlineOverflow,
        ).toBeLessThanOrEqual(1);
        const floor = await resolvedLength(page, "var(--size-control-sm)", group);
        for (const box of geometry.controls) {
          expect(box.height).toBeGreaterThanOrEqual(floor);
        }
        const chosen = page.getByRole("button", { name: DECISION_LABELS[decision], exact: true });
        await chosen.focus();
        await expect(chosen).toBeFocused();
        await page.keyboard.press("Enter");
        await expect.poll(() => calls.count("preset.update")).toBe(writeCount);
        expect(calls.lastInput("preset.update")).toEqual(decision === "clear" ? { id: preset.id, config: { ...preset.config, params: {} } } : undefined);
        const completion = { clear: page.getByText("Saved", { exact: true }), keep };
        await expect(completion[decision]).toHaveCount(completionCount);
        const saved = await caller.preset.get({ id: preset.id });
        for (const knob of ["topK", "minP", "dryMultiplier"] as const) {
          expect(saved.config.params[knob]).toBe(decision === "clear" ? undefined : preset.config.params[knob]);
        }
      });
    }
  });
}
