// The scopes a primitive's paint is read under: Hearth, every shipped seed, and a custom scope nested in a seed.
// The seed list derives from the generated tuple, so a new seed is a new case in every suite that sweeps them.
import { SEED_THEME_NAMES, TOKENS } from "@orb/ui/tokens";

/** The accent a scope inherits from Hearth, the shipped app theme, when it carries none of its own. */
export const HEARTH_ACCENT = TOKENS["color.primary"].value;

/** A neutral mid-grey, where a fixed-colour edge has the least room on either side. */
export const MID_GREY = "oklch(0.6 0 0)";

/** Hearth (no `data-theme`) and every shipped seed palette. */
export const SEED_SCOPES = [{ name: "hearth seed" }, ...SEED_THEME_NAMES.map((theme) => ({ name: `${theme} seed`, theme }))] as const;

/** Every seed scope and a custom mid-grey scope nested in the light seed, as the shell root hands one down. */
export const SEED_CASES = [...SEED_SCOPES, { name: "custom mid-grey scope nested in the light seed", theme: "light" as const, background: MID_GREY }] as const;
