// The shared regex-script PICKER (D121-E). Attaches/detaches LIBRARY rows to one scope — a preset, a
// character, or a room — instead of authoring a private copy of the script into that carrier's blob.
//
// This component is the whole user-visible payoff of the reshape. Before, a preset's Regex tab and a
// character's regex facet each held their OWN array of scripts: the same rule written twice ran twice, the
// character editor exposed four of the ten fields (so an in-app card script had `placement: []` and could
// never fire), and there was no way to say "this preset and that character share this one rule". Now every
// surface picks from the ONE library the settings pane authors, and the row runs exactly once per turn even
// when two scopes both claim it (the resolver dedupes on the row id, earliest tier wins).
//
// Client-shared (not `@orb/ui`): it speaks tRPC. Features cannot import each other, and BOTH the preset
// editor and the character facet editor need it — `components/` is the shared home (the
// `RegexEditorDialog` precedent).
//
// IT FILTERS PAST THE SAME CAP THE RAIL DOES (`COLLECTION_LARGE_GROUP`, side-eye 2026-08-06): this deck maps
// the owner's WHOLE library flat, so it hits "not a glance" at exactly the size the config rail's group
// frame does. ONE constant, one grammar, two homes — see `PickerBody`.

import type { RegexPickerScope, RegexScriptRow } from "@orb/contracts/regex";
import type { CharacterId, ChatId, PresetId, RegexScriptId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Icon, Search } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { COLLECTION_LARGE_GROUP, regexScriptScent, regexScriptTitle, timeLib } from "#lib";
import { RegexScopeOrder } from "./regex-scope-order.tsx";
import { scopeOrderShowsGrips } from "./regex-scope-order-model.ts";

// Every regex verb is `busDriven` (`regexChanged` path-invalidates the whole router), so no call site
// hand-invalidates its own attached-list read. The six factories live at the BOTTOM of this file, next to
// each other, so the three scope pairs read as one table.

export interface RegexScriptPickerProps {
  readonly scope: RegexPickerScope;
  /**
   * The GROUP name, when the picker is one deck among several (the preset's Transforms view). Omit it when
   * the picker IS the whole body of something already named — the character facet's `Regex scripts` drill
   * rendered a `Regex scripts` heading inside a `Regex scripts` drill header, beside a `Regex scripts`
   * inspector panel: four labels, one concept, one screen (side-eye X-7).
   */
  readonly heading?: string | undefined;
  readonly helperText: string;
  /**
   * Takes the user to the script library. The EMPTY arm's action (side-eye X-19) — a picker with nothing in
   * it must not read as broken, it must carry the one thing there is to do. It arrives as a callback rather
   * than being wired here because navigation is a `#state` act and `components/` is below the features that
   * own it; omit it and the empty arm falls back to naming the destination in prose.
   */
  readonly onOpenLibrary?: (() => void) | undefined;
}

/** The picker. Dispatches to the per-scope READER — three sibling components rather than one component
 *  switching a query, because the three `listFor*` procs have three distinct option types and a hook cannot
 *  be called conditionally: one component per scope keeps each read honestly typed with no cast. The switch
 *  is exhaustive, so a new scope is a compile error rather than a silently empty picker. */
export function RegexScriptPicker(props: RegexScriptPickerProps): ReactElement {
  const { scope } = props;
  switch (scope.kind) {
    case "character":
      return <CharacterScopePicker {...props} scope={scope} />;
    case "preset":
      return <PresetScopePicker {...props} scope={scope} />;
    case "chat":
      return <ChatScopePicker {...props} scope={scope} />;
    default:
      return assertNeverScope(scope);
  }
}

function assertNeverScope(scope: never): never {
  throw new Error(`unhandled regex picker scope: ${JSON.stringify(scope)}`);
}

function CharacterScopePicker(props: RegexScriptPickerProps & { readonly scope: { kind: "character"; characterId: CharacterId } }): ReactElement {
  const trpc = useTRPC();
  const attached = useSuspenseQuery(trpc.regex.listForCharacter.queryOptions({ characterId: props.scope.characterId }));
  return <PickerBody {...props} attached={attached.data} />;
}

function PresetScopePicker(props: RegexScriptPickerProps & { readonly scope: { kind: "preset"; presetId: PresetId } }): ReactElement {
  const trpc = useTRPC();
  const attached = useSuspenseQuery(trpc.regex.listForPreset.queryOptions({ presetId: props.scope.presetId }));
  return <PickerBody {...props} attached={attached.data} />;
}

