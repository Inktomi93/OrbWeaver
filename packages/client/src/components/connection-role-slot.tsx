// ONE connection ROLE SLOT (inference program §5.3a): a Select of the author's compatible connections writing
// `connection.setBinding` for an actor, beside what the role resolves to today from the persisted `listBindings`
// view. Model roles renders one per task for the user; a rule's editor renders one per task its arms spend.

import type { EmbedTargetRefusal } from "@orb/contracts/inference";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Check, Icon, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import type { Invalidation, Trpc } from "#data";
import type { RoleConnectionFacts, RoleRequirementVerdict, RoleRow } from "#lib";
import {
  backgroundRepairs,
  bindRefusal,
  cn,
  connectionHost,
  connectionSummary,
  EMBED_REFUSAL_SLOTS,
  embedderCheckingText,
  embedRefusalOf,
  embedRefusalText,
  REBUILD_JOBS_LABEL,
  REBUILD_STATUS_COPY,
  ROLE_STATUS_LABELS,
  roleReadout,
  roleRequirementVerdicts,
  roleStatus,
  VECTOR_ROLES,
} from "#lib";
import { openConfigTo } from "#state";
import { useSetBinding, useUpdateConnection } from "./connection-role-mutations.ts";
import { useEmbedRefusalToastAfterUnmount } from "./embedder-refusal-toast.ts";
import { useReindexConfirm } from "./reindex-confirm.tsx";
import { useEmbedderRebuild } from "./use-embedder-rebuild.ts";

const UNSET_VALUE = "";

// The pane is as wide as the settings body; a sentence capped at the prose measure never runs across it.
const PROSE_MEASURE = "max-w-(--reading-measure-prose)";

// Unbinding the text embedder queues nothing: the stored index stays, and search keeps answering from it.
const TEXT_EMBEDDER_UNSET = "None set — search keeps using your last index until you pick an embedder.";

type ConnectionListItem = inferOutput<Trpc["connection"]["list"]>[number];
type BindingView = inferOutput<Trpc["connection"]["listBindings"]>[number];
type BindingActorInput = NonNullable<inferInput<Trpc["connection"]["setBinding"]>["actor"]>;

// Both axes are DERIVED from their one home rather than re-spelled here (`no-inline-types`): the dot's
// states are the keys of its own label map, and the readout's arms are whatever `roleReadout` returns — so
// a fifth arm or a new state is a `tsc` error at these two maps instead of a silent fallthrough.
type RoleStatus = keyof typeof ROLE_STATUS_LABELS;
type RoleReadout = ReturnType<typeof roleReadout>;

/** Why a vector role that resolves is still not running: its target's rebuild failed, so search stays paused. */
const REBUILD_FAILED_CAUSE = "its search index failed to rebuild";

/** The readout repeats the dot's name, so when a failed rebuild takes the dot off running, the steady arm follows it. */
function readoutForDot(readout: RoleReadout, dotIsStatus: boolean): RoleReadout {
  return !dotIsStatus && readout.kind === "steady" ? { kind: "blocked", cause: REBUILD_FAILED_CAUSE } : readout;
}

/** The DOT's skin per state. `unset` is a RING — `ghost` is the only tone with no fill, and the border is
 *  restated on the muted ink because the default hairline (`--color-border`, 8% alpha) is invisible at 6px. */
const DOT_SKIN = {
  running: { intent: "success", tone: "solid", className: "" },
  blocked: { intent: "warning", tone: "solid", className: "" },
  unset: { intent: "neutral", tone: "ghost", className: "border-muted-foreground" },
} as const satisfies Record<RoleStatus, { readonly intent: "neutral" | "success" | "warning"; readonly tone: "ghost" | "solid"; readonly className: string }>;

/** The readout's per-arm ink. `className` and not `tone`, because `voice` is declared AFTER `tone` in
 *  `textVariants` and therefore wins the colour merge — only the call site's own className outranks it. */
const READOUT_INK = {
  steady: "",
  divergent: "text-info",
  unset: "italic",
  blocked: "text-warning",
} as const satisfies Record<RoleReadout["kind"], string>;

