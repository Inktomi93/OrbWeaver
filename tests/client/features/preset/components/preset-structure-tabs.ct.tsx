// CT (#9 item-4): the CompactionTab (a fragment of preset-structure-tabs.tsx, so the CT mirrors THAT source per
// the CT-mirror-path rule) communicates the RESOLVED DEFAULTS on first paint instead of a blank trigger + empty
// field. UNSET compaction ⇒ the mode Select's trigger shows the DEFAULT_COMPACTION_MODE placeholder
// ("Default — Managed…") and the threshold field carries the derived default in its description; a SET value ⇒
// the explicit selection renders (not the placeholder). The default text is derived from the single-homed
// constants (never re-spelled), so this CT bites if the UI drifts from the recommended default.

import { DEFAULT_COMPACTION_MODE, MANAGED_COMPACT_DEFAULT_PCT } from "@orb/contracts/preset";
import { expect, test } from "@playwright/experimental-ct-react";
import { compactionModeLabel } from "../../../../../packages/client/src/features/preset/lib/preset-nav";
import { CompactionTabDefaultsStory, CompactionTabSetStory } from "./_add-flow-stories";

const DEFAULT_PREFIX = /Default — /;

test("UNSET: the mode Select shows the resolved DEFAULT_COMPACTION_MODE placeholder + the threshold default in its description", async ({ mount }) => {
  const probe = await mount(<CompactionTabDefaultsStory />);

  // The mode trigger communicates the in-effect default (derived from the constant), not a blank trigger. Substring
  // match (not a dynamic regex) — both operands come from the single-homed constants.
  await expect(probe.getByText(`Default — ${compactionModeLabel(DEFAULT_COMPACTION_MODE)}`, { exact: false })).toBeVisible();

  // The threshold field's helper carries the derived default fraction (single-homed, not a re-spelled "0.85").
  await expect(probe.getByText(`leave blank for the ${MANAGED_COMPACT_DEFAULT_PCT} default`, { exact: false })).toBeVisible();
});

test("SET: an explicit compaction mode renders the selected value (not the placeholder)", async ({ mount }) => {
  const probe = await mount(<CompactionTabSetStory />);

  // The set story pins mode "auto" (a non-default) — the trigger shows the Auto label, and the default
  // placeholder ("Default — Managed…") is absent.
  await expect(probe.getByText(compactionModeLabel("auto"), { exact: false })).toBeVisible();
  await expect(probe.getByText(DEFAULT_PREFIX)).toHaveCount(0);
});
