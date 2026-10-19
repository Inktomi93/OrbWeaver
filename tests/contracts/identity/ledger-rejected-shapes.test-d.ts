// Shapes the decision ledger rejected by name. A reintroduction fails here; a rename of either subject fails the import.
import type { Principal } from "@orb/contracts/identity";
import type { AppSettings, appSettingsSchema } from "@orb/contracts/settings";
import { expectTypeOf, test } from "vitest";
import type { z } from "zod";

test("Principal gains no kind field: agents are structurally Principal-less (D60)", () => {
  expectTypeOf<Principal>().not.toHaveProperty("kind");
  // positive control: the property probe reads the real declaration, not an empty or `any` type
  expectTypeOf<Principal>().toHaveProperty("userId");
  expectTypeOf<Principal>().toHaveProperty("via");
});

test("appSettingsSchema carries no guidedActions: guided actions live only on the preset (D33)", () => {
  expectTypeOf<AppSettings>().not.toHaveProperty("guidedActions");
  expectTypeOf<z.infer<typeof appSettingsSchema>>().not.toHaveProperty("guidedActions");
  expectTypeOf<z.input<typeof appSettingsSchema>>().not.toHaveProperty("guidedActions");
  // positive control: an unresolvable shape widens to `unknown`/`any` and would fail here instead of passing the absence rows
  expectTypeOf<AppSettings>().toHaveProperty("promptCacheMinDepth");
});
