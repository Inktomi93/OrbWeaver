// plugin-install-card — the install half of the Plugins pane: choose a zip, folder, bundle URL, or Git source,
// READ WHAT IT ASKS FOR, approve or deny, install.
//
// THE TWO-STEP IS THE FEATURE, not ceremony. `plugin.install` takes `{bundle, grant}` in ONE call and no
// server verb projects a declared capability list from un-installed bytes — so the grant screen has to read
// the manifest FIRST. A FILE install reads it client-side (`lib/plugin-bundle.ts`, which documents why that
// is a display read and not a trust boundary); a URL install cannot (the client never fetches the bytes —
// that is the whole SSRF point), so `plugin.previewFromUrl` fetches it THROUGH the server egress guard and
// returns the manifest plus an exact-bundle identity that the install must echo. Either way there is a pause
// at which a person could have consented — the ONE consent
// surface below (`PluginGrantList` + the confirm block), never a second grant screen (§4.8: consent is
// host-only, one surface).
//
// THE URL ARM IS LEAK-FREE BY CONSTRUCTION (U8, seam 15). A person pastes an arbitrary
// URL, so the preview is a probe of a caller-named destination — and `previewFromUrl` can fail two ways
// (`PluginBundleFetchError` for unreachable/refused/SSRF-blocked/non-2xx, `ManifestInvalidError` for
// "reached it, but not a plugin"). Distinguishing those to the caller would be an SSRF ORACLE ("did my URL
// resolve to something?"), so EVERY preview failure renders ONE fixed line here — never `error.message`,
// which is exactly why `usePreviewPluginFromUrl` carries no `errorToast` (`plugin-mutations.ts`). The
// INSTALL act forwards the server's own sentence, because by then the fetch has already succeeded once and
// its refusals (already-installed, a re-fetch that now fails) are host-readable and leak-free.
//
// APPROVE-ALL / DENY (#1855, owner ruling). The prior model had per-grant toggles that defaulted to all
// checked. The owner ruled that the consent surface shows what the plugin requests and offers exactly two
// choices: approve all or cancel. Per-grant cherry-picking was conceptually honest but practically useless —
// unchecking capabilities the plugin declares rarely leaves a working plugin, and it taught people to tick
// boxes without reading. The display list is now READ-ONLY, and the install always grants the full declared
// set. The row still lands OFF (`status: "disabled"` — enabling is a second explicit act, like a rule), and
// this card says so before the button.
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

import type { PluginBundleHash, PluginCapability, PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_BUNDLE_MAX_BYTES } from "@orb/contracts/plugin";
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
import { openConfigTo } from "#state";
import type { PluginBundlePreview } from "../lib/plugin-bundle.ts";
import { PluginBundlePreviewError, readPluginBundle, readPluginFolder, toBundleBase64 } from "../lib/plugin-bundle.ts";
import { abbreviateSourceCommit, builtAgainstLine, grantSummaryLine } from "../lib/plugin-copy.ts";
import { useInstallPluginFromGit } from "../lib/plugin-distribution-mutations.ts";
import { useInstallPlugin, useInstallPluginFromUrl } from "../lib/plugin-mutations.ts";
import { PluginGrantList } from "./plugin-grant-list.tsx";
import { PluginInstallGitArm } from "./plugin-install-git-arm.tsx";
import { PluginInstallUrlArm } from "./plugin-install-url-arm.tsx";

/** WHERE a confirmed manifest came from. Local files carry admitted bytes; remote sources carry the URL plus
 * exact reviewed identity the server checks on re-fetch. `onInstall` dispatches on this. */
type InstallSource =
  | { readonly kind: "file"; readonly bytes: Uint8Array; readonly name: string }
  | { readonly kind: "folder"; readonly bytes: Uint8Array; readonly name: string }
  | { readonly kind: "url"; readonly url: string; readonly expectedBundleHash: PluginBundleHash }
  | { readonly kind: "git"; readonly url: string; readonly expectedCommit: string };

type PluginInstallSourceKind = InstallSource["kind"];

/** The pick→confirm→install state. `manifest` and `source` travel together: the source decides which verb
 *  installs it. The grant is always the full declared set (#1855: approve-all/deny). */
type InstallState =
  | { readonly step: "pick" }
  | { readonly step: "reading"; readonly sourceKind: PluginInstallSourceKind; readonly sourceLabel: string }
  | { readonly step: "confirm"; readonly manifest: PluginManifest; readonly source: InstallSource }
  | { readonly step: "rejected"; readonly sourceKind: PluginInstallSourceKind; readonly message: string };

interface InstallSourceActions {
  readonly bundle: (bytes: Uint8Array) => Promise<unknown>;
  readonly git: (url: string, expectedCommit: string) => Promise<unknown>;
  readonly url: (url: string, expectedBundleHash: PluginBundleHash) => Promise<unknown>;
}

