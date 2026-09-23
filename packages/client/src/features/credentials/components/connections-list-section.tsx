// The CONNECTIONS section (Settings → Connections) — the user's connection rows: label · provider · model ·
// key, the Model roles each row may serve, the background switch, and a row MENU carrying §5.3a's
// no-defaults survivability actions. Owns its own `QueryBoundary` (one
// contributed section per read).
//
// THE BADGE RAIL SITS OUTSIDE THE ROW BODY, ON PURPOSE. `ListRow`'s `leading`/`markers`/`subtitleLead` all
// render INSIDE the body — which becomes a native `<button>` the moment the row is `clickable` (the editor
// door) — and a badge is a STATUS, not a door. So the rail is a sibling under the row rather than a slot
// inside it, and the row door can land on this call site without swallowing it.
//
// THE SWEEP IS A MENU ITEM AND NOT A ROW BUTTON. "Use this connection for everything it can serve" writes up
// to six `user` bindings in one act — the pane's most consequential and least frequent action. A button on
// every row makes the loudest affordance the rarest one; the menu also gives it room for the gloss that
// NAMES the roles it will write, so the undo is knowable BEFORE the click rather than after it (there is no
// default to fall back to — §7.2 F2/F16).
//
// THE REMOVE CONFIRM IS THE HOUSE `ConfirmDialog` AND ONLY ITS DESCRIPTION MOVED. The shipped sentence was
// correct and UNQUANTIFIED — it could not tell a user whether they were about to break one role or five,
// which is the only thing they need in order to decide — and it omitted the one fact that stops a user
// keeping a dead row out of fear: the CREDENTIAL survives, because a key is its own row (§5.3).

