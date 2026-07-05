// theme-picker-surface — the interim theme picker (ux-flow-revamp J8 · UIP-402). Renders the §12.1 palette
// SET (Hearth active · Mocha · Light deferred) as swatch rows; the route composes it over the `theme` modal
// slot (home-page.tsx `modals={{theme}}`). A read-only, HONEST picker: Hearth is the active row (primary-14%
// selected skin + a check); Mocha/Light are disabled with a "why" tooltip. There is NO switch action —
// the §12.1 theme persistence (`selectedThemeId` + the `themes` entity) is UNBUILT, so wiring a toggle
// would be the fake no-op J8 forbids; the FLAG lives in theme-options.ts. The swatch chip shows a real
// bg+accent for Hearth and a muted PLACEHOLDER for the deferred palettes (no fabricated Mocha/Light colors
// exist to show — honest, and it still reads as "a theme, disabled").

// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + Icon fine (the character-library-surface.tsx precedent).
import { Check, Icon, Lock } from "@orb/ui/icons";
import { Container, Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { ACTIVE_THEME_ID, THEME_OPTIONS } from "../lib/theme-options";

/** The swatch chip — a bg square with an accent dot. Real tokens for the live palette; a muted placeholder
 *  for the deferred ones (no Mocha/Light token set exists to show — honest, not fabricated). */
function ThemeSwatch({ available }: { readonly available: boolean }): ReactElement {
  const box = available ? "bg-background" : "bg-muted";
  const dot = available ? "bg-primary" : "bg-muted-foreground";
  return (
    <Row
      aria-hidden={true}
      className={`size-8 items-end justify-end rounded-control border border-border p-field ${box}`}
    >
      <Stack className={`size-2 rounded-full ${dot}`} />
    </Row>
  );
}

/** The theme picker body (rendered inside the `theme` modal's Dialog). */
export function ThemePickerSurface(): ReactElement {
  return (
    <Container>
      <Stack gap="row">
        {THEME_OPTIONS.map((option) => {
          const isActive = option.id === ACTIVE_THEME_ID;
          return (
            <ListRow
              key={option.id}
              disabled={!option.available}
              leading={<ThemeSwatch available={option.available} />}
              selected={isActive}
              subtitle={option.description}
              title={option.name}
              actions={
                isActive ? (
                  <Icon icon={Check} label="Active theme" size="sm" />
                ) : (
                  <Tooltip>
                    <TooltipTrigger render={<span />}>
                      <Icon icon={Lock} label={`${option.name} is not available yet`} size="sm" />
                    </TooltipTrigger>
                    <TooltipPopup>Lands with the D44 theme editor.</TooltipPopup>
                  </Tooltip>
                )
              }
            />
          );
        })}
      </Stack>
    </Container>
  );
}
