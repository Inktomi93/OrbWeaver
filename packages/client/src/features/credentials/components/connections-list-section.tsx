// The CONNECTIONS section (Settings → Connections) — the user's connection rows: label · provider · model ·
// key, the Model roles each row may serve, the background state, and a row MENU carrying §5.3a's
// no-defaults survivability actions. Owns its own `QueryBoundary` (one contributed section per read). The
// background switch is the editor's alone: the row shows the state, and its body is the editor's door.
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
// default to fall back to — §7.2 F2/F16). When it would re-point an embedder it asks first, like the role picker:
// a new embedder can delete and rebuild the search index.
//
// "ADD ANOTHER MODEL ON THIS KEY" IS THE MENU'S SECOND §5.3a ACTION. It is offered only where it can work:
// a hosted row whose key is gone has no catalog to list and no key to share (`addModelScope`), and its words
// follow what the new row shares — the key, the server, or only the built-in provider.
//
// THE REMOVE CONFIRM IS THE HOUSE `ConfirmDialog` AND ONLY ITS DESCRIPTION MOVED. The shipped sentence was
// correct and UNQUANTIFIED — it could not tell a user whether they were about to break one role or five,
// which is the only thing they need in order to decide — and it omitted the one fact that stops a user
// keeping a dead row out of fear: the CREDENTIAL survives, because a key is its own row (§5.3).

