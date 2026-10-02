import type { RosterPresetView } from "@orb/contracts/roster-preset";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { RosterPresetService } from "@orb/server/domain/roster-preset";
import { vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

const view = {
  id: mintTypeId(ID_PREFIX.rosterPreset),
  name: "Party",
  description: "",
  anchorPersonaId: null,
  groupConfig: { output: "per-speaker" },
  game: null,
  members: [],
  rules: [],
  createdAt: 1,
  updatedAt: 2,
} satisfies RosterPresetView;

test("roster get preserves a sparse stored group-config input without filling room defaults", async () => {
  const get = vi.fn<RosterPresetService["get"]>().mockResolvedValue(view);
  const ctx = makeContext({ auth: principal("user"), services: { rosterPreset: { get } } });
  await expect(caller(ctx).rosterPreset.get({ presetId: view.id })).resolves.toEqual(view);
});

test("roster get refuses a malformed stored field instead of healing and rewriting its reply", async () => {
  const get = vi.fn<RosterPresetService["get"]>();
  // @ts-expect-error — the output boundary must refuse an untyped stored value that violates the declared boolean.
  get.mockResolvedValue({ ...view, groupConfig: { output: "per-speaker", autoMode: "bad" } });
  const ctx = makeContext({ auth: principal("user"), services: { rosterPreset: { get } } });
  await expect(caller(ctx).rosterPreset.get({ presetId: view.id })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
});
