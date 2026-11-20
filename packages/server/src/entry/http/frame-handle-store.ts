// entry/http/frame-handle-store — the ONE per-user opaque-handle store behind every routed frame doorway (the
// card frame, `card-frame.ts`; the plugin frame, `plugin-frame.ts`). Extracted at U7 rather than copied,
// because what it implements is a SECURITY primitive and "a second spelling of a security policy is the defect
// this prevents" (`@orb/kit/card-frame`'s own header, about the CSP one layer down). A duplicated eviction loop
// or a duplicated owner check is two places for the no-existence-leak property to be true in only one of them.
//
// ── WHAT A HANDLE IS ─────────────────────────────────────────────────────────────────────────────────────────
// 128 bits of CSPRNG, bound to the minting `userId`, living in a capped in-process map. So a link an attacker
// crafts resolves in nobody's store but the victim's — and a foreign or unknown id is indistinguishable from an
// expired one (the `/api/blob` no-existence-leak precedent). Nothing persists: the document bytes never reach
// disk through either route.
//
// THE OWNER CHECK IS THE LAST WORD AND NEVER FALLS THROUGH TO A DIFFERENT ANSWER — `take` returns `undefined`
// for a foreign owner exactly as it does for a miss, so a caller cannot accidentally build two response arms.
//
// ── THE CEILINGS, ALL ENFORCED ───────────────────────────────────────────────────────────────────────────────
// Count AND bytes, because a document's size varies by three orders of magnitude: a count-only cap would let
// max-size documents pin far more than the byte ceiling, a byte-only cap would let a flood of tiny ones pin an
// unbounded map. A PER-USER count and byte ceiling sits under the process one, so a viewer's own mints evict that
// viewer's oldest documents first and one account alone cannot push another member's open frames out. Oldest-first
// eviction (Map iteration is insertion-ordered, so the first matching key IS the oldest handle); a victim of
// eviction re-mints. Each doorway passes its own ceilings and gets its own store.
//
// SIZED for framed replies (D354), measured on a heavy public preset's display scripts: the longest reply (a
// six-tracker scene) mints a 279,294-byte body (204,544 chars of markup, 58,319 of matched app CSS, the token set),
// so its stored document is about 0.27 MiB. A reply that splits on dice, choices or media stores one document per
// run, and each run carries the other runs' stylesheets. Measured through the real transcript, app stylesheet match
// and mint, with panels sized to that preset's six heaviest stylesheets and that reply's markup, the reply stores
// four documents, 0.72 MiB, at three splits, and eleven, 1.77 MiB, at ten. A ten-split reply is taller than the
// window, so the transcript mounted three such rows (the visible one and the two the virtual list renders past its
// edge), 33 documents, at phone and desktop sizes alike. A store keeps every document a reader minted until it
// expires, mounted or not, so the sizing screen is sixteen framed rows (the visible rows, the rows past each edge,
// and up to eight card rows kept mounted): 16 documents and 4.2 MiB unsplit, 64 and 11.5 MiB at three splits, 176
// and 28.4 MiB at ten.
//
// A reply still streaming adds FORMING documents, one per complete panel (D354): at most eight panels a stream, each
// minted once plus one re-mint after a lost handle, so sixteen documents. Each carries one panel's markup, the app CSS
// that markup matches and the earlier panels' sheets, so it is no larger than the settled document of the same reply,
// and sixteen stay under 4.4 MiB. Every viewer watching the stream mints its own. A forming document is counted like
// any other until its stream's turn ends in the room, when the store drops it (`dropForming`): by then the settled
// reply mints its own frame, and a forming frame on screen has already loaded its document.
//
// THE CARD FRAME'S per-user byte ceiling, 64 MiB, holds the ten-split screen twice over and the three-split screen
// five times, with a stream's forming documents beside either. Its count ceiling is that byte ceiling's worth of ten-split documents (about 400), rounded up. Its
// process ceiling holds four viewers at their ceiling. The plugin frame mints one document per open surface and
// never splits, so it keeps the unsplit sizing: 8 MiB a viewer, four viewers.
//
// WHAT ONE SIGNED-IN ACCOUNT CAN PIN: 64 MiB in the card store and 8 MiB in the plugin store. Four or more accounts
// together reach the process ceilings, 256 MiB and 32 MiB, and pin no more. The bytes are counted as UTF-8, and V8
// holds a string that has any character past Latin-1 at two bytes a character, so the heap can carry up to twice
// those figures. A document is served for 30 minutes after its last serve. Its bytes stay counted until a lookup
// finds it expired or a later mint evicts it, so an idle account's documents stay pinned until the ceilings push
// them out.
//
// TTL SLIDES ON EACH SERVE — a transcript or a room left open re-frames on remount (lazy iframes refetch) and
// must not find a hole where its document was. The slide costs a timestamp write and bounds retention to "the
// tab that is looking at it".

