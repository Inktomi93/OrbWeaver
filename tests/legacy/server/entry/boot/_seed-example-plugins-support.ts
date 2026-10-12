import { join } from "node:path";
import type { InvocationChat, PluginCapability, PluginHandlerRef } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import type { ChatId, PluginId, WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { liftJsonSchema } from "@orb/kit/json-schema";
import { requireHost } from "@orb/server/domain/chat";
import { createPluginHost } from "@orb/server/infra/plugin-host";
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import { expect } from "@orb/testkit/node/fixtures.ts";
import { writeShowcaseArtifacts } from "@orb/tooling/plugin-author-showcase";
import { afterEach, beforeAll } from "vitest";
import { can } from "#server/domain/admin/index.ts";
import { createResolveViewerVisibility } from "#server/domain/chat/verbs/resolve-viewer-visibility.ts";
import type { PluginActivationScope, PluginHostOps, PluginHostPort, PluginInvokeHandler, PluginRegistrationHandle } from "#server/domain/plugin/index.ts";
import { buildPluginStorage } from "#server/domain/plugin/index.ts";
import { __terminateManagedPluginBrokerForTest } from "#server/infra/plugin-host/process-runtime.ts";
import { packShowcaseBundle } from "#showcase-plugins/index.ts";
import type { makePluginHarness, ownerPrincipalFor } from "../../domain/plugin/_support.ts";
import { makeInertOps, principalFor } from "../../domain/plugin/_support.ts";

export { packShowcaseBundle, readShowcaseManifest, SHOWCASE_PLUGIN_SLUGS } from "#showcase-plugins/index.ts";

export const FAMILIAR_BOOK_ID = castId<WorldBookId>("wib_01h455vb4pex5vsknk084sn02q");
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..", "..");

beforeAll(async () => {
  const built = await writeShowcaseArtifacts(REPO_ROOT);
  expect(built.diagnostics).toEqual([]);
});

// Every `realHost()` below opens its own logical pool, but all of them share the one physical broker
// process (`process-runtime.ts`'s module-level singleton) and its fixed Worker cap. Without a terminate
// between tests, activated-but-never-disposed runtimes from earlier tests pin that shared capacity and
// starve later ones — the same reset `tests/legacy/server/infra/plugin-host/process-runtime.test.ts` takes.
afterEach(async () => {
  await __terminateManagedPluginBrokerForTest();
});

/** The production runtime under DETERMINISTIC seams — the same object compose builds, so the membrane, the
 *  registration collection and the resident-invoke path are all real. */
export function realHost(): PluginHostPort {
  let n = 0;
  return createPluginHost({
    nowEpochMs: (): number => FROZEN_AT_MS,
    nextRandom: (): number => 0.5,
    mintId: (): string => {
      n += 1;
      return `seed_${n}`;
    },
  });
}

/** What the registrar ops saw at activation — the seam the compose fan-out and the tool registry consume. */
interface Captured {
  readonly events: { readonly type: string; readonly handler: PluginHandlerRef }[];
  readonly tools: { readonly name: string; readonly handler: PluginHandlerRef }[];
  readonly transforms: { readonly name: string; readonly point: string; readonly handler: PluginHandlerRef }[];
  /** The collected VALUE macros — guest-local names; the registrar namespaces them. */
  readonly macros: { readonly name: string; readonly handler: PluginHandlerRef }[];
  /** The collected private-event subscriptions (§5a) — `(emitterSlug, name)` channel coordinates. */
  readonly pubsubSubs: { readonly emitterSlug: string; readonly name: string; readonly handler: PluginHandlerRef }[];
  /** Every `pubsub.emit` the guests fired, in order — the announce half of the composition demo. */
  readonly pubsubEmits: { readonly emitterSlug: string; readonly name: string; readonly data: Record<string, unknown> }[];
  /** Each `surfaceQuickReply` emission, in order — the room-visible half of the chip archetype. */
  readonly chips: (readonly { readonly label: string; readonly sendText: string }[])[];
  /** Every `host.ui.toast` the guests asked for, at the OP seam (the compose-wired outbox is a compose
   *  concern; the drive asserts what the guest SAID, not how chrome delivers it). */
  readonly toasts: { readonly level: string; readonly message: string }[];
  readonly worldBookReads: { readonly chatId: ChatId }[];
  readonly searches: { readonly queryText: string; readonly limit?: number }[];
  readonly worldWrites: { readonly bookId: string; readonly content: string }[];
  readonly assetReads: string[];
  /** The per-activation invoke closure (crash-policy wrapped) — how a delivery/tool call actually re-enters. */
  invoke: PluginInvokeHandler | null;
  scope: PluginActivationScope | null;
}

/** A `PluginHostOps` that RECORDS its registrations, over the REAL plugin-private KV (the deck's state plane)
 *  and a scriptable global-variable read (the familiar's configuration plane). */
export function recordingOps(db: Db, globals: Map<string, string>): { ops: PluginHostOps; captured: Captured } {
  const base = makeInertOps();
  const noop: PluginRegistrationHandle = { unregister: (): void => undefined };
  const captured: Captured = {
    events: [],
    tools: [],
    transforms: [],
    macros: [],
    pubsubSubs: [],
    pubsubEmits: [],
    chips: [],
    toasts: [],
    worldBookReads: [],
    searches: [],
    worldWrites: [],
    assetReads: [],
    invoke: null,
    scope: null,
  };
  const ops: PluginHostOps = {
    ...base,
    storage: buildPluginStorage(db, () => FROZEN_AT_MS),
    variables: { ...base.variables, get: (_ownerId, key): Promise<string | null> => Promise.resolve(globals.get(key) ?? null) },
    worldInfo: {
      ...base.worldInfo,
      listBooksForChat: (_ownerId, chatId) => {
        captured.worldBookReads.push({ chatId });
        return Promise.resolve([{ id: FAMILIAR_BOOK_ID, name: "Field Notes" }]);
      },
      isBookAttachedToChat: (_ownerId, _chatId, bookId) => Promise.resolve(bookId === FAMILIAR_BOOK_ID),
      upsertEntries: (req) => {
        captured.worldWrites.push({ bookId: req.bookId, content: req.entries[0]?.content ?? "" });
        return Promise.resolve({ inserted: 1, updated: 0, skippedHandEdited: 0 });
      },
    },
    search: {
      documents: ({ queryText, limit }) => {
        captured.searches.push({ queryText, ...(limit === undefined ? {} : { limit }) });
        return Promise.resolve([
          {
            documentId: "doc_01h455vb4pex5vsknk084sn02q",
            documentName: "Aurora field notes",
            content: "Charged particles excite gases high above the polar sky.",
            score: 0.99,
          },
        ]);
      },
    },
    assets: {
      ...base.assets,
      read: ({ assetId }) => {
        captured.assetReads.push(assetId);
        return Promise.resolve({ mime: "image/png", sizeBytes: 2_097_152, dataBase64: null });
      },
    },
    quickReply: {
      surface: ({ choices }): Promise<void> => {
        captured.chips.push(choices);
        return Promise.resolve();
      },
    },
    pubsub: {
      emit: ({ emitterSlug, name, data }): Promise<void> => {
        captured.pubsubEmits.push({ emitterSlug, name, data });
        return Promise.resolve();
      },
    },
    ui: {
      ...base.ui,
      toast: (_plugin, level, message): Promise<void> => {
        captured.toasts.push({ level, message });
        return Promise.resolve();
      },
    },
    registrar: {
      registerTool: (reg, invoke, scope): PluginRegistrationHandle => {
        // THE LIFT IS PART OF REGISTERING A TOOL, so this fake performs it (#1865). The real registrar
        // (`domain/tool-use/verbs/register-plugin-tool.ts`) lifts the guest's untrusted JSON Schema to zod and
        // a `JsonSchemaLiftError` there is ACTIVATION-FATAL. A fake that only recorded `name`/`handler` said
        // "story-clocks registers advance_clock" for months while every real install of it died on exactly
        // this line — the suite was green about a plugin that had never once run. Recording a name is not
        // proof a tool registered; surviving the lift is.
        liftJsonSchema(reg.parameters);
        captured.tools.push({ name: reg.name, handler: reg.handler });
        captured.invoke = invoke;
        captured.scope = scope;
        return noop;
      },
      registerTransform: (reg, invoke, scope): PluginRegistrationHandle => {
        captured.transforms.push({ name: reg.name, point: reg.point, handler: reg.handler });
        captured.invoke = invoke;
        captured.scope = scope;
        return noop;
      },
      registerMacros: (macros, invoke, scope): PluginRegistrationHandle => {
        for (const macro of macros) {
          captured.macros.push({ name: macro.name, handler: macro.handler });
        }
        captured.invoke = invoke;
        captured.scope = scope;
        return noop;
      },
      subscribeEvent: (subscriptions, invoke, scope): PluginRegistrationHandle => {
        for (const sub of subscriptions) {
          captured.events.push({ type: sub.type, handler: sub.handler });
        }
        captured.invoke = invoke;
        captured.scope = scope;
        return noop;
      },
      subscribePubsub: (subscriptions, invoke, scope): PluginRegistrationHandle => {
        for (const sub of subscriptions) {
          captured.pubsubSubs.push({ emitterSlug: sub.emitterSlug, name: sub.name, handler: sub.handler });
        }
        captured.invoke = invoke;
        captured.scope = scope;
        return noop;
      },
    },
  };
  return { ops, captured };
}

// Room-effect drives must pass the same live membership/host guards as production, not an admission-time host bit.
export function roomAuthority(db: Db): Pick<PluginHostOps["chat"], "resolveViewerVisibility" | "requireHost"> {
  return {
    resolveViewerVisibility: createResolveViewerVisibility({ db }),
    requireHost: async (chatId, installerUserId): Promise<void> => {
      await requireHost({ db, can }, principalFor(installerUserId), chatId);
    },
  };
}

/** The per-activation invoke closure, or a legible failure. Split out of the call sites because biome's type
 *  service models `arr[0]` as always-defined (no `noUncheckedIndexedAccess`), so an inline
 *  `x[0]?.h === undefined` guard reads to it as statically dead and poisons the narrowing around it. */
export function requireInvoke(captured: Captured): PluginInvokeHandler {
  const invoke = captured.invoke;
  if (invoke === null) {
    throw new Error("activation registered nothing — no invoke closure reached the registrar");
  }
  return invoke;
}

/** One captured handler ref by index, or a legible failure. `.at()` is honestly typed `T | undefined`. */
export function requireHandler(entries: readonly { readonly handler: PluginHandlerRef }[], index: number, what: string): PluginHandlerRef {
  const entry = entries.at(index);
  if (entry === undefined) {
    throw new Error(`activation registered no ${what} at index ${index}`);
  }
  return entry.handler;
}

/** The whole user-facing sequence on an example's REAL packed bytes: install with an empty grant, consent to
 *  `grant`, enable. Returns the row id. `netHosts` is the caller's echo of the displayed host list — the
 *  anti-TOCTOU pin `setGrant` refuses on when the grant includes `net.fetch`. */
export async function installGrantEnable(args: {
  readonly h: ReturnType<typeof makePluginHarness>;
  readonly caller: ReturnType<typeof ownerPrincipalFor>;
  readonly slug: string;
  readonly grant: readonly PluginCapability[];
  readonly netHosts?: readonly string[];
}): Promise<PluginId> {
  const { h, caller, slug, grant } = args;
  const bundle = await packShowcaseBundle(slug);
  expect(bundle, `${slug} has no packable source directory`).not.toBeNull();
  // @orb-waive no-test-fabrication(Uint8Array): baselined when the gate widened to value casts; burn-down item 906.
  const installed = await h.service.install({ caller, bundle: bundle as Uint8Array, grant: [] });
  expect(installed.status).toBe("disabled");
  expect(installed.grantedCapabilities).toEqual([]);
  await h.service.setGrant({ caller, pluginId: installed.id, grant: [...grant], acknowledgedNetHosts: [...(args.netHosts ?? [])] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  const [view] = await h.service.list({ caller });
  expect(view?.["status"]).toBe("enabled");
  expect(view?.grantedCapabilities).toEqual([...grant]);
  return installed.id;
}

/** The one room every delivery in this file is scoped to. The ONE cast seam: these tests never touch the
 *  chats table (a delivery is a push — the fan-out already admitted the room), so there is no row to mint an
 *  id from, and the id is only ever compared against itself. */
export const CHAT = castId<ChatId>("chat_1");

/** The chat scope a delivery carries: the admitted room plus whether the installer HOSTS it. */
export function chatScope(chatId: ChatId, canWrite: boolean): InvocationChat {
  return { chatId, canWrite, automationDepth: 0 };
}

/** A `messageCommitted` fact as the fan-out marshals it — the WIRE shape, whose ids are plain strings by
 *  contract (`triggerFactSchema`), re-branded only by a reader that re-queries them. */
export function messageFact(chatId: ChatId, content: string, role = "user"): string {
  return JSON.stringify({
    type: "messageCommitted",
    bus: "chat",
    chatId,
    message: { id: "msg_1", role, authorUserId: null, characterId: null, seq: 1, content },
  });
}
