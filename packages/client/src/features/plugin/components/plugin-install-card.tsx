// plugin-install-card — the install half of the Plugins pane: pick a bundle, READ WHAT IT ASKS FOR, confirm
// the subset you allow, install.
//
// THE TWO-STEP IS THE FEATURE, not ceremony. `plugin.install` takes `{bundle, grant}` in ONE call and no
// server verb projects a declared capability list from un-installed bytes — so the grant screen has to read
// the manifest client-side first (`lib/plugin-bundle.ts`, which documents why that is a display read and not
// a trust boundary). Without the pause there is no moment at which a person could have consented.
//
// DEFAULT = EVERYTHING DECLARED, CHECKED. The design's own words: "the caller confirms; `granted_capabilities`
// is stored as the confirmed SUBSET (a paranoid owner may grant less)". Defaulting to nothing would ship a
// broken plugin and teach people to check every box without reading; defaulting to the ask, with each row's
// consequence spelled beside it and the destructive/spendy ones marked, is the confirm this screen is for.
//
// The row lands OFF either way (`status: "disabled"` — enabling is a second explicit act, like a rule), and
// this card says so before the button rather than leaving a person wondering why nothing happened.

import type { PluginCapability } from "@orb/contracts/plugin";
import { Button } from "@orb/ui/button";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Row, Stack } from "@orb/ui/layout";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import type { PluginBundlePreview } from "../lib/plugin-bundle.ts";
import { PLUGIN_BUNDLE_MAX_BYTES, PluginBundlePreviewError, readPluginBundle, toBundleBase64 } from "../lib/plugin-bundle.ts";
import { builtAgainstLine } from "../lib/plugin-copy.ts";
import { useInstallPlugin } from "../lib/plugin-mutations.ts";
import { PluginGrantList } from "./plugin-grant-list.tsx";

/** The pick→confirm→install state. `preview` and `granted` travel together: a grant set is only meaningful
 *  against the manifest it was confirmed for. */
type InstallState =
  | { readonly step: "pick" }
  | { readonly step: "reading" }
  | { readonly step: "confirm"; readonly preview: PluginBundlePreview; readonly granted: readonly PluginCapability[] }
  | { readonly step: "rejected"; readonly message: string };

/** The build-provenance line, when the manifest carried one — display/warn only, never an install gate. */
function BuiltAgainstLine({ manifest }: { readonly manifest: PluginBundlePreview["manifest"] }): ReactElement | null {
  const line = builtAgainstLine(manifest.builtAgainst ?? null);
  return line === null ? null : <Text voice="gloss">{line}</Text>;
}

export function PluginInstallCard(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const install = useInstallPlugin({ trpc, invalidation });
  const [state, setState] = useState<InstallState>({ step: "pick" });

  const onFile = (file: File): void => {
    setState({ step: "reading" });
    readPluginBundle(file).then(
      (preview) => {
        setState({ step: "confirm", preview, granted: preview.manifest.capabilities });
      },
      (error: unknown) => {
        setState({
          step: "rejected",
          message: error instanceof PluginBundlePreviewError ? error.message : "That file couldn't be read as a plugin bundle.",
        });
      },
    );
  };

  const onToggle = (capability: PluginCapability, next: boolean): void => {
    setState((current) =>
      current.step !== "confirm"
        ? current
        : {
            ...current,
            granted: next ? [...current.granted, capability] : current.granted.filter((c) => c !== capability),
          },
    );
  };

  const onInstall = (): void => {
    if (state.step !== "confirm") {
      return;
    }
    const name = state.preview.manifest.name;
    install.mutateAsync({ bundleBase64: toBundleBase64(state.preview.bytes), grant: [...state.granted] }).then(
      () => {
        notify.success(`${name} is installed. It's off until you turn it on.`);
        setState({ step: "pick" });
      },
      () => undefined,
    );
  };

  return (
    <Stack gap="block">
      <Text voice="gloss">A plugin is a .zip holding a manifest and one script. It runs sandboxed, and it can only do what you allow here.</Text>

      <FileDropzone
        accept=".zip"
        aria-label="Choose a plugin bundle"
        disabled={state.step === "reading" || install.isPending}
        hint="A .zip holding manifest.json and main.js"
        instructions="Drop a plugin bundle"
        loading={state.step === "reading"}
        maxSizeBytes={PLUGIN_BUNDLE_MAX_BYTES}
        onFilesSelected={({ accepted }): void => {
          const [file] = accepted;
          if (file !== undefined) {
            onFile(file);
          }
        }}
      />

      {state.step === "rejected" ? (
        <Text className="text-destructive" role="alert">
          {state.message}
        </Text>
      ) : null}

      {state.step === "confirm" ? (
        <Stack gap="section">
          <Separator />
          <Stack gap="tight">
            <Text voice="promoted">
              {state.preview.manifest.name} {state.preview.manifest.version}
            </Text>
            <Text voice="gloss">{state.preview.manifest.description}</Text>
            {state.preview.manifest.author === undefined ? null : <Text voice="gloss">By {state.preview.manifest.author}</Text>}
            <BuiltAgainstLine manifest={state.preview.manifest} />
          </Stack>

          <Stack gap="block">
            <Text voice="label">What it's asking for</Text>
            <PluginGrantList
              declared={state.preview.manifest.capabilities}
              granted={state.granted}
              netHosts={state.preview.manifest.netHosts ?? []}
              onToggle={onToggle}
            />
          </Stack>

          <Stack gap="block">
            <Text voice="gloss">It will be installed turned off. Turn it on when you're ready.</Text>
            <Row gap="field" justify="start">
              <Button intent="primary" loading={install.isPending} onClick={onInstall}>
                Install
              </Button>
              <Button
                intent="ghost"
                onClick={(): void => {
                  setState({ step: "pick" });
                }}
              >
                Cancel
              </Button>
            </Row>
          </Stack>
        </Stack>
      ) : null}
    </Stack>
  );
}
