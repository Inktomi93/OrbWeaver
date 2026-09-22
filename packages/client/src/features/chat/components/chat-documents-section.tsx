// The per-chat DOCUMENTS rack — "what feeds this room", and the D85 host visibility toggle
// (databank-surface-spec §3.2/§6.3; the workboard item this lane exists to close).
//
// ONE COMPONENT, TWO DATA SHAPES, NO SEPARATE MEMBER MODE (`no-separate-reduced-modes`).
// `databank.listActiveForChat` is member-readable by design — the active documents are ROOM-PUBLIC prompt
// context every member's turns assemble against — and the VERB does the branching: a HOST receives the
// whole union with per-document `hidden` flags, a MEMBER receives only the visible subset and never learns
// a host-hidden document's NAME. So a member renders the identical section with the identical rows; the
// host's rows additionally carry the visibility control, the hidden skin and the detach. Nothing here
// counts what a member can't see (that would leak the count) and nothing renders a disabled control.
//
// THE SOURCE CHIP IS THE CORRECTION OVER LEGACY (§6.3). Legacy rendered a globally-attached document as
// `<Switch checked readOnly>` — a control that looks operable, is not, and whose real write lives in
// another section of the app. But a member's Everywhere document CANNOT be detached by the host, only
// hidden; a switch lies about that and a chip states it. `sources` (the D-2 server delta this lane landed)
// is what makes the chip possible, and it is the same datum that decides whether the row offers a detach.
//
// THE VISIBILITY TOGGLE IS A RETRIEVAL SWITCH, NOT A DELETE (D85). Hiding leaves every junction row
// intact — every label here says "feed"/"stop feeding", never "remove".
//
// THE SLOTLESS-PRESET WARNING (issue #80). Everything this rack says about feeding is conditional on one
// fact it cannot see from its own read: the running preset must place `{{databank}}` somewhere, or the
// retrieved passages are gathered, budgeted — and then dropped, with no error anywhere. The shipped default
// arrangement now carries the slot, but an imported ST preset never will, and an unreferenced slot is a
// legal no-op by design (databank-design/07 §3), so nothing else in the system can complain. The rack is
// where the user is standing when the promise is made, so the rack is where it gets qualified.

import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { ChatId, DocumentId } from "@orb/kit/ids";
import { formatBytes } from "@orb/kit/strings";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Eye, EyeOff, Icon, Unlink } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { MenuItem } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { Fragment, useRef, useState } from "react";
import { RowActionsMenu, RowToggleAction } from "#components";
import type { Trpc } from "#data";
import { useGatedQuery, useInvalidation, useTRPC } from "#data";
import { rowActionsName } from "#lib";
import { useDetachDocumentFromChat, useSetChatDocumentVisibility } from "../hooks/use-chat-document-mutations.ts";
import { isDetachableFromChat, nextHiddenSet, placesDatabankSlot, sourceChips } from "../lib/chat-documents-model.ts";
import { AddChatDocumentDialog } from "./add-chat-document-dialog.tsx";

/** The four states of "does the running arrangement place the slot" — `resolving` is its own value, not a
 *  collapsed `false`, so the warning never flashes on a preset that turns out to carry the slot, and so a CT
 *  can barrier on a SETTLED answer instead of racing the two reads. `unknown` is the SETTLED failure (#1520
 *  item 3) — also its own value, for the same reason one step further out: a read that failed has an answer,
 *  and the answer is "we could not find out". Rendered as a `data-` attribute. */
const SLOT_STATES = ["resolving", "placed", "missing", "unknown"] as const;
type SlotState = (typeof SLOT_STATES)[number];

/** Does this read failure mean the preset ISN'T THERE (or isn't ours)? tRPC surfaces the domain code on
 *  `error.data.code` — the `databank-context-body` / `rpg-error-state` discrimination precedent. Any other
 *  failure is transient and says nothing about which arrangement will run. */
function isUnresolvablePreset(error: unknown): boolean {
  const code = (error as { data?: { code?: string } } | null | undefined)?.data?.code;
  return code === "NOT_FOUND" || code === "FORBIDDEN";
}

