import type { ChatOnlyIntentField, RolePresetField, RolePresetParams, UserIntent } from "@orb/contracts/preset";
import type { SummarizeOptions } from "@orb/contracts/role-clients";
import { expectTypeOf, test } from "vitest";

// D299: a new `UserIntent` field reaches background roles only after someone classifies it. The two tuples
// must cover every intent key and share none, so adding a field to `userIntentSchema` fails here until it is
// listed in `ROLE_PRESET_FIELDS` or `CHAT_ONLY_INTENT_FIELDS`.

test("ROLE_PRESET_FIELDS and CHAT_ONLY_INTENT_FIELDS partition every UserIntent key", () => {
  expectTypeOf<Exclude<keyof UserIntent, RolePresetField | ChatOnlyIntentField>>().toEqualTypeOf<never>();
  expectTypeOf<Extract<RolePresetField, ChatOnlyIntentField>>().toEqualTypeOf<never>();
});

test("a background summarize call can carry no chat-only intent", () => {
  expectTypeOf<SummarizeOptions>().toEqualTypeOf<RolePresetParams>();
  expectTypeOf<Extract<keyof SummarizeOptions, ChatOnlyIntentField>>().toEqualTypeOf<never>();
});
