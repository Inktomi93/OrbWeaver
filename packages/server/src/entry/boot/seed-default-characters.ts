// entry/boot/seed-default-characters — boot step 4: the default-character pack (tiers/entry.md §"Boot order").
//
// FLAG[PD-32]: the authored default-card SEEDER subsystem (`domain/character/seeder/` —
// `createDefaultCharacterSeeder` / `WELCOME_ASSISTANT_HANDLE` / `DEFAULT_CHARACTER_CARDS`, character.md
// §"Public surface") is a SEPARABLE slice that is NOT built yet (PROMOTION-DEBT PD-32, blocked on the
// settings `isSeeded`/`markSeeded` seam). There is no authored card content to seed and no front-door verb
// to call; inventing card data here would be fake content. So this boot step is an idempotent no-op that
// records the gap once. When PD-32 lands, wire the seeder's idempotent `seed` (over the real
// `character.create` path, gated by `settings.isSeeded`/`markSeeded`) HERE.

import { getLog } from "#foundation/observability";

/** Boot step 4: seed the default-character pack. FLAG[PD-32] — the seeder subsystem is not built; no-op. */
export function seedDefaultCharacters(): void {
  getLog().info(
    { flag: "PD-32" },
    "boot/seed-default-characters: default-card seeder not built (PD-32) — skipping",
  );
}