/**
 * Does the HOST's running preset write `{{databank}}`?
 *
 * The chat has no preset of its own: a turn assembles against the room host's active preset
 * (`UserSettings.seeds.defaultPresetId`, `null` ⇒ the built-in `DEFAULT_PROMPT_CONFIG` — one home with the
 * server's `resolvePromptConfigFor`, entry/compose/chat.ts). A stale or unowned id degrades to the built-in
 * SERVER-side, so an UNRESOLVABLE id resolves the same way here rather than warning about a preset that will
 * never run. Both reads are cache-first and already warm on any real session.
 *
 * THAT RULING SURVIVES; ITS INPUT CHANGED (#1520 item 3). It was written for the case it names — a stale or
 * unowned id — and applied to `preset.isError` WHOLESALE, which also catches a 500 and a dropped socket. So a
 * transient failure read exactly like "you have no custom preset", the built-in (which DOES place the slot)
 * stood in for a preset nobody had read, and the "Not reaching the prompt" warning was silently withheld from
 * a host whose real arrangement may well be slotless. The degrade now applies to the errors that EARN it —
 * `NOT_FOUND` / `FORBIDDEN`, which are the server's own degrade conditions — and everything else settles as
 * `unknown`, which withholds the warning WITHOUT claiming its opposite and says so on the surface.
 */
function useSlotState(): { readonly slot: SlotState; readonly recheck: () => void } {
  const trpc = useTRPC();
  const settings = useQuery(trpc.settings.getUserSettings.queryOptions());
  const activePresetId = settings.data?.config.seeds.defaultPresetId ?? null;
  const preset = useGatedQuery(settings.data === undefined ? null : activePresetId, (id) => trpc.preset.get.queryOptions({ id }));
  const recheck = (): void => {
    if (activePresetId === null) {
      settings.refetch().catch(() => undefined);
      return;
    }
    // @orb-waive caught-failure-ownership(Promise.all): each TanStack Query observer owns its rejection in `settings.isError`/`preset.isError`; this event only starts the paired retry. Ends if either refetch stops updating query error state.
    Promise.all([settings.refetch(), preset.refetch()]).catch(() => undefined);
  };

  if (settings.isError) {
    return { slot: "unknown", recheck };
  }
  if (settings.data === undefined) {
    return { slot: "resolving", recheck };
  }
  if (activePresetId !== null && preset.isError) {
    return { slot: isUnresolvablePreset(preset.error) ? slotOf(DEFAULT_PROMPT_CONFIG) : "unknown", recheck };
  }
  const config: PromptConfig | undefined = activePresetId === null ? DEFAULT_PROMPT_CONFIG : preset.data?.config;
  if (config === undefined) {
    return { slot: "resolving", recheck };
  }
  return { slot: slotOf(config), recheck };
}

function slotOf(config: PromptConfig): SlotState {
  return placesDatabankSlot(config) ? "placed" : "missing";
}

/** One row of the rack — DERIVED from the read's wire type, never re-spelled (§5.4). */
type ActiveDocument = inferOutput<Trpc["databank"]["listActiveForChat"]>[number];

export interface ChatDocumentsSectionProps {
  readonly chatId: ChatId;
  readonly isHost: boolean;
}

