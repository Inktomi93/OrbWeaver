// The persona and world entry metadata columns take only the value their narrowing function returns: a literal, a
// spread of a stored value with overrides, or a rest rebuild of one does not compile. Object.assign and an assertion
// are the forms the type cannot refuse; `orb/narrowed-json-brand` owns those.
// @subject packages/kit/src/json/index.ts
// @subject packages/db/src/schema/persona.ts
// @subject packages/db/src/schema/world-info.ts

import type { narrowPersonaMetadata, PersonaMetadata } from "@orb/contracts/persona";
import type { EntryMetadata, narrowEntryMetadata } from "@orb/contracts/world-info";
import type { personas, worldEntries } from "@orb/db/schema";
import { expectTypeOf, test } from "vitest";

type PersonaColumn = NonNullable<(typeof personas.$inferInsert)["metadata"]>;
type EntryColumn = NonNullable<(typeof worldEntries.$inferInsert)["metadata"]>;

declare const storedPersona: PersonaMetadata;
declare const storedEntry: EntryMetadata;

test("a spread or a rest rebuild of a stored value is not a column value", () => {
  const entrySpread = { ...storedEntry, inject: { depth: 999_999 }, extra: { nested: [1, 2] } };
  const personaSpread = { ...storedPersona, descriptionPosition: "at_depth" as const, inject: { depth: -5 } };
  const { inject: _dropped, ...personaRest } = storedPersona;
  const entryRebuilt = { ...storedEntry };
  expectTypeOf(entrySpread).not.toExtend<EntryColumn>();
  expectTypeOf(personaSpread).not.toExtend<PersonaColumn>();
  expectTypeOf(personaRest).not.toExtend<PersonaColumn>();
  expectTypeOf(entryRebuilt).not.toExtend<EntryColumn>();
  expectTypeOf({ descriptionPosition: "none" as const }).not.toExtend<PersonaColumn>();
});

test("one column's narrowed value is not the other's", () => {
  expectTypeOf<PersonaMetadata>().not.toExtend<EntryColumn>();
  expectTypeOf<EntryMetadata>().not.toExtend<PersonaColumn>();
});

test("the narrowing functions' output and a stored value copied whole are column values", () => {
  expectTypeOf<NonNullable<ReturnType<typeof narrowPersonaMetadata>>>().toExtend<PersonaColumn>();
  expectTypeOf<NonNullable<ReturnType<typeof narrowEntryMetadata>>>().toExtend<EntryColumn>();
  expectTypeOf(storedPersona).toExtend<PersonaColumn>();
});
