// The "Distribute to everyone" section (Settings → Plugins → Distribute) — the admin face of D147 clause (d).
// An admin publishes a bundle and every account gets its OWN copy; the published set is listed here so it can
// be withdrawn again.
//
// A SECTION, NOT A GATE ON THE PANE. The Plugins pane is deliberately ungated (D147: plugins are user-scoped,
// and hiding a person's own installed plugins from them is the failure that ruling exists to prevent), so the
// admin half arrives as a viewer-gated CONTRIBUTION at the same anchor — exactly what `plugins-pane.tsx`'s own
// header said a future server-wide install would be.
//
// THE COPY CARRIES THE ONE THING AN ADMIN MUST UNDERSTAND BEFORE PRESSING IT: distributing does not turn
// anything on. Every copy lands switched off with nothing allowed, and each person answers the permission ask
// themselves — because enabling RUNS the plugin's code as whoever enabled it, so it can never be done on
// someone's behalf. Without that sentence the button reads like "install this for everyone", which is a
// promise the system deliberately does not keep.
//
// The pick→read→confirm shape mirrors `plugin-install-card` (same client-side manifest read, same reason: no
// server verb projects a declared capability list from un-installed bytes). It shows the permissions the
// bundle asks for at the confirm step — an admin choosing what to push to every account should see what they
// are pushing, even though they are not the one granting it.

import { Button } from "@orb/ui/button";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { configAnchorId } from "#state";
import type { PluginBundlePreview } from "../lib/plugin-bundle.ts";
import { PLUGIN_BUNDLE_MAX_BYTES, PluginBundlePreviewError, readPluginBundle, toBundleBase64 } from "../lib/plugin-bundle.ts";
import { PLUGIN_DISTRIBUTE_SUBCATEGORY } from "../lib/plugin-distribute-nav.ts";
import { useDistributePlugin, useWithdrawPlugin } from "../lib/plugin-mutations.ts";
import { PluginGrantList } from "./plugin-grant-list.tsx";

/** The pick→confirm→publish state, mirroring the install card's. */
type PublishState =
  | { readonly step: "pick" }
  | { readonly step: "reading" }
  | { readonly step: "confirm"; readonly preview: PluginBundlePreview }
  | { readonly step: "rejected"; readonly message: string };

/** The section body — mounted at the Plugins pane's sections anchor, admin-gated by its contribution def. */
export function PluginDistributeSection(): ReactElement {
  return (
    // RESERVED (#1098) — a config section that settles into the published-plugin list; it sits above the
    // rest of the Plugins pane, so its read landing moved every section below it.
    <QueryBoundary
      fallback={<SkeletonRows count={3} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="the distribution list — it's available to administrators only" onRetry={retry} />}
      reserveKey="config.plugins.distribute"
    >
      <PluginDistributeBody />
    </QueryBoundary>
  );
}

/** One sentence for the fan-out's outcome: who got it, and who was passed over and WHY. A bare count would
 *  hide the fact an admin actually needs — that somebody's own copy of this plugin was left alone. */
function fanoutSentence(result: { readonly applied: number; readonly skipped: readonly { readonly userHandle: string }[] }, name: string): string {
  const served = `${name} is now on ${result.applied} account${result.applied === 1 ? "" : "s"}, switched off until each person allows it.`;
  if (result.skipped.length === 0) {
    return served;
  }
  const who = result.skipped.map((s) => s.userHandle).join(", ");
  return `${served} Left alone (they already had their own copy): ${who}.`;
}

function withdrawSentence(result: { readonly applied: number; readonly skipped: readonly { readonly userHandle: string }[] }, name: string): string {
  const removed = `${name} was removed from ${result.applied} account${result.applied === 1 ? "" : "s"} and is no longer given to new ones.`;
  if (result.skipped.length === 0) {
    return removed;
  }
  const who = result.skipped.map((s) => s.userHandle).join(", ");
  return `${removed} Kept (they had updated it themselves): ${who}.`;
}

