// The Macro browser: every macro a `MacroCatalog` holds, each naming its source and linking to the editor that
// owns it; a source the reader cannot reach shows its name alone. Shared by the preset editor and the game console.

import type { MacroSourceRef } from "@orb/kit/macro";
import { MACRO_FLAG_DEFS } from "@orb/kit/macro";
import { Badge } from "@orb/ui/badge";
import { InlineAction } from "@orb/ui/inline-action";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { CatalogMacro, MacroCatalog, MacroPlane } from "#lib";
import { MACRO_CATEGORY_WORDS, macroSourceLabel } from "#lib";
import { openInstalledPlugin, selectPreset, setActiveSection } from "#state";
import type { StatusVocabulary } from "./status-chip.tsx";
import { StatusChip } from "./status-chip.tsx";

const FLAG_STATUS: StatusVocabulary<(typeof MACRO_FLAG_DEFS)[number]["status"]> = {
  implemented: { label: "Implemented", tone: "info" },
  reserved: { label: "Reserved", tone: "neutral" },
};

export interface MacroBrowserProps {
  readonly catalog: MacroCatalog;
}

/** The existing navigation that opens the editor owning a source, or `null` when the reader cannot get there from
 *  here: a game's editor is the console the browser already sits in, and a preset with no id is the built-in default
 *  or a view that knows the preset by name alone. A total switch, so a new source kind fails `tsc`. */
function sourceOpener(source: MacroSourceRef): (() => void) | null {
  switch (source.kind) {
    case "preset": {
      const { id } = source;
      return id === null
        ? null
        : (): void => {
            selectPreset(id);
            setActiveSection("presets");
          };
    }
    case "plugin": {
      const { id } = source;
      return (): void => openInstalledPlugin(id);
    }
    case "game":
      return null;
    default:
      throw new Error("Unreachable macro source", { cause: source satisfies never });
  }
}

/** One macro's arg signature for display — `name` / `name?` / `name?=default`, comma-joined. */
function argSignature(meta: CatalogMacro["meta"]): string {
  const parts = meta.args.map((a) => {
    const opt = a.optional ? "?" : "";
    const def = a.default !== undefined && a.default !== "" ? `=${a.default}` : "";
    return `${a.name}${opt}${def} (${a.type})`;
  });
  return meta.variadic ? [...parts, "…"].join(", ") : parts.join(", ");
}

/** The browser — a flat, name-sorted metadata list + the flag-vocabulary reference. */
export function MacroBrowser({ catalog }: MacroBrowserProps): ReactElement {
  const { macros, rejected } = catalog;
  return (
    <Stack gap="block">
      {rejected.map((r) => (
        <Text key={r.name} tone="warning" voice="gloss">
          “{r.name}” was refused: {r.reason}
        </Text>
      ))}
      {/* KICKERS, not sentence-case headings (side-eye F-8): ONE group-heading voice across all five
          editor views — see `entry-list-editor.tsx` for the full ruling. */}
      <Section kicker="Macros">
        <Stack gap="field">
          {macros.map((macro) => (
            <MacroRow key={macro.meta.name} macro={macro} />
          ))}
        </Stack>
      </Section>
      <Section kicker="Flags">
        {/* Same paragraph cap as the macro glosses below, and for the same reason (#859 T-3). */}
        <Text cap="prose" voice="gloss">
          A flag run sits between the braces and the name: {"{{#name}}…{{/name}}"}. Reserved flags parse and carry but do nothing yet.
        </Text>
        <Stack gap="field">
          {MACRO_FLAG_DEFS.filter((def) => def.key !== "closing").map((def) => (
            <Row key={def.key} gap="field" align="center">
              <code>{def.char}</code>
              <StatusChip size="sm" status={def.status} vocabulary={FLAG_STATUS} />
              <Text cap="prose" voice="gloss">
                {def.description}
              </Text>
            </Row>
          ))}
        </Stack>
      </Section>
    </Stack>
  );
}

/** Where a macro lives: a link to the owning editor when the reader can get there, else the name alone. */
function MacroSource({ plane }: { readonly plane: MacroPlane }): ReactElement {
  const label = macroSourceLabel(plane);
  const open = plane.current === true ? null : sourceOpener(plane.source);
  if (open === null) {
    return (
      <Badge tone="info" variant="solid" size="sm">
        {label}
      </Badge>
    );
  }
  return (
    <InlineAction variant="link" onClick={open} step="body" type="button">
      {label}
    </InlineAction>
  );
}

/** One macro row: name + category/volatile/strict/source + description + the arg signature. */
function MacroRow({ macro }: { readonly macro: CatalogMacro }): ReactElement {
  const { meta, plane } = macro;
  const signature = argSignature(meta);
  return (
    <Stack gap="field">
      <Row gap="field" align="center">
        <code>{`{{${meta.name}}}`}</code>
        <Badge size="sm">{MACRO_CATEGORY_WORDS[meta.category]}</Badge>
        {meta.volatile ? (
          <Badge tone="warning" variant="solid" size="sm">
            Volatile
          </Badge>
        ) : null}
        {meta.strict === true ? (
          <Badge tone="info" variant="solid" size="sm">
            Strict
          </Badge>
        ) : null}
        {plane === undefined ? null : <MacroSource plane={plane} />}
      </Row>
      {/* CAPPED ON THE PARAGRAPH (#859 T-3). These glosses used to be paid for only by a reader who opened
          the browser; it is open by default now (`user-macros-tab.tsx`), so their measure became a
          default-visible cost — audited at 105-119 characters (78 CSS ch) per line across the content pane,
          past the 80-character ceiling, on eighteen rows at once. `--reading-measure-prose` is the house
          TEACHING measure and the cap `Text`'s own `voice` doc prescribes (`ui/text/variants.ts`); a reading
          line is capped on the paragraph, never on the pane. */}
      <Text cap="prose" voice="gloss">
        {meta.description}
        {signature === "" ? "" : `, args: ${signature}`}
      </Text>
    </Stack>
  );
}
