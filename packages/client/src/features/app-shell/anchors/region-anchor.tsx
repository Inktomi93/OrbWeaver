// RegionAnchor — the containment PROVIDER for a shell region (UI-Arch §4: the anchor tier). Wraps a
// region's content in a NAMED `@container` (via @orb/ui `<Container>`, the one writer of
// container-type) so the surface dropped inside adapts to the REGION's width, not the viewport — the
// same `<ChatRoomSurface>` is wide in a docked-panels layout and narrow in immersive, with zero
// layout props (§4b axis 1). One parametrized provider, not three identical files (one home): the
// `region` names the container (`content` / `list` / `context`) and fills its grid cell. It lays no inset:
// a CONTENT body's inset sits inside its own scroller (`ContentPane`), so the scroll edge is the pane's edge.

import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { Suspense } from "react";
import { SkeletonRows } from "#data";
import { RenderProfiler } from "#lib";

// A section read that suspends past its own boundary must stop at its region: with none here it unmounts the whole
// shell into the router pending screen.
const REGION_SKELETON_ROWS = 4;

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
      <RenderProfiler id={`region:${region}`}>
        <Suspense fallback={<SkeletonRows count={REGION_SKELETON_ROWS} />}>{children}</Suspense>
      </RenderProfiler>
    </Container>
  );
}
