// The `/join` link landing (the multi-human invites lane) — the preview-then-confirm dialog the SPA
// root mounts when it captures a `?join=<token>` handoff (lib/join-token.ts). An ANCHOR (it owns its
// Dialog — the surface-purity rule; the first-run-persona-dialog precedent), mounted as an AppShell
// sibling by app-root.tsx while the deployment is multi-human capable.
//
// Flow: mount → `invites.previewInvite({ token })` (a mutation by transport design — the token rides
// the POST body, never a GET URL) → the MINIMAL preview (room · host · member count · mode — Part III
// §2: no roster identities, no history pre-join) → confirm → `invites.redeemInvite({ token })` (THE
// one participant-insert chokepoint) → navigate into the joined room via the #state seam. A bad/spent/
// foreign token is a leak-free NOT_FOUND both steps — rendered as ONE flat "invalid or expired" state
// (no oracle distinguishing which). Dismissing at any point just closes (the host's link stays usable
// until spent/expired).

import { Button } from "@orb/ui/button";
import { Dialog, DialogDescription, DialogPopup, DialogTitle } from "@orb/ui/dialog";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { testId } from "#lib";
import { selectChat, setActiveSection } from "#state";
import { usePreviewInvite, useRedeemInvite } from "../hooks/use-invite-mutations.ts";

type Preview = inferOutput<Trpc["invites"]["previewInvite"]>;

type PreviewState = { readonly kind: "loading" } | { readonly kind: "invalid" } | { readonly kind: "ready"; readonly preview: Preview };

export interface JoinInviteDialogProps {
  /** The raw invite token captured from `?join=` (already scrubbed from the URL by the caller). */
  readonly token: string;
  /** Close/teardown — the caller unmounts the dialog (join, dismiss, and invalid-close all end here). */
  readonly onDone: () => void;
}

/** The preview→confirm `/join` landing dialog. */
export function JoinInviteDialog({ token, onDone }: JoinInviteDialogProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const preview = usePreviewInvite({ trpc, invalidation });
  const redeem = useRedeemInvite({ trpc, invalidation });
  const [state, setState] = useState<PreviewState>({ kind: "loading" });
  // One-shot mount fire (ref-guarded against StrictMode's dev double-invoke + the hook identity churn):
  // preview is a POST-shaped READ — refiring is harmless server-side but would flap the UI state.
  const fired = useRef(false);
  const previewAsync = preview.mutateAsync;

  useEffect(() => {
    if (fired.current) {
      return;
    }
    fired.current = true;
    previewAsync({ token }).then(
      (result) => setState({ kind: "ready", preview: result }),
      () => setState({ kind: "invalid" }),
    );
  }, [previewAsync, token]);

  const join = (): void => {
    redeem.mutateAsync({ token }).then(
      ({ chat }) => {
        onDone();
        // The sanctioned cross-feature navigation seam (§5.1): land in the joined room.
        setActiveSection("chats");
        selectChat(chat.id);
      },
      () => {
        // The redeem raced an expiry/last-use — collapse to the same flat invalid state (no oracle).
        setState({ kind: "invalid" });
      },
    );
  };

  return (
    <Dialog
      open={true}
      onOpenChange={(next): void => {
        if (!next) {
          onDone();
        }
      }}
    >
      <DialogPopup data-testid={testId("joinInviteDialog")}>
        <Stack gap="block">
          <DialogTitle>Join a chat</DialogTitle>
          {state.kind === "loading" ? <Text tone="muted">Checking the invite…</Text> : null}
          {state.kind === "invalid" ? (
            <>
              <DialogDescription>This invite is invalid or has expired.</DialogDescription>
              <Row gap="field" justify="end">
                <Button intent="secondary" onClick={onDone}>
                  Close
                </Button>
              </Row>
            </>
          ) : null}
          {state.kind === "ready" ? (
            <>
              <DialogDescription>
                {state.preview.hostHandle} invited you to join{" "}
                <Text as="span" weight="semibold">
                  {state.preview.roomName}
                </Text>
                .
              </DialogDescription>
              <Stack gap="field">
                <Text size="label" tone="muted">
                  Host: {state.preview.hostHandle}
                </Text>
                <Text size="label" tone="muted">
                  Members: {state.preview.memberCount}
                </Text>
                <Text size="label" tone="muted">
                  Mode: {state.preview.modeLabel}
                </Text>
              </Stack>
              <Row gap="field" justify="end">
                <Button intent="ghost" onClick={onDone}>
                  Not now
                </Button>
                <Button intent="primary" disabled={redeem.isPending} onClick={join} data-testid={testId("joinInviteConfirm")}>
                  {redeem.isPending ? "Joining…" : "Join chat"}
                </Button>
              </Row>
            </>
          ) : null}
        </Stack>
      </DialogPopup>
    </Dialog>
  );
}
