// @orb/contracts/plugin/bridge — the domain↔infra op-bridge WIRE (P4b-CORE). `infra/plugin-host` cannot import
// a domain (plugin-no-ambient) and the domain never imports `#infra`, so the shape the membrane's host functions
// call across that seam has its ONE home here in the cake — below both. `domain/plugin` BUILDS a `PluginBridge`
// (adapting `PluginHostOps` per-installer: closing global-vars over the installer, mapping worldInfo/imagery to
// the membrane's arg/result shapes) and gates the chat authority UPSTREAM; `infra/plugin-host` consumes it
// authority-blind — every function receives an ALREADY-ADMITTED `ChatId` (the domain's invocation-chat-context
// admission did the `can(installer,"read"/"host",chat)` check). Infra therefore never sees a Principal or roster.

import type { ChatId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type { GenerateImageActionArgs } from "#imagery";
import type { NotificationRecipient } from "#notifications";
import type { PluginMessageView, PluginWorldEntryUpsert } from "./host-v1";

/** The JSON-shaped, authority-agnostic op bridge the membrane calls (01 §2). Chat-scoped fns take an admitted
 *  `ChatId`; global-vars is pre-scoped to the installer by the domain builder. Exposes the composable set:
 *  chat.read / chat.variables.write / global_vars + the two host-gated writers worldInfo + imagery (the domain
 *  builder closes each over the installer — worldInfo maps the guest entry onto the shared `upsertEntries`
 *  writer, imagery onto the `{assetId}` front door). The write ceiling (host authority) is enforced UPSTREAM in
 *  the membrane via `InvocationChat.canWrite`; the bridge only ever receives already-admitted ids. */
export interface PluginBridge {
  readonly chat: {
    readonly listMessages: (chatId: ChatId, limit: number | undefined) => Promise<readonly PluginMessageView[]>;
    readonly getVariables: (chatId: ChatId) => Promise<Record<string, string>>;
    readonly applyVariableOps: (chatId: ChatId, ops: readonly VarOp[]) => Promise<void>;
    /** Request an autonomous turn (01 §2 `chat.requestTurn`, turn.trigger — SPEND). The membrane passes the
     *  ALREADY-ADMITTED `chatId` (the invocation-chat-context ran `can(installer,"host",chat)` → `canWrite`),
     *  the CHILD cascade depth to stamp (already-incremented; the domain seam refuses past the hard cap), and the
     *  guest-supplied speaker/guided hints. The FUNDER is closed over by the domain builder (the installer —
     *  NEVER infra/guest-supplied); chat's `requestTurn` resolves the funding box from the room host, gates the
     *  funder's membership (leak-free NOT_FOUND), and runs the D17 by-proxy consent + per-member budget belts —
     *  so infra stays authority-blind. */
    readonly requestTurn: (chatId: ChatId, automationDepth: number, p: { readonly speakerCharacterId?: string; readonly guided?: string }) => Promise<void>;
  };
  readonly worldInfo: {
    /** Upsert one attached-book entry (01 §2 `worldInfo.upsertEntry`). The entry carries its own `bookId`; the
     *  domain builder resolves the installer's Principal and maps to the shared `upsertEntries` writer, so a
     *  cross-owner book write is refused by the writer's ownership gate. */
    readonly upsertEntry: (entry: PluginWorldEntryUpsert) => Promise<void>;
  };
  readonly imagery: {
    /** SPEND-classed generation (01 §2 `imagery.generatePicture`); returns the primary image's asset id. The
     *  domain builder closes over the installer for connection + spend attribution. */
    readonly generatePicture: (chatId: ChatId, args: GenerateImageActionArgs) => Promise<{ readonly assetId: string }>;
  };
  readonly variables: {
    readonly get: (key: string) => Promise<string | null>;
    readonly set: (key: string, value: string) => Promise<void>;
    readonly delete: (key: string) => Promise<void>;
  };
  /** The plugin-PRIVATE KV (01 §2 `storage.*`). Distinct from `variables` (the installing USER's namespace,
   *  shared with macros/CEL): `storage` is per plugin × installing owner (the `plugin_kv` plane). The domain
   *  builder closes each op over the concrete `pluginId` + installer, so a cross-plugin (or cross-owner) read is
   *  structurally impossible — the guest supplies ONLY the key/prefix. The value/key-size + 256-key caps are
   *  enforced host-side by the domain op (02 §3). */
  readonly storage: {
    readonly get: (key: string) => Promise<string | null>;
    readonly set: (key: string, value: string) => Promise<void>;
    readonly delete: (key: string) => Promise<void>;
    readonly list: (prefix: string | undefined) => Promise<readonly string[]>;
  };
  /** Post a durable `automation-notice` to the chat's PARTICIPANTS (01 §2 `notifications.post`; the recipient
   *  rule per automation-design/03 §1.5). The membrane passes the ALREADY-ADMITTED `chatId` + the guest recipient
   *  selector + the (host-capped) message; the domain builder closes over the `pluginId` (the notice source) +
   *  installer, resolves the recipient set DOMAIN-side (host = the installer; all_members = the present human
   *  roster — a plugin can never notify a non-participant), and emits through the SAME durable inbox path a
   *  `post_notification` arm uses. */
  readonly notifications: {
    readonly post: (chatId: ChatId, recipient: NotificationRecipient, message: string) => Promise<void>;
  };
  /** Surface transient quick-reply chips into the admitted chat (01 §2 `surfaceQuickReply`; the automation-bus
   *  `quickReplySurfaced` event — 03 §1.4). Host-authority gated UPSTREAM in the membrane (same write ceiling as
   *  the plugin's other chat writes) via `InvocationChat.canWrite`. The domain builder closes over the `pluginId`
   *  (stamped as the emit `source`) + the injected bus sink (`publishAutomationEvent`, composed UP — infra never
   *  imports transport). Transient (no row): the chips are ephemeral display strings. */
  readonly surfaceQuickReply: (chatId: ChatId, choices: readonly { readonly label: string; readonly sendText: string }[]) => Promise<void>;
}

/** The admitted invocation chat + whether the acting principal is HOST of it (the write ceiling — 02 §2:
 *  variables.write / worldinfo.write / imagery.generate are host-gated). The domain sets it per-invocation
 *  (fixed for a snippet's single run; re-set before each resident tool handler call). `null` = no chat scope
 *  (an installed plugin's `activate` run — `chat.current()` throws). */
export interface InvocationChat {
  readonly chatId: ChatId;
  readonly canWrite: boolean;
  /** The cascade depth of the CONTEXT this invocation runs in (the loop-prevention lever — automation-design/03
   *  §4; mirrors requestTurn's `automationDepth` param, the `messages.automationDepth` column, and the fact's
   *  depth). A resident TOOL handler in a human turn = 0 (the human turn is the cascade root); an EVENT handler
   *  = the resolved depth of the turn that triggered the fact. A guest `chat.requestTurn` stamps `+1` at the
   *  membrane boundary — requestTurn refuses a child depth past the hard cap, so a plugin can never launder an
   *  event→turn→event loop past the ceiling. */
  readonly automationDepth: number;
}
