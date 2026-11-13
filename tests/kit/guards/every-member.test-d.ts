// A table over a closed union names every member, or the call fails to compile and names the member it lacks.
import { everyMember, everyRow } from "@orb/kit/guards";
import { expectTypeOf, test } from "vitest";

const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
type Season = (typeof SEASONS)[number];

interface SeasonRow {
  readonly season: Season;
  readonly days: number;
}

test("a tuple naming every member comes back with its literal members", () => {
  const all = everyMember<Season>()(["spring", "summer", "autumn", "winter"]);
  expectTypeOf(all).toEqualTypeOf<readonly ["spring", "summer", "autumn", "winter"]>();
});

test("a tuple that leaves a member out fails to compile, and the error names the member", () => {
  // @ts-expect-error "winter" is missing, so the argument owes `{ missing: "winter" }`
  const short = everyMember<Season>()(["spring", "summer", "autumn"]);
  // @ts-expect-error a member outside the union is not a member
  const stray = everyMember<Season>()(["spring", "summer", "autumn", "winter", "monsoon"]);
  expectTypeOf(short).toExtend<readonly Season[]>();
  expectTypeOf(stray).toExtend<readonly string[]>();
});

test("rows naming every member through their key field come back as given", () => {
  const rows = everyRow<SeasonRow, "season">()([
    { season: "spring", days: 92 },
    { season: "summer", days: 93 },
    { season: "autumn", days: 90 },
    { season: "winter", days: 90 },
  ]);
  expectTypeOf(rows[0].season).toEqualTypeOf<"spring">();
});

test("rows that leave a member out fail to compile, and the error names the member", () => {
  // @ts-expect-error no row names "autumn", so the argument owes `{ missing: "autumn" }`
  const short = everyRow<SeasonRow, "season">()([
    { season: "spring", days: 92 },
    { season: "summer", days: 93 },
    { season: "winter", days: 90 },
  ]);
  expectTypeOf(short).toExtend<readonly SeasonRow[]>();
});
