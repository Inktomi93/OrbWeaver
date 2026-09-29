import type { PluginBundleHash, PluginManifest } from "@orb/contracts/plugin";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { usePreviewPluginFromUrl } from "../lib/plugin-mutations.ts";

const URL_FETCH_FAILED = "Couldn't fetch a plugin from that URL — it may be unreachable, refused, or not a plugin bundle.";

interface PluginInstallUrlArmProps {
  readonly disabled: boolean;
  readonly error: string | null;
  readonly loading: boolean;
  readonly onEdited: () => void;
  readonly onPreviewFailed: (epoch: number, message: string) => void;
  readonly onPreviewStarted: (url: string) => number;
  readonly onPreviewed: (epoch: number, manifest: PluginManifest, bundleHash: PluginBundleHash, url: string) => void;
}

export function PluginInstallUrlArm({
  disabled,
  error,
  loading,
  onEdited,
  onPreviewFailed,
  onPreviewStarted,
  onPreviewed,
}: PluginInstallUrlArmProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const preview = usePreviewPluginFromUrl({ trpc, invalidation });
  const [url, setUrl] = useState("");
  const trimmedUrl = url.trim();

  return (
    <Stack gap="tight">
      <Text voice="label">Install from a link</Text>
      <Text prose={true} voice="gloss">
        Paste a link to a plugin .zip. It's fetched on the server, and you confirm what it asks for the same way as a file.
      </Text>
      <Row align="end" gap="field">
        <Stack className="flex-1">
          <Field label="Plugin URL">
            <Input
              disabled={disabled}
              onValueChange={(next): void => {
                setUrl(next);
                onEdited();
              }}
              placeholder="https://…"
              type="url"
              value={url}
            />
          </Field>
        </Stack>
        <Button
          aria-label="Fetch plugin bundle URL"
          disabled={trimmedUrl === "" || disabled}
          intent="secondary"
          loading={loading}
          onClick={(): void => {
            const epoch = onPreviewStarted(trimmedUrl);
            preview.mutate(
              { url: trimmedUrl },
              {
                onError: () => onPreviewFailed(epoch, URL_FETCH_FAILED),
                onSuccess: ({ manifest, bundleHash }) => onPreviewed(epoch, manifest, bundleHash, trimmedUrl),
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
