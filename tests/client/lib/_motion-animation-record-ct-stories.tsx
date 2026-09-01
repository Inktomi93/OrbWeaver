// Real-browser story for motion-animation-record.ct.tsx. Kept outside the test module because
// Playwright CT mounts importable stories, not locally declared components.

import type { ReactElement } from "react";
import { useEffect } from "react";
import { activeAnimations, installAnimationLifecycleRecorder } from "../../../packages/client/src/lib/motion-animation-record.ts";

export function AnimationRecordStory(): ReactElement {
  useEffect(() => {
    installAnimationLifecycleRecorder();
    globalThis.__readAnimationRecords = activeAnimations;
    return (): void => {
      globalThis.__readAnimationRecords = undefined;
    };
  }, []);
  return (
    <>
      <div data-starting-style="" data-testid="library-transition" style={{ height: 10, transition: "height 30s linear, width 30s linear", width: 10 }} />
      <div data-starting-style="" data-testid="concurrent-transition" style={{ height: 10, opacity: 1, transition: "height 30s linear, opacity 30s linear" }} />
      <div data-testid="application-transition" style={{ height: 10, transition: "height 30s linear" }} />
      <div data-testid="waapi-animation" style={{ height: 10 }} />
    </>
  );
}
