import { EditableTagChip, QueryBoundary, TagEditorBody } from "@orb/client/components";
import { SkeletonRows, useInvalidation, useOrbSocket, useSuspenseQuery, useTRPC, useUserBus } from "@orb/client/data";
import type { TagView } from "@orb/contracts/tag";
import type { TagId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement, ReactNode } from "react";

function TagEvents({ children }: { readonly children: ReactNode }): ReactElement {
  const invalidation = useInvalidation();
  useOrbSocket();
  useUserBus({ invalidateUser: invalidation.invalidateUser, invalidateAllUserRoots: invalidation.invalidateAllUserRoots });
  return <>{children}</>;
}

function TagEditor({ tagId }: { readonly tagId: TagId }): ReactElement {
  const trpc = useTRPC();
  const { data: tags } = useSuspenseQuery(trpc.tag.listTagsWithUsage.queryOptions());
  const tag = tags.find((row) => row.id === tagId);
  if (tag === undefined) {
    throw new Error("The authored tag must exist");
  }
  return <TagEditorBody tag={tag} others={tags.filter((row) => row.id !== tag.id)} onMerged={(): void => undefined} />;
}

/** The shared editor on its production library query and user-bus invalidation path. */
export function TagEditorStory({ tagId }: { readonly tagId: TagId }): ReactElement {
  return (
    <CtClientProviders>
      <TagEvents>
        <QueryBoundary fallback={<SkeletonRows count={3} />}>
          <TagEditor tagId={tagId} />
        </QueryBoundary>
      </TagEvents>
    </CtClientProviders>
  );
}

/** The real chip host handles deletion-event unmounts and ordinary dismiss flushing. */
export function TagEditorChipStory({ tag }: { readonly tag: TagView }): ReactElement {
  return (
    <CtClientProviders>
      <TagEvents>
        <EditableTagChip tag={tag} />
      </TagEvents>
    </CtClientProviders>
  );
}
