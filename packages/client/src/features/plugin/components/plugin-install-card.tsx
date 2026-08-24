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
//
// THE CONFIRM BLOCK SCROLLS INTO VIEW the moment it appears (side-eye #650 P1-4). The settings modal's own
// scroller does not follow new content — dropping a bundle used to append the whole grant screen BELOW the
// unchanged dropzone with no scroll and no signal (measured: the Install button sat at y=872 in an 800px
// viewport whose scroller was still at scrollTop 0), so the security moment could land entirely off-screen
// and a person could reasonably conclude the drop failed. The dropzone ALSO changes its own state
// (`success` + the staged file's name) for the same reason: the drop needs to look like it did something
// even before the eye finds the confirm block below it.
//
// A PRE-FLIGHT ALREADY-INSTALLED CHECK reads the SAME `plugin.list` cache the installed section already
// suspends on (side-eye P2-10) — no extra round trip, since `useQuery` here shares the query key and the
// list is already resident by the time this card can render a confirm step. Without it a person fills in
// the whole consent form for a plugin they already have and only learns that at the 409.

import type { PluginCapability } from "@orb/contracts/plugin";
import { Button } from "@orb/ui/button";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Row, Stack } from "@orb/ui/layout";
import { scrollBehavior } from "@orb/ui/lib";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import type { PluginBundlePreview } from "../lib/plugin-bundle.ts";
import { PLUGIN_BUNDLE_MAX_BYTES, PluginBundlePreviewError, readPluginBundle, toBundleBase64 } from "../lib/plugin-bundle.ts";
import { builtAgainstLine, grantSummaryLine } from "../lib/plugin-copy.ts";
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
  return line === null ? null : (
    <Text prose={true} voice="gloss">
      {line}
    </Text>
  );
}

/** The roll-up line at the decision point (file header, P2-9) — `null` renders nothing rather than a
 *  hollow "Granting 0 permissions" when every box was unchecked. */
function GrantSummary({ granted }: { readonly granted: readonly PluginCapability[] }): ReactElement | null {
  const summary = grantSummaryLine(granted);
  return summary === null ? null : <Text voice="label">{summary}</Text>;
}

export function PluginInstallCard(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const install = useInstallPlugin({ trpc, invalidation });
  const [state, setState] = useState<InstallState>({ step: "pick" });
  const confirmRef = useRef<HTMLDivElement>(null);

  // The installed-list cache the sibling section already suspends on — same `queryKey`, so this is a cache
  // hit under normal load, never a second round trip. `data` starts `undefined` only on a genuinely first
  // paint before that suspense has resolved, which cannot happen here (the confirm step this check gates
  // only exists after a user interaction, long after the installed section has settled).
  const { data: installed } = useQuery(trpc.plugin.list.queryOptions());
  const alreadyInstalledName = state.step === "confirm" ? (installed?.find((row) => row.slug === state.preview.manifest.id)?.name ?? null) : null;

  // Scroll the confirm block into view the instant it appears (file header). Keyed on `state.step` alone —
  // re-picking a SECOND bundle while already confirming the first one passes back through "reading" first
  // (the dropzone stays live during "confirm"), so the transition into "confirm" fires again either way.
  useEffect(() => {
    if (state.step === "confirm") {
      confirmRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    }
  }, [state.step]);

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
      <Text prose={true} voice="gloss">
        A plugin is a .zip holding a manifest and one script. It runs sandboxed, and it can only do what you allow here.
      </Text>

      <FileDropzone
        accept=".zip"
        aria-label="Choose a plugin bundle"
        disabled={state.step === "reading" || install.isPending}
        hint="A .zip holding manifest.json and main.js"
        // The dropzone's OWN state changes the moment a bundle is staged (side-eye P1-4) — the confirm
        // block below it is the real signal, but a person's eye is still on the box they just dropped
        // into, and an unchanged box reads as "the drop did nothing" before the eye ever finds it.
        instructions={state.step === "confirm" ? `${state.preview.manifest.name} — read what it's asking for below` : "Drop a plugin bundle"}
        loading={state.step === "reading"}
        maxSizeBytes={PLUGIN_BUNDLE_MAX_BYTES}
        onFilesSelected={({ accepted }): void => {
          const [file] = accepted;
          if (file !== undefined) {
            onFile(file);
          }
        }}
        success={state.step === "confirm"}
      />

      {state.step === "rejected" ? (
        <Text className="text-destructive" role="alert">
          {state.message}
        </Text>
      ) : null}

      {state.step === "confirm" ? (
        <Stack gap="section" ref={confirmRef}>
          <Separator />
          <Stack gap="tight">
            <Text voice="promoted">
              {state.preview.manifest.name} {state.preview.manifest.version}
            </Text>
            <Text prose={true} voice="gloss">
              {state.preview.manifest.description}
            </Text>
            {state.preview.manifest.author === undefined ? null : (
              <Text prose={true} voice="gloss">
                By {state.preview.manifest.author}
              </Text>
            )}
            <BuiltAgainstLine manifest={state.preview.manifest} />
          </Stack>

          {alreadyInstalledName === null ? null : (
            // Pre-flight, not a hard block (side-eye P2-10): the server is still the authority, but reading
            // it off the ALREADY-RESIDENT `plugin.list` cache (no extra round trip) means a person never
            // fills out the whole consent form only to learn at the 409 that they already have this plugin.
            <Text prose={true} role="alert" voice="gloss">
              "{alreadyInstalledName}" is already installed. Use Update on that row to change its bundle instead — installing again will be refused.
            </Text>
          )}

          <Stack gap="block">
            <Text voice="label">What it's asking for</Text>
            <PluginGrantList
              capabilitiesLabel="What it's asking for"
              declared={state.preview.manifest.capabilities}
              granted={state.granted}
              netHosts={state.preview.manifest.netHosts ?? []}
              onToggle={onToggle}
            />
          </Stack>

          <Stack gap="block">
            <Text prose={true} voice="gloss">
              It will be installed turned off. Turn it on when you're ready.
            </Text>
            {/* The roll-up (side-eye P2-9): at a large ask this is the one line that survives the scroll
                back up to the button — the per-row marks above are what to READ, this is what to REMEMBER. */}
            <GrantSummary granted={state.granted} />
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