function ChatScopePicker(props: RegexScriptPickerProps & { readonly scope: { kind: "chat"; chatId: ChatId } }): ReactElement {
  const trpc = useTRPC();
  const attached = useSuspenseQuery(trpc.regex.listForChat.queryOptions({ chatId: props.scope.chatId }));
  return <PickerBody {...props} attached={attached.data} />;
}

/** The scope-blind body: the owner's whole library with a switch per row (on = attached to this scope).
 *
 *  THE LIST SPLITS ONCE SOMETHING IS ATTACHED (REGORDER). Per-scope execution ORDER is real data
 *  (`applyScopeOrder`) and had no author, so the attached slice is now an ordered, reorderable group and
 *  the rest of the library follows it. Split IN PLACE — one row per script, never a second list beside
 *  this one: an "execution order" panel above the picker would print every attached script's name twice on
 *  one deck, which is the exact redundancy X-7 ruled against in this very component. The two slices are
 *  real `Section`s so the boundary is an `h3` a screen reader hears, not a visual gap.
 *
 *  KICKER, NOT `heading` (side-eye F-8 REGRESSED → R-4, 2026-08-03). This component landed after the
 *  fix-round that moved `EntryListEditor` to the kicker voice, and rebuilt the same defect: on the preset's
 *  Transforms deck its 16px sentence-case white `Regex` heading sat among four 10.5px muted caps kickers
 *  (Delivery · Collapsing · Post-processing · Inline reasoning parsing), so one deck spoke two group
 *  grammars. Same ruling, same reasoning as the composite's: a picker in a deck IS a deck group, and this
 *  is not a per-call-site knob — a knob is how the divergence happened both times. */
function PickerBody({
  scope,
  heading,
  helperText,
  onOpenLibrary,
  attached,
}: RegexScriptPickerProps & { readonly attached: readonly RegexScriptRow[] }): ReactElement {
  const trpc = useTRPC();
  const library = useSuspenseQuery(trpc.regex.listScripts.queryOptions());
  const [filter, setFilter] = useState("");
  const attachedIds = new Set(attached.map((row) => row.id));

  // THE FILTER IS THE COLLECTION GROUP'S, GATED ON THE SAME CONSTANT (side-eye 2026-08-06). This picker maps
  // the owner's WHOLE library flat — 35 rows at the seeded fixture, ~400 in the owner's real one — and a
  // library past a glance earns the same box, in the same place, with the same grammar as the config rail's
  // group frame. One constant (`COLLECTION_LARGE_GROUP`), one behaviour, both homes.
  const filterable = library.data.length > COLLECTION_LARGE_GROUP;
  const needle = filterable ? filter.trim().toLowerCase() : "";
  const matches = (script: RegexScriptRow): boolean => needle === "" || regexScriptTitle(script).toLowerCase().includes(needle);
  const loose = library.data.filter((script) => !attachedIds.has(script.id) && matches(script));
  const matchedAttached = attached.filter(matches);
  const nothingMatches = needle !== "" && loose.length === 0 && matchedAttached.length === 0;
  // The rank column always; the grip column only where the ordered slice actually draws one (one home for
  // that threshold — `scopeOrderShowsGrips`).
  const reserveGrip = scopeOrderShowsGrips(attached.length);

  const looseRows = (
    <Stack gap="field" role="list">
      {loose.map((script) => (
        <Stack key={script.id} role="listitem">
          <PickerRow attached={false} reserveRank={attached.length > 0} reserveGrip={reserveGrip} scope={scope} script={script} />
        </Stack>
      ))}
    </Stack>
  );

  const body = (
    <Stack gap="field">
      <Text voice="gloss">{helperText}</Text>
      {library.data.length === 0 ? <EmptyLibrary onOpenLibrary={onOpenLibrary} /> : null}
      {filterable ? (
        <Row align="center" gap="tight">
          <Icon icon={Search} size="sm" className="text-muted-foreground" />
          <Input aria-label="Filter regex scripts" onValueChange={setFilter} placeholder="Filter regex scripts…" value={filter} />
        </Row>
      ) : null}
      {nothingMatches ? <Text voice="gloss">No scripts match that filter.</Text> : null}
      {/* Nothing attached ⇒ NO split: two group headings over one undifferentiated library is noise, and
          the ordered slice would be empty. This is the pre-REGORDER rendering, unchanged. */}
      {library.data.length > 0 && attached.length === 0 ? looseRows : null}
      {attached.length === 0 ? null : (
        <Section kicker={attached.length > 1 ? "Runs here, in order" : "Runs here"}>
          {/* A FILTERED VIEW HAS NO ORDER TO EDIT. `applyScopeOrder` keeps rows the write doesn't name as a
              relative TAIL, so committing a drag over a filtered subset would silently push every hidden
              attachment to the end — a control that lies. While a needle is set the slice renders as plain
              rows carrying their TRUE ranks (the index in the whole attached list), and the reorder
              affordance returns with the full list. */}
          {needle === "" ? (
            <RegexScopeOrder
              // The ordinal is the kicker's own claim, made checkable (side-eye sweep 2026-08-03). "Runs here,
              // in order" over 34 undifferentiated rows asks the reader to count them by eye to know where the
              // one they just moved landed — the config rail's global readout already answers that with a
              // leading position, and this is the same concept in its other home. Only the ORDERED slice gets
              // one: an unordered "Not attached" row numbered 1..n would be a rank that means nothing.
              renderItem={(script, index): ReactElement => <PickerRow attached={true} position={index + 1} scope={scope} script={script} />}
              scope={scope}
              scripts={attached}
            />
          ) : (
            <Stack gap="field" role="list">
              {matchedAttached.map((script) => (
                <Stack aria-posinset={attached.indexOf(script) + 1} aria-setsize={attached.length} key={script.id} role="listitem">
                  <PickerRow
                    attached={true}
                    position={attached.indexOf(script) + 1}
                    reserveGrip={reserveGrip}
                    reserveRank={false}
                    scope={scope}
                    script={script}
                  />
                </Stack>
              ))}
            </Stack>
          )}
        </Section>
      )}
      {attached.length === 0 || loose.length === 0 ? null : <Section kicker="Not attached">{looseRows}</Section>}
    </Stack>
  );
  // No `heading` ⇒ no group frame at all: the picker is the whole body of something already named, and a
  // Section with an absent kicker would still spend the group's block gap on nothing (X-7).
  return heading === undefined ? body : <Section kicker={heading}>{body}</Section>;
}

