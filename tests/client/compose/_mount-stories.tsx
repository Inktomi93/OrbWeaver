// Probes the actual CT data and registry door without replacing a feature or transport implementation.
import { createTrpcClient } from "@orb/client/data";
import { CommandPaletteSourceRegistryContext, MessageToolsRendererRegistryContext, SlashCommandRegistryContext, useSectionRegistry } from "@orb/client/state";
import { CtAppDataProviders, CtClientProviders, CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { use, useState, useSyncExternalStore } from "react";

const CACHE_KEY = ["composition", "mount-control"] as const;

function CacheProbe({ version, advance }: { readonly version: number; readonly advance: () => void }): ReactElement {
  const client = useQueryClient();
  const [firstClient] = useState(() => client);
  const cached = useSyncExternalStore(
    (onChange) => client.getQueryCache().subscribe(onChange),
    () => client.getQueryData<string>(CACHE_KEY),
  );
  return (
    <Stack>
      <Text>{firstClient === client ? "Same data runtime" : "Data runtime replaced"}</Text>
      <Text>{cached ?? "Empty cache"}</Text>
      <Button
        onClick={(): void => {
          client.setQueryData(CACHE_KEY, "Retained cache");
          advance();
        }}
      >
        Rerender providers {version}
      </Button>
    </Stack>
  );
}

/** A parent update must not replace the QueryClient held by the production data door. */
export function RuntimeLifetimeStory(): ReactElement {
  const [version, setVersion] = useState(0);
  return (
    <CtIsolation subject="Client data runtime" isolates="isolates cache lifetime from authenticated feature rendering">
      <CtAppDataProviders>
        <CacheProbe version={version} advance={(): void => setVersion((value) => value + 1)} />
      </CtAppDataProviders>
    </CtIsolation>
  );
}

function RegistryProbe(): ReactElement {
  const sections = useSectionRegistry();
  const commands = use(SlashCommandRegistryContext);
  const palette = use(CommandPaletteSourceRegistryContext);
  const messageTools = use(MessageToolsRendererRegistryContext);
  return (
    <Stack>
      <Text>{sections.get("chats").rail.label}</Text>
      <Text>{commands === null ? "Missing command door" : "Command door mounted"}</Text>
      <Text>{palette === null ? "Missing palette door" : "Palette door mounted"}</Text>
      <Text>{messageTools === null ? "Missing message tools door" : "Message tools door mounted"}</Text>
    </Stack>
  );
}

/** Observes registry contexts the authenticated production composition supplies to its children. */
export function RegistryDoorStory(): ReactElement {
  return (
    <CtClientProviders>
      <RegistryProbe />
    </CtClientProviders>
  );
}

function WarmedRuntime({ retire }: { readonly retire: (client: QueryClient) => void }): ReactElement {
  const client = useQueryClient();
  const [warmed, setWarmed] = useState(false);
  const cached = useSyncExternalStore(
    (onChange) => client.getQueryCache().subscribe(onChange),
    () => client.getQueryData<string>(CACHE_KEY),
  );
  return (
    <Stack>
      <Text>{cached ?? "Empty active cache"}</Text>
      <Button
        onClick={(): void => {
          client.setQueryData(CACHE_KEY, "Warmed active cache");
          setWarmed(true);
        }}
      >
        Warm active cache
      </Button>
      <Button disabled={!warmed} onClick={(): void => retire(client)}>
        Unmount data owner
      </Button>
    </Stack>
  );
}

function RetiredRuntime({ client }: { readonly client: QueryClient }): ReactElement {
  const entries = useSyncExternalStore(
    (onChange) => client.getQueryCache().subscribe(onChange),
    () => client.getQueryCache().getAll().length,
  );
  return <Text>{entries === 0 ? "Retired cache released" : "Retired cache retained"}</Text>;
}

/** Observe the retired owner after unmount, not merely the fresh cache of another provider. */
export function RuntimeTeardownStory(): ReactElement {
  const [retired, setRetired] = useState<QueryClient | null>(null);
  return (
    <CtIsolation subject="Client data teardown" isolates="isolates retired cache ownership from authenticated feature rendering">
      {retired === null ? (
        <CtAppDataProviders>
          <WarmedRuntime retire={setRetired} />
        </CtAppDataProviders>
      ) : (
        <RetiredRuntime client={retired} />
      )}
    </CtIsolation>
  );
}

/** Drives the production client while preserving the recorder's pre-parse wire observations. */
export function RawTrpcObservationStory({ backgroundUrl, videoUrl }: { readonly backgroundUrl: string; readonly videoUrl: string }): ReactElement {
  const [client] = useState(() => createTrpcClient());
  const [settled, setSettled] = useState(false);
  return (
    <CtIsolation subject="Raw tRPC observations" isolates="isolates the protocol recorder from domain execution and server parsing">
      <Stack>
        <Button
          onClick={async (): Promise<void> => {
            await Promise.allSettled([
              client.settings.addExternalBackground.mutate({ url: backgroundUrl }),
              client.databank.scrapeYoutube.mutate({ url: videoUrl }),
              client.settings.resetUserConfig.mutate(),
            ]);
            setSettled(true);
          }}
        >
          Send observed batch
        </Button>
        <Text>{settled ? "Observed batch settled" : "Observed batch idle"}</Text>
      </Stack>
    </CtIsolation>
  );
}
