// The WEATHER axis — the closed nine-state vocabulary shared by `@orb/contracts`'s rpg ambient/tool wire
// schemas and `@orb/ui`'s Waystone (which owns one air-layer recipe per member).
//
// This is THE single home for the axis. It lives in `kit` — not `contracts` — because BOTH consumers must
// reach it and `ui` may import `kit` ONLY (never `contracts`, D54): homed in contracts, the Waystone would
// have to re-spell the eight tokens and the `no-inline-union-redecl` reach-guard could only EXEMPT that
// re-spell rather than kill it. Homed here, `WAYSTONE_WEATHERS` derives by identity and the contracts
// `z.enum(WEATHER_TYPES)` wire schema imports the tuple DOWN (the kit↔contracts tuple rule, mirrors
// `scroll-mode`/`message-role`).
//
// The members are the nine the stone actually PAINTS — the render is the reason the vocabulary is closed:
// a free string bins into these anyway, so binning at the WIRE (an enum the model must pick from) beats
// binning at the render (a resolver that silently degrades an unrecognized string). Vivid phrasing is not
// lost — it rides the ambient weather's free `label` beside the type ("torrential sleet" · `snow`), the
// relationship-kind `{kind, label}` precedent.
//
// `indoors` is the OCCLUSION member (owner ladder, 2026-08-07, dogfood SCENE-DROPPED): the eight sky states
// could only describe a sky the scene can SEE, so an interior scene had no legal value — and `update_scene`
// is a single-schema call, so one unwritable field cost the whole scene write (location, recentEvent and all)
// until the EXT-4a per-field salvage landed. Even after salvage it left a standing
// `salvagedFields:["update_scene.weather"]` on every indoor beat: a closed enum announcing its own hole.
// `indoors` is the exact token the live model reached for, unprompted, on both failing chats.
//
// It is NOT a ninth kind of sky — it is "no sky is visible from here", which is a fact ABOUT the sky and so
// belongs on this axis rather than in `location`. The extraction prompt's weather paragraph is written to
// match (`contracts/src/rpg/extraction-prompt.ts`): the room's own atmosphere still goes in `location`;
// `indoors` is reserved for the enclosed scene with no view out. `dusk` stays excluded from `TIME_OF_DAY`
// (standing taste ruling, `contracts/src/rpg/ambient.ts`) — that one is a near-synonym of `evening`, which
// is a different problem from a state the vocabulary cannot express at all.

export const WEATHER_TYPES = ["clear", "cloudy", "rain", "storm", "snow", "fog", "wind", "ash", "indoors"] as const;
export type WeatherType = (typeof WEATHER_TYPES)[number];
