// Shared scaffolding for the connection-authoring CTs (the add dialog and "Add another model on this key"):
// the registry rows the pane reads, row and catalog builders in the canonical wire shapes, and ONE stateful
// network stub for the whole Connections pane. The stub is stateful on purpose: a created connection appears
// in the next `connection.list` read and a minted key in the next `credentials.list`, which is what lets a CT
// drive an add and then the follow-on action (the persona flows) against the same rows the server would keep.
//
// Pure `.ts` with no `.tsx` import: a CT spec's node side cannot import from a component module.

import type { USER_ROLES } from "@orb/contracts/identity";
import type { ProviderAvailability } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS, ROUTABLE_TASKS } from "@orb/contracts/inference";
import { expect } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
// Deep relative, pure `.ts`: the step titles are read from their one home, never re-typed here.
import { ADD_DIALOG_COPY } from "../../../../packages/client/src/features/credentials/lib/add-connection-form-model.ts";
import type { TrpcInput, TrpcRecorder, TrpcResponder, TrpcWireOutput } from "../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../support/node/route-trpc.ts";
import { userSettingsView } from "../../../support/node/user-settings-view.ts";

export type ConnectionRow = TrpcWireOutput<"connection.list">[number];
export type CredentialRow = TrpcWireOutput<"credentials.list">[number];
export type CatalogRead = TrpcWireOutput<"connection.catalogModels">;
export type CatalogEntry = Extract<CatalogRead, { readonly listed: true }>["models"][number];

/** The server's own reason for a list that came back empty. */
const NO_MODELS_LISTED = "the provider listed no models";

/** The list-or-reason answer every catalog read gives — `listed: false` with the server's own "listed no
 *  models" reason when there are none, and no model list on that branch. */
export function catalogOf(models: readonly CatalogEntry[]): CatalogRead {
  return models.length > 0 ? { listed: true, models: [...models] } : { listed: false, reason: NO_MODELS_LISTED };
}
type BindingView = TrpcWireOutput<"connection.listBindings">[number];
type AvailabilityRow = TrpcWireOutput<"connection.providersAvailable">[number];

const OWNER_ID = "user_ct_conn_author";

/** Every built-in provider, available — the registry the server reads at boot. */
export const ALL_AVAILABLE: readonly AvailabilityRow[] = BUILTIN_PROVIDERS.map((provider): ProviderAvailability => ({ provider, available: true }));

/** The same registry with the `claude` executable missing — `claude-sub` listed, disabled, with its cause. */
export const SUBSCRIPTION_RUNTIME_MISSING: readonly AvailabilityRow[] = BUILTIN_PROVIDERS.map(
  (provider): ProviderAvailability => (provider.id === "claude-sub" ? { provider, available: false, cause: "runtime-missing" } : { provider, available: true }),
);

function providerLabelOf(providerId: string): string {
  const provider = BUILTIN_PROVIDERS.find((row) => row.id === providerId);
  if (provider === undefined) {
    throw new Error(`no built-in provider ${providerId}`);
  }
  return provider.label;
}

export function catalogEntry(id: string, name = id): CatalogEntry {
  return {
    id,
    name,
    contextLength: null,
    promptPrice: null,
    completionPrice: null,
    cacheReadPrice: null,
    cacheWritePrice: null,
    inputModalities: [],
    supportedParameters: [],
  };
}