// THREE THINGS THIS SLOT CARRIES, AND WHY EACH IS A SEPARATE CHANNEL (§5.3a, the step-3b mocks' Board D):
//
//  1. THE STATUS DOT HAS ONE AXIS — *would a turn run*. Green running · amber set-but-not-running · a grey
//     RING for not set (a ring, not a red disc: an unset optional role is a choice, not a fault). A FAILED
//     REQUIREMENT IS DELIBERATELY NOT THE DOT — a bound model that cannot read images still RUNS, and two of
//     the Utility slot's three consumers work; colouring the dot for that would say the role is broken when
//     it is partly working, and could not say which part. Every state is decidable WITH THE DOT REMOVED,
//     because the readout beside it states the same thing in words — the dot is a scanning aid over six
//     rows, never the only signal.
//  2. THE `Needs:` RAIL renders `requirementMet`'s per-clause verdict. A cannot-serve verdict is MUTED with
//     a `✗` and its reason, never destructive colour: destructive is reserved for a BOUND role that has
//     actually failed, and a chat model that cannot embed is not broken.
//  3. THE INLINE BACKGROUND REFUSAL is stated twice and they are not duplicates. In the PICKER it is the
//     option's own disabled reason (`bindRefusal`), so a user scanning the list learns why a row is
//     unpickable without picking it. In the ROW it is the REPAIR — the same sentence plus the switch that
//     resolves it — because §5.3a makes the slot the FIRST enforcement point ("so the user learns at
//     authoring time") and a refusal with no adjacent remedy sends the user to the connection list to find a
//     switch nobody has told them the name of. Resolve's `canFund` still re-checks: the flag can flip after
//     the binding is written, so this is the friendly gate and never the only one.
//
// THE ROW ITSELF is `components/connection-role-slot.tsx`, shared with a rule's editor.
//
// THE PICKER HOLDS A DRAFT NOW, AND THE 2026-08-01 RULING SURVIVES WITH ITS INPUT CHANGED. That incident
// (two hours of a NULL `roleDefaults` under a "Saved" chip) ruled that the READOUT comes from the persisted
// read and never from what the picker is showing — and it still does: `{X}` is always the persisted
// connection. What is new is that the row can now SAY the two disagree, which is the whole of §5.3a's
// divergence arm. The condition is draft-vs-persisted and NEVER request-in-flight (`lib/connection-roles.ts`
// states why at the readout).

export interface ConnectionRoleSlotProps {
  readonly row: RoleRow;
  readonly connections: readonly ConnectionListItem[];
  readonly view: BindingView | null;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
  /** Whose binding this slot writes; absent ⇒ the signed-in user's own role. */
  readonly actor?: BindingActorInput | undefined;
  /** The Select's "nothing bound" option. A rule's slot names what it falls back to, not a bare "Not set". */
  readonly unsetLabel?: string | undefined;
  /** Replaces the row's own description where the role means something narrower (a rule's turns). */
  readonly description?: string | undefined;
  /** The picker's DOM id — a settings deep link to this role focuses the element carrying it. */
  readonly controlId?: string | undefined;
}

