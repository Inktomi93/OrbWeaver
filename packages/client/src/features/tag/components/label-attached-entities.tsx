// Adopted attachment doors use the target's canonical navigation intent.
import type { TagAttachedEntity, TagTargetType } from "@orb/contracts/tag";
import { TAG_TARGET_TYPES } from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Skeleton } from "@orb/ui/skeleton";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, useTRPC } from "#data";
import { tagTargetTitle } from "#lib";
import { openConfigTo, openPersonaEditor, selectCharacter, selectChat, selectCollectionMember, selectPreset, setActiveSection } from "#state";

export function LabelAttachedEntities({ tagId }: { readonly tagId: TagId }): ReactElement {
  return (
    <Stack gap="block">
      {TAG_TARGET_TYPES.map((targetType) => (
        <QueryBoundary
          key={targetType}
          fallback={<Skeleton className="h-16 w-full" />}
          renderError={(_error, retry): ReactElement => <QueryErrorState label={tagTargetTitle(targetType).toLowerCase()} onRetry={retry} />}
        >
          <AttachedKind tagId={tagId} targetType={targetType} />
        </QueryBoundary>
      ))}
    </Stack>
  );
}

function AttachedKind({ tagId, targetType }: { readonly tagId: TagId; readonly targetType: TagTargetType }): ReactElement {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.tag.listAttachedEntities.queryOptions({ tagId, targetType }));
  return (
    <Stack gap="field">
      <Text voice="kicker">{tagTargetTitle(targetType)}</Text>
      {data.entities.length === 0 ? (
        <Text voice="gloss">No accessible adopted attachments.</Text>
      ) : (
        data.entities.map((entity) => <ListRow key={entity.targetId} clickable={true} title={entity.name} onClick={(): void => openTarget(entity)} />)
      )}
      {data.hasMore ? <Text voice="gloss">This is an attachment preview. More attachments are counted above.</Text> : null}
    </Stack>
  );
}

function openTarget(entity: TagAttachedEntity): void {
  // biome-ignore-start lint/suspicious/noUnnecessaryConditions: Biome loses imported branded target unions; the compiler checks this exhaustive dispatch.
  switch (entity.targetType) {
    case "character":
      selectCharacter(entity.targetId);
      setActiveSection("characters");
      return;
    case "chat":
      selectChat(entity.targetId);
      setActiveSection("chats");
      return;
    case "worldBook":
      openConfigTo("worldInfo");
      selectCollectionMember("worldInfo", entity.targetId);
      return;
    case "persona":
      openPersonaEditor(entity.targetId);
      return;
    case "preset":
      selectPreset(entity.targetId);
      setActiveSection("presets");
      return;
    default:
      throw new Error("Unreachable label target", { cause: entity satisfies never });
  }
  // biome-ignore-end lint/suspicious/noUnnecessaryConditions: Imported target-union dispatch ends here.
}