import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import type { Principal } from "@orb/contracts/identity";
import type { CardFrameMediaPolicy, CardFramePosture } from "@orb/kit/card-frame";
import type { CharacterId, ChatId, PluginId, UserId } from "@orb/kit/ids";
import { MS_PER_MINUTE } from "@orb/kit/time";

/** A handle lives 30 minutes, sliding on each serve. */
const TTL_MINUTES = 30;
export const FRAME_HANDLE_TTL_MS = TTL_MINUTES * MS_PER_MINUTE;

const BYTES_PER_MIB = 1_048_576;
const ID_BYTES = 16;

/** One doorway's retention ceilings: per account and per process, in UTF-8 bytes and in documents. */
export interface FrameHandleCeilings {
  readonly userBytes: number;
  readonly userEntries: number;
  readonly totalBytes: number;
  readonly totalEntries: number;
}

const CARD_USER_MIB = 64;
const CARD_USER_ENTRIES = 512;
const CARD_VIEWERS_AT_CEILING = 4;

/** The card frame's ceilings, sized from the split-reply screen in the header. */
export const CARD_FRAME_CEILINGS: FrameHandleCeilings = {
  userBytes: CARD_USER_MIB * BYTES_PER_MIB,
  userEntries: CARD_USER_ENTRIES,
  totalBytes: CARD_VIEWERS_AT_CEILING * CARD_USER_MIB * BYTES_PER_MIB,
  totalEntries: CARD_VIEWERS_AT_CEILING * CARD_USER_ENTRIES,
};

const PLUGIN_USER_MIB = 8;
const PLUGIN_USER_ENTRIES = 256;
const PLUGIN_VIEWERS_AT_CEILING = 4;

/** The plugin frame's ceilings: one document per open surface. */
export const PLUGIN_FRAME_CEILINGS: FrameHandleCeilings = {
  userBytes: PLUGIN_USER_MIB * BYTES_PER_MIB,
  userEntries: PLUGIN_USER_ENTRIES,
  totalBytes: PLUGIN_VIEWERS_AT_CEILING * PLUGIN_USER_MIB * BYTES_PER_MIB,
  totalEntries: PLUGIN_VIEWERS_AT_CEILING * PLUGIN_USER_ENTRIES,
};

/** The handle grammar. A path segment that does not match never reaches the store at all — checked by the
 *  caller BEFORE `take`, so a traversal attempt is refused by shape rather than by lookup. */
export const FRAME_HANDLE_SHAPE = /^[0-9a-f]{32}$/u;

/** One stored document. `csp` rides WITH the bytes rather than being recomputed at serve time: the policy a
 *  document is served under must be the one decided when it was minted, not one re-derived later from settings
 *  that may since have changed. The one exception only TIGHTENS: `grant`. Not exported: consumers hand
 *  `put` an object literal and read `take`'s result through {@link FrameHandleStore}, so this shape has no
 *  cross-module caller (knip). */
type FrameHandleScope = {
  readonly userId: UserId;
  readonly csp: string;
  expiresAt: number;
} & (
  | {
      /** A named card rechecks its selector's grants at serve time. An unnamed card carries no grant. */
      readonly grant?: {
        readonly chatId: ChatId;
        readonly characterId: CharacterId;
        /** The other authors whose stylesheets the document carries, rechecked with the selector. */
        readonly carriedFrom: readonly CharacterId[] | undefined;
        readonly media: CardFrameMediaPolicy;
        readonly posture: CardFramePosture;
      };
      /** A forming document (a panel of a reply still streaming) and the room it streams in: dropped when a turn there ends. */
      readonly formingIn?: ChatId;
      readonly plugin?: never;
    }
  | {
      /** Plugin assets resolve under the authenticated mint's identity. */
      readonly plugin: {
        readonly caller: Principal;
        readonly pluginId: PluginId;
        readonly surfaceId: string;
      };
      readonly grant?: never;
      readonly formingIn?: never;
    }
);

type FrameHandleEntry = FrameHandleScope & { readonly doc: string; readonly bytes: number };

type FrameHandlePut = FrameHandleScope & {
  /** Plugin documents need their own minted id while assembling the injected asset URL. */
  readonly doc: string | ((id: string) => string);
};

