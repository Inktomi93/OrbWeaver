import { tv } from "#lib";

// The typographic scale seal — STYLED-INTRINSIC (Base UI ships no text primitive; text is intrinsic),
// so this is the token type-scale, not a lib wrap. Every axis rides a DTCG token (UI-Architecture §3):
// `size` → the text-*/leading-* scale, `tone` → the color-* semantics. Shared by BOTH <Text> and
// <Heading> (one tv() per dir — gate ui-primitive-structure clause 2 forbids a second export).
//
// `weight` rides Tailwind's built-in font-weight utilities — there is NO DTCG weight token today
// (button.tsx's `font-medium` sets the same precedent). Since "hierarchy by weight" is a core design
// principle (UI-Architecture §4.1 — flat size scale, hierarchy carried by weight), these may be
// promoted to real tokens later; for now they stay un-tokenized. (A note, not a TODO.)
//
// `code` has no dedicated leading token (tokens.json carries leading.display/headline/title/body/label
// only) — it falls back to leading-body, the correct reading rhythm for inline/short code runs.
export const textVariants = tv({
  base: "font-sans",
  variants: {
    size: {
      display: "text-display leading-display",
      headline: "text-headline leading-headline",
      title: "text-title leading-title",
      body: "text-body leading-body",
      label: "text-label leading-label",
      code: "font-mono text-code leading-body",
      // micro-caps section-label voice (D62 UIP-103): 10.5px + the 0.08em micro tracking. Line-height
      // rides Tailwind's `leading-tight` (~1.2) untokenized — the same precedent as the un-tokenized
      // `font-*` weights below (no DTCG token for a value this close to 1.2; a `--leading-micro` would
      // be a token minted for a hair). Pair with weight="semibold" transform="caps" for the full voice.
      micro: "text-micro leading-tight tracking-micro",
    },
    weight: {
      regular: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
    },
    tone: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      accent: "text-primary",
      destructive: "text-destructive",
      success: "text-success",
      warning: "text-warning",
    },
    // The case transform (D62 UIP-103) — `caps` uppercases for the micro-caps label voice; `none` is
    // the identity default so every existing call site is unchanged. Orthogonal to `size`, so a caps
    // treatment can ride any scale (though `size="micro"` + `transform="caps"` is the canonical pair).
    transform: {
      none: "",
      caps: "uppercase",
    },
  },
  defaultVariants: { size: "body", weight: "regular", tone: "default", transform: "none" },
});
