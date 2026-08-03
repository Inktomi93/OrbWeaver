// CT harness (not a spec — Playwright CT needs mounted components in their own module, and biome forbids
// exporting a component from a `.ct.tsx`). Mirrors the PRESET LIST's exact anatomy, because both defects
// this harness pins are anatomy defects rather than component defects:
//
//   · F-4 — a list whose rows carry DIFFERENT cluster shapes (the built-in preset has a state toggle and
//     NO actions menu; every fork has toggle + duplicate + kebab), inside a row that RESERVES its trailing
//     strip. That combination is what staggered the one-of-N state column by 80px row to row.
//   · F-5 — the rows are `role="radio"` inside the list's `role="radiogroup"`, so the WAI-ARIA radiogroup
//     keyboard contract (one tabbable radio, Arrows move the selection) applies to them.
//
// The harness owns the active id so a keyboard move is observable as a real selection flip, and it composes
// the SHIPPING components (`LibraryListLayout` + `LibraryRow` + `RowToggleAction`) rather than re-spelling
// their markup — a harness that re-declares the anatomy proves nothing about the anatomy that ships.

import { LibraryListLayout, LibraryRow, RowToggleAction } from "@orb/client/components";
import { Circle } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { useState } from "react";

/** The built-in row is the one with NO actions menu — the shape whose short cluster caused F-4. */
const ROWS = [
  { id: "builtin", name: "Default", builtIn: true },
  { id: "fork-a", name: "Default (edited)", builtIn: false },
  { id: "fork-b", name: "New preset", builtIn: false },
] as const;

const NOOP = (): void => undefined;

export function LibraryListHarness(): ReactElement {
  const [activeId, setActiveId] = useState<string>("builtin");
  return (
    <div style={{ width: 320 }}>
      <LibraryListLayout
        isEmpty={false}
        onSearchChange={NOOP}
        rowsRadiogroupLabel="Active preset for generation"
        searchLabel="Search presets"
        searchPlaceholder="Search presets"
        searchValue=""
      >
        {ROWS.map((row) => (
          <LibraryRow
            actionsReserved={3}
            key={row.id}
            onSelect={NOOP}
            selected={false}
            stateToggle={
              <RowToggleAction
                icon={Circle}
                labelOff={`Activate ${row.name} for generation`}
                labelOn={`Activate ${row.name} for generation`}
                onToggle={(): void => setActiveId(row.id)}
                pressed={activeId === row.id}
                pressedFill={true}
                rest="when-on"
                semantics="radio"
              />
            }
            title={row.name}
            {...(row.builtIn
              ? { subtitle: "Built-in default" }
              : {
                  subtitle: "generation · edited now",
                  actions: {
                    deleteDescription: "This can't be undone.",
                    inlineVerb: "duplicate" as const,
                    name: row.name,
                    onDelete: NOOP,
                    onDuplicate: NOOP,
                    onRename: NOOP,
                  },
                })}
          />
        ))}
      </LibraryListLayout>
      <p data-testid="active-id">{activeId}</p>
    </div>
  );
}