export interface FrameHandleStore {
  /** Store a document and return its opaque handle. */
  readonly put: (entry: FrameHandlePut) => string;
  /** Resolve a handle FOR `userId`. `undefined` for unknown, expired, AND foreign — one answer, no oracle. */
  readonly take: (id: string, userId: UserId) => FrameHandleEntry | undefined;
  /** Resolve by the high-entropy capability itself. Only for passive frame subresources, whose opaque-origin
   *  requests cannot carry the app's SameSite session cookie. */
  readonly peekByHandle: (id: string) => FrameHandleEntry | undefined;
  /** Slide a capability handle only after its subresource request passed every route/domain gate. */
  readonly touch: (id: string) => void;
  /** Revoke one owner's handle. Miss and foreign owner are the same `false` answer. */
  readonly drop: (id: string, userId: UserId) => boolean;
  /** Drop every account's forming documents for `chatId`: a turn there ended, so its streamed panels are done. */
  readonly dropForming: (chatId: ChatId) => void;
}

/** Create a per-process handle store. Created per registrar call, so a test gets a clean one. */
export function createFrameHandleStore(now: () => number, ceilings: FrameHandleCeilings): FrameHandleStore {
  const entries = new Map<string, FrameHandleEntry>();
  const userBytes = new Map<UserId, number>();
  const userEntries = new Map<UserId, number>();
  let totalBytes = 0;

  const drop = (id: string): boolean => {
    const found = entries.get(id);
    if (found !== undefined) {
      totalBytes -= found.bytes;
      const remaining = (userBytes.get(found.userId) ?? 0) - found.bytes;
      const count = (userEntries.get(found.userId) ?? 0) - 1;
      if (count > 0) {
        userBytes.set(found.userId, remaining);
        userEntries.set(found.userId, count);
      } else {
        userBytes.delete(found.userId);
        userEntries.delete(found.userId);
      }
      entries.delete(id);
      return true;
    }
    return false;
  };

  // The oldest handle `owner` holds other than `keep`, or the oldest of anyone's when `owner` is undefined.
  const oldest = (keep: string, owner: UserId | undefined): string | undefined =>
    entries.entries().find(([id, entry]) => id !== keep && (owner === undefined || entry.userId === owner))?.[0];

  const evictFor = (id: string, owner: UserId): void => {
    while ((userBytes.get(owner) ?? 0) > ceilings.userBytes || (userEntries.get(owner) ?? 0) > ceilings.userEntries) {
      const victim = oldest(id, owner);
      if (victim === undefined) {
        break;
      }
      drop(victim);
    }
    while (entries.size > ceilings.totalEntries || totalBytes > ceilings.totalBytes) {
      const victim = oldest(id, undefined);
      if (victim === undefined) {
        break;
      }
      drop(victim);
    }
  };

  const live = (id: string): FrameHandleEntry | undefined => {
    const found = entries.get(id);
    if (found === undefined) {
      return;
    }
    if (found.expiresAt <= now()) {
      drop(id);
      return;
    }
    return found;
  };

  return {
    put: (entry): string => {
      const id = randomBytes(ID_BYTES).toString("hex");
      const doc = typeof entry.doc === "function" ? entry.doc(id) : entry.doc;
      const bytes = Buffer.byteLength(doc, "utf8");
      entries.set(id, { ...entry, doc, bytes });
      totalBytes += bytes;
      userBytes.set(entry.userId, (userBytes.get(entry.userId) ?? 0) + bytes);
      userEntries.set(entry.userId, (userEntries.get(entry.userId) ?? 0) + 1);
      evictFor(id, entry.userId);
      return id;
    },
    take: (id, userId): FrameHandleEntry | undefined => {
      const found = live(id);
      if (found === undefined) {
        return;
      }
      if (found.userId !== userId) {
        return;
      }
      found.expiresAt = now() + FRAME_HANDLE_TTL_MS;
      return found;
    },
    peekByHandle: (id): FrameHandleEntry | undefined => live(id),
    touch: (id): void => {
      const found = live(id);
      if (found !== undefined) {
        found.expiresAt = now() + FRAME_HANDLE_TTL_MS;
      }
    },
    drop: (id, userId): boolean => {
      const found = live(id);
      return found?.userId === userId ? drop(id) : false;
    },
    dropForming: (chatId): void => {
      for (const [id, entry] of [...entries]) {
        if (entry.formingIn === chatId) {
          drop(id);
        }
      }
    },
  };
}