/** The "Documents" section body — the chat's active document union, one row each. */
export function ChatDocumentsSection({ chatId, isHost }: ChatDocumentsSectionProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setVisibility = useSetChatDocumentVisibility({ trpc, invalidation });
  const detach = useDetachDocumentFromChat({ trpc, invalidation });
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data: rows } = useSuspenseQuery(trpc.databank.listActiveForChat.queryOptions({ chatId }));
  // THE SET THIS SURFACE HAS ALREADY ASKED FOR, held until every write it queued has settled (#1520 item 2).
  //
  // THE FILED MECHANISM IS PARTLY REFUTED, AND THE SYMPTOM SURVIVES IT. The issue read this as two toggles
  // deriving from one stale query snapshot; they do not, because `useSetChatDocumentVisibility` is OPTIMISTIC
  // (`use-chat-document-mutations.ts:65-68` re-derives every row's `hidden` from the written set), so a
  // second toggle a beat later composes from an already-patched cache. What is NOT covered is the two
  // narrower windows that produce the same reported outcome, both of which this closes:
  //   · SAME-TICK — `onMutate` runs inside the mutation's own async execution, not synchronously in the
  //     click handler, so two toggles in ONE task both read the unpatched rows and the second's set omits
  //     the first's document. The ref is the intent the cache has not caught up to yet, and it is a REF and
  //     not state precisely because the repaint is not its job: the optimistic patch owns that, and a second
  //     rendered overlay here would be two homes for one concept.
  //   · ORDERING — two concurrent writes are two independent HTTP requests with a SET payload each, so the
  //     server can apply them in either order and keep the older one. Chaining makes the wire order the
  //     click order.
  const pendingHiddenRef = useRef<readonly DocumentId[] | null>(null);
  const visibilityChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const queuedWritesRef = useRef(0);
  // HOST-ONLY, and that is not a permission dodge: the turn assembles against the HOST's preset (D19), so a
  // member's own arrangement says nothing true about this room — and the host is the only person who can act
  // on it. A member with no documents attached has nothing to be warned about either way.
  const { slot: slotState, recheck: recheckSlot } = useSlotState();
  const warnSlotless = isHost && rows.length > 0 && slotState === "missing";
  // The failure's own arm — stated only where the WARNING would have been stated, so it reaches exactly the
  // reader whose section had something to say and could not find out.
  const slotUnknown = isHost && rows.length > 0 && slotState === "unknown";

  const setHidden = (id: DocumentId, hide: boolean): void => {
    // The write REPLACES the whole excluded set, so it is derived from every rendered row, not patched —
    // over the pending intent when this surface has an unsettled one, else over the rows as read.
    const pending = pendingHiddenRef.current;
    const base = pending === null ? rows : rows.map((row) => ({ ...row, hidden: pending.includes(row.id) }));
    const next = nextHiddenSet(base, id, hide);
    pendingHiddenRef.current = next;
    queuedWritesRef.current += 1;
    // @orb-waive caught-failure-ownership(visibilityChainRef.current): the chain's own catch, never the mutation's — `useSetChatDocumentVisibility` still runs its errorToast and its optimistic `onError` rollback untouched. It exists so ONE rejected write cannot wedge the queue for every later toggle. Ends if that mutation stops wiring an errorToast.
    visibilityChainRef.current = visibilityChainRef.current
      .then(async () => setVisibility.mutateAsync({ chatId, visibility: { hidden: next } }))
      .catch(() => undefined)
      .finally(() => {
        queuedWritesRef.current -= 1;
        if (queuedWritesRef.current === 0) {
          // Drained: hand the arithmetic back to the cache, which by now carries the settled truth (the
          // optimistic patch on success, the rollback on failure).
          pendingHiddenRef.current = null;
        }
      });
  };

  return (
    <Stack data-databank-slot={slotState} gap="block">
      <Text voice="gloss">
        {isHost
          ? "Indexed passages from these documents can be pulled into this chat's prompts. Hiding one stops it feeding this room — it stays attached everywhere else."
          : "Indexed passages from these documents can be pulled into this chat's prompts — anyone in the room can contribute their own."}
      </Text>

      {warnSlotless ? (
        // A WARNING, not an error: nothing has failed and nothing is lost — the documents are attached and
        // indexed, they simply have nowhere to land in the prompt this preset builds. Stated as the chip word
        // (the fact, scannable) plus one sentence naming the fix, in the section's own voice.
        <Row align="center" gap="field">
          <Badge intent="warning" size="sm" tone="soft">
            Not reaching the prompt
          </Badge>
          <Text voice="gloss">Your preset never places {"{{databank}}"}, so these can't feed a turn. Add the Databank section to it and they will.</Text>
        </Row>
      ) : null}

      {slotUnknown ? (
        <Row align="center" gap="field">
          <Text voice="gloss">Couldn't check whether your preset places {"{{databank}}"}, so this section can't say if these reach a turn.</Text>
          <Button intent="ghost" onClick={recheckSlot} size="sm" type="button">
            Check again
          </Button>
        </Row>
      ) : null}

      {rows.length === 0 ? (
        // Never render nothing: "nothing feeds this room" is the normal starting state, and a blank block
        // reads as a failed load (empty states are load-bearing).
        <Text voice="gloss">
          {isHost
            ? "No documents feed this chat yet."
            : "No documents feed this chat yet — switch one of your own on for every chat in Databank and it joins the rooms you are in."}
        </Text>
      ) : (
        // THE RACK OWNS ITS SCROLL. The union is membership-derived: every present member's Everywhere
        // documents plus the roster characters' plus the room's own, so it can outgrow the pane while its
        // siblings (Field overrides, Macro picks, the host band) cannot. Without a cap of its own a
        // twenty-document room pushed every later section below the fold of the tab's scroller.
        // `overscroll-contain` keeps a flick inside the rack from chaining into the tab behind it.
        <Stack className="relative max-h-96 overflow-y-auto overscroll-contain" gap="tight">
          {rows.map((row) => (
            <ActiveDocumentRow
              document={row}
              isHost={isHost}
              key={row.id}
              onDetach={(): void => detach.mutate({ chatId, documentId: row.id })}
              onSetHidden={(hide): void => setHidden(row.id, hide)}
            />
          ))}
        </Stack>
      )}

      {isHost ? (
        <>
          <Button intent="secondary" onClick={(): void => setPickerOpen(true)} size="sm" type="button">
            Add from your bank
          </Button>
          <AddChatDocumentDialog activeIds={rows.map((row) => row.id)} chatId={chatId} onOpenChange={setPickerOpen} open={pickerOpen} />
        </>
      ) : null}
    </Stack>
  );
}

