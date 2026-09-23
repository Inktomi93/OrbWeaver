// Story wrappers for command CT (CT mounts from a non-test module). CommandPaletteStory is the
// full assembled shape (input + two groups + a disabled item + escape/select instrumentation);
// DerivedItemsStory proves the real consumer pattern — a parent that re-renders and passes a
// freshly-mapped array of CommandItems (the R7 "collection-prop" acceptance shape, adapted to
// cmdk's children-based API: items keyed + valued by id, not inferred from textContent).
import {
  Command,
  CommandAuxiliaryButton,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
  CommandStatus,
} from "@orb/ui/command";
import type { ReactElement } from "react";
import { useState } from "react";

const FILES = ["report.md", "readme.md", "notes.txt"];
const ACTIONS = ["Create file", "Delete file"];

/** A loading list whose child is a block that asks for the full width — the skeleton-row shape. */
export function LoadingListStory(): ReactElement {
  return (
    <div style={{ width: 320 }}>
      <Command label="Loading">
        <CommandInput aria-label="Search" disabled={true} />
        <CommandList>
          <CommandLoading label="Loading rows…">
            <div data-testid="loading-child" style={{ height: 8, width: "100%" }} />
          </CommandLoading>
        </CommandList>
      </Command>
    </div>
  );
}

export function CommandPaletteStory(): ReactElement {
  const [selected, setSelected] = useState("");
  const [escapes, setEscapes] = useState(0);
  const onEscape = (): void => setEscapes((n) => n + 1);
  return (
    <div>
      <Command label="Command palette" onEscape={onEscape}>
        <CommandInput aria-label="Search commands" placeholder="Type a command…" />
        <CommandStatus />
        <CommandList>
          <CommandEmpty>No matching commands.</CommandEmpty>
          <CommandGroup heading="Files">
            {FILES.map((file) => (
              <CommandItem key={file} onSelect={setSelected} value={file}>
                {file}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Actions">
            {ACTIONS.map((action) => (
              <CommandItem disabled={action === "Delete file"} key={action} onSelect={setSelected} value={action}>
                {action}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
      <p data-testid="selected">{selected}</p>
      <p data-testid="escapes">{escapes}</p>
    </div>
  );
}

/** A non-option button sharing a cmdk list with a selected command row. */
export function AuxiliaryControlStory(): ReactElement {
  const [activated, setActivated] = useState(false);
  const [selected, setSelected] = useState("");
  return (
    <div>
      <Command label="Command palette">
        <CommandInput aria-label="Search" />
        <CommandList>
          <CommandItem onSelect={setSelected} value="home">
            Home
          </CommandItem>
          <CommandAuxiliaryButton onClick={(): void => setActivated(true)}>Retry</CommandAuxiliaryButton>
        </CommandList>
      </Command>
      <p data-testid="auxiliary-activated">{activated ? "true" : "false"}</p>
      <p data-testid="auxiliary-selected">{selected}</p>
    </div>
  );
}

/** A list long enough that most of its rows are OUTSIDE the bounded viewport — the shape the character
 *  picker mounts (a walked page of 100+ options) and the one `orb-skip-offscreen` exists for. */
const LONG_LIST = Array.from({ length: 60 }, (_, i) => `row ${String(i + 1).padStart(2, "0")}`);

/**
 * A BOUNDED command list of 60 rows — the mount that can tell "render-skipped" apart from "unmounted".
 * Every row is in the DOM (cmdk resolves arrow-roving, its filter sort and Enter through
 * `querySelectorAll` over the mounted `[cmdk-item]`s), and the ones below the fold skip layout and paint.
 * The CT walks the keyboard to a row that starts off-screen and selects it.
 */
export function LongCommandListStory(): ReactElement {
  const [selected, setSelected] = useState("");
  return (
    <div>
      <Command label="Long list">
        <CommandInput aria-label="Search rows" placeholder="Search rows…" />
        <CommandList className="max-h-40">
          <CommandEmpty>No matching rows.</CommandEmpty>
          {LONG_LIST.map((row) => (
            <CommandItem key={row} onSelect={setSelected} value={row}>
              {row}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
      <p data-testid="selected">{selected}</p>
    </div>
  );
}

const SOURCE = [
  { id: "a1", name: "alpha" },
  { id: "b2", name: "bravo" },
  { id: "c3", name: "charlie" },
];

/**
 * The normal React case: a parent re-renders and derives a NEW filtered/mapped array of command
 * items each time (never a module-const stable reference), with each `CommandItem` given an
 * explicit id-based `value` (per the doc-comment's guidance — never rely on inferred textContent
 * identity for a dynamic tree). If cmdk's filtering broke on a fresh child tree, the popup would
 * mis-render after a re-render; the acceptance test asserts it does not.
 */
export function DerivedItemsStory(): ReactElement {
  const [bump, setBump] = useState(0);
  const rerender = (): void => setBump((n) => n + 1);
  const items = SOURCE.filter((s) => s.name.length > 0).map((s) => ({ ...s }));
  return (
    <div>
      <button data-testid="rerender" onClick={rerender} type="button">
        rerender {bump}
      </button>
      <Command label="Command palette">
        <CommandInput aria-label="Search commands" />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          {items.map((item) => (
            <CommandItem key={item.id} keywords={[item.name]} value={item.id}>
              {item.name}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </div>
  );
}