function installConfirmedSource(source: InstallSource, actions: InstallSourceActions): Promise<unknown> {
  if (source.kind === "file" || source.kind === "folder") {
    return actions.bundle(source.bytes);
  }
  if (source.kind === "git") {
    return actions.git(source.url, source.expectedCommit);
  }
  return actions.url(source.url, source.expectedBundleHash);
}

function alreadyInstalledFor(
  state: InstallState,
  installed: readonly { readonly name: string; readonly slug: string }[] | undefined,
): { readonly name: string; readonly slug: string } | null {
  if (state.step !== "confirm") {
    return null;
  }
  return installed?.find((row) => row.slug === state.manifest.id) ?? null;
}

function sourceDropInstructions(state: InstallState, sourceKind: "file" | "folder", fallback: string): string {
  if (state.step === "reading" && state.sourceKind === sourceKind) {
    return sourceKind === "file" ? `Reading ${state.sourceLabel}…` : `Reading folder ${state.sourceLabel}…`;
  }
  if (state.step === "confirm" && state.source.kind === sourceKind) {
    return `${state.manifest.name} — read what it's asking for below`;
  }
  return fallback;
}

function selectedFolderName(files: readonly File[]): string {
  const relativePath = files.find((file) => file.webkitRelativePath !== "")?.webkitRelativePath;
  const root = relativePath?.split("/")[0];
  return root === undefined || root === "" ? "selected folder" : root;
}

function sourceIdentityLine(source: InstallSource): string {
  if (source.kind === "file") {
    return `Source file: ${source.name}`;
  }
  if (source.kind === "folder") {
    return `Source folder: ${source.name}`;
  }
  if (source.kind === "git") {
    return `Source repository: ${source.url} at commit ${abbreviateSourceCommit(source.expectedCommit)}`;
  }
  return `Source URL: ${source.url}`;
}

function isReadingSource(state: InstallState, sourceKind: PluginInstallSourceKind): boolean {
  return state.step === "reading" && state.sourceKind === sourceKind;
}

function isConfirmedSource(state: InstallState, sourceKind: PluginInstallSourceKind): boolean {
  return state.step === "confirm" && state.source.kind === sourceKind;
}

function rejectedMessageFor(state: InstallState, sourceKind: PluginInstallSourceKind): string | null {
  return state.step === "rejected" && state.sourceKind === sourceKind ? state.message : null;
}

function clearRejectedSource(state: InstallState, sourceKind: PluginInstallSourceKind): InstallState {
  return state.step === "rejected" && state.sourceKind === sourceKind ? { step: "pick" } : state;
}

function localPreviewFailure(error: unknown, sourceKind: "file" | "folder"): string {
  if (error instanceof PluginBundlePreviewError) {
    return error.message;
  }
  return sourceKind === "file" ? "That file couldn't be read as a plugin bundle." : "That folder couldn't be read as a plugin bundle.";
}

/** The build-provenance line, when the manifest carried one — display/warn only, never an install gate. */
function BuiltAgainstLine({ manifest }: { readonly manifest: PluginManifest }): ReactElement | null {
  const line = builtAgainstLine(manifest.builtAgainst ?? null);
  return line === null ? null : (
    <Text prose={true} voice="gloss">
      {line}
    </Text>
  );
}

/** The roll-up line at the decision point (#1855: always the full declared set). */
function GrantSummary({ capabilities }: { readonly capabilities: readonly PluginCapability[] }): ReactElement | null {
  const summary = grantSummaryLine(capabilities);
  return summary === null ? null : <Text voice="label">{summary}</Text>;
}

