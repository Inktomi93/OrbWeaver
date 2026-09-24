// Type-level pin for the destructive-reset safety gate (#1392). `MigrateDeps.launched` is the deployment
// posture that decides whether a regenerated baseline auto-WIPES the database or aborts boot. While it was
// optional, the production caller (`entry/lifecycle`) simply omitted it and silently took the permissive
// arm — a safety gate that had never once been armed on a real boot, and whose inertness would first matter
// on the first launched deployment.
//
// This file IS the enforcement: the key is REQUIRED, so any call site that forgets it is a compile error
// rather than a silent auto-wipe. The runtime half — an `undefined` arriving from an untyped caller must
// still take the REFUSAL arm, never the reset — is pinned behaviorally in `migrate.int.test.ts`.

import type { Db } from "@orb/db";
import type { MigrateDeps } from "@orb/server/entry/boot";
import { expectTypeOf, test } from "vitest";

test("`launched` is a REQUIRED MigrateDeps key — omitting it cannot typecheck", () => {
  expectTypeOf<MigrateDeps["launched"]>().toEqualTypeOf<boolean>();
  // The refusal itself: the shape the pre-fix lifecycle passed no longer satisfies MigrateDeps.
  expectTypeOf<{ db: Db; databaseUrl: string; backupDir: string }>().not.toExtend<MigrateDeps>();
  // …and adding the flag is what makes it satisfy it again.
  expectTypeOf<{ db: Db; databaseUrl: string; backupDir: string; launched: boolean }>().toExtend<MigrateDeps>();
});
