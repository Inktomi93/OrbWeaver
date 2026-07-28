// The Macro browser (WAVE MU — the deferred 02 §5 browser consumer, landed): every macro the preset's
// evaluation would see — the builtins + THIS preset's user macros — rendered from the ONE metadata table
// (`queryMacros` over a composed registry; `MACRO_FLAG_DEFS` documents the flag vocabulary). User macros
// carry source attribution (§12A.5) and a REFUSED definition (builtin collision / bad name) is surfaced
// exactly as registration reports it — the browser shows the truth of the registry, never a parallel list.

import type { UserMacroSpec } from "@orb/contracts/preset";
import type { MacroMetadata, UserMacroRegistration } from "@orb/kit/macro";
import { createDefaultRegistry, MACRO_FLAG_DEFS, queryMacros, registerUserMacros } from "@orb/kit/macro";
import { Badge } from "@orb/ui/badge";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useMemo } from "react";

export interface MacroBrowserProps {
  /** The preset's user-macro definitions — composed onto a fresh default registry for display. */
  readonly userMacros: readonly UserMacroSpec[];
  /** The owning preset id (source attribution — `preset:<id>`). */
  readonly presetId: string;
}

interface BrowserModel {
  readonly macros: readonly MacroMetadata[];
  readonly rejected: UserMacroRegistration["rejected"];
}

// Compose the display registry exactly the way evaluation composes it (defaults + registerUserMacros) —
// the browser reads the SAME metadata surface the engine enforces, so the two can never disagree.
function buildModel(userMacros: readonly UserMacroSpec[], presetId: string): BrowserModel {
  const registry = createDefaultRegistry();
  const { rejected } = registerUserMacros(registry, userMacros, { source: { kind: "preset", id: presetId } });
  return { macros: queryMacros(registry, {}), rejected };
}

/** One macro's arg signature for display — `name` / `name?` / `name?=default`, comma-joined. */
function argSignature(meta: MacroMetadata): string {
  const parts = meta.args.map((a) => {
    const opt = a.optional ? "?" : "";
    const def = a.default !== undefined && a.default !== "" ? `=${a.default}` : "";
    return `${a.name}${opt}${def} (${a.type})`;
  });
  return meta.variadic ? [...parts, "…"].join(", ") : parts.join(", ");
}

/** The browser — a flat, name-sorted metadata list + the flag-vocabulary reference. */
export function MacroBrowser({ userMacros, presetId }: MacroBrowserProps): ReactElement {
  const { macros, rejected } = useMemo(() => buildModel(userMacros, presetId), [userMacros, presetId]);
  return (
    <Stack gap="block">
      {rejected.map((r) => (
        <Text key={r.name} size="micro" tone="warning">
          “{r.name}” was refused: {r.reason}
        </Text>
      ))}
      <Section heading="Macros">
        <Stack gap="field">
          {macros.map((meta) => (
            <MacroRow key={meta.name} meta={meta} />
          ))}
        </Stack>
      </Section>
      <Section heading="Flags">
        <Text size="micro" tone="muted">
          A flag run sits between the braces and the name — {"{{#name}}…{{/name}}"}. Reserved flags parse and carry but do nothing yet.
        </Text>
        <Stack gap="field">
          {MACRO_FLAG_DEFS.filter((def) => def.key !== "closing").map((def) => (
            <Row key={def.key} gap="field" align="center">
              <code>{def.char}</code>
              <Badge intent={def.status === "implemented" ? "info" : "neutral"} size="sm">
                {def.status}
              </Badge>
              <Text size="micro" tone="muted">
                {def.description}
              </Text>
            </Row>
          ))}
        </Stack>
      </Section>
    </Stack>
  );
}

/** One macro row: name + category/volatile/strict/source badges + description + the arg signature. */
function MacroRow({ meta }: { readonly meta: MacroMetadata }): ReactElement {
  const signature = argSignature(meta);
  return (
    <Stack gap="field">
      <Row gap="field" align="center">
        <code>{`{{${meta.name}}}`}</code>
        <Badge intent="neutral" size="sm">
          {meta.category}
        </Badge>
        {meta.volatile ? (
          <Badge intent="warning" size="sm">
            volatile
          </Badge>
        ) : null}
        {meta.strict === true ? (
          <Badge intent="info" size="sm">
            strict
          </Badge>
        ) : null}
        {meta.source !== undefined ? (
          <Badge intent="info" size="sm">
            {meta.source.kind === "preset" ? "this preset" : "game"}
          </Badge>
        ) : null}
      </Row>
      <Text size="micro" tone="muted">
        {meta.description}
        {signature === "" ? "" : ` — args: ${signature}`}
      </Text>
    </Stack>
  );
}