/** The empty arm — WITH ITS ACTION (side-eye X-19). It used to be a bare sentence pointing at "Settings →
 *  Regex", which is a navigation instruction printed next to a surface that can navigate. An empty state
 *  carries the thing it is telling you to do. */
function EmptyLibrary({ onOpenLibrary }: { readonly onOpenLibrary: (() => void) | undefined }): ReactElement {
  return (
    <Stack gap="field" align="start">
      <Text voice="gloss">
        {onOpenLibrary === undefined
          ? "You haven't written any regex scripts yet — add one in Settings → Regex, then attach it here."
          : "You haven't written any regex scripts yet — write one in your library, then attach it here."}
      </Text>
      {onOpenLibrary === undefined ? null : (
        <Button intent="secondary" onClick={onOpenLibrary} size="sm" type="button">
          Open your script library
        </Button>
      )}
    </Stack>
  );
}

/** One library row + its attach switch.
 *
 *  THE SUBTITLE IS THE SHARED SCENT, WHOLE (side-eye X-15, then 2026-08-03 P2). This row used to append the
 *  pipeline stages after the scent; the scent now LEADS with those same stages (one home, `regexScriptScent`),
 *  so the append became the line saying its first fact twice. Both halves of X-15's finding survive inside
 *  the shared function: the F-23 stage vocabulary, then the find pattern that tells two "New script" rows
 *  apart. */
