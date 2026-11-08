import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { CtIsolation } from "./ct-isolated-subject.tsx";

// Shorter than any settle window, so a sampled window always holds a move no matter when readiness was declared.
const LATE_NOTICE_PERIOD_MS = 250;

/** A ready witness that stays put, or one a recurring late notice keeps pushing down after it rendered. */
export function SurfaceStabilityStory({ shift }: { readonly shift: "still" | "late-notice" }): ReactElement {
  const [notice, setNotice] = useState(false);
  useEffect(() => {
    const timer = shift === "late-notice" ? setInterval(() => setNotice((shown) => !shown), LATE_NOTICE_PERIOD_MS) : undefined;
    return (): void => clearInterval(timer);
  }, [shift]);
  return (
    <CtIsolation subject="Post-ready witness movement" isolates="A planted late layout change needs no application services.">
      <main>
        <Stack gap="section" padding="section">
          <h1>Stability control</h1>
          {notice ? <p style={{ blockSize: 48, margin: 0 }}>Late notice</p> : null}
          <Button>Ready witness</Button>
        </Stack>
      </main>
    </CtIsolation>
  );
}
