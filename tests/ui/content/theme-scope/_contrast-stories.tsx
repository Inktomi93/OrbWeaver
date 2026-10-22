import { CtIsolation } from "@orb/testkit/browser/ct-isolated-subject.tsx";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { CSSProperties, ReactElement } from "react";

const SEMANTIC_PAIRS = [
  ["background", "foreground"],
  ["surface-raised", "foreground"],
  ["card", "foreground"],
  ["card", "card-foreground"],
  ["popover", "popover-foreground"],
  ["sidebar", "sidebar-foreground"],
  ["accent", "accent-foreground"],
  ["sidebar-accent", "sidebar-accent-foreground"],
  ["secondary", "secondary-foreground"],
] as const;
const MUTED_HOSTS = ["background", "card", "popover", "sidebar", "secondary", "muted"] as const;
const INPUT_HOSTS = ["background", "card", "popover"] as const;
const SAMPLE_STYLE: CSSProperties = { margin: 0, padding: "1rem", minHeight: "3rem" };

export function SemanticContrastStory({ background }: { readonly background: string }): ReactElement {
  return (
    <CtIsolation subject="ThemeScope" isolates="Domain-free emitted theme tokens and browser color composition">
      <ThemeScope tokens={{ background }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 16rem)" }}>
          {SEMANTIC_PAIRS.map(([surface, ink]) => (
            <p key={`${surface}-${ink}`} style={{ ...SAMPLE_STYLE, backgroundColor: `var(--color-${surface})`, color: `var(--color-${ink})` }}>
              {`${ink} on ${surface}`}
            </p>
          ))}
          {MUTED_HOSTS.map((surface) => (
            <p key={`muted-${surface}`} style={{ ...SAMPLE_STYLE, backgroundColor: `var(--color-${surface})`, color: "var(--color-muted-foreground)" }}>
              {`muted on ${surface}`}
            </p>
          ))}
          {INPUT_HOSTS.map((surface) => (
            <div key={`input-${surface}`} style={{ backgroundColor: `var(--color-${surface})` }}>
              <p style={{ ...SAMPLE_STYLE, backgroundColor: "var(--color-input)", color: "var(--color-muted-foreground)" }}>{`input on ${surface}`}</p>
            </div>
          ))}
        </div>
      </ThemeScope>
    </CtIsolation>
  );
}

export function ReadingBandStory({ background }: { readonly background: string }): ReactElement {
  return (
    <CtIsolation subject="ThemeScope reading band" isolates="Opaque attribution coverage against contrasting art and the live plate color">
      <ThemeScope tokens={{ background }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 16rem)" }}>
          {["black", "white"].map((art) => (
            <section key={art} aria-label={`${art} art`} style={{ backgroundColor: art }}>
              <p style={{ ...SAMPLE_STYLE, backgroundColor: "var(--color-reading-band)", color: "var(--color-reading-plate-foreground)" }}>Reading band</p>
              <p
                style={{ ...SAMPLE_STYLE, backgroundColor: "oklch(from var(--color-reading-plate) l c h / 1)", color: "var(--color-reading-plate-foreground)" }}
              >
                Opaque plate reference
              </p>
              <p style={{ ...SAMPLE_STYLE, backgroundColor: "var(--color-reading-plate)", color: "var(--color-reading-plate-foreground)" }}>Reading plate</p>
            </section>
          ))}
        </div>
      </ThemeScope>
    </CtIsolation>
  );
}
