// Reduced owner projections and admitted installer operations shared by host adapters.

import type { AssetId, ChatId, PluginId, UserId, WorldBookId } from "@orb/kit/ids";
import type { OwnedAssetBytes } from "#assets";
import type { Principal } from "#identity";
import type { NotificationEvent, NotificationType, PluginNotificationRecipient } from "#notifications";
import type { HistoryFloorSeq } from "../chat/roster.ts";
import type { PluginAssetView, PluginCharacterView, PluginMessageView, PluginSearchHit, PluginWorldBookView, PluginWorldEntryView } from "./host-v1.ts";
import type { PluginSuggestedAct } from "./suggestion.ts";

export interface PluginChatReads {
  /** Recent canon projected to the REDUCED plugin view (the read floor is "what a member sees").
   *  `capability: chat.read`.
   *
   *  `floorSeq` is REQUIRED, not optional, and is the D16 canon floor of the human this read runs for — the
   *  read returns only `messages.seq >= floorSeq`. It is required BY TYPE because the admission that reaches
   *  this op resolves membership only (`can(installer,"read",chat)` / `loadPresentRole`), and membership
   *  alone is not visibility: a `from-join`-clamped member is admitted to their room yet may not read its
   *  pre-join rows. A caller therefore cannot obtain the value without asking chat's `resolveViewerVisibility`
   *  first — {@link buildPluginBridge} is that caller, and a non-member short-circuits to `[]` there.
   *
   *  `readsHidden` is the SECOND half of the same viewer verdict (parity-plus §3.6 / D106): `true` when the
   *  human this read runs for is the chat HOST (they read hidden-class spans — the reveal plane), `false` for a
   *  member (hidden `<lie>`/`<ofilter>` spans are STRIPPED from the body before it crosses the realm boundary —
   *  the plugin realm is a member-reachable surface, so an unstripped body would launder a GM-plane secret to a
   *  non-host member's snippet). REQUIRED BY TYPE for the same reason as `floorSeq`: the only source is chat's
   *  `resolveViewerVisibility` (its `role`), so a caller cannot obtain it without the visibility resolve. */
  readonly listMessages: (
    chatId: ChatId,
    opts: { readonly limit?: number; readonly floorSeq: HistoryFloorSeq; readonly readsHidden: boolean },
  ) => Promise<readonly PluginMessageView[]>;
  /** The invocation chat's PRESENT CHARACTER roster, projected to the reduced `PluginCharacterView`
   *  (`chat.listCharacters`, capability `chat.read` — #788 F11). PRINCIPAL-FREE, the `listMessages` posture: the
   *  bridge resolves the installer's membership via `resolveViewerVisibility` FIRST and short-circuits a
   *  non-member to `[]`, so this read is reached only for a member of THIS room and carries no owner filter (a
   *  room's roster is the room's own member-visible state). Wired at compose to the principal-free
   *  `loadPluginCharacters` reader. Reduced to id/name/avatar — never a co-participant's full card. */
  readonly listCharacters: (chatId: ChatId) => Promise<readonly PluginCharacterView[]>;
}

export interface PluginWorldInfoReads {
  /** Is the guest-named book attached to the ADMITTED chat? The attachment IS the room's consent to that
   *  book's prompt content, so a plugin invoked in chat X may not write a book attached only to chat Y (both
   *  can be owned by the same installer, which is all the shared writer's ownership gate can see). Wired at
   *  compose to world-info's own member-gated `listForChat` front door. */
  readonly isBookAttachedToChat: (ownerId: UserId, chatId: ChatId, bookId: WorldBookId) => Promise<boolean>;
  /** The book's existing entry TITLES, for the per-plugin entry ceiling (a looping guest fills a book
   *  otherwise). Wired at compose to world-info's owner-gated `listEntryIndex`. */
  readonly listEntryTitles: (ownerId: UserId, bookId: WorldBookId) => Promise<readonly string[]>;
  /** The `worldinfo.read` READ half (#788 F12): the books ATTACHED to the invocation chat, reduced to
   *  `PluginWorldBookView`. Wired at compose to world-info's member-gated `listForChat` under the installer's
   *  Principal — so a non-member/kicked caller gets `[]` and only books attached to THIS room are ever named.
   *  Owner-scoped by construction: the installer's own attached books. */
  readonly listBooksForChat: (ownerId: UserId, chatId: ChatId) => Promise<readonly PluginWorldBookView[]>;
  /** The `worldinfo.read` entry read (#788 F12): the entries of ONE book, reduced to `PluginWorldEntryView`.
   *  Wired at compose to world-info's OWNER-gated `listEntries`. The ATTACHMENT gate is applied by the bridge
   *  BEFORE this op (the write path's own `isBookAttachedToChat`), so a `bookId` not attached to the invocation
   *  chat never reaches here — this op reads only an already-attachment-verified, installer-owned book. */
  readonly listEntries: (ownerId: UserId, bookId: WorldBookId) => Promise<readonly PluginWorldEntryView[]>;
}

