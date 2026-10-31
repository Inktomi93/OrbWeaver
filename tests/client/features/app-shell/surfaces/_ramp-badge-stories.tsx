import type { SectionId } from "@orb/client/state";
import { Badge } from "@orb/ui/badge";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { Tone } from "@orb/ui/tokens";
import { TOKENS, TONES } from "@orb/ui/tokens";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SectionShellStory } from "../_surface-stories.tsx";
import { RAMP_SURFACES } from "./ramp-surfaces.ts";

const COLORED_TONES = TONES.filter((tone): tone is Exclude<Tone, "neutral"> => tone !== "neutral");

/** The shell surfaces as they mount: the panes and the topbar arrive after the shell's first commit. */
function useRampSurfaces(): readonly HTMLElement[] {
  const [surfaces, setSurfaces] = useState<readonly HTMLElement[]>([]);
  useEffect(() => {
    const find = (): void => {
      const found = RAMP_SURFACES.flatMap((selector) => [...document.querySelectorAll<HTMLElement>(selector)]);
      setSurfaces((known) => (found.length === known.length && found.every((node, index) => node === known[index]) ? known : found));
    };
    find();
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    return (): void => observer.disconnect();
  }, []);
  return surfaces;
}

/** A soft badge in every colored tone, portaled into each ramp surface the production shell mounts. */
function BadgesInSurfaces(): ReactElement {
  const surfaces = useRampSurfaces();
  return (
    <>
      {surfaces.map((surface) =>
        createPortal(
          <div data-ramp-badges="" style={{ display: "flex", flexWrap: "wrap" }}>
            {/* A bare stretch of the surface's own fill beside its badges: what each badge's tint must stand apart from. */}
            <div data-sample="host" style={{ blockSize: "1rem", inlineSize: "2rem" }} />
            {COLORED_TONES.map((tone) => (
              <Badge key={tone} tone={tone} variant="soft" data-badge={tone}>
                {tone}
              </Badge>
            ))}
          </div>,
          surface,
        ),
      )}
    </>
  );
}

/** The production shell on one section with a soft badge in each ramp surface, under the seed palette on the page or a custom ThemeScope. */
export function RampBadgeShellStory({ section, background }: { readonly section: SectionId; readonly background?: string }): ReactElement {
  const shell = (
    <>
      <SectionShellStory section={section} />
      <BadgesInSurfaces />
    </>
  );
  return background === undefined ? (
    shell
  ) : (
    <ThemeScope tokens={{ background }} ambientBackground={TOKENS["color.background"].value} ambientAccent={TOKENS["color.primary"].value}>
      {shell}
    </ThemeScope>
  );
}
