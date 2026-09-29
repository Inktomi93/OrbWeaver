// The source identity shown at the plugin consent point. Remote installs repeat the reviewed URL and exact
// hash or commit so the person can identify the source the server will fetch again when they install.

import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

export function LocalSourceIdentity({ kind, name }: { readonly kind: "file" | "folder"; readonly name: string }): ReactElement {
  return (
    <Text prose={true} voice="gloss">
      Source {kind === "file" ? "file" : "folder"}: {name}
    </Text>
  );
}

export function RemoteSourceIdentity({ kind, url, identity }: { readonly kind: "git" | "url"; readonly url: string; readonly identity: string }): ReactElement {
  const identityLabel = kind === "git" ? "Reviewed commit" : "Reviewed SHA-256";
  return (
    <Stack gap="tight">
      <Text prose={true} voice="gloss">
        {kind === "git" ? "Source repository" : "Source URL"}
      </Text>
      <Text className="min-w-0 select-all whitespace-pre-wrap wrap-anywhere" voice="datumMono">
        {url}
      </Text>
      <Text prose={true} voice="gloss">
        {identityLabel}
      </Text>
      <Text className="min-w-0 select-all whitespace-pre-wrap wrap-anywhere" voice="datumMono">
        {identity}
      </Text>
    </Stack>
  );
}
