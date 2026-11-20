// An install's stored v11 override row held two HTML-trust keys; v12 holds one "Default for characters" step (D294). A
// v11 row read by this build lifts to the step that keeps what an inheriting character and a Rich HTML character drew
// under the two keys. A character set to Interactive resolves to Interactive under every lift, because its own step wins
// over the default.
// @subject packages/contracts/src/settings/index.ts
// @subject packages/server/src/domain/settings/effective-config/layer.ts
import type { HtmlTrustStep } from "@orb/contracts/chat";
import { renderPolicyOverrideForStep } from "@orb/contracts/chat";
import { settings } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { eq } from "drizzle-orm";
import { APP_SETTINGS_KEY } from "#server/domain/settings/contract/keys.ts";

// The last version that stored the two keys.
const LEGACY_VERSION = 11;

interface LegacyRow {
  readonly stored: Readonly<Record<string, boolean | null>>;
  /** The lifted override, `null` when the row leaves the step to the floor. */
  readonly lifted: HtmlTrustStep | null;
  /** What each kind of character draws after the lift. */
  readonly drew: { readonly inheriting: HtmlTrustStep; readonly richHtml: HtmlTrustStep; readonly interactive: HtmlTrustStep };
}

const LEGACY_ROWS: Readonly<Record<string, LegacyRow>> = {
  "no html keys": { stored: {}, lifted: null, drew: { inheriting: "interactive", richHtml: "trusted", interactive: "interactive" } },
  "interactive cards on, rich html on": {
    stored: { allowInteractiveCards: true, trustHtml: true },
    lifted: "interactive",
    drew: { inheriting: "interactive", richHtml: "trusted", interactive: "interactive" },
  },
  "interactive cards cleared, rich html off": {
    stored: { allowInteractiveCards: null, trustHtml: false },
    lifted: null,
    drew: { inheriting: "interactive", richHtml: "trusted", interactive: "interactive" },
  },
  "interactive cards off, rich html on": {
    stored: { allowInteractiveCards: false, trustHtml: true },
    lifted: "trusted",
    drew: { inheriting: "trusted", richHtml: "trusted", interactive: "interactive" },
  },
  "interactive cards off, rich html off": {
    stored: { allowInteractiveCards: false, trustHtml: false },
    lifted: "untrusted",
    drew: { inheriting: "untrusted", richHtml: "trusted", interactive: "interactive" },
  },
  "interactive cards off, rich html unset": {
    stored: { allowInteractiveCards: false },
    lifted: "untrusted",
    drew: { inheriting: "untrusted", richHtml: "trusted", interactive: "interactive" },
  },
};

test.for(Object.entries(LEGACY_ROWS))("a v11 row with %s lifts to the step its characters draw at", async ([, row], { harness }) => {
  const principal = await harness.principalFor(harness.ownerId);
  const caller = await harness.internalCallerFor(harness.ownerId);
  const inheriting = await caller.character.create({ input: { handle: "inherits", name: "Inherits", description: "Follows the install." } });
  const richHtml = await caller.character.create({ input: { handle: "rich-html", name: "Rich", description: "Styled, no scripts." } });
  const interactive = await caller.character.create({ input: { handle: "interactive", name: "Live", description: "Runs scripts." } });
  await caller.character.update({ characterId: richHtml.id, input: renderPolicyOverrideForStep("trusted") });
  await caller.character.update({ characterId: interactive.id, input: renderPolicyOverrideForStep("interactive") });
  const { chat } = await caller.chat.startChat({ characterIds: [inheriting.id, richHtml.id, interactive.id] });
  // The override row exists once an admin wrote any key; the plant then replaces it with what a v11 build stored.
  await harness.services.settings.updateAppSettings({ principal, partial: { localMultiUser: false } });
  await harness.db
    .update(settings)
    .set({ value: { localMultiUser: false, ...row.stored, schemaVersion: LEGACY_VERSION } })
    .where(eq(settings.key, APP_SETTINGS_KEY));
  await harness.services.settings.reloadEffectiveConfig();

  const { overrides } = await harness.services.settings.getAppSettingsWithOverrides({ principal });
  expect(overrides).not.toHaveProperty("trustHtml");
  expect(overrides).not.toHaveProperty("allowInteractiveCards");
  expect(overrides.defaultHtmlStep ?? null).toBe(row.lifted);
  const { participants } = await caller.chat.getChat({ chatId: chat.id });
  const stepOf = (characterId: string): HtmlTrustStep | undefined => participants.find((seat) => seat.characterId === characterId)?.renderPolicy?.htmlTrust;
  expect({ inheriting: stepOf(inheriting.id), richHtml: stepOf(richHtml.id), interactive: stepOf(interactive.id) }).toEqual(row.drew);
});
