import { openConfigTo, resolveConfigSectionAnchor, useSectionRegistry } from "@orb/client/state";
import { CtClientProviders, configSections } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

function ConfigContent(): ReactElement {
  const definition = useSectionRegistry().get("config");
  if (typeof definition.content !== "function") {
    throw new Error("The production settings section has no content renderer");
  }
  return <>{definition.content()}</>;
}

function AnchorSubject(): ReactElement {
  const [mounted, setMounted] = useState(() => {
    openConfigTo("appearance");
    return true;
  });
  const avatars = configSections.get("appearance-avatars");
  const looks = configSections.get("appearance-looks");
  const target = resolveConfigSectionAnchor(configSections, avatars.anchor, avatars.nav.id, { isAdmin: false, isOwner: false });
  return (
    <Stack>
      <Button data-anchor={target ?? undefined} onClick={(): void => openConfigTo(avatars.anchor, avatars.nav.id)}>
        Jump to avatars
      </Button>
      <Button
        data-anchor={resolveConfigSectionAnchor(configSections, looks.anchor, looks.nav.id, { isAdmin: false, isOwner: false }) ?? undefined}
        onClick={(): void => openConfigTo(looks.anchor, looks.nav.id)}
      >
        Jump to looks
      </Button>
      <Button onClick={(): void => setMounted(false)}>Unmount content</Button>
      <Button onClick={(): void => setMounted(true)}>Remount content</Button>
      <div style={{ height: 560, width: 900, minHeight: 0, display: "flex" }}>
        {mounted ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <ConfigContent />
          </div>
        ) : null}
      </div>
    </Stack>
  );
}

/** The production settings content is isolated from route and shell mounting, not reimplemented. */
export function ConfigAnchorStory(): ReactElement {
  return (
    <CtClientProviders>
      <AnchorSubject />
    </CtClientProviders>
  );
}
