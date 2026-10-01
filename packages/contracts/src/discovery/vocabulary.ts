/** Scene groups tier-zero digests; arc groups higher-tier syntheses. */
export const THEME_LEVELS = ["scene", "arc"] as const;
export type ThemeLevel = (typeof THEME_LEVELS)[number];
