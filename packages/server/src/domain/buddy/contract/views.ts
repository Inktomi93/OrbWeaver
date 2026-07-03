// domain/buddy/contract/views — the read-model the client renders (§7.4). The taxonomy types come from
// `@orb/contracts/buddy` (the ONE cross-boundary home) — db, client, and this
// domain all import them from contracts directly, never re-exported through `@orb/server`.

import type { BondTier, CompanionBones, CompanionForm, Mood, Stage } from "@orb/contracts/buddy";

/** What the client renders. `unhatched` carries the deterministic preview bones (so the gacha reveal
 *  shows the body before hatching); `hatched` carries the snapshot bones + the model-authored soul. The
 *  client draws the sprite from `bones`. `bondTier`/`stage`/`form` are DERIVED at read time (never
 *  stored). */
export interface BuddyView {
  readonly status: "hatched" | "unhatched";
  readonly bones: CompanionBones;
  readonly name: string | null;
  readonly personality: string | null;
  /** epoch-ms UTC; null until hatched (the row's `createdAt`). */
  readonly hatchedAt: number | null;
  readonly mood: Mood;
  /** The observer toggle. */
  readonly reactionsEnabled: boolean;
  /** The capability-ceiling kill switch for the tool-using "hands". */
  readonly agencyEnabled: boolean;
  /** Relationship tier (derived from bond XP). */
  readonly bondTier: BondTier;
  /** Maturity stage 0-2 (derived from stat-sum) — drives the sprite accent. */
  readonly stage: Stage;
  /** Archetype (derived from the dominant stat) — title + persona blurb. */
  readonly form: CompanionForm;
}
