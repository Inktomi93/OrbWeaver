// @orb/contracts/chat/content-classes — the CONTENT-CLASS VISIBILITY REGISTRY (parity-plus §3.1): two
// orthogonal planes per embedded content class — reading-surface `{show|hide}` (does the human reader SEE
// it?) × wire `{full|stub|drop}` (what does the MODEL receive on subsequent turns?). ONE open registry, one
// row per class; the two projection seams are TOTAL over it (render: `contentSpansToBlocks` / the client
// filter; wire: the server `toContentParts` arm) — a future class (a thoughts channel, a GM-notes channel)
// is a REGISTRATION, not a build (graft #V1).
//
// The registry keys off the KIT span-kind axis (`ContentSpanKind`, `@orb/kit/content`) — the axis homes in
// kit because the tokenizer (kit) must read the tag/fence registries and the cake forbids kit→contracts
// (D54 axis-home-follows-reachability); the POLICY homes here because it is cross-boundary vocabulary both
// server (wire seam) and client (render filter) consume.
//
// A THIRD dimension exists but is NOT a plane here: the SERVER MEMBER-STRIP (§3.6) applies to the `hidden`
// class ONLY — hidden-class bytes never reach a non-host member's payload (`domain/chat` substrate
// `member-visibility`, the trust boundary). `unknown-directive` shares `{hide, full}` (display noise is
// stripped from the READING surface, the wire transcript stays honest) but is NOT member-stripped — it is
// noise, not a secret.

import type { ContentSpanKind } from "@orb/kit/content";

/** One content class's two-plane policy (§3.1). `reading` drives the render projection (a `hide` class
 *  emits NO render block); `wire` drives the server history projection (`full` = verbatim bytes, `stub` =
 *  the deterministic compact stand-in, `drop` = resolve-or-drop like image refs). */
export interface ContentClassPolicy {
  readonly reading: "show" | "hide";
  readonly wire: "full" | "stub" | "drop";
}

/** The shipped cells (§3.1 — the rationale column lives in the spec table):
 *  `text` show/full — the baseline; `image` show/drop — ATTACHMENT-ONLY (owner ruling, ST parity): only a
 *  deliberate user attachment (an owned-CAS `asset:` ref on a user-authored row) is a resolve-or-drop→alt
 *  candidate gated by `input.vision`; EVERY other embedded image — a character card's greeting picture, a
 *  world-info illustration, narrator/`/imagine` media, a pasted link — is DISPLAY-ONLY: it renders in the
 *  transcript forever and rides as a short `[image: alt]` marker, never as a model-visible image part (the
 *  gate is `isUserAttachment` in the chat engine's pipeline); `hidden` hide/full — `<lie>`/`<ofilter>`: the reader never sees it, the model
 *  MUST remember its own lie/the true event; `card` show/stub — the reader keeps the rich card forever,
 *  the model gets `[card: title]` not the multi-KB blob (M2 keep-last-X excepts the newest X); `choices`
 *  show/drop — buttons for the reader, but the CYOA fence is STRIPPED from the model wire on later turns
 *  (the user's pick already became a real user turn — unselected options must not pile up in context);
 *  `unknown-directive`
 *  hide/full — the §3.2.1 allowlist-strip (a hallucinated command tag/fence never renders as garbage; the
 *  wire keeps the model's bytes). The `Record<ContentSpanKind, …>` is the compile-force: a new span kind
 *  will not build until it declares its row. */
export const CONTENT_CLASS_POLICY: Readonly<Record<ContentSpanKind, ContentClassPolicy>> = {
  text: { reading: "show", wire: "full" },
  image: { reading: "show", wire: "drop" },
  hidden: { reading: "hide", wire: "full" },
  card: { reading: "show", wire: "stub" },
  choices: { reading: "show", wire: "drop" },
  "unknown-directive": { reading: "hide", wire: "full" },
};
