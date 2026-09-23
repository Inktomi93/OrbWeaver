// The manual-injections manager: ad-hoc positional context a user adds to a chat. Not
// createCollectionSurface — a chat holds a handful of these, so it's a plain mapped list of per-row
// autosave forms. The presentational `InjectionsList` takes rows + CRUD callbacks, owning neither read nor
// write — it was source-agnostic AND EXPORTED because a draft wired it to `draftConfig.injections` instead
// of the verbs. Draft mode is gone (chat-creation-draft-mode-replacement.md §4.9, R1), so there is one
// source (chat.listChatInjections + the verbs) and the split is module-private again: a second wiring is a
// deliberate re-export, not a leftover door. No enabled/disabled toggle — "off" = delete the row,
// and an EMPTY-content row is inert (assembly skips it at every position), which the row says out loud.
//
// COLLAPSE-UNTIL-NEEDED (#821, side-eye 2026-08-30 §5-P1/§7).
// Every row used to render six stacked full-width fields, always open — measured 362px and 385px at the
// production 367px context width, so ONE injection was taller than the eleven sections above and below it
// could show, and the section's one-line `SkeletonRows` fallback stood in for 920px of forms. At 4× CPU on
// a 430px phone that settle landed 795ms after the tap, past the browser's 500ms `hadRecentInput` cliff,
// and the host paid 0.30837 CLS in a single shift. The row now wears the SAME clothes as the Field-overrides
// section directly above it — a collapse row (`Collapsible` in a `!p-0` Card) whose trigger carries the
// summary (where it lands, in whose voice, at what depth) plus the not-delivered chip, with a one-line
// content excerpt under it while closed. Two adjacent sections expressing one idea in two opposite
// presentation laws was the §7 taste finding; this retires both with one change.
//
// AN EMPTY-CONTENT ROW OPENS ITSELF. `Add injection` seeds a blank row (`NEW_INJECTION`), and a blank row is
// also the inert "not delivered" state — both want the editor in front of the host rather than a collapsed
// summary of nothing. So `open` seeds from the row's content, and a host who just pressed Add lands in the
// field they came for.
//
// REMOVE LIVES IN THE PANEL, exactly where the Field-overrides row puts Clear. Collapsed rows are a list a
// host scans; a destructive, irreversible affordance one click from the surface of a scan-list is the
// pattern side-eye #621 already demoted on the rule row. Expanding is the confirmation.