import { providerDisplayLabel } from "@orb/contracts/inference";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Plus } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { moreActionsName } from "@orb/ui/lib";
import { ListRow } from "@orb/ui/list-row";
import { MenuItem } from "@orb/ui/menu";
import { Heading, Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { QueryBoundary, RowActionsMenu, useFirstBootRows, useReindexConfirm } from "#components";
import type { Invalidation, Trpc } from "#data";
import { QueryErrorState, SkeletonRows, useInvalidation, useSuspenseQueries, useTRPC } from "#data";
import { connectionSummary } from "#lib";
import { clearConnectionEditorRequest, configSettingControlId, useRequestedConnectionEditor } from "#state";
import { useRemoveConnection, useUseForEverything } from "../hooks/use-connections-mutations.ts";
import { addModelActionGloss, addModelActionLabel, addModelScope } from "../lib/add-model-on-key-form-model.ts";
import { ADD_CONNECTION_NAME, backgroundStateLabel, CAN_SERVE_LABEL, connectionRailGroupName, USED_FOR_LABEL } from "../lib/connections-copy.ts";
import { boundRoleLabels, connectionRoleLabels, joinRoleLabels, sweepRebindsEmbedder, sweepRoleLabels } from "../lib/connections-model.ts";
import { ADD_CONNECTION_SETTING, CONNECTIONS_LIST_SUBCATEGORY } from "../lib/connections-nav.ts";
import { AddConnectionDialog } from "./add-connection-dialog.tsx";
import { AddModelOnKeyDialog } from "./add-model-on-key-dialog.tsx";
import { ConnectionEditor } from "./connection-editor.tsx";

type ConnectionListItem = inferOutput<Trpc["connection"]["list"]>[number];
type BindingView = inferOutput<Trpc["connection"]["listBindings"]>[number];
type CredentialListItem = inferOutput<Trpc["credentials"]["list"]>[number];
type ProviderDef = inferOutput<Trpc["connection"]["providersAvailable"]>[number]["provider"];
type ListFocusIntent =
  | { readonly kind: "row"; readonly connectionId: ConnectionListItem["id"] }
  | { readonly kind: "removed"; readonly connectionId: ConnectionListItem["id"]; readonly index: number };

// Whichever add verb is showing carries the leaf's control id, so an add-connection landing focuses it.
const ADD_CONNECTION_CONTROL_ID = configSettingControlId("connections", ADD_CONNECTION_SETTING);

export function ConnectionsListSection({ anchorId }: { readonly anchorId: string }): ReactElement {
  const firstBootRows = useFirstBootRows({ wide: 6, narrow: 7 });
  return (
    // RESERVED (#1098) — a config section that settles into one row per connection.
    <QueryBoundary
      resetKeys={[]}
      fallback={<SkeletonRows count={3} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your connections" onRetry={retry} />}
      reserveRows={firstBootRows}
      reserveKey="config.connections.list"
    >
      <ConnectionsBody anchorId={anchorId} />
    </QueryBoundary>
  );
}

function ConnectionsBody({ anchorId }: { readonly anchorId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const [{ data: connections }, { data: bindings }, { data: credentials }, { data: available }] = useSuspenseQueries({
    queries: [
      trpc.connection.list.queryOptions(),
      trpc.connection.listBindings.queryOptions(),
      trpc.credentials.list.queryOptions(),
      trpc.connection.providersAvailable.queryOptions(),
    ],
  });
  const [addOpen, setAddOpen] = useState(false);
  // THE EDITOR IS A PANE SWAP INSIDE THE SECTION, not a dialog — the mock's band (Back · title · Done) is a
  // view replacing the list, which is what keeps the four tiers inside the settings body at 486 instead of
  // inside a modal that has its own width.
  const [editingId, setEditingId] = useState<ConnectionListItem["id"] | null>(null);
  const addConnectionFocus = useRef<HTMLButtonElement>(null);
  const listFocusIntent = useRef<ListFocusIntent | null>(null);
  const rowBodies = useRef(new Map<ConnectionListItem["id"], HTMLButtonElement>());
  // A door elsewhere asks for one row's editor; the request is taken once, then cleared from the store. Each taken
  // request remounts the editor, so a door to the row already open still lands its tiers as asked.
  const requestedEditor = useRequestedConnectionEditor();
  const [takenRequest, setTakenRequest] = useState<typeof requestedEditor>(null);
  const [requestCount, setRequestCount] = useState(0);
  const [advancedOpenFor, setAdvancedOpenFor] = useState<ConnectionListItem["id"] | null>(null);
  if (requestedEditor !== null && requestedEditor !== takenRequest) {
    setTakenRequest(requestedEditor);
    setRequestCount((count) => count + 1);
    setEditingId(requestedEditor.connectionId);
    setAdvancedOpenFor(requestedEditor.openAdvanced ? requestedEditor.connectionId : null);
  }
  useEffect(() => {
    if (requestedEditor !== null) {
      clearConnectionEditorRequest();
    }
  }, [requestedEditor]);

  useEffect(() => {
    const intent = listFocusIntent.current;
    if (editingId !== null || intent === null) {
      return;
    }
    if (intent.kind === "removed" && connections.some((connection) => connection.id === intent.connectionId)) {
      return;
    }
    const targetId = intent.kind === "row" ? intent.connectionId : connections[intent.index]?.id;
    listFocusIntent.current = null;
    const target = targetId === undefined ? undefined : rowBodies.current.get(targetId);
    (target ?? addConnectionFocus.current)?.focus();
  }, [connections, editingId]);

  if (editingId !== null) {
    return (
      <Section id={anchorId}>
        <Heading className="sr-only" level={3}>
          {CONNECTIONS_LIST_SUBCATEGORY.label}
        </Heading>
        <ConnectionEditor
          key={requestCount}
          advancedOpen={advancedOpenFor === editingId}
          connectionId={editingId}
          invalidation={invalidation}
          onDone={(): void => {
            listFocusIntent.current = { kind: "row", connectionId: editingId };
            setEditingId(null);
            setAdvancedOpenFor(null);
          }}
          onRemoved={(): void => {
            listFocusIntent.current = {
              kind: "removed",
              connectionId: editingId,
              index: connections.findIndex((connection) => connection.id === editingId),
            };
            setEditingId(null);
          }}
          removalFinalFocus={addConnectionFocus}
          trpc={trpc}
        />
      </Section>
    );
  }

  return (
    // The shell crumb and the pane title already name this screen, so the heading stays in the outline unpainted.
    <Section id={anchorId}>
      <Heading className="sr-only" level={3}>
        {CONNECTIONS_LIST_SUBCATEGORY.label}
      </Heading>
      <Row gap="field" align="center" justify="between" wrap={true}>
        <Text voice="quiet" cap="prose">
          One provider and one model per connection. Your roles use these connections in rooms you host and for your work outside rooms. Shared-room turns use
          the room host's connections.
        </Text>
        {/* ONE "Add connection" PER VIEWPORT: the empty state owns the verb while the list is empty. */}
        {connections.length === 0 ? null : (
          <Button ref={addConnectionFocus} id={ADD_CONNECTION_CONTROL_ID} size="sm" wrap={true} onClick={(): void => setAddOpen(true)}>
            <Icon icon={Plus} size="sm" />
            {ADD_CONNECTION_NAME}
          </Button>
        )}
      </Row>

      {connections.length === 0 ? (
        <EmptyState
          icon={<Icon icon={Plus} size="lg" />}
          title="No connections yet"
          description="Add a provider key or your own server so your roles can reach a model."
          action={
            <Button ref={addConnectionFocus} id={ADD_CONNECTION_CONTROL_ID} size="sm" wrap={true} onClick={(): void => setAddOpen(true)}>
              <Icon icon={Plus} size="sm" />
              {ADD_CONNECTION_NAME}
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
              provider={available.find((row) => row.provider.id === connection.providerId)?.provider ?? null}
              bodyRef={(node): void => {
                if (node === null) {
                  rowBodies.current.delete(connection.id);
                } else {
                  rowBodies.current.set(connection.id, node);
                }
              }}
              trpc={trpc}
              invalidation={invalidation}
              onEdit={setEditingId}
            />
          ))}
        </Stack>
      )}

      <AddConnectionDialog open={addOpen} onOpenChange={setAddOpen} trpc={trpc} invalidation={invalidation} returnFocus={addConnectionFocus} />
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
      : `${roles.length} model role${roles.length === 1 ? "" : "s"} use${roles.length === 1 ? "s" : ""} it: ${joinRoleLabels(roles)}. They become Not set, and there is no default model, so those turns stop until you pick something else.`;
  const keySentence = key === null ? "" : ` The ${key} stays in Saved keys.`;
  return `${rolesSentence} Past messages keep their attribution.${keySentence} This can't be undone.`;
}

function ConnectionRow({
  connection,
  bindings,
  credentials,
  provider,
  bodyRef,
  trpc,
  invalidation,
  onEdit,
}: {
  readonly connection: ConnectionListItem;
  readonly bindings: readonly BindingView[];
  readonly credentials: readonly CredentialListItem[];
  /** The row's registry entry; `null` when the registry no longer lists its provider. */
  readonly provider: ProviderDef | null;
  /** The row's clickable body, registered so the list can hand focus back to it. */
  readonly bodyRef: (node: HTMLButtonElement | null) => void;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
  readonly onEdit: (connectionId: ConnectionListItem["id"]) => void;
}): ReactElement {
  const deps = { trpc, invalidation };
  const remove = useRemoveConnection(deps);
  const applyEverywhere = useUseForEverything(deps);
  const reindex = useReindexConfirm();
  const [addModelOpen, setAddModelOpen] = useState(false);
  const providerUnavailable = provider === null;
  const addModel = provider === null ? null : addModelScope({ auth: provider.auth, credentialId: connection.credentialId });

  const name = connectionSummary(connection);
  const key = keyClause(connection, credentials);
  const subtitle = [connection.providerLabel, connection.baseUrl, key].filter((part) => part !== null).join(" · ");
  const sweepRoles = sweepRoleLabels(connection);
  const boundRoles = boundRoleLabels(connection.id, bindings);

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
        bodyRef={bodyRef}
        clickable={true}
        onClick={(): void => onEdit(connection.id)}
        title={name}
        subtitle={subtitle}
        // The background switch lives in the editor this row opens; the row shows its state in the rail below.
        actions={
          <RowActionsMenu
            label={moreActionsName(name)}
            destructive={{
              confirmLabel: "Remove",
              description: removalDescription(boundRoles, key),
              label: "Remove",
              onConfirm: (): void => remove.mutate({ connectionId: connection.id }),
              title: `Remove "${connection.label}"?`,
            }}
          >
            {sweepRoles.length === 0 ? null : (
              <MenuItem
                stacked={true}
                disabled={applyEverywhere.isPending}
                onClick={(): void => {
                  const write = (): void => applyEverywhere.mutate({ connectionId: connection.id });
                  if (sweepRebindsEmbedder(connection)) {
                    reindex.guard({ kind: "everywhere", connectionId: connection.id }, write);
                  } else {
                    write();
                  }
                }}
              >
                <Text voice="label" as="span" ink="inherit">
                  Use this connection for everything it can serve
                </Text>
                <Text voice="gloss" as="span">
                  Sets {joinRoleLabels(sweepRoles)} to this connection. You can change any of them after.
                </Text>
              </MenuItem>
            )}
            {provider === null || addModel === null ? null : (
              <MenuItem stacked={true} onClick={(): void => setAddModelOpen(true)}>
                <Text voice="label" as="span" ink="inherit">
                  {addModelActionLabel(addModel)}
                </Text>
                <Text voice="gloss" as="span">
                  {addModelActionGloss(addModel, providerDisplayLabel(provider))}
                </Text>
              </MenuItem>
            )}
          </RowActionsMenu>
        }
      />
      <ConnectionBadges connection={connection} heldRoles={boundRoles} name={name} providerUnavailable={providerUnavailable} />
      {reindex.dialog}
      {provider === null || addModel === null ? null : (
        <AddModelOnKeyDialog
          connection={connection}
          invalidation={invalidation}
          onOpenChange={setAddModelOpen}
          open={addModelOpen}
          provider={provider}
          scope={addModel}
          trpc={trpc}
        />
      )}
    </Stack>
  );
}

/** The row's rail, three elements apart so a capability never reads as an assignment: the Model roles the model
 *  CAN serve (muted outline chips, a statement about the model), the roles bound to it NOW (a sentence from the
 *  persisted bindings), and its status (the warning badges and the background state). `task` is sealed — chip
 *  text is always the Model-roles label, never the schema word. */
function ConnectionBadges({
  connection,
  name,
  heldRoles,
  providerUnavailable,
}: {
  readonly connection: ConnectionListItem;
  /** The row's one-line identity, which names each rail group apart from the other rows'. */
  readonly name: string;
  readonly heldRoles: readonly string[];
  readonly providerUnavailable: boolean;
}): ReactElement {
  const canServe = connectionRoleLabels(connection.tasks);
  return (
    <Stack gap="tight">
      {canServe.length === 0 ? null : (
        <Row role="group" aria-label={connectionRailGroupName(CAN_SERVE_LABEL, name)} gap="field" align="center" wrap={true}>
          <Text voice="gloss" as="span">
            {CAN_SERVE_LABEL}
          </Text>
          {canServe.map((label) => (
            <Badge key={label} tone="neutral" variant="outline" size="sm" whitespace="normal">
              {label}
            </Badge>
          ))}
        </Row>
      )}
      <Row role="group" aria-label={connectionRailGroupName(USED_FOR_LABEL, name)} gap="field" align="center" wrap={true}>
        <Text voice="gloss" as="span">
          {USED_FOR_LABEL}
        </Text>
        <Text as="span" voice="datum" italic={heldRoles.length === 0}>
          {heldRoles.length === 0 ? "No model role yet" : joinRoleLabels(heldRoles)}
        </Text>
      </Row>
      <Row gap="field" align="center" wrap={true}>
        {providerUnavailable ? (
          <Badge tone="warning" size="sm" whitespace="normal">
            Provider unavailable
          </Badge>
        ) : null}
        {connection.modelCheck === "unlisted" ? (
          <Badge tone="warning" size="sm" whitespace="normal">
            Model not in list
          </Badge>
        ) : null}
        <Text voice="gloss" as="span" tone={connection.allowBackground ? undefined : "warning"}>
          {backgroundStateLabel(connection.allowBackground)}
        </Text>
      </Row>
    </Stack>
  );
}
