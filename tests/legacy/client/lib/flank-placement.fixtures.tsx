// Probe for the flank-placement CT (CT mounts from a non-test module): readers of the one store beside buttons that
// publish the room's verdict and the plugin host's answer, the way the room and the host do.
import { publishFlankHost, publishInlineFlankFit, useFlankHost, useInlineFlankFits } from "@orb/client/lib";
import type { ReactElement } from "react";

function FitReader({ name }: { readonly name: string }): ReactElement {
  return <output aria-label={name}>{String(useInlineFlankFits())}</output>;
}

function HostReader(): ReactElement {
  const host = useFlankHost();
  return <output aria-label="host">{`${String(host.panels)}/${String(host.collapsed)}`}</output>;
}

export function FlankPlacementProbe(): ReactElement {
  return (
    <>
      <FitReader name="inline host" />
      <FitReader name="header host" />
      <HostReader />
      <button onClick={(): void => publishInlineFlankFit(false)} type="button">
        Room narrows
      </button>
      <button onClick={(): void => publishInlineFlankFit(true)} type="button">
        Room widens
      </button>
      <button onClick={(): void => publishFlankHost({ panels: true, collapsed: true, toggle: () => undefined })} type="button">
        Host announces
      </button>
      <button onClick={(): void => publishFlankHost(null)} type="button">
        Host withdraws
      </button>
    </>
  );
}
