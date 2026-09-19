// The per-row action-name DISAMBIGUATOR, resolved across a WHOLE list (side-eye P2c).
//
// A row action names its subject ('Star "Azarael" · 3d', 'Duplicate "Default (edited)" · 9h ago'), and the
// subject is the row's name plus the stamp the row already SHOWS — so what is announced matches the screen.
// A per-row derivation cannot know that the stamp collided: eight forks minted in the same hour all read
// "9h ago", and a character's projection is N rows titled "Azarael" whose newest few all read "2h". The
// result is N identical accessible names — a screen-reader or agent walk of the list cannot tell them apart,
// which is the exact defect the qualifier exists to fix.
//
// So the qualifier is resolved with the list in hand, escalating ONLY where it has to (a longer stamp on
// every row would be noise): the shown stamp → the absolute date-time → an ordinal. Rows that are already
// distinct keep the short form, so the common list is unchanged.

/**
 * The SUBJECT an action label names — the row's name, disambiguated by what the row already shows.
 *
 * It lives beside the resolver rather than inside `LibraryRow` because a row's cluster is not always a kebab:
 * the regex roster swaps it for a bulk checkbox named `Select <subject>`, which inherited the same collision
 * the kebab had (#443 — two rows named "New script" gave one list two identically-named controls). ONE
 * spelling of the grammar, so a row's two controls can never announce their subject two different ways.
 * (It cannot be exported from `library-row.tsx`: a component module may export only components —
 * `useComponentExportOnlyModules`.)
 */
export function rowActionSubject(name: string, qualifier: string | undefined): string {
  return qualifier === undefined ? name : `"${name}" · ${qualifier}`;
}

/**
 * The accessible name of a row's ACTION-MENU trigger (the trailing kebab) — `Actions for <subject>`.
 *
 * The grammar was re-spelled at every kebab in the client and again in ~50 test locators, so a copy change
 * broke specs that never imported the thing they assert (#2261; #2245 guessed a name the product does not
 * build). One exported builder makes the coupling COMPILE-time: the component and its tests call the same
 * function, and a drifted spelling cannot exist. `subject` is `rowActionSubject`'s output wherever the row
 * is disambiguated, and the bare row name where it is not.
 *
 * NOT the universal kebab name: the theme rows deliberately use `Theme actions: <name>` instead
 * (`features/settings/lib/theme-row-names.ts`, #2252) because the bare `Actions for Mocha` collided with
 * Playwright's substring matching against the theme cell of the same name.
 */
export function rowActionsName(subject: string): string {
  return `Actions for ${subject}`;
}

/** One row's disambiguation inputs: the name its actions announce + the instant its stamp shows. */
interface RowQualifierRow {
  readonly name: string;
  readonly at: number;
}

/** Group index by `name` + `stamp` — the pair whose collision makes two action names identical. */
function groupBy(rows: readonly RowQualifierRow[], stamps: readonly string[]): ReadonlyMap<string, readonly number[]> {
  const groups = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const key = `${row.name}\u0000${stamps[index] ?? ""}`;
    const bucket = groups.get(key);
    if (bucket === undefined) {
      groups.set(key, [index]);
    } else {
      bucket.push(index);
    }
  });
  return groups;
}

/**
 * The qualifier for each row, IN LIST ORDER — `rows[i]`'s qualifier is `result[i]`.
 *
 * @param rows - the list's rows, in the order they render.
 * @param stamp - the relative form the row already shows (`2h` / `9h ago`).
 * @param absolute - the escalation for a collided stamp (`Jul 3, 2026, 14:07`).
 */
export function rowQualifiers(rows: readonly RowQualifierRow[], stamp: (at: number) => string, absolute: (at: number) => string): readonly string[] {
  const shown = rows.map((row) => stamp(row.at));
  const resolved = [...shown];
  for (const collided of groupBy(rows, shown).values()) {
    if (collided.length < 2) {
      continue;
    }
    // Same name, same shown stamp: spend the full date-time. Two rows minted minutes apart separate here.
    for (const index of collided) {
      resolved[index] = absolute(rows[index]?.at ?? 0);
    }
  }
  // Whatever is STILL identical is identical to the millisecond (a bulk import, a same-tick fork) — nothing
  // the row displays can tell those apart, so fall back to their position in the list the reader is walking.
  for (const collided of groupBy(rows, resolved).values()) {
    if (collided.length < 2) {
      continue;
    }
    collided.forEach((index, ordinal) => {
      resolved[index] = `${resolved[index] ?? ""} · #${ordinal + 1}`;
    });
  }
  return resolved;
}
