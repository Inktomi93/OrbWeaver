// The MODEL ROLES section (Settings → Connections) — one compact row per routable task ("binding" is a schema
// word and never reaches copy, §5.3a): a Select of the user's compatible connections → `connection.setBinding`,
// beside what a turn resolves TODAY against the PERSISTED read (`listBindings` carries the resolved view +
// the unavailable cause). Owns its own `QueryBoundary`.
//
// THREE THINGS THIS ROW CARRIES, AND WHY EACH IS A SEPARATE CHANNEL (§5.3a, the step-3b mocks' Board D):
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
// THE PICKER HOLDS A DRAFT NOW, AND THE 2026-08-01 RULING SURVIVES WITH ITS INPUT CHANGED. That incident
// (two hours of a NULL `roleDefaults` under a "Saved" chip) ruled that the READOUT comes from the persisted
// read and never from what the picker is showing — and it still does: `{X}` is always the persisted
// connection. What is new is that the row can now SAY the two disagree, which is the whole of §5.3a's
// divergence arm. The condition is draft-vs-persisted and NEVER request-in-flight (`connections-model.ts`
// states why at the readout).

import { Badge } from "@orb/ui/badge";
import { Check, Icon, X } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary } from "#components";
import type { Invalidation, Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { configAnchorId } from "#state";
import { useSetBinding, useUpdateConnection } from "../hooks/use-connections-mutations.ts";
import type { RoleConnectionFacts, RoleRequirementVerdict, RoleRow } from "../lib/connections-model.ts";
import {
  backgroundRepairs,
  bindRefusal,
  connectionHost,
  connectionSummary,
  ROLE_ROWS_ORDERED,
  ROLE_STATUS_LABELS,
  roleReadout,
  roleRequirementVerdicts,
  roleStatus,
} from "../lib/connections-model.ts";
import { CONNECTIONS_ROLES_SUBCATEGORY } from "../lib/connections-nav.ts";

type ConnectionListItem = inferOutput<Trpc["connection"]["list"]>[number];
type BindingView = inferOutput<Trpc["connection"]["listBindings"]>[number];

const UNSET_VALUE = "";

// Both axes are DERIVED from their one home rather than re-spelled here (`no-inline-types`): the dot's
// states are the keys of its own label map, and the readout's arms are whatever `roleReadout` returns — so
// a fifth arm or a new state is a `tsc` error at these two maps instead of a silent fallthrough.
type RoleStatus = keyof typeof ROLE_STATUS_LABELS;
type RoleReadout = ReturnType<typeof roleReadout>;

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

export function ConnectionsRolesSection(): ReactElement {
  return (
    // RESERVED (#1098) — a config section that settles into one row per model role — the tallest block on this pane.
    <QueryBoundary
      fallback={<SkeletonRows count={4} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your model roles" onRetry={retry} />}
      reserveKey="config.connections.roles"
    >
      <ModelRolesBody />
    </QueryBoundary>
  );
}

function ModelRolesBody(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: connections } = useSuspenseQuery(trpc.connection.list.queryOptions());
  const { data: bindings } = useSuspenseQuery(trpc.connection.listBindings.queryOptions());

  return (
    <Section divider={true} heading={CONNECTIONS_ROLES_SUBCATEGORY.label} id={configAnchorId("connections", CONNECTIONS_ROLES_SUBCATEGORY.id)}>
      {/* The F20 sentence rides the SECTION BODY, not just the nav teach text: the body is where a user
          forms the expectation that a room might override this, and it is the width-independent one. */}
      <Text voice="gloss">
        Pick which connection each role uses. An unset role does nothing — there is no default model. Rooms never override this: a turn always runs on the
        connection of whoever triggered it.
      </Text>
      <Stack gap="block">
        {ROLE_ROWS_ORDERED.map((row) => (
          <RoleSlotRow
            key={row.task}
            row={row}
            connections={connections}
            view={bindings.find((view) => view.task === row.task) ?? null}
            trpc={trpc}
            invalidation={invalidation}
          />
        ))}
      </Stack>
    </Section>
  );
}

interface RoleSlotRowProps {
  readonly row: RoleRow;
  readonly connections: readonly ConnectionListItem[];
  readonly view: BindingView | null;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

function RoleSlotRow({ row, connections, view, trpc, invalidation }: RoleSlotRowProps): ReactElement {
  const deps = { trpc, invalidation };
  const setBinding = useSetBinding(deps);
  const update = useUpdateConnection(deps);
  // The PICKER's draft — `undefined` until the user touches it, which is the only state that can never
  // diverge. It is never the readout's `{X}`; it is only the other half of the comparison.
  const [draft, setDraft] = useState<string | null | undefined>(undefined);

  const compatible = connections.filter((connection) => connection.tasks.includes(row.task));
  const items = [
    { label: row.optional ? "None" : "Not set", value: UNSET_VALUE },
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
  const readout = roleReadout({ view, draftConnectionId: draft, factsOf });
  const verdicts = roleRequirementVerdicts(row, view?.resolved?.capability ?? null);
  const repairs = backgroundRepairs({ row, connections, status });
  const persisted = view?.binding?.connectionId ?? UNSET_VALUE;
  const current = draft === undefined ? persisted : (draft ?? UNSET_VALUE);

  return (
    <Row gap="field" align="start" justify="between" className="flex-wrap">
      <Row gap="field" align="start">
        <Badge
          aria-label={ROLE_STATUS_LABELS[status]}
          className={DOT_SKIN[status].className}
          intent={DOT_SKIN[status].intent}
          role="img"
          size="dot"
          tone={DOT_SKIN[status].tone}
        />
        <Stack gap="tight">
          <Text voice="label">{row.heading}</Text>
          <Text voice="gloss">{row.description}</Text>
          {verdicts.length === 0 ? null : <RequirementRail verdicts={verdicts} />}
          <ReadoutLine readout={readout} />
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
        aria-label={`${row.label} connection`}
        items={items}
        value={current}
        disabled={setBinding.isPending}
        onValueChange={(value): void => {
          const picked = value === UNSET_VALUE ? null : (compatible.find((connection) => connection.id === value)?.id ?? undefined);
          if (picked === undefined) {
            return;
          }
          setDraft(picked);
          setBinding.mutate({ task: row.task, connectionId: picked });
        }}
        placeholder="Not set"
      />
    </Row>
  );
}

/** The four sentences, one per arm — each spelled ONCE, so a fix lane restyling the steady arm cannot
 *  silently restyle the arm that is the opposite of steady. The blocked arm repeats the status dot's own
 *  accessible name word for word, which is what makes the amber dot decidable without colour. */
function ReadoutLine({ readout }: { readonly readout: RoleReadout }): ReactElement {
  const className = READOUT_INK[readout.kind];
  if (readout.kind === "steady") {
    return (
      <Text voice="gloss" className={className}>
        A turn uses {readout.connection}.
      </Text>
    );
  }
  if (readout.kind === "divergent") {
    return (
      <Text voice="gloss" className={className}>
        Not applied yet — a turn still uses {readout.connection}.
      </Text>
    );
  }
  if (readout.kind === "unset") {
    return (
      <Text voice="gloss" className={className}>
        Nothing — no connection is set.
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
