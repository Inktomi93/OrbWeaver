import { CtIsolation } from "@orb/testkit/browser";
import { Badge } from "@orb/ui/badge";
import { Card } from "@orb/ui/card";
import { Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { SEED_THEME_VALUE_SETS, Tone } from "@orb/ui/tokens";
import { TOKENS, TONES } from "@orb/ui/tokens";
import type { ReactElement } from "react";
import { useState } from "react";

const COLORED_TONES = TONES.filter((tone): tone is Exclude<Tone, "neutral"> => tone !== "neutral");

/** A bare stretch of the host's own fill beside its badges: what each badge's tint must stand apart from. */
function HostSample(): ReactElement {
  return <div data-sample="host" style={{ blockSize: "1.5rem", inlineSize: "4rem" }} />;
}

/** A soft badge in every colored tone on the host around it. */
function SoftBadges(): ReactElement {
  return (
    <>
      <HostSample />
      {COLORED_TONES.map((tone) => (
        <Badge key={tone} tone={tone} variant="soft" data-badge={tone}>
          {tone}
        </Badge>
      ))}
    </>
  );
}

/** The card, raised and popover hosts, each holding the soft badges; the popover portals into `container`. */
function Hosts({ container }: { readonly container: HTMLElement | null }): ReactElement {
  return (
    <div style={{ display: "grid", gap: "1rem", padding: "1rem", backgroundColor: "var(--color-background)" }}>
      <Popover defaultOpen={true}>
        <PopoverTrigger>Open</PopoverTrigger>
        {container === null ? null : (
          <PopoverPopup container={container} data-host="popover" side="bottom" align="start">
            <Stack gap="row">
              <SoftBadges />
            </Stack>
          </PopoverPopup>
        )}
      </Popover>
      {/* Room under the trigger inside the first viewport, so the popup opens below it and never covers the hosts after it. */}
      <div style={{ blockSize: "22rem" }} />
      <Card data-host="card">
        <Stack gap="row">
          <SoftBadges />
        </Stack>
      </Card>
      <Stack data-host="surface-raised" ground="raised" gap="row">
        <SoftBadges />
      </Stack>
    </div>
  );
}

/**
 * Soft badges on the card, raised and popover hosts under a seed palette (`theme`, the base palette when absent) or a
 * custom ThemeScope on `background`. The popover portals inside the palette, so it takes the same palette as the page.
 */
export function ToneHostStory({ theme, background }: { readonly theme?: keyof typeof SEED_THEME_VALUE_SETS; readonly background?: string }): ReactElement {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const hosts = (
    <>
      <Hosts container={container} />
      <div ref={setContainer} />
    </>
  );
  return (
    <CtIsolation subject="Tone hosts" isolates="Soft tone tints over the card, raised and popover surfaces under seed palettes and a custom ThemeScope">
      {background === undefined ? (
        <div data-theme={theme}>{hosts}</div>
      ) : (
        <ThemeScope tokens={{ background }} ambientBackground={TOKENS["color.background"].value} ambientAccent={TOKENS["color.primary"].value}>
          {hosts}
        </ThemeScope>
      )}
    </CtIsolation>
  );
}