export interface PluginAssetReadOps {
  readonly read: (req: {
    readonly installerUserId: UserId;
    // eslint-disable-next-line orb/brand-in-name-position -- the guest's untrusted wire string, owner-scope-gated by the domain read, cast at compose — branding here would claim a validation this boundary has not performed.
    readonly assetId: string;
  }) => Promise<PluginAssetView | null>;
}

export interface PluginDocumentReads {
  readonly documents: (req: { readonly installerUserId: UserId; readonly queryText: string; readonly limit?: number }) => Promise<readonly PluginSearchHit[]>;
}

export interface PluginNotificationDelivery {
  readonly emit: (event: NotificationEvent) => Promise<void>;
  /** The STANDING-ASK TRIO (#1041) the consent prompt drives — a standing ask is a claim that stays true,
   *  so it has three moves an episodic event does not, and the CALLER picks by what actually changed:
   *   - `emitStanding` — the ask GREW: record the event as the recipient's ONE live row of its type
   *     (any active row of that type is superseded in the same batch) and re-badge. New information.
   *   - `refreshStanding` — the ask SHRANK: correct the SAME row's payload in place (`seq`/`readAt`
   *     untouched), so answering nine asks one at a time never re-badges the bell nine times.
   *   - `retractStanding` — the ask is GONE: withdraw the row. There is no zero-count event to record.
   *  All three are no-ops for a reader who dismissed the row (no active row of the type), which is the
   *  settled state, not a reason to resurrect it. Wired at compose to `notifications.record`
   *  (`supersedeActiveOfSameType`) / `notifications.refreshStanding` / `notifications.retract`, each +
   *  the per-user bus publish. Capability: NONE — host-internal, never reachable from a guest. */
  readonly emitStanding: (event: NotificationEvent) => Promise<void>;
  readonly refreshStanding: (event: NotificationEvent) => Promise<void>;
  readonly retractStanding: (req: { readonly recipientUserId: UserId; readonly type: NotificationType }) => Promise<void>;
}

export interface PluginNotificationPost {
  readonly post: (req: {
    readonly pluginId: PluginId;
    readonly installerUserId: UserId;
    readonly chatId: ChatId;
    readonly recipient: PluginNotificationRecipient;
    readonly message: string;
  }) => Promise<void>;
}

export interface PluginQuickReplySurface {
  readonly surface: (req: {
    readonly pluginId: PluginId;
    readonly chatId: ChatId;
    readonly choices: readonly { readonly label: string; readonly sendText: string }[];
  }) => Promise<void>;
}

/** The caller's leak-free chat authority for the snippet gate: `canRead` admits the chat at all,
 *  `canWrite` unlocks the write half of the fixed profile (host authority). An unknown/foreign chat resolves
 *  to `{false,false}` — indistinguishable from a no-access chat (the loadPresentRole compose-gate semantics),
 *  so a snippet against a chat the caller cannot see is refused NOT_FOUND, never given an existence oracle. */
export interface ChatAuthority {
  readonly canRead: boolean;
  readonly canWrite: boolean;
}
export type ResolvePluginChatAuthority = (caller: Principal, chatId: ChatId) => Promise<ChatAuthority>;
export type ReadPluginBundleBytes = (caller: Principal, assetId: AssetId) => Promise<OwnedAssetBytes>;
export type ReadPublishedPluginBundle = (assetId: AssetId) => Promise<Uint8Array>;
export type ListPluginRecipients = (caller: Principal) => Promise<readonly Principal[]>;

/** Execute a CONFIRMED plugin-origin act through `domain/plugin`'s own bridge — declared here as a TYPE and
 *  wired at `entry/compose` (the cake: automation never imports plugin). The op rebuilds the plugin's bridge
 *  from the `pluginId` + installer, so the confirmed act takes the plugin's OWN gates and belts, and re-checks
 *  nothing about authority: the confirm verb already gated the host, claimed the ask take-once, and re-ran
 *  the actor's host authority. Rejects on any refusal; the verb surfaces it as `action_error`. */
export type ExecutePluginSuggestion = (req: {
  readonly pluginId: PluginId;
  readonly installerUserId: UserId;
  readonly chatId: ChatId;
  readonly act: PluginSuggestedAct;
}) => Promise<void>;
