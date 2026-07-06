// RegionAnchor — the containment PROVIDER for a shell region (UI-Arch §4: the anchor tier). Wraps a
// region's content in a NAMED `@container` (via @orb/ui `<Container>`, the one writer of
// container-type) so the surface dropped inside adapts to the REGION's width, not the viewport — the
// same `<ChatRoomSurface>` is wide in a docked-panels layout and narrow in immersive, with zero
// layout props (§4b axis 1). One parametrized provider, not three identical files (one home): the
// `region` names the container (`content` / `list` / `context`) and fills its grid cell.

import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { RenderProfiler } from "#lib";

// File-local, tuple-derived (Spine string-union discipline §5.5 — declared once, not an inline
// re-spelled union; not exported — callers pass the literal `region="content"`).
const SHELL_REGIONS = ["content", "list", "context"] as const;
type ShellRegion = (typeof SHELL_REGIONS)[number];

export interface RegionAnchorProps {
  readonly region: ShellRegion;
  readonly children: ReactNode;
}

export function RegionAnchor({ region, children }: RegionAnchorProps): ReactElement {
  return (
    <Container name={region} className="shell-region-fill">
      {/* Per-region <Profiler> boundary → the render heatmap (`window.__orb.renders()`, dev-only; bare
          children in prod). Gives content/list/context render frequency + cost with one wrapper. */}
      <RenderProfiler id={`region:${region}`}>{children}</RenderProfiler>
    </Container>
  );
}