function PickerRow({
  scope,
  script,
  attached,
  position,
  reserveGrip = false,
  reserveRank = false,
}: {
  readonly scope: RegexPickerScope;
  readonly script: RegexScriptRow;
  readonly attached: boolean;
  /** 1-based execution rank, present ONLY inside the ordered slice (see the `renderItem` note above). */
  readonly position?: number;
  /** Hold the width the ORDERED slice spends on its drag grip, so the two slices share one left edge
   *  (side-eye 2026-08-06 P3 — the unattached rows started 53px inboard of the attached ones). Set from
   *  `scopeOrderShowsGrips`, never guessed: past the large-group cap that slice has Move buttons instead. */
  readonly reserveGrip?: boolean;
  /** Hold the rank column's width on a row that has no rank (the unattached slice), for the same reason. */
  readonly reserveRank?: boolean;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const toggle = useToggleAttachment({ trpc, invalidation, scope });
  const name = regexScriptTitle(script);

  return (
    <Row gap="field" align="center" justify="between">
      {/* The rank rides INSIDE the identity cluster (the `GlobalOrderRow` anatomy), not as a third
          `justify-between` child — a bare sibling would push the name to the row's centre. */}
      <Row align="center" className="min-w-0" gap="field">
        {reserveGrip ? <Row aria-hidden={true} className="size-control-sm shrink-0" /> : null}
        <RankCell position={position} reserve={reserveRank} />
        <Stack gap="tight" className="min-w-0">
          <Text>{name}</Text>
          <Text voice="gloss">{regexScriptScent(script, timeLib.formatRelative)}</Text>
        </Stack>
      </Row>
      <Switch
        aria-label={`Attach ${name}`}
        checked={attached}
        onCheckedChange={(next): void => {
          void toggle(script.id, next);
        }}
      />
    </Row>
  );
}

/** The ordered slice's 1-based rank, or the WIDTH it would take on a row that has none — one fixed column
 *  so the two slices share a left edge (see `PickerRow`'s `reserveRank`). Its own component rather than a
 *  nested ternary: three states, one cell. */
function RankCell({ position, reserve }: { readonly position: number | undefined; readonly reserve: boolean }): ReactElement | null {
  if (position === undefined) {
    return reserve ? <Row aria-hidden={true} className="w-control-sm shrink-0" /> : null;
  }
  return (
    <Text as="span" voice="datum" className="w-control-sm shrink-0 text-end tabular-nums">
      {position}
    </Text>
  );
}

/** The attach/detach dispatch — one call site per scope kind, returned as a single `(scriptId, next)` fn so
 *  the row does not care which junction it is writing. */
function useToggleAttachment({
  trpc,
  invalidation,
  scope,
}: {
  readonly trpc: ReturnType<typeof useTRPC>;
  readonly invalidation: ReturnType<typeof useInvalidation>;
  readonly scope: RegexPickerScope;
}): (scriptId: RegexScriptId, next: boolean) => Promise<unknown> {
  const attachCharacter = useAttachCharacter({ trpc, invalidation });
  const detachCharacter = useDetachCharacter({ trpc, invalidation });
  const attachPreset = useAttachPreset({ trpc, invalidation });
  const detachPreset = useDetachPreset({ trpc, invalidation });
  const attachChat = useAttachChat({ trpc, invalidation });
  const detachChat = useDetachChat({ trpc, invalidation });

  return (scriptId, next): Promise<unknown> => {
    switch (scope.kind) {
      case "character":
        return next
          ? attachCharacter.mutateAsync({ characterId: scope.characterId, scriptId })
          : detachCharacter.mutateAsync({ characterId: scope.characterId, scriptId });
      case "preset":
        return next ? attachPreset.mutateAsync({ presetId: scope.presetId, scriptId }) : detachPreset.mutateAsync({ presetId: scope.presetId, scriptId });
      case "chat":
        return next ? attachChat.mutateAsync({ chatId: scope.chatId, scriptId }) : detachChat.mutateAsync({ chatId: scope.chatId, scriptId });
      default:
        return assertNeverScope(scope);
    }
  };
}

const useAttachCharacter = createEntityMutation<{ readonly characterId: CharacterId; readonly scriptId: RegexScriptId }, void>({
  options: (trpc) => trpc.regex.attachToCharacter.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't attach that script to this character.",
});
const useDetachCharacter = createEntityMutation<{ readonly characterId: CharacterId; readonly scriptId: RegexScriptId }, { readonly detached: boolean }>({
  options: (trpc) => trpc.regex.detachFromCharacter.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't detach that script from this character.",
});
const useAttachPreset = createEntityMutation<{ readonly presetId: PresetId; readonly scriptId: RegexScriptId }, void>({
  options: (trpc) => trpc.regex.attachToPreset.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't attach that script to this preset.",
});
const useDetachPreset = createEntityMutation<{ readonly presetId: PresetId; readonly scriptId: RegexScriptId }, { readonly detached: boolean }>({
  options: (trpc) => trpc.regex.detachFromPreset.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't detach that script from this preset.",
});
const useAttachChat = createEntityMutation<{ readonly chatId: ChatId; readonly scriptId: RegexScriptId }, void>({
  options: (trpc) => trpc.regex.attachToChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't attach that script to this chat.",
});
const useDetachChat = createEntityMutation<{ readonly chatId: ChatId; readonly scriptId: RegexScriptId }, { readonly detached: boolean }>({
  options: (trpc) => trpc.regex.detachFromChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't detach that script from this chat.",
});
