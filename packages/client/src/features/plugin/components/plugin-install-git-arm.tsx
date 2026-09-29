import type { PluginManifest } from "@orb/contracts/plugin";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { usePreviewPluginFromGit } from "../lib/plugin-distribution-mutations.ts";

interface PluginInstallGitArmProps {
  readonly disabled: boolean;
  readonly error: string | null;
  readonly loading: boolean;
  readonly onEdited: () => void;
  readonly onPreviewFailed: (epoch: number, message: string) => void;
  readonly onPreviewStarted: (url: string) => number;
  readonly onPreviewed: (epoch: number, manifest: PluginManifest, url: string, sourceCommit: string) => void;
}

const GIT_FETCH_FAILED = "Couldn't read a plugin from that repository — it may be unreachable, refused, or not a plugin.";

export function PluginInstallGitArm({
  disabled,
  error,
  loading,
  onEdited,
  onPreviewFailed,
  onPreviewStarted,
  onPreviewed,
}: PluginInstallGitArmProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const preview = usePreviewPluginFromGit({ trpc, invalidation });
  const [url, setUrl] = useState("");
  const trimmedUrl = url.trim();

  return (
    <Stack gap="tight">
      <Text voice="label">Install from Git</Text>
      <Text prose={true} voice="gloss">
        This downloads code from an arbitrary HTTPS repository. Orbweaver checks the manifest and sandbox boundary; it does not review the code for you.
      </Text>
      <Row align="end" gap="field">
        <Stack className="flex-1">
          <Field label="Repository URL">
            <Input
              disabled={disabled}
              onValueChange={(next): void => {
                setUrl(next);
                onEdited();
              }}
              placeholder="https://github.com/…"
              type="url"
              value={url}
            />
          </Field>
        </Stack>
        <Button
          aria-label="Fetch Git repository"
          disabled={trimmedUrl === "" || disabled}
          intent="secondary"
          loading={loading}
          onClick={(): void => {
            const epoch = onPreviewStarted(trimmedUrl);
            preview.mutate(
              { url: trimmedUrl },
              {
                onError: () => onPreviewFailed(epoch, GIT_FETCH_FAILED),
                onSuccess: (result) => onPreviewed(epoch, result.manifest, trimmedUrl, result.sourceCommit),
              },
            );
          }}
        >
          Fetch
        </Button>
      </Row>
      {error === null ? null : (
        <Text className="text-destructive" role="alert">
          {error}
        </Text>
      )}
    </Stack>
  );
}
