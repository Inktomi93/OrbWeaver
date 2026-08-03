// The regex collection's CONTEXT arm — "Where it runs" for the selected script.
//
// THE FOUR SCOPES, EACH IN ITS OWN VOICE (workspace.html's context column). The GLOBAL scope is a SWITCH:
// it is a property of the script (`global_regex_scripts` PKs on the script id) and this library owns it, so
// this pane decides it. The other three are ROSTERS: a preset, a character and a room each attach from the
// thing they belong to, so this pane can only REPORT them — "Attached by presets · 2" over the two names.
// The read behind them is `regex.listScriptUsage` (REGROSTER), the reverse of the forward `listFor*` lists;
// until it existed the pane shipped an honest sentence pointing at the three carriers instead, because
// faking the answer would have meant an N-query fan-out over every preset and character the owner has.
//
// A ROSTER ROW IS A NAME, NOT A LINK. There is no door from here to a preset/character/room member — the
// existing `goToCollection` intent only opens a config COLLECTION, and none of these three is one. A row
// that looked clickable and wasn't would be worse than a row that reads as what it is: a statement of where
// this script already runs. An EMPTY roster still renders (with its `· 0` and the line saying where to
// attach one) — omitting it would read as "not built", not as "none yet".
//
// AND THE GLOBAL SCOPE'S RUN ORDER (REGORDER). Global is an ORDERED tier, not a set: the resolver hands
// `executeRegexScripts` the global attachments in junction-`position` order and the executor applies them
// in order, so "which of my always-on scripts bites first" is data — and `regex.applyScopeOrder` shipped
// with no client caller at all. This is the pane where the global membership is decided, so it is the pane
// where its order is decided. The other three scopes author theirs in the shared picker, beside their own
// attach switches.

import type { RegexAttachmentRef, RegexScriptRow } from "@orb/contracts/regex";
import type { CharacterId, ChatId, PresetId } from "@orb/kit/ids";
import { EmptyState } from "@orb/ui/empty-state";
import type { LucideIcon } from "@orb/ui/icons";
import { Code, Icon, MessagesSquare, SlidersHorizontal, Users } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { RegexScopeOrder } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { regexScriptTitle } from "#lib";
import { useAttachRegexGlobal, useDetachRegexGlobal } from "../hooks/use-regex-library.ts";

export function RegexContextBody({ memberId }: { readonly memberId: string }): ReactElement {
  const trpc = useTRPC();
  const { data: scripts } = useSuspenseQuery(trpc.regex.listScripts.queryOptions());
  const { data: globals } = useSuspenseQuery(trpc.regex.listGlobal.queryOptions());
  const script = scripts.find((row) => row.id === memberId);
  if (script === undefined) {
    return <EmptyState description="This script was deleted. Pick another on the left." icon={<Icon icon={Code} size="lg" />} title="Script not found" />;
  }
  return <RegexScopePanel globals={globals} isGlobal={globals.some((row) => row.id === script.id)} script={script} />;
}