import type { ChatInjection } from "@orb/contracts/chat";
import { CHAT_INJECTION_POSITIONS } from "@orb/contracts/chat";
import type { ChatId, ChatInjectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Row, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { createAutosaveEntityForm } from "#forms/editor";
import { MESSAGE_ROLE_ITEMS, MESSAGE_ROLE_LABELS } from "#lib";
import { useDeleteChatInjection, useSetChatInjection } from "../hooks/use-context-panel-mutations.ts";
import type { InjectionFormValues } from "../lib/injection-row-model.ts";
import { DEFAULT_INJECTION_FORM, fromInjectionForm, toInjectionForm } from "../lib/injection-row-model.ts";
import { NEW_INJECTION } from "../lib/injection-seed.ts";

// The per-injection-row session-boundary autosave form (D78 L3). Built at MODULE scope (stable component
// identity, §13.1); the persist fn arrives per-instance (closes over the live tRPC client + the row's
// id/chatId). The boundary owns the entity key (the row's stable key), so a row surviving a list reshuffle
// carries no stale FormApi — but the list `.map` key on `<InjectionRow>` already IS that identity (safe-by-
// key by construction, autosave-form-doctrine.md §8; harmless double-key).

const InjectionRowBoundary = createAutosaveEntityForm<InjectionFormValues>({
  defaultValues: DEFAULT_INJECTION_FORM,
});

type InjectionFields = Pick<ChatInjection, "position" | "role" | "depth" | "content">;

function positionLabel(position: ChatInjection["position"]): string {
  switch (position) {
    case "before_prompt":
      return "Before system prompt";
    case "in_static":
      return "In system (static)";
    case "in_prompt":
      return "In system (dynamic)";
    case "in_chat":
      return "In chat history (at depth)";
  }
}
const POSITION_ITEMS: SelectItems<string> = CHAT_INJECTION_POSITIONS.map((value) => ({
  value,
  label: positionLabel(value),
}));

/** The collapsed row's summary — WHERE the injection lands and in WHOSE voice, which (with the excerpt
 *  below it) is the whole of what a row is. `in_chat` adds the depth because two at-depth injections differ
 *  by nothing else. Reads the LIVE form values, not the server row, so collapsing after an edit shows the
 *  edit. */
function rowSummary(values: InjectionFormValues): string {
  // Through the form↔wire mapper the row already owns, so the summary reads the SAME narrowed union the
  // save seam does rather than re-casting the form's string projection a second time.
  const fields = fromInjectionForm(values);
  const where = positionLabel(fields.position);
  const role = MESSAGE_ROLE_LABELS[fields.role];
  return fields.position === "in_chat" ? `${where} · ${role} · depth ${fields.depth}` : `${where} · ${role}`;
}

/** The gloss that opens the section — one line, in the voice of who may edit. Shared with the skeleton
 *  below, which paints it FOR REAL: it depends on no read, so reserving a placeholder bar for text we
 *  already have would be the shift the reserve exists to prevent. */
function injectionsIntro(isHost: boolean): string {
  return isHost ? "Ad-hoc context spliced into this chat's prompt. Changes save automatically." : "Ad-hoc context the host has added to this chat's prompt.";
}

interface InjectionListRow {
  readonly key: string;
  readonly value: InjectionFields;
}

interface InjectionsListProps {
  readonly rows: readonly InjectionListRow[];
  readonly isHost: boolean;
  readonly onAdd: () => void;
  readonly onSave: (key: string, values: InjectionFormValues) => Promise<unknown>;
  readonly onDelete: (key: string) => void;
}

function InjectionsList({ rows, isHost, onAdd, onSave, onDelete }: InjectionsListProps): ReactElement {
  return (
    <Stack gap="section">
      <Text voice="gloss">{injectionsIntro(isHost)}</Text>

      {rows.length === 0 ? (
        // The muted empty-state grammar every other zero-row surface uses — at full body weight this one
        // sentence carried more visual weight than the rows it stands in for (side-eye 2026-08-06 P3).
        <Text voice="gloss">No injections yet.</Text>
      ) : (
        <Stack gap="section">
          {rows.map((row, index) => (
            <InjectionRow key={row.key} ordinal={index + 1} row={row} isHost={isHost} onSave={onSave} onDelete={onDelete} />
          ))}
        </Stack>
      )}

      {isHost ? (
        <Button intent="secondary" size="sm" onClick={onAdd}>
          Add injection
        </Button>
      ) : null}
    </Stack>
  );
}

interface InjectionRowProps {
  readonly row: InjectionListRow;
  /** The row's 1-based place in the list — the collapsed row's NAME. A list of injections has nothing else
   *  stable to be called: N disclosures all announced as a bare "Injection" is the exact defect side-eye
   *  #621 filed against the rule rows' fire-log triggers. */
  readonly ordinal: number;
  readonly isHost: boolean;
  readonly onSave: (key: string, values: InjectionFormValues) => Promise<unknown>;
  readonly onDelete: (key: string) => void;
}

function InjectionRow({ row, ordinal, isHost, onSave, onDelete }: InjectionRowProps): ReactElement {
  const save = isHost ? (values: InjectionFormValues): Promise<unknown> => onSave(row.key, values) : undefined;
  // Seeded from the SERVER row, not subscribed to the live value: a host who types into a blank row must
  // not have it fold shut under them, and a host who clears one must not have it fold shut either.
  const [open, setOpen] = useState(row.value.content.trim() === "");

  return (
    // The seam is DECLARED, never omitted (client-forms-01): a host row persists, a member row says
    // `readOnly` — which is what makes the boundary itself refuse to autosave, instead of relying on
    // every field below remembering `disabled={!isHost}`.
    <InjectionRowBoundary entityId={row.key} serverValues={toInjectionForm(row.value)} {...(save === undefined ? ({ readOnly: true } as const) : { save })}>
      {({ form }): ReactElement => (
        // `!p-0` so the block padding lives on the trigger instead and the whole row is one tap target —
        // the Field-overrides card's own reasoning, and the `!` is load-bearing there for the same reason
        // (the tier padding map is UNLAYERED, so a plain `p-0` utility loses to it inside a Surface).
        <Card className="!p-0">
          <Collapsible open={open} onOpenChange={setOpen}>
            {/* ONE subscription for the whole collapsed face: the summary and the excerpt both read the
                LIVE values, so collapsing after an edit shows the edit rather than the loaded row. */}
            <form.Subscribe selector={(state): InjectionFormValues => state.values}>
              {(values): ReactElement => (
                <>
                  {/* `size="control"` pins the pointer-conditional `--spacing-control-sm` floor (44px
                      coarse / 32px fine) — the disclosure IS the row, and it is the only door to the
                      editor. The accessible name COMPUTES from the trigger's own content ("Injection 1 …"),
                      so it can never disagree with the visible label (WCAG 2.5.3). */}
                  <CollapsibleTrigger className="w-full p-block" size="control">
                    <Row gap="field" align="center" justify="between" className="min-w-0 flex-1">
                      <Text voice="label">{`Injection ${ordinal}`}</Text>
                      {/* An empty-content row is INERT: assembly skips it at every position, so it reaches
                          no prompt. With no enabled/disabled toggle ("off" = delete the row), a blank row is
                          also the normal just-added state — so it is neither refused nor deleted, it just
                          says so. Silence here reads as "my injection is on", which is the lie: the owner
                          ran a live chat with an enabled-but-empty row believing it was delivering. It
                          takes the summary's slot rather than sitting beside it — an empty row opens
                          itself, so its position/role are already spelled by the fields below. */}
                      {values.content.trim() === "" ? (
                        <Badge intent="warning" tone="soft" size="sm">
                          Not delivered — no content
                        </Badge>
                      ) : (
                        <Text voice="gloss" className="min-w-0 truncate">
                          {rowSummary(values)}
                        </Text>
                      )}
                    </Row>
                  </CollapsibleTrigger>
                  {open || values.content.trim() === "" ? null : (
                    // THE PADDING LIVES ON THE WRAPPER, NOT ON THE CLAMPED RUN (#847). `line-clamp-1` clamps
                    // the CONTENT box to one line, but `overflow: hidden` clips at the PADDING box — so a
                    // `pb-block` on the clamped element is ~12px of visible area BELOW the clamp point, and
                    // the clamped-away second line paints into it: an ellipsis on line 1 with a horizontally
                    // sliced line 2 under it. With the padding one level out, the clamped box ends exactly
                    // where its last line does. (Measured pre-fix: clientHeight 25 = one 13.125px line +
                    // pb-block; the report's "display: flow-root defeats the clamp" reading was wrong —
                    // `flow-root` is just Chrome's computed serialization of a blockified `-webkit-box`.)
                    <Stack className="px-block pb-block">
                      <Text voice="gloss" className="line-clamp-1">
                        {values.content}
                      </Text>
                    </Stack>
                  )}
                </>
              )}
            </form.Subscribe>
            <CollapsiblePanel>
              <Stack gap="field" className="px-block pb-block">
                <form.AppField name="position">
                  {(field): ReactElement => <field.SelectField label="Position" items={POSITION_ITEMS} disabled={!isHost} />}
                </form.AppField>

                <form.AppField name="role">
                  {(field): ReactElement => <field.SelectField label="Role" items={MESSAGE_ROLE_ITEMS} disabled={!isHost} />}
                </form.AppField>

                <form.Subscribe selector={(state): string => state.values.position}>
                  {(position): ReactElement | null =>
                    position === "in_chat" ? (
                      <form.AppField name="depth">
                        {(field): ReactElement => (
                          <field.NumberField
                            label="Depth"
                            description="0 = at the tail (just before the new turn); higher = further back."
                            min={0}
                            max={100}
                            disabled={!isHost}
                          />
                        )}
                      </form.AppField>
                    ) : null
                  }
                </form.Subscribe>

                <form.AppField name="content">{(field): ReactElement => <field.TextareaField label="Content" disabled={!isHost} rows={2} />}</form.AppField>

                {/* Remove sits where the Field-overrides row puts Clear — inside the panel, so an
                    irreversible action is never one click off a collapsed scan-list. */}
                {isHost ? (
                  <Row align="center" gap="field">
                    <Button intent="ghost" size="sm" aria-label="Remove injection" onClick={(): void => onDelete(row.key)}>
                      Remove
                    </Button>
                  </Row>
                ) : null}
              </Stack>
            </CollapsiblePanel>
          </Collapsible>
        </Card>
      )}
    </InjectionRowBoundary>
  );
}

export interface InjectionsSkeletonProps {
  /** How many collapsed rows to reserve. `0` reserves the empty state's one line instead — a card would
   *  over-reserve a section that is about to say "No injections yet." */
  readonly count: number;
  /** Which intro line the section will settle to (host vs member copy wrap differently at 367px). */
  readonly isHost: boolean;
}

/**
 * THE INJECTIONS SECTION'S RESERVED BOX (#821) — the section's `QueryBoundary` fallback, exported from the
 * module that owns the row so the two change together (the `skeleton-row-metrics.ts` discipline, one file
 * further: this does not INVERT an arithmetic pitch, it mirrors the settled anatomy element for element).
 *
 * The shared `SkeletonRows count={1} shape="line"` cannot express this box, which is why it lied by ~830px:
 * a `line` row is a `control-lg` bar, and the settled section is an intro line, N collapse CARDS (a
 * `control-sm` trigger row plus a one-line excerpt inside a `!p-0` card) and an `Add injection` button.
 * Every one of those is spelled below with the SAME primitives and the SAME gaps, so the reserve tracks the
 * row's own geometry — including the pointer-conditional control height — instead of a number that was
 * right on one viewport.
 *
 * The intro is painted FOR REAL rather than as a bar: it depends on no read, so a placeholder standing in
 * for text we already have would be one more thing to shift on arrival.
 */
export function InjectionsSkeleton({ count, isHost }: InjectionsSkeletonProps): ReactElement {
  const rows = Array.from({ length: count }, (_row, index) => index);
  return (
    <Stack aria-busy={true} gap="section">
      <Text voice="gloss">{injectionsIntro(isHost)}</Text>
      {count === 0 ? (
        <Skeleton className="h-4 w-1/3" />
      ) : (
        <Stack gap="section">
          {rows.map((index) => (
            <Card className="!p-0" key={index}>
              {/* The trigger row: `min-h-control-sm` + `p-block` is byte-for-byte the collapsed trigger's
                  box, so this bar is the height it stands in for at BOTH pointer classes. */}
              <Row align="center" className="min-h-control-sm p-block" gap="field" justify="between">
                <Skeleton className="h-4 basis-1/3" />
                <Skeleton className="h-4 min-w-0 flex-1" />
              </Row>
              {/* The one-line content excerpt. */}
              <Row className="px-block pb-block">
                <Skeleton className="h-4 flex-1" />
              </Row>
            </Card>
          ))}
        </Stack>
      )}
      {isHost ? <Skeleton className="h-control-sm w-1/3" /> : null}
    </Stack>
  );
}

export interface InjectionsManagerProps {
  readonly chatId: ChatId;
  readonly isHost: boolean;
}

export function InjectionsManager({ chatId, isHost }: InjectionsManagerProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const addInjection = useSetChatInjection({ trpc, invalidation });
  const setInjection = useSetChatInjection({ trpc, invalidation });
  const deleteInjection = useDeleteChatInjection({ trpc, invalidation });
  const { data: injections } = useSuspenseQuery(trpc.chat.listChatInjections.queryOptions({ chatId }));
  const rows: InjectionListRow[] = injections.map((injection) => ({
    key: injection.id,
    value: injection,
  }));

  return (
    <InjectionsList
      rows={rows}
      isHost={isHost}
      onAdd={(): void => {
        addInjection.mutate({ chatId, ...NEW_INJECTION });
      }}
      onSave={(key, values): Promise<unknown> =>
        setInjection.mutateAsync({
          chatId,
          id: castId<ChatInjectionId>(key),
          ...fromInjectionForm(values),
        })
      }
      onDelete={(key): void => {
        deleteInjection.mutate({ chatId, injectionId: castId<ChatInjectionId>(key) });
      }}
    />
  );
}