function PluginDistributeBody(): ReactElement {
  const trpc = useTRPC();
  const { data: published } = useSuspenseQuery(trpc.plugin.listDistributed.queryOptions());
  const invalidation = useInvalidation();
  const distribute = useDistributePlugin({ trpc, invalidation });
  const withdraw = useWithdrawPlugin({ trpc, invalidation });
  const [state, setState] = useState<PublishState>({ step: "pick" });

  const onFile = (file: File): void => {
    setState({ step: "reading" });
    readPluginBundle(file).then(
      (preview) => {
        setState({ step: "confirm", preview });
      },
      (error: unknown) => {
        setState({
          step: "rejected",
          message: error instanceof PluginBundlePreviewError ? error.message : "That file couldn't be read as a plugin bundle.",
        });
      },
    );
  };

  const onDistribute = (): void => {
    if (state.step !== "confirm") {
      return;
    }
    const { name } = state.preview.manifest;
    // @orb-waive caught-failure-ownership(distribute.mutateAsync): useDistributePlugin carries
    // errorToast: serverReason("Couldn't distribute that plugin.") — the toast is the surface. Ends if that
    // mutation drops its errorToast.
    distribute.mutateAsync({ bundleBase64: toBundleBase64(state.preview.bytes) }).then(
      (result) => {
        notify.success(fanoutSentence(result, name));
        setState({ step: "pick" });
      },
      () => undefined,
    );
  };

  return (
    <Section
      className="@container"
      divider={true}
      heading={PLUGIN_DISTRIBUTE_SUBCATEGORY.label}
      id={configAnchorId("plugins", PLUGIN_DISTRIBUTE_SUBCATEGORY.id)}
    >
      <Stack gap="row">
        <Text prose={true} voice="gloss">
          Give a plugin to everyone on this server. Each account gets its own copy — switched off, allowed nothing — and the people who use it decide what it
          may do. Turning a plugin on runs its code as that person, so nobody can do that step for them.
        </Text>

        <FileDropzone
          accept=".zip"
          aria-label="Choose a plugin bundle to distribute"
          disabled={state.step === "reading" || distribute.isPending}
          hint="A .zip holding manifest.json and main.js"
          instructions={state.step === "confirm" ? `${state.preview.manifest.name} — check what it asks for below` : "Drop a plugin bundle"}
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
          <Stack gap="block">
            <Separator />
            <Text voice="promoted">
              {state.preview.manifest.name} {state.preview.manifest.version}
            </Text>
            <Text prose={true} voice="gloss">
              {state.preview.manifest.description}
            </Text>
            <Text voice="label">What it will ask each person for</Text>
            {/* The SAME read-only disclosure the install card and the plugin row use — one home for
                "what a capability means", so a distribute screen can never describe a permission differently
                from the screen where somebody actually allows it. `granted={[]}` is not a placeholder: it is
                literally what every distributed copy lands with, so each row correctly reads as not allowed. */}
            <PluginGrantList
              capabilitiesLabel="What it will ask each person for"
              declared={state.preview.manifest.capabilities}
              granted={[]}
              netHosts={state.preview.manifest.netHosts ?? []}
            />
            <Row gap="field" justify="start">
              <Button intent="primary" loading={distribute.isPending} onClick={onDistribute}>
                Distribute to everyone
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
        ) : null}

        <Separator />
        <Text voice="label">Published to every account</Text>
        {published.length === 0 ? (
          <Text prose={true} voice="gloss">
            Nothing is being given out. Anything you distribute here also lands for people who sign up later.
          </Text>
        ) : (
          <Stack gap="field">
            {published.map((row) => (
              <ListRow
                key={row.slug}
                title={row.name}
                subtitle={`${row.slug} · ${row.version}`}
                actions={
                  <Button
                    intent="secondary"
                    size="sm"
                    loading={withdraw.isPending}
                    onClick={(): void => {
                      // @orb-waive caught-failure-ownership(withdraw.mutateAsync): useWithdrawPlugin carries
                      // errorToast: serverReason("Couldn't withdraw that plugin.") — the toast is the surface.
                      // Ends if that mutation drops its errorToast.
                      withdraw.mutateAsync({ slug: row.slug }).then(
                        (result) => {
                          notify.success(withdrawSentence(result, row.name));
                        },
                        () => undefined,
                      );
                    }}
                  >
                    Stop giving it out
                  </Button>
                }
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Section>
  );
}
