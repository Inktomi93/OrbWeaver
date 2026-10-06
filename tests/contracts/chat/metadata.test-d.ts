import type { GroupConfigInput, groupConfigInputSchema, NarratorGroupPolicy, NormalizedGroupConfigInput } from "@orb/contracts/chat";
import type { RosterPresetView, rosterPresetViewSchema } from "@orb/contracts/roster-preset";
import { expectTypeOf, test } from "vitest";
import type { z } from "zod";

test("legacy input stays accepted while normalized partial output and the roster view have one exact owner", () => {
  expectTypeOf<{ output: "narrator"; policy: "smart" }>().toMatchTypeOf<GroupConfigInput>();
  expectTypeOf<NormalizedGroupConfigInput>().toEqualTypeOf<z.output<typeof groupConfigInputSchema>>();
  expectTypeOf<Extract<NormalizedGroupConfigInput, { output: "narrator" }>["policy"]>().toEqualTypeOf<NarratorGroupPolicy | undefined>();
  expectTypeOf<RosterPresetView["groupConfig"]>().toEqualTypeOf<NormalizedGroupConfigInput | null>();
  expectTypeOf<z.output<typeof rosterPresetViewSchema>>().toMatchTypeOf<RosterPresetView>();
  expectTypeOf<RosterPresetView>().toMatchTypeOf<z.output<typeof rosterPresetViewSchema>>();
});