export function ConnectionRoleSlot({
  row,
  connections,
  view,
  trpc,
  invalidation,
  actor,
  unsetLabel,
  description,
  controlId,
}: ConnectionRoleSlotProps): ReactElement {
  const deps = { trpc, invalidation };
  const setBinding = useSetBinding(deps);
  const update = useUpdateConnection(deps);
  const pickerLabel = `${row.label} connection`;
  // The confirm opens from the picker's own popup, which is gone by the time it closes; focus returns to the picker.
  const slotRef = useRef<HTMLDivElement>(null);
  const reindex = useReindexConfirm(trpc, (): boolean => {
    slotRef.current?.querySelector<HTMLElement>(`[aria-label="${CSS.escape(pickerLabel)}"]`)?.focus();
    return false;
  });
  const isVectorRole = actor === undefined && VECTOR_ROLES.includes(row.task);
  const rebuild = useEmbedderRebuild(trpc, isVectorRole, row.task);
  // The last pick the server refused because the embedder does not make the width its connection states, or did not
  // answer, and the picked connection's name: the picker has rolled back to what is bound, so it no longer shows it.
  const [embedRefusal, setEmbedRefusal] = useState<SlotEmbedRefusal | null>(null);
  // The pick whose embedder the server is checking before the binding lands.
  const [checking, setChecking] = useState<{ readonly embedder: string | undefined } | null>(null);
  const toastRefusalIfGone = useEmbedRefusalToastAfterUnmount();
  // The PICKER's draft — `undefined` until the user touches it, which is the only state that can never
  // diverge. It is never the readout's `{X}`; it is only the other half of the comparison.
  const [draft, setDraft] = useState<string | null | undefined>(undefined);

  const compatible = connections.filter((connection) => connection.tasks.includes(row.task));
  // The closed Select shows the placeholder for the empty value, so the unset option and the placeholder are one word.
  const unsetText = unsetLabel ?? (row.optional ? "None" : "Not set");
  const items = [
    { label: unsetText, value: UNSET_VALUE },
    ...compatible.map((connection) => {
      const refusal = bindRefusal(connection, row.task);
      return { label: connectionSummary(connection), value: connection.id as string, ...(refusal === null ? {} : { disabled: true, description: refusal }) };
    }),
  ];

  const factsOf = (connectionId: string): RoleConnectionFacts | null => {
    const connection = connections.find((candidate) => candidate.id === connectionId);
    return connection === undefined ? null : { label: connectionSummary(connection), host: connectionHost(connection.baseUrl) };
  };
  const status = roleStatus(view);
  // A failed rebuild leaves search paused, so the dot does not say the role is running.
  const dot: RoleStatus = rebuild === "failed" && status === "running" ? "blocked" : status;
  const readout = readoutForDot(roleReadout({ view, draftConnectionId: draft, factsOf }), dot === status);
  const verdicts = roleRequirementVerdicts(row, view?.resolved?.capability ?? null);
  const repairs = backgroundRepairs({ row, connections, status });
  const persisted = view?.binding?.connectionId ?? UNSET_VALUE;
  const current = draft === undefined ? persisted : (draft ?? UNSET_VALUE);

  return (
    <Row aria-busy={checking !== null} gap="field" align="start" justify="between" className="flex-wrap" ref={slotRef}>
      <Row gap="field" align="start">
        <Badge
          aria-label={ROLE_STATUS_LABELS[dot]}
          className={DOT_SKIN[dot].className}
          intent={DOT_SKIN[dot].intent}
          role="img"
          size="dot"
          tone={DOT_SKIN[dot].tone}
        />
        <Stack gap="tight">
          <Text voice="label">{row.heading}</Text>
          <Text voice="gloss" className={PROSE_MEASURE}>
            {description ?? row.description}
          </Text>
          {verdicts.length === 0 ? null : <RequirementRail verdicts={verdicts} />}
          <ReadoutLine readout={readout} unsetSentence={isVectorRole && row.task === "embed" ? TEXT_EMBEDDER_UNSET : undefined} />
          {checking === null ? (
            <EmbedRefusalLine refused={embedRefusal} />
          ) : (
            <Text voice="gloss" role="status" data-embedder-check="" className={PROSE_MEASURE}>
              {embedderCheckingText(checking.embedder)}
            </Text>
          )}
          {isVectorRole ? <RebuildLine rebuild={rebuild} /> : null}
          {repairs.map((connection) => (
            <BackgroundRepair
              key={connection.id}
              connection={connection}
              pending={update.isPending}
              onAllow={(): void => update.mutate({ connectionId: connection.id, patch: { allowBackground: true } })}
            />
          ))}
        </Stack>
      </Row>
      <Select
        aria-label={pickerLabel}
        id={controlId}
        items={items}
        value={current}
        disabled={setBinding.isPending}
        onValueChange={(value): void => {
          const pickedRow = value === UNSET_VALUE ? null : compatible.find((connection) => connection.id === value);
          if (pickedRow === undefined) {
            return;
          }
          const picked = pickedRow?.id ?? null;
          const embedder = pickedRow?.label;
          const write = (checksEmbedder: boolean): void => {
            setDraft(picked);
            setEmbedRefusal(null);
            setChecking(checksEmbedder ? { embedder } : null);
            const bound = setBinding.mutateAsync({ task: row.task, connectionId: picked, ...(actor !== undefined ? { actor } : {}) });
            toastRefusalIfGone(bound, (refusal) => embedRefusalText(refusal, embedder));
            // @orb-waive caught-failure-ownership(bound): a refusal becomes the row's alert; any other failure keeps the
            // draft (the row says "not applied yet") and toasts through the mutation's errorToast. Ends if that toast goes.
            void bound.catch(rollBackOnEmbedRefusal(setDraft, (refusal) => setEmbedRefusal({ refusal, embedder }))).finally((): void => setChecking(null));
          };
          // Only the user's own vector roles define their index; a rule's or a plugin's binding never moves it.
          if (isVectorRole) {
            reindex.guard({ kind: "bind", task: row.task, connectionId: picked }, write);
          } else {
            write(false);
          }
        }}
        placeholder={unsetText}
      />
      {reindex.dialog}
    </Row>
  );
}

/** A failed pick's handler: the server undid a write onto an embedder whose width it could not accept or could not
 *  check, so the picker goes back to what is bound and the row says why. Any other failure keeps the draft, so the
 *  row says it is not applied yet. */
function rollBackOnEmbedRefusal(setDraft: (draft: undefined) => void, setEmbedRefusal: (refusal: EmbedTargetRefusal) => void): (error: unknown) => void {
  return (error) => {
    const refusal = embedRefusalOf(error);
    if (refusal !== null) {
      setDraft(undefined);
      setEmbedRefusal(refusal);
    }
  };
}

/** A refused pick, and the name of the connection that was picked. */
interface SlotEmbedRefusal {
  readonly refusal: EmbedTargetRefusal;
  readonly embedder: string | undefined;
}

