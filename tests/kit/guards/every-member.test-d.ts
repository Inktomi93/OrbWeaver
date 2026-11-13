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

declare const someSeason: Season;
declare const someSeasons: readonly Season[];

test("an array typed as the union's array is not a table: its length and members are unknown", () => {
  // @ts-expect-error the argument owes `{ notALiteralTable: ... }`
  const unknownLength = everyMember<Season>()(someSeasons);
  expectTypeOf(unknownLength).toExtend<readonly Season[]>();
});

test("a value typed as the whole union names no member, so it covers none", () => {
  // @ts-expect-error `someSeason` could be any season, so the argument owes `{ notOneMember: Season }`
  const widened = everyMember<Season>()([someSeason]);
  // @ts-expect-error the same widened value as a row key covers nothing
  const widenedRow = everyRow<SeasonRow, "season">()([{ season: someSeason, days: 1 }]);
  expectTypeOf(widened).toExtend<readonly Season[]>();
  expectTypeOf(widenedRow).toExtend<readonly SeasonRow[]>();
});

test("a member named twice is refused: a second row for one member is a copy that should have named another", () => {
  // @ts-expect-error "spring" twice, so the argument owes `{ namedTwice: "spring" }`
  const twice = everyMember<Season>()(["spring", "summer", "autumn", "winter", "spring"]);
  // @ts-expect-error two rows for "winter"
  const twoRows = everyRow<SeasonRow, "season">()([
    { season: "spring", days: 92 },
    { season: "summer", days: 93 },
    { season: "autumn", days: 90 },
    { season: "winter", days: 90 },
    { season: "winter", days: 89 },
  ]);
  expectTypeOf(twice).toExtend<readonly Season[]>();
  expectTypeOf(twoRows).toExtend<readonly SeasonRow[]>();
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