import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Plus } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { MenuItem } from "@orb/ui/menu";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary, RowActionsMenu } from "#components";
import type { Invalidation, Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { configAnchorId } from "#state";
import { useRemoveConnection, useUpdateConnection, useUseForEverything } from "../hooks/use-connections-mutations.ts";
import { boundRoleLabels, connectionRoleLabels, connectionSummary, joinRoleLabels, sweepRoleLabels } from "../lib/connections-model.ts";
import { CONNECTIONS_LIST_SUBCATEGORY } from "../lib/connections-nav.ts";
import { AddConnectionDialog } from "./add-connection-dialog.tsx";
import { ConnectionEditor } from "./connection-editor.tsx";

type ConnectionListItem = inferOutput<Trpc["connection"]["list"]>[number];
type BindingView = inferOutput<Trpc["connection"]["listBindings"]>[number];
type CredentialListItem = inferOutput<Trpc["credentials"]["list"]>[number];

export function ConnectionsListSection(): ReactElement {
  return (
    // RESERVED (#1098) — a config section that settles into one row per connection.
    <QueryBoundary
      fallback={<SkeletonRows count={3} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your connections" onRetry={retry} />}
      reserveKey="config.connections.list"
    >
      <ConnectionsBody />
    </QueryBoundary>
  );
}

function ConnectionsBody(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: connections } = useSuspenseQuery(trpc.connection.list.queryOptions());
  // The bindings read is what lets the REMOVE confirm say how many roles it breaks, and the credential read
  // is what lets a row say WHICH key it uses — with several connections on one key (§5.3) neither fact is
  // derivable from anything else already on the row.
  const { data: bindings } = useSuspenseQuery(trpc.connection.listBindings.queryOptions());
  const { data: credentials } = useSuspenseQuery(trpc.credentials.list.queryOptions());
  const [addOpen, setAddOpen] = useState(false);
  // THE EDITOR IS A PANE SWAP INSIDE THE SECTION, not a dialog — the mock's band (Back · title · Done) is a
  // view replacing the list, which is what keeps the four tiers inside the settings body at 486 instead of
  // inside a modal that has its own width.
  const [editingId, setEditingId] = useState<ConnectionListItem["id"] | null>(null);

  if (editingId !== null) {
    return (
      <Section divider={true} heading={CONNECTIONS_LIST_SUBCATEGORY.label} id={configAnchorId("connections", CONNECTIONS_LIST_SUBCATEGORY.id)}>
        <ConnectionEditor connectionId={editingId} invalidation={invalidation} onDone={(): void => setEditingId(null)} trpc={trpc} />
      </Section>
    );
  }

  return (
    <Section divider={true} heading={CONNECTIONS_LIST_SUBCATEGORY.label} id={configAnchorId("connections", CONNECTIONS_LIST_SUBCATEGORY.id)}>
      <Row gap="field" align="center" justify="between" className="flex-wrap">
        <Text voice="gloss">One provider and one model per connection. Every turn you trigger — in any room — runs on your own connections.</Text>
        {/* ONE "Add connection" PER VIEWPORT: the empty state owns the verb while the list is empty. */}
        {connections.length === 0 ? null : (
          <Button intent="primary" size="sm" onClick={(): void => setAddOpen(true)}>
            <Icon icon={Plus} size="sm" />
            Add connection
          </Button>
        )}
      </Row>

      {connections.length === 0 ? (
        <EmptyState
          icon={<Icon icon={Plus} size="lg" />}
          title="No connections yet"
          description="Add a provider key or your own server so your roles can reach a model."
          action={
            <Button intent="primary" size="sm" onClick={(): void => setAddOpen(true)}>
              <Icon icon={Plus} size="sm" />
              Add connection
            </Button>
          }
        />
      ) : (
        <Stack gap="field">
          {connections.map((connection) => (
            <ConnectionRow
              key={connection.id}
              connection={connection}
              bindings={bindings}
              credentials={credentials}
              trpc={trpc}
              invalidation={invalidation}
              onEdit={setEditingId}
            />
          ))}
        </Stack>
      )}

      <AddConnectionDialog open={addOpen} onOpenChange={setAddOpen} trpc={trpc} invalidation={invalidation} />
    </Section>
  );
}

/** The key a row uses, in the words Saved keys shows — `key "work"`. `null` for a keyless row. */
function keyClause(connection: ConnectionListItem, credentials: readonly CredentialListItem[]): string | null {
  if (connection.credentialId === null) {
    return null;
  }
  const credential = credentials.find((candidate) => candidate.id === connection.credentialId);
  return credential === undefined ? null : `key "${credential.label ?? "default"}"`;
}

/** The REMOVE confirm's description: the count and the ROLE NAMES it unsets, plus the fact the key stays. */
function removalDescription(roles: readonly string[], key: string | null): string {
  const rolesSentence =
    roles.length === 0
      ? "No model roles use it."
      : `${roles.length} model role${roles.length === 1 ? "" : "s"} use${roles.length === 1 ? "s" : ""} it — ${joinRoleLabels(roles)}. They become Not set, and there is no default model, so those turns stop until you pick something else.`;
  const keySentence = key === null ? "" : ` The ${key} stays in Saved keys.`;
  return `${rolesSentence} Past messages keep their attribution.${keySentence} This can't be undone.`;
}

function ConnectionRow({
  connection,
  bindings,
  credentials,
  trpc,
  invalidation,
  onEdit,
}: {
  readonly connection: ConnectionListItem;
  readonly bindings: readonly BindingView[];
  readonly credentials: readonly CredentialListItem[];
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
  readonly onEdit: (connectionId: ConnectionListItem["id"]) => void;
}): ReactElement {
  const deps = { trpc, invalidation };
  const remove = useRemoveConnection(deps);
  const update = useUpdateConnection(deps);
  const applyEverywhere = useUseForEverything(deps);

  const name = connectionSummary(connection);
  const key = keyClause(connection, credentials);
  const subtitle = [connection.providerLabel, connection.baseUrl, key].filter((part) => part !== null).join(" · ");
  const sweepRoles = sweepRoleLabels(connection);
  const boundRoles = boundRoleLabels(connection.id, bindings);
  // THE SWITCH'S SUBJECT RIDES ITS ACCESSIBLE NAME, NOT ITS PIXELS — measured, not preferred. The row it
  // belongs to is the row it is IN, so a sighted reader already has the subject; spelling it visibly made
  // the trailing cluster wider than the identity block and truncated the connection's own name to
  // "local-light · reranker · Xenova/ms…" while the switch label spelled that model in full (snap
  // `config_to_connections`, 870px). A screen-reader user has no row context, so the NAME keeps it — which
  // is also why the shipped one-word "background" gloss had to go.
  // The Model-roles REPAIR switch is the opposite case and spells its subject visibly: it sits in a role
  // row and writes a DIFFERENT row's flag, so there is no context to inherit.
  const switchLabel = "Allow background work";
  const switchName = `${switchLabel} on ${name}`;

  return (
    <Stack gap="tight">
      {/* THE ROW IS THE EDITOR'S DOOR. `clickable` makes the identity block (leading + title + subtitle) ONE
          native `<button>` with the actions cluster kept a SIBLING — which is also what keeps this from being
          the stretched link the mock review caught as a P1 `obscured-target` (an `inset: 0` overlay covers
          the row's own name and meta, so the thing you point at stops being the thing under the pointer).
          Its accessible name is the CONNECTION, not "Edit <the connection>": `list-row.tsx:1-10` records the
          #512 owner ruling that a clickable row's name IS its title, so voice control can say what is on
          screen, and the primitive offers no aria-label door. the mock design §2.2 says otherwise and is wrong.
          The badge rail is already OUT of the body (the file header's own decision, `ConnectionBadges`
          below), which is exactly the landing this door needed. */}
      <ListRow
        clickable={true}
        onClick={(): void => onEdit(connection.id)}
        title={name}
        subtitle={subtitle}
        // THE ROW STACKS INSTEAD OF SQUEEZING (#2486). Dropping the switch's visible gloss below ~480px
        // bought the name ~130px and still was not enough: a 52-character auto-minted label truncated to
        // "local-light · encoder · jinaai…" at the 486 settings body (snap `config_to_connections`,
        // 486x1700) while the cluster beside it kept its full intrinsic width — which is why the CT could
        // only pin "the identity is never narrower than its controls" rather than the layout. `list.html`
        // Board D answers with a STACK: identity full width, switch and kebab on their own line, the switch
        // keeping its shipped silhouette and its label "on a single line beside it". So the gloss comes back
        // at every width and the name never yields to its own controls. The mechanism is the PRIMITIVE's
        // (`@container/list-row` on the row's own box), never this call site's — every list surface in the
        // app has this shape and three of them solving it three ways is the drift `ListRow` exists to
        // prevent.
        // TWO SIBLINGS IN THE SLOT, NOT ONE WRAPPER ROW, AND THAT IS THE STACK'S DOING. The `actions` slot
        // is itself the flex row (`gap-field`, `items-center`), so an outer `<Row>` here rendered
        // identically inline — and in the STACKED arm it collapsed the slot to ONE child, which makes
        // `justify-between` a no-op: MEASURED on the isolated stage at 486x1700, the kebab sat glued to the
        // switch's gloss instead of at the row's end, where Board D draws it.
        stackActions={true}
        actions={
          <>
            <Row gap="field" align="center">
              <Switch
                aria-label={switchName}
                checked={connection.allowBackground}
                disabled={update.isPending}
                onCheckedChange={(checked): void => update.mutate({ connectionId: connection.id, patch: { allowBackground: checked } })}
              />
              <Text voice="gloss" as="span">
                {switchLabel}
              </Text>
            </Row>
            <RowActionsMenu
              label={`More actions for ${name}`}
              destructive={{
                confirmLabel: "Remove",
                description: removalDescription(boundRoles, key),
                label: "Remove",
                onConfirm: (): void => remove.mutate({ connectionId: connection.id }),
                title: `Remove "${connection.label}"?`,
              }}
            >
              <MenuItem
                className="flex-col items-start"
                disabled={applyEverywhere.isPending || sweepRoles.length === 0}
                onClick={(): void => applyEverywhere.mutate({ connectionId: connection.id })}
              >
                <Text voice="label" as="span" ink="inherit">
                  Use this connection for everything it can serve
                </Text>
                <Text voice="gloss" as="span">
                  Sets {joinRoleLabels(sweepRoles)} to this connection. You can change any of them after.
                </Text>
              </MenuItem>
            </RowActionsMenu>
          </>
        }
      />
      <ConnectionBadges connection={connection} />
    </Stack>
  );
}

/** The row's status rail: the Model roles this connection CAN serve (a statement about the model, never
 *  about what the user bound), plus the two CONDITION badges. `task` is SEALED — the badge text is always
 *  the Model-roles label, never the schema word. */
function ConnectionBadges({ connection }: { readonly connection: ConnectionListItem }): ReactElement {
  return (
    <Row gap="field" align="center" className="flex-wrap">
      {connectionRoleLabels(connection.tasks).map((label) => (
        <Badge key={label} intent="primary" size="sm" tone="soft">
          {label}
        </Badge>
      ))}
      {connection.modelListed ? null : (
        <Badge intent="warning" size="sm" tone="soft">
          Model not in list
        </Badge>
      )}
      {connection.allowBackground ? null : (
        <Badge intent="warning" size="sm" tone="soft">
          Background work off
        </Badge>
      )}
    </Row>
  );
}