interface ActiveDocumentRowProps {
  readonly document: ActiveDocument;
  readonly isHost: boolean;
  readonly onSetHidden: (hide: boolean) => void;
  readonly onDetach: () => void;
}

/** One active document. Leading is EMPTY (§6.1's ruling — a variable-width leading chip costs ~58px of
 *  title at the 320px pane floor); the provenance chips ride the HEAD OF THE SUBTITLE line, where the slack
 *  is, and the size is the row's scent. Chunk counts are library detail — the rack answers "what feeds this
 *  room", so it drops them. */
function ActiveDocumentRow({ document, isHost, onSetHidden, onDetach }: ActiveDocumentRowProps): ReactElement {
  const chips = sourceChips(document.sources);
  const detachable = isDetachableFromChat(document.sources);
  // `hidden` is only ever true in a HOST's payload (the verb filters a member's), so the muted skin and the
  // spoken "Hidden" chip are host-only by construction rather than by a second permission test.
  const visible = !document.hidden;

  return (
    <ListRow
      // A MEMBER's row renders NO trailing cluster at all — not a disabled one (permission-OMIT; a control
      // a member cannot operate is exactly the affordance lie this rack exists to correct).
      {...(isHost
        ? {
            actions: (
              <>
                <RowToggleAction
                  // Eye ↔ EyeOff is a SHAPE delta, so the state is legible in greyscale (WCAG 1.4.1)
                  // without a pressed tint. `rest="always"`: retrieval state is exactly what the eye
                  // scans this rack for, so it must not be hover-revealed.
                  icon={visible ? Eye : EyeOff}
                  labelOff={`Let ${document.name} feed this chat again`}
                  labelOn={`Stop ${document.name} feeding this chat`}
                  onToggle={(): void => onSetHidden(visible)}
                  pressed={visible}
                  rest="always"
                />
                {detachable ? (
                  <RowActionsMenu label={rowActionsName(document.name)}>
                    <MenuItem onClick={onDetach}>
                      <Icon icon={Unlink} size="sm" />
                      Detach from this chat
                    </MenuItem>
                  </RowActionsMenu>
                ) : (
                  // A RESERVED, aria-hidden slot where the kebab would be (the `LibraryRow.clusterSpacers`
                  // rule, applied to a raw ListRow): only SOME rows are detachable, so without it the eye —
                  // the column a host scans this rack down — lands at two different x's row to row. Empty
                  // and aria-hidden: this is layout, never a disabled affordance.
                  <Row aria-hidden={true} className="size-control-md shrink-0" />
                )}
              </>
            ),
          }
        : {})}
      className={visible ? "" : "opacity-60"}
      subtitle={formatBytes(document.byteSize)}
      // EVERY chip is followed by a literal space text node. Visual spacing is `mr-field`, but the
      // accessible-DESCRIPTION computation concatenates adjacent inline nodes with no separator (the same
      // trap `ListRow` documents for its own subtitleLead↔subtitle seam) — without these, a screen reader
      // heard "EverywhereThis chat 24.5 KB". Measured in the browser, not theorized.
      subtitleLead={
        <>
          {/* Said in WORDS, not only by the dimmed skin + the eye glyph: a host scanning the rack for what
              is switched off should not have to read an icon's pressed state to find it. */}
          {visible ? null : (
            <>
              <Badge className="mr-field" intent="warning" size="inline" tone="soft">
                Hidden
              </Badge>{" "}
            </>
          )}
          {chips.map((chip) => (
            <Fragment key={chip}>
              <Badge className="mr-field" intent="neutral" size="inline" tone="soft">
                {chip}
              </Badge>{" "}
            </Fragment>
          ))}
        </>
      }
      title={document.name}
    />
  );
}