export function credentialRow(over: Partial<CredentialRow> = {}): CredentialRow {
  return {
    id: "user_credential_ctauthor0001",
    provider: "openrouter",
    label: "default",
    revokedAt: null,
    revokedReason: null,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

export function connectionRow(over: Partial<ConnectionRow> = {}): ConnectionRow {
  return {
    id: "user_connection_ctauthor0001",
    ownerId: OWNER_ID,
    label: "OpenRouter · Claude Opus 5",
    providerId: "openrouter",
    providerLabel: "OpenRouter",
    credentialId: "user_credential_ctauthor0001",
    baseUrl: null,
    model: "anthropic/claude-opus-5",
    api: "auto",
    declared: null,
    extras: null,
    transport: null,
    modelCheck: "listed",
    allowBackground: false,
    promptCache: null,
    tasks: ["chat", "agent", "summarize", "structured"],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

/** Every routable role unbound (there is no default connection). */
const UNBOUND: readonly BindingView[] = ROUTABLE_TASKS.map((task) => ({
  task,
  binding: null,
  resolved: null,
  unavailableCause: null,
}));

export interface PaneStubOptions {
  readonly providers?: readonly AvailabilityRow[];
  readonly storageEnabled?: boolean;
  /** Replaces `credentials.storageStatus` (a hold pins the dialog's first loading state). */
  readonly storageStatus?: TrpcResponder<"credentials.storageStatus">;
  /** The rows the pane starts with. A successful `connection.create` appends to them. */
  readonly connections?: readonly ConnectionRow[];
  readonly credentials?: readonly CredentialRow[];
  /** Replaces `credentials.add`; the default mints a row with the requested provider and label. */
  readonly addCredential?: TrpcResponder<"credentials.add">;
  /** Replaces `connection.create`; the default builds the row from the request and appends it. */
  readonly createConnection?: TrpcResponder<"connection.create">;
  readonly catalogModels?: TrpcResponder<"connection.catalogModels">;
  /** Replaces `connection.draftCatalogModels` — the add dialog's list for an endpoint or built-in draft. */
  readonly draftCatalogModels?: TrpcResponder<"connection.draftCatalogModels">;
  /** Replaces `connection.verifyAuth` — the sign-in check a saved subscription row runs. */
  readonly verifyAuth?: TrpcResponder<"connection.verifyAuth">;
  /** The caller's `sessions.me` role; the box owner by default. */
  readonly role?: (typeof USER_ROLES)[number];
  /** The deployment's private-endpoint allowlist. A `settings.updateAppSettings` that writes it replaces it. */
  readonly allowlist?: readonly string[];
}

/** A passing sign-in check, as the agent-sdk backend answers it. */
export const SIGNED_IN: TrpcWireOutput<"connection.verifyAuth"> = {
  source: "max-pro-sub",
  ok: true,
  apiKeySource: "none",
  model: "claude-sonnet-5",
  reply: "ok",
  costUsd: 0,
  account: { email: "owner@example.com", subscriptionType: "max" },
};

/** The whole Connections pane's network, stateful across an add (header). */
export async function stubConnectionsPane(page: Page, opts: PaneStubOptions = {}): Promise<TrpcRecorder> {
  const connections: ConnectionRow[] = [...(opts.connections ?? [])];
  const credentials: CredentialRow[] = [...(opts.credentials ?? [])];
  let allowlist: readonly string[] = opts.allowlist ?? [];
  const mintCredential = (input: TrpcInput<"credentials.add">): CredentialRow => {
    const row = credentialRow({ id: `user_credential_ctminted00${credentials.length + 1}`, provider: input.provider, label: input.label ?? "default" });
    credentials.push(row);
    return row;
  };
  const createConnection = (input: TrpcInput<"connection.create">): ConnectionRow => {
    const row = connectionRow({
      id: `user_connection_ctcreated0${connections.length + 1}`,
      label: input.label ?? `${providerLabelOf(input.providerId)} · ${input.model}`,
      providerId: input.providerId,
      providerLabel: providerLabelOf(input.providerId),
      credentialId: input.credentialId,
      baseUrl: input.baseUrl,
      model: input.model,
      modelCheck: input.modelCheck ?? "unchecked",
      allowBackground: input.allowBackground ?? false,
    });
    connections.push(row);
    return row;
  };
  return await routeTrpc(page, {
    "sessions.me": () => ({ userId: OWNER_ID, handle: "owner", globalRole: opts.role ?? "owner" }),
    "connection.list": () => connections,
    "connection.listBindings": () => UNBOUND,
    "connection.providersAvailable": () => opts.providers ?? ALL_AVAILABLE,
    "credentials.list": () => credentials,
    "credentials.storageStatus": opts.storageStatus ?? { enabled: opts.storageEnabled ?? true },
    "credentials.add": opts.addCredential ?? mintCredential,
    "connection.create": opts.createConnection ?? createConnection,
    "connection.catalogModels": opts.catalogModels ?? catalogOf([]),
    "connection.draftCatalogModels": opts.draftCatalogModels ?? catalogOf([]),
    "connection.useForEverything": [],
    // The first-model step's writes: a patch lands on the stateful row, a role write echoes its binding.
    "connection.update": ({ connectionId, patch }) => {
      const index = connections.findIndex((row) => row.id === connectionId);
      const current = connections[index];
      if (current === undefined) {
        throw new Error(`connection.update on a row the stub never created: ${connectionId}`);
      }
      const updated = { ...current, ...(patch.allowBackground === undefined ? {} : { allowBackground: patch.allowBackground }) };
      connections.splice(index, 1, updated);
      return updated;
    },
    "connection.setBinding": ({ task, connectionId }) => ({
      id: `connection_binding_ct${task}`,
      actorKind: "user",
      userId: OWNER_ID,
      ruleId: null,
      pluginId: null,
      task,
      connectionId,
    }),
    "connection.verifyAuth": opts.verifyAuth ?? SIGNED_IN,
    // Model roles' Utility preset picker, which the pane renders beside the list: no presets, every default.
    "preset.list": () => [],
    "settings.getUserSettings": () => userSettingsView(),
    "settings.getAppSettingsWithOverrides": () => ({
      resolved: { privateEndpointAllowlist: [...allowlist] },
      overrides: { privateEndpointAllowlist: null },
    }),
    "settings.updateAppSettings": ({ partial }) => {
      allowlist = partial.privateEndpointAllowlist ?? allowlist;
      return { privateEndpointAllowlist: [...allowlist] };
    },
  });
}

/** The open dialog, by its title. */
export function dialogNamed(page: Page, title: string): Locator {
  return page.getByRole("dialog", { name: title });
}

/** The first-model step a first chat-capable add opens instead of closing. */
export function firstModelSetup(page: Page): Locator {
  return dialogNamed(page, ADD_DIALOG_COPY.setup.title);
}

/** Leave the first-model step with no Utility model ("Not now", Finish), for a CT about the add itself. */
export async function skipFirstModelSetup(page: Page): Promise<void> {
  const setup = firstModelSetup(page);
  await setup.getByRole("radio", { name: "Not now" }).click();
  await setup.getByRole("button", { name: "Finish" }).click();
  await expect(setup).toBeHidden();
}

/** Pick a provider in the add dialog's grouped picker. */
export async function pickProvider(page: Page, dialog: Locator, label: string): Promise<void> {
  await dialog.getByRole("combobox", { name: "Provider" }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

/** A row's "More actions for …" menu, opened. */
export async function openRowMenu(page: Page, rowName: string): Promise<void> {
  await page.getByRole("button", { name: `More actions for ${rowName}` }).click();
}

/** The acceptance matrix's widths: the settings body with the context panel closed (870) and open (486), and
 *  a phone, where the viewport itself is 390 wide with a coarse pointer. */
export const AUTHORING_ARMS = [
  { arm: "870", width: 870, device: {} },
  { arm: "486", width: 486, device: {} },
  { arm: "mobile", width: 390, device: { hasTouch: true, viewport: { width: 390, height: 844 } } },
] as const;

/** The dialog's box is inside the viewport on both sides — nothing a user needs is off-screen. A missing
 *  box or viewport fails both bounds rather than skipping them. */
export async function expectInsideViewport(page: Page, dialog: Locator): Promise<void> {
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(viewport === null ? 0 : viewport.width);
}
