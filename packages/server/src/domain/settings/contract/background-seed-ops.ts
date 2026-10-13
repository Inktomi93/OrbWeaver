import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { DefaultBackgroundSeederDeps, SeededSlugResolver } from "./seeder.ts";

export type BackgroundSeedSettings = Pick<DefaultBackgroundSeederDeps, "readOnboarding" | "readLibrary" | "writeLibrary" | "markSeeded">;
export interface SeedBackgroundRewriteDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly migrateCards: (userId: UserId, resolve: SeededSlugResolver, at: number) => Promise<number>;
  readonly migrateRooms: (userId: UserId, resolve: SeededSlugResolver, at: number) => Promise<number>;
}
