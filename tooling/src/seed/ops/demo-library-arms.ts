/**
 * Demo seed — the LIBRARY arms (regex tiers + saved rosters), split out of `demo.ts` when that file crossed
 * the `tooling-size` cap (450) with #1764. Same door as the panels: every row is created through the domain
 * verbs, never raw inserts, so a seeded row can never disagree with what the UI would have written.
 *
 * `deriveRegexTierFlags` is the SAME pure derivation the client's save boundary and the server's bulk-placement
 * verb use, so a seeded script's markdownOnly/promptOnly flags cannot disagree with its placement set. The
 * disabled preset tier lives here too, called once the demo preset exists.
 */
import type { CharacterId, ChatId, PresetId } from "@orb/kit/ids";
import type { RegexPlacement } from "@orb/kit/regex";
import { deriveRegexTierFlags, SubstituteFindRegex } from "@orb/kit/regex";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SeedDemoDeps } from "../contract/types.ts";
import {
  REGEX_DISABLED_SCRIPT_NAME,
  REGEX_DISPLAY_ONLY_SCRIPT_NAME,
  REGEX_FIND_REPLACE_SCRIPT_NAME,
  REGEX_PROMPT_ONLY_SCRIPT_NAME,
  ROSTER_PRESET_ALT_NAME,
  ROSTER_PRESET_MATCHING_NAME,
} from "../lib/fixture.ts";

refuseDirectInvocation(import.meta.url, "pnpm seed:demo (node tooling/src/seed/cli.ts <demo|chat|multi-user>)");

type LibraryArmDeps = Pick<SeedDemoDeps, "services" | "owner" | "log">;

/** Three regex tiers — global find/replace, character display-only, chat prompt-only — created and attached
 *  so the room's effective run order shows every tier populated on a fresh db (#1725 boards 04/05, the #1742
 *  room Regex section). The preset tier is `seedDemoPresetRegexTier`, once the demo preset exists. */
export async function seedDemoRegexTiers(
  deps: LibraryArmDeps,
  target: { readonly assistantId: CharacterId | undefined; readonly chatId: ChatId },
): Promise<void> {
  const { services, owner, log } = deps;
  const { assistantId, chatId } = target;
  // Regex scripts (#1725 boards 04/05 + the #1742 room Regex section) — one per tier, so the room's
  // effective run order shows every tier populated on a fresh db: global / character / chat / preset
  // (the preset leg lands below, once the demo preset exists). `deriveRegexTierFlags` is the SAME pure
  // derivation the client's save boundary and the server's bulk-placement verb use, so a seeded row's
  // markdownOnly/promptOnly flags can never disagree with its placement set.
  const findReplacePlacement: RegexPlacement[] = ["AI_OUTPUT", "USER_INPUT"];
  const findReplaceScript = await services.regex.createScript({
    principal: owner,
    input: {
      name: REGEX_FIND_REPLACE_SCRIPT_NAME,
      enabled: true,
      findRegex: "\\bthe Loom\\b",
      replaceString: "the great Loom",
      placement: findReplacePlacement,
      ...deriveRegexTierFlags(findReplacePlacement),
      runOnEdit: false,
      trimStrings: [],
      substituteRegex: SubstituteFindRegex.none,
    },
  });
  await services.regex.attachGlobal({ principal: owner, scriptId: findReplaceScript.id });

  const displayOnlyPlacement: RegexPlacement[] = ["DISPLAY"];
  const displayOnlyScript = await services.regex.createScript({
    principal: owner,
    input: {
      name: REGEX_DISPLAY_ONLY_SCRIPT_NAME,
      enabled: true,
      findRegex: "\\*([^*]+)\\*",
      replaceString: "_$1_",
      placement: displayOnlyPlacement,
      ...deriveRegexTierFlags(displayOnlyPlacement),
      runOnEdit: false,
      trimStrings: [],
      substituteRegex: SubstituteFindRegex.none,
    },
  });
  if (assistantId !== undefined) {
    await services.regex.attachToCharacter({ principal: owner, characterId: assistantId, scriptId: displayOnlyScript.id });
  }

  const promptOnlyPlacement: RegexPlacement[] = ["AI_OUTPUT"];
  const promptOnlyScript = await services.regex.createScript({
    principal: owner,
    input: {
      name: REGEX_PROMPT_ONLY_SCRIPT_NAME,
      enabled: true,
      findRegex: "\\bvault-key-7\\b",
      replaceString: "[redacted]",
      placement: promptOnlyPlacement,
      ...deriveRegexTierFlags(promptOnlyPlacement),
      runOnEdit: false,
      trimStrings: [],
      substituteRegex: SubstituteFindRegex.none,
    },
  });
  await services.regex.attachToChat({ principal: owner, chatId, scriptId: promptOnlyScript.id });
  log(
    `regex scripts created + attached: global/${REGEX_FIND_REPLACE_SCRIPT_NAME}, character/${REGEX_DISPLAY_ONLY_SCRIPT_NAME}, chat/${REGEX_PROMPT_ONLY_SCRIPT_NAME}`,
  );
}

