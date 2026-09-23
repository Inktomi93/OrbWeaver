// BackgroundSourceField CT fixture (docs/law/Spine-Testing.md §7 — CT mounts ONLY from a non-test module):
// the shared picker over the data layer, with the discrete `onChange` value echoed into an <output> so
// the CT asserts the FULL ThemeBackground each tap yields (the call sites mutate with exactly this value).

import { BackgroundSourceField } from "@orb/client/components";
import type { ThemeBackground } from "@orb/contracts/theme";
import { TooltipProvider } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { useState } from "react";
import { CtDataProviders } from "../../support/browser/ct-data-providers.tsx";

export function BackgroundSourceFieldStory({ readOnly = false }: { readonly readOnly?: boolean }): ReactElement {
  const [value, setValue] = useState<ThemeBackground | null>(null);
  return (
    <CtDataProviders>
      <TooltipProvider>
        <div style={{ width: 560 }}>
          <BackgroundSourceField onChange={setValue} readOnly={readOnly} value={value} />
          <output>{value === null ? "none" : JSON.stringify(value)}</output>
        </div>
      </TooltipProvider>
    </CtDataProviders>
  );
}
