import { Button } from "@orb/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogPopup, DialogTitle, DialogTrigger } from "@orb/ui/dialog";
import { Stack } from "@orb/ui/layout";
import { PortalContainerContext } from "@orb/ui/lib";
import { Select } from "@orb/ui/select";
import type { ReactElement } from "react";
import { Activity, Suspense, use, useRef, useState } from "react";
import { CtIsolation } from "./ct-isolated-subject.tsx";

function HeldContent({ result }: { readonly result: Promise<string> }): ReactElement {
  return <Button>{use(result)}</Button>;
}

/** Exercise actual React hidden/held content beside production Base UI wrappers. */
export function SurfaceFrameworkStory(): ReactElement {
  const portal = useRef<HTMLElement>(null);
  const [held] = useState(() => Promise.withResolvers<string>());
  const [visible, setVisible] = useState(false);
  const [named, setNamed] = useState(false);
  const [portalNamed, setPortalNamed] = useState(false);
  return (
    <CtIsolation subject="Surface audit framework controls" isolates="Native hidden content, portals, and focus behavior need no application services.">
      <PortalContainerContext value={portal}>
        <main ref={portal}>
          <Stack gap="section" padding="section">
            <h1>Framework controls</h1>
            <Button onClick={(): void => held.resolve("Resolved action")}>Resolve content</Button>
            <Suspense fallback={<p role="status">Awaiting content</p>}>
              <HeldContent result={held.promise} />
            </Suspense>
            <Button onClick={(): void => setVisible(!visible)}>{visible ? "Hide activity" : "Show activity"}</Button>
            <Button onClick={(): void => setNamed(true)}>Label activity</Button>
            <Activity mode={visible ? "visible" : "hidden"}>
              <section aria-label="Activity control">
                <Button aria-label={named ? "Activity action" : ""}>
                  <span aria-hidden="true">●</span>
                </Button>
              </section>
            </Activity>
            <Dialog>
              <DialogTrigger render={<Button />}>Open portal</DialogTrigger>
              <DialogPopup>
                <DialogTitle>Portal control</DialogTitle>
                <DialogDescription>The visible portal remains part of the document audit.</DialogDescription>
                <Button aria-label={portalNamed ? "Portal action" : ""}>
                  <span aria-hidden="true">●</span>
                </Button>
                <Button onClick={(): void => setPortalNamed(true)}>Label portal</Button>
                <DialogClose render={<Button />}>Close portal</DialogClose>
              </DialogPopup>
            </Dialog>
            <Select
              aria-label="Choice"
              name="surface-choice"
              defaultValue="alpha"
              items={[
                { label: "Alpha", value: "alpha" },
                { label: "Beta", value: "beta" },
              ]}
            />
          </Stack>
        </main>
      </PortalContainerContext>
    </CtIsolation>
  );
}