/** Saved rosters (D61 B6) through the same library-create door the rosters panel uses: one matching the demo
 *  group's seated trio, one a different pairing, so the picker shows more than a single row. */
export async function seedDemoRosters(
  deps: LibraryArmDeps,
  target: { readonly assistantId: CharacterId | undefined; readonly groupCharIds: readonly CharacterId[] },
): Promise<void> {
  const { services, owner, log } = deps;
  const { assistantId, groupCharIds } = target;
  // Saved rosters (D61 B6) — through the same library-create door the rosters panel uses. One matching
  // the demo group's seated trio, one a different pairing, so the picker shows more than a single row.
  await services.rosterPreset.create({
    principal: owner,
    input: {
      name: ROSTER_PRESET_MATCHING_NAME,
      description: "The refinery crew, ready to seat as a group.",
      members: groupCharIds.map((characterId, position) => ({ kind: "character" as const, characterId, position })),
    },
  });
  if (assistantId !== undefined) {
    const altMembers = [assistantId, groupCharIds[0]]
      .filter((id): id is CharacterId => id !== undefined)
      .map((characterId, position) => ({ kind: "character" as const, characterId, position }));
    await services.rosterPreset.create({
      principal: owner,
      input: { name: ROSTER_PRESET_ALT_NAME, description: "A smaller two-seat pairing.", members: altMembers },
    });
  }
  log(`saved rosters created: ${ROSTER_PRESET_MATCHING_NAME}, ${ROSTER_PRESET_ALT_NAME}`);
}

/** The FOURTH regex tier: a DISABLED script attached to the demo preset, so the preset leg of the room's Regex
 *  section is populated too and a disabled row stays disabled through the attach. */
export async function seedDemoPresetRegexTier(deps: LibraryArmDeps, presetId: PresetId): Promise<void> {
  const { services, owner, log } = deps;
  // The FOURTH regex tier: a DISABLED script attached to the demo preset — so the preset leg of the room's
  // Regex section is populated too, and a disabled row stays disabled through the attach.
  const disabledPlacement: RegexPlacement[] = ["WORLD_INFO"];
  const disabledScript = await services.regex.createScript({
    principal: owner,
    input: {
      name: REGEX_DISABLED_SCRIPT_NAME,
      enabled: false,
      findRegex: "\\r\\n",
      replaceString: "\\n",
      placement: disabledPlacement,
      ...deriveRegexTierFlags(disabledPlacement),
      runOnEdit: false,
      trimStrings: [],
      substituteRegex: SubstituteFindRegex.none,
    },
  });
  await services.regex.attachToPreset({ principal: owner, presetId, scriptId: disabledScript.id });
  log(`regex script created (disabled) + attached: preset/${REGEX_DISABLED_SCRIPT_NAME}`);
}