export function PluginInstallCard(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const install = useInstallPlugin({ trpc, invalidation });
  const installFromUrl = useInstallPluginFromUrl({ trpc, invalidation });
  const installFromGit = useInstallPluginFromGit({ trpc, invalidation });
  const [state, setState] = useState<InstallState>({ step: "pick" });
  const [selectionsInFlight, setSelectionsInFlight] = useState(0);
  const confirmRef = useRef<HTMLDivElement>(null);
  const selectionEpoch = useRef(0);

  // The installed-list cache the sibling section already suspends on — same `queryKey`, so this is a cache
  // hit under normal load, never a second round trip. `data` starts `undefined` only on a genuinely first
  // paint before that suspense has resolved, which cannot happen here (the confirm step this check gates
  // only exists after a user interaction, long after the installed section has settled).
  const { data: installed } = useQuery(trpc.plugin.list.queryOptions());
  const alreadyInstalled = alreadyInstalledFor(state, installed);

  const installing = install.isPending || installFromUrl.isPending || installFromGit.isPending;
  const selecting = selectionsInFlight > 0;
  const doorsDisabled = selecting || installing;

  const beginSelection = (sourceKind: PluginInstallSourceKind, sourceLabel: string): number => {
    selectionEpoch.current += 1;
    setSelectionsInFlight((count) => count + 1);
    setState({ step: "reading", sourceKind, sourceLabel });
    return selectionEpoch.current;
  };

  const finishSelection = (epoch: number, next: InstallState): void => {
    setSelectionsInFlight((count) => count - 1);
    if (selectionEpoch.current === epoch) {
      setState(next);
    }
  };

  // Scroll the confirm block into view the instant it appears (file header). Keyed on `state.step` alone —
  // re-picking a SECOND bundle while already confirming the first one passes back through "reading" first
  // (the dropzone stays live during "confirm"), so the transition into "confirm" fires again either way.
  useEffect(() => {
    if (state.step === "confirm") {
      confirmRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    }
  }, [state.step]);

  const onFile = (file: File): void => {
    const epoch = beginSelection("file", file.name);
    Promise.allSettled([readPluginBundle(file)])
      .then(([result]) => {
        if (result.status === "fulfilled") {
          const preview: PluginBundlePreview = result.value;
          finishSelection(epoch, { step: "confirm", manifest: preview.manifest, source: { kind: "file", bytes: preview.bytes, name: file.name } });
        } else {
          finishSelection(epoch, {
            step: "rejected",
            sourceKind: "file",
            message: localPreviewFailure(result.reason, "file"),
          });
        }
      })
      .catch((error: unknown) => globalThis.reportError(error));
  };

  const onFolder = (files: readonly File[]): void => {
    const name = selectedFolderName(files);
    const epoch = beginSelection("folder", name);
    Promise.allSettled([readPluginFolder(files)])
      .then(([result]) => {
        if (result.status === "fulfilled") {
          finishSelection(epoch, { step: "confirm", manifest: result.value.manifest, source: { kind: "folder", bytes: result.value.bytes, name } });
        } else {
          finishSelection(epoch, {
            step: "rejected",
            sourceKind: "folder",
            message: localPreviewFailure(result.reason, "folder"),
          });
        }
      })
      .catch((error: unknown) => globalThis.reportError(error));
  };

  // The URL rides into `source` so `onInstall` re-fetches server-side rather than uploading bytes the client
  // never held (the whole SSRF point). The arm below owns the input + the leak-free failure line.
  const onUrlPreviewed = (epoch: number, manifest: PluginManifest, bundleHash: PluginBundleHash, previewedUrl: string): void => {
    finishSelection(epoch, { step: "confirm", manifest, source: { kind: "url", url: previewedUrl, expectedBundleHash: bundleHash } });
  };

  const onGitPreviewed = (epoch: number, manifest: PluginManifest, previewedUrl: string, sourceCommit: string): void => {
    finishSelection(epoch, { step: "confirm", manifest, source: { kind: "git", url: previewedUrl, expectedCommit: sourceCommit } });
  };

  const onInstall = (): void => {
    if (state.step !== "confirm" || selecting) {
      return;
    }
    const name = state.manifest.name;
    // #1855: approve-all/deny — always grant the full declared set.
    const grant = [...state.manifest.capabilities];
    const source = state.source;
    const onDone = (): void => {
      notify.success(`${name} is installed. It's off until you turn it on.`);
      setState({ step: "pick" });
    };
    const settled = installConfirmedSource(source, {
      bundle: (bytes) => install.mutateAsync({ bundleBase64: toBundleBase64(bytes), grant }),
      git: (url, expectedCommit) => installFromGit.mutateAsync({ url, expectedCommit, grant }),
      url: (url, expectedBundleHash) => installFromUrl.mutateAsync({ url, expectedBundleHash, grant }),
    });
    // @orb-waive caught-failure-ownership(settled): each install mutation carries an errorToast — the toast is
    // the surface; the dialog stays open for retry. Ends if any install mutation drops its errorToast.
    settled.then(onDone, () => undefined);
  };

  return (
    <Stack gap="block">
      <Text prose={true} voice="gloss">
        A plugin has a manifest and one script. Choose a .zip, a source folder, a bundle link, or a Git repository. It runs sandboxed and can only do what you
        allow here.
      </Text>

      <FileDropzone
        accept=".zip"
        aria-label="Choose a plugin bundle"
        disabled={doorsDisabled}
        hint="A .zip holding manifest.json and main.js"
        // The dropzone's OWN state changes the moment a bundle is staged (side-eye P1-4) — the confirm
        // block below it is the real signal, but a person's eye is still on the box they just dropped
        // into, and an unchanged box reads as "the drop did nothing" before the eye ever finds it.
        instructions={sourceDropInstructions(state, "file", "Drop a plugin bundle")}
        loading={isReadingSource(state, "file")}
        maxSizeBytes={PLUGIN_BUNDLE_MAX_BYTES}
        onFilesSelected={({ accepted }): void => {
          const [file] = accepted;
          if (file !== undefined) {
            onFile(file);
          }
        }}
        success={isConfirmedSource(state, "file")}
      />
      {rejectedMessageFor(state, "file") === null ? null : (
        <Text className="text-destructive" role="alert">
          {rejectedMessageFor(state, "file")}
        </Text>
      )}

      <FileDropzone
        {...({ webkitdirectory: "" } as const)}
        aria-label="Choose an unpacked plugin folder"
        disabled={doorsDisabled}
        hint="A folder holding manifest.json and main.js"
        instructions={sourceDropInstructions(state, "folder", "Choose an unpacked plugin folder")}
        loading={isReadingSource(state, "folder")}
        multiple={true}
        onFilesSelected={({ accepted }): void => {
          if (accepted.length > 0) {
            onFolder(accepted);
          }
        }}
        success={isConfirmedSource(state, "folder")}
      />
      {rejectedMessageFor(state, "folder") === null ? null : (
        <Text className="text-destructive" role="alert">
          {rejectedMessageFor(state, "folder")}
        </Text>
      )}

      {/* THE URL ARM — the same consent screen, from a link instead of a file. The
          bytes are fetched on the SERVER (through the egress guard), so nothing here uploads; the arm previews
          the manifest and hands it up to drive the ONE grant screen below. */}
      <Separator />
      <PluginInstallUrlArm
        disabled={doorsDisabled}
        error={rejectedMessageFor(state, "url")}
        loading={isReadingSource(state, "url")}
        onEdited={(): void => setState((current) => clearRejectedSource(current, "url"))}
        onPreviewFailed={(epoch, message): void => finishSelection(epoch, { step: "rejected", sourceKind: "url", message })}
        onPreviewStarted={(url): number => beginSelection("url", url)}
        onPreviewed={onUrlPreviewed}
      />

      <Separator />
      <PluginInstallGitArm
        disabled={doorsDisabled}
        error={rejectedMessageFor(state, "git")}
        loading={isReadingSource(state, "git")}
        onEdited={(): void => setState((current) => clearRejectedSource(current, "git"))}
        onPreviewFailed={(epoch, message): void => finishSelection(epoch, { step: "rejected", sourceKind: "git", message })}
        onPreviewStarted={(url): number => beginSelection("git", url)}
        onPreviewed={onGitPreviewed}
      />

      {state.step === "confirm" ? (
        <Stack gap="section" ref={confirmRef}>
          <Separator />
          <Stack gap="tight">
            <Text voice="promoted">
              {state.manifest.name} {state.manifest.version}
            </Text>
            <Text prose={true} voice="gloss">
              {state.manifest.description}
            </Text>
            <Text prose={true} voice="gloss">
              {sourceIdentityLine(state.source)}
            </Text>
            {state.manifest.author === undefined ? null : (
              <Text prose={true} voice="gloss">
                By {state.manifest.author}
              </Text>
            )}
            <BuiltAgainstLine manifest={state.manifest} />
          </Stack>

          {alreadyInstalled === null ? null : (
            // Pre-flight, not a hard block (side-eye P2-10): the server is still the authority, but reading
            // it off the ALREADY-RESIDENT `plugin.list` cache (no extra round trip) means a person never
            // fills out the whole consent form only to learn at the 409 that they already have this plugin.
            <Stack gap="field">
              <Text prose={true} role="alert" voice="gloss">
                "{alreadyInstalled.name}" ({alreadyInstalled.slug}) is already installed. Open installed plugins to check for an update.
              </Text>
              <Button intent="primary" onClick={(): void => openConfigTo("plugins", "installed")} size="sm">
                Open installed plugins
              </Button>
            </Stack>
          )}

          <Stack gap="block">
            <Text voice="label">What it's asking for</Text>
            <PluginGrantList
              capabilitiesLabel="What it's asking for"
              declared={state.manifest.capabilities}
              granted={state.manifest.capabilities}
              netHosts={state.manifest.netHosts ?? []}
            />
          </Stack>

          <Stack gap="block">
            <Text prose={true} voice="gloss">
              It will be installed turned off. Turn it on when you're ready.
            </Text>
            {/* The roll-up (side-eye P2-9): at a large ask this is the one line that survives the scroll
                back up to the button — the per-row marks above are what to READ, this is what to REMEMBER. */}
            <GrantSummary capabilities={state.manifest.capabilities} />
            <Row gap="field" justify="start">
              <Button disabled={selecting || alreadyInstalled !== null} intent="primary" loading={installing} onClick={onInstall}>
                Install
              </Button>
              <Button
                disabled={doorsDisabled}
                intent="ghost"
                onClick={(): void => {
                  selectionEpoch.current += 1;
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
