// @orb/contracts/rpg — the front-door for the RPG lite substrate wire contracts (rpg-design/05 §4.1). The
// shapes are split across sibling modules by concern (D15's directory-module law: internals flat, this
// index re-exports, consumer-invisible):
//   • enums.ts    — the string-union tuples (mode/status/quest/journal/checkpoint/widget), CHECK-derived in db
//   • mode.ts     — the `MODE_POLICY` exhaustive record + the mode capability axis (§2.2)
//   • profile.ts  — `statProfile` as data + the three packaged profiles (§2.3)
//   • sheet.ts    — the per-actor identity sheet (§4.3)
//   • actor.ts    — the actor ref + `actorRefKey` + per-actor volatile (wallet/inventory first-class, §2.6)
//   • ambient.ts  — clock/weather/time-of-day, engine-shaped, born nullable (§2.7)
//   • snapshot.ts — quest/objective/present-character/widget + the swipe-volatile snapshot state (§2.4-2.5)
//   • config.ts   — the `rpg_games.config` blob (statProfile + lite dials, §4.1)
//   • pointer.ts  — the opaque `chats.metadata.rpg` sync pointer, mode-free `{gameId}` (§2.1)
//   • views.ts    — the CP read-view projections (getGame/getTrackerView/getConfigView, §4.8)
//
// PARKED: the feature-root rpg bus (§4.9) re-lands in W1c WITH its full belt set (the coverage gate + the
// client total-map) — the D72 machine-ships-with-its-seal rule means the belts can't wire before their
// producer emit sites (W1c) and client invalidation keys (W2) exist, so the bus union sequences with them.
//
// LAWS honored across these modules:
//   • No `ownerId` (D23): every rpg shape is authority-derived through the chat FK chain; no wire shape
//     stamps an rpg owner.
//   • One home per axis (§5.5): every string union is a tuple here; the db CHECK derives from it, no re-spell.
//   • Tool args are PROJECTION-CLEAN (tools.ts): no `.transform()`/branded ids (z.toJSONSchema throws on them).
//   • KISS/YAGNI SUSPENDED: the full-mode shape ships as DATA from day one so full grafts add siblings, never
//     re-spell (the graft-map invariant, §C).

export * from "./actor";
export * from "./ambient";
export * from "./config";
export * from "./enums";
export * from "./mode";
export * from "./pointer";
export * from "./profile";
export * from "./sheet";
export * from "./snapshot";
export * from "./tools";
export * from "./views";
