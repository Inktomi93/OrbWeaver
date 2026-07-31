// The WEATHER axis — the closed eight-state vocabulary shared by `@orb/contracts`'s rpg ambient/tool wire
// schemas and `@orb/ui`'s Waystone (which owns one air-layer recipe per member).
//
// This is THE single home for the axis. It lives in `kit` — not `contracts` — because BOTH consumers must
// reach it and `ui` may import `kit` ONLY (never `contracts`, D54): homed in contracts, the Waystone would
// have to re-spell the eight tokens and the `no-inline-union-redecl` reach-guard could only EXEMPT that
// re-spell rather than kill it. Homed here, `WAYSTONE_WEATHERS` derives by identity and the contracts
// `z.enum(WEATHER_TYPES)` wire schema imports the tuple DOWN (the kit↔contracts tuple rule, mirrors
// `scroll-mode`/`message-role`).
//
// The members are the eight the stone actually PAINTS — the render is the reason the vocabulary is closed:
// a free string bins into these anyway, so binning at the WIRE (an enum the model must pick from) beats
// binning at the render (a resolver that silently degrades an unrecognized string). Vivid phrasing is not
// lost — it rides the ambient weather's free `label` beside the type ("torrential sleet" · `snow`), the
// relationship-kind `{kind, label}` precedent.

export const WEATHER_TYPES = ["clear", "cloudy", "rain", "storm", "snow", "fog", "wind", "ash"] as const;
export type WeatherType = (typeof WEATHER_TYPES)[number];