function EmbedRefusalLine({ refused }: { readonly refused: SlotEmbedRefusal | null }): ReactElement | null {
  return refused === null ? null : (
    <Text voice="gloss" role="alert" data-refusal={EMBED_REFUSAL_SLOTS[refused.refusal.kind]} className={cn(READOUT_INK.blocked, PROSE_MEASURE)}>
      {embedRefusalText(refused.refusal, refused.embedder)}
    </Text>
  );
}

/** The vector row's rebuild line and its door to Jobs. The live region is mounted before it has anything to say, so
 *  the rebuild starting and failing are both announced. */
function RebuildLine({ rebuild }: { readonly rebuild: ReturnType<typeof useEmbedderRebuild> }): ReactElement {
  return (
    <Row role="status" gap="field" align="center" className="flex-wrap">
      {rebuild === null ? null : (
        <>
          <Text
            voice="gloss"
            as="span"
            data-rebuild={rebuild}
            className={cn(rebuild === "failed" ? READOUT_INK.blocked : READOUT_INK.divergent, PROSE_MEASURE)}
          >
            {REBUILD_STATUS_COPY[rebuild]}
          </Text>
          <Button intent="ghost" onClick={(): void => openConfigTo("workloads", "jobs")} size="sm" type="button">
            {REBUILD_JOBS_LABEL}
          </Button>
        </>
      )}
    </Row>
  );
}

/** The four sentences, one per arm — each spelled ONCE, so a fix lane restyling the steady arm cannot
 *  silently restyle the arm that is the opposite of steady. The running and blocked arms repeat the status
 *  dot's own accessible name, which is what makes the dot decidable without colour. No arm says "a turn":
 *  an embedder or a reranker runs for search and memory, never for a turn. */
function ReadoutLine({ readout, unsetSentence }: { readonly readout: RoleReadout; readonly unsetSentence?: string | undefined }): ReactElement {
  const className = cn(READOUT_INK[readout.kind], PROSE_MEASURE);
  if (readout.kind === "steady") {
    return (
      <Text voice="gloss" className={className}>
        {readout.connection === null
          ? `${ROLE_STATUS_LABELS.running} on the connection picked here.`
          : `${ROLE_STATUS_LABELS.running} on ${readout.connection}.`}
      </Text>
    );
  }
  if (readout.kind === "divergent") {
    return (
      <Text voice="gloss" className={className}>
        Not applied yet — still running on {readout.connection}.
      </Text>
    );
  }
  if (readout.kind === "unset") {
    return (
      <Text voice="gloss" className={className}>
        {unsetSentence ?? "Nothing — no connection is set."}
      </Text>
    );
  }
  return (
    <Text voice="gloss" className={className}>
      {ROLE_STATUS_LABELS.blocked} — {readout.cause}.
    </Text>
  );
}

/** The `Needs:` rail — one chip per CLAUSE. An unjudged clause (nothing resolves, so there is no capability
 *  to judge against) still STATES the requirement: a requirement the user cannot see is the exact failure
 *  the rail exists to prevent, so it is never dropped for want of a verdict. */
function RequirementRail({ verdicts }: { readonly verdicts: readonly RoleRequirementVerdict[] }): ReactElement {
  return (
    <Row gap="field" align="center" className="flex-wrap">
      <Text voice="gloss" as="span">
        Needs:
      </Text>
      {verdicts.map((verdict) => (
        <Badge key={verdict.label} intent={verdict.met === true ? "success" : "neutral"} size="sm" tone="ghost">
          {verdict.met === null ? null : <Icon icon={verdict.met ? Check : X} size="xs" />}
          {verdict.met === false ? `${verdict.label} — ${verdict.unmet}` : verdict.label}
        </Badge>
      ))}
    </Row>
  );
}

/** §5.3a's inline repair: the refusal sentence `bindRefusal` already returns, plus the switch that resolves
 *  it. The switch writes the SAME `allowBackground` field the connection row's switch writes and names it
 *  the same way, so a user who meets the refusal on either surface meets one switch, not two. */
function BackgroundRepair({
  connection,
  pending,
  onAllow,
}: {
  readonly connection: ConnectionListItem;
  readonly pending: boolean;
  readonly onAllow: () => void;
}): ReactElement {
  const label = `Allow background work on ${connectionSummary(connection)}`;
  return (
    <Stack gap="tight">
      <Text voice="gloss">{connectionSummary(connection)} doesn&apos;t allow background work — turn it on to use it here.</Text>
      <Row gap="field" align="center">
        <Switch aria-label={label} checked={false} disabled={pending} onCheckedChange={(): void => onAllow()} />
        <Text voice="gloss" as="span">
          {label}
        </Text>
      </Row>
    </Stack>
  );
}