function RegexScopePanel({
  script,
  isGlobal,
  globals,
}: {
  readonly script: RegexScriptRow;
  readonly isGlobal: boolean;
  readonly globals: readonly RegexScriptRow[];
}): ReactElement {
  const trpc = useTRPC();
  // Keyed on the RESOLVED script id, so the rosters can never belong to the previously-selected row. Rides
  // the `regexChanged` bus row (invalidation.ts path-invalidates the whole regex router), so an attach or
  // detach made anywhere — this device or another — repaints these lists.
  const { data: usage } = useSuspenseQuery(trpc.regex.listScriptUsage.queryOptions({ scriptId: script.id }));
  const invalidation = useInvalidation();
  const attach = useAttachRegexGlobal({ trpc, invalidation });
  const detach = useDetachRegexGlobal({ trpc, invalidation });

  return (
    // `padding="block"` — the same inset its sibling arm (`BookAttachments`) uses, so one context slot has
    // one edge (side-eye 2026-08-03 P3, the two-grammars finding).
    <Stack data-slot="regex-context-body" gap="block" padding="block">
      <Row align="center" gap="field" justify="between">
        <Text as="span" voice="label">
          Runs in every chat
        </Text>
        <Switch
          aria-label={`${regexScriptTitle(script)} runs in every chat`}
          checked={isGlobal}
          onCheckedChange={(checked): void => {
            if (checked) {
              void attach.mutateAsync({ scriptId: script.id });
            } else {
              void detach.mutateAsync({ scriptId: script.id });
            }
          }}
        />
      </Row>
      <Text voice="gloss">The one scope this library owns — the other three attach this script from the thing it belongs to.</Text>
      {/* THE SCOPE IS MOOT WHEN THE SCRIPT RUNS ON NOTHING (side-eye 2026-08-03 P2). This pane's entire job
          is "where does this script run", and with `placement: []` the honest answer is nowhere — no amount
          of attaching changes that. Said here as well as on the row and in the editor, because this is the
          pane a reader opens to ask the question. */}
      {script.placement.length === 0 ? (
        <Text className="text-destructive" voice="label">
          This script has no “Runs on” stream selected, so it will not run in any of these scopes. Pick one in the editor.
        </Text>
      ) : null}
      <AttachmentRoster
        emptyText="No preset attaches this script yet. Open a preset's Regex tab to attach it there."
        glyph={SlidersHorizontal}
        noun="presets"
        rows={usage.presets}
      />
      <AttachmentRoster
        emptyText="No character attaches this script yet. Open a character's Regex field to attach it there."
        glyph={Users}
        noun="characters"
        rows={usage.characters}
      />
      <AttachmentRoster
        emptyText="No room attaches this script yet. Open a chat's This-chat panel to attach it there."
        glyph={MessagesSquare}
        noun="rooms"
        rows={usage.rooms}
      />
      {/* THE ROSTERS LEAD, THE ORDER FOLLOWS (side-eye 2026-08-03 P2 "panel burial"). The order editor used
          to sit directly under the global switch: at the owner's 34 global scripts its 34 rows pushed
          "Attached by presets / characters / rooms" ~1400px below the fold, in a panel whose entire stated
          job is telling you where this script runs. The three rosters ARE that answer and they are bounded
          (a script is attached by a handful of carriers); the order list is unbounded in the library's size,
          so it goes last. Still gated: one global script has no run order, and a non-global script's pane
          has no business editing a tier it is not in. */}
      {isGlobal && globals.length > 1 ? (
        <Section kicker="Global run order">
          <Stack gap="field">
            <Text voice="gloss">First to last. Every always-on script runs in this order, on every message.</Text>
            <RegexScopeOrder
              renderItem={(row, index): ReactElement => <GlobalOrderRow current={row.id === script.id} position={index + 1} script={row} />}
              scope={GLOBAL_SCOPE}
              scripts={globals}
            />
          </Stack>
        </Section>
      ) : null}
    </Stack>
  );
}

/**
 * ONE reverse roster — "Attached by <noun> · N" over the carrier names, or the honest none-yet line.
 *
 * The COUNT rides in the kicker rather than a badge because the count IS part of the section's name here:
 * "Attached by rooms · 0" is a complete statement, where a bare "Attached by rooms" over an empty box asks
 * the reader whether the list failed to load. The empty arm keeps the section — an omitted section reads as
 * a surface that was never built, not as a scope with nothing in it.
 *
 * The glyph is `aria-hidden` (Icon's default): the noun is already in the section heading the row sits
 * under, so announcing it per row would say "presets" three times before each name.
 */
function AttachmentRoster({
  noun,
  glyph,
  rows,
  emptyText,
}: {
  readonly noun: string;
  readonly glyph: LucideIcon;
  readonly rows: readonly RegexAttachmentRef<PresetId | CharacterId | ChatId>[];
  readonly emptyText: string;
}): ReactElement {
  return (
    <Section data-slot={`regex-usage-${noun}`} kicker={`Attached by ${noun} · ${rows.length}`}>
      {rows.length === 0 ? (
        <Text voice="gloss">{emptyText}</Text>
      ) : (
        <Stack gap="tight">
          {rows.map((row) => (
            // `min-w-0` + `truncate`: this pane is the config rail's 320px context column, and a long
            // preset name must clip inside it rather than push the roster past its own edge.
            <Row align="center" className="min-w-0" gap="field" key={row.id}>
              <Icon icon={glyph} size="xs" />
              <Text as="span" className="truncate" title={row.name}>
                {row.name}
              </Text>
            </Row>
          ))}
        </Stack>
      )}
    </Section>
  );
}

/** The `applyScopeOrder` scope this pane writes — hoisted so a re-render never hands the order editor a
 *  fresh object identity for a value that never changes. */
const GLOBAL_SCOPE = { kind: "global" } as const;

/** One row of the global order: its position, its name, and — for the script this pane is about — the fact
 *  that it is the one you came here for. Without that marker the reader has to match names by eye to find
 *  out where their own script sits, which is the whole question the panel answers. */
function GlobalOrderRow({
  script,
  position,
  current,
}: {
  readonly script: RegexScriptRow;
  readonly position: number;
  readonly current: boolean;
}): ReactElement {
  return (
    <Row align="center" gap="field" justify="between">
      <Row align="center" className="min-w-0" gap="field">
        <Text as="span" voice="datum">
          {position}
        </Text>
        <Text as="span">{regexScriptTitle(script)}</Text>
      </Row>
      {current ? (
        <Text as="span" voice="gloss">
          this script
        </Text>
      ) : null}
    </Row>
  );
}
