import { QueryBoundary } from "@orb/client/components";
import { worldInfoGroup } from "@orb/client/features/world-info";
import { clearWorldEntrySelection, selectWorldEntry, setMobileViewport, useMobileViewport } from "@orb/client/state";
import type { WorldEntryId } from "@orb/kit/ids";
import { CtClientProviders, storyTestId } from "@orb/testkit/browser";
import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useLayoutEffect, useState } from "react";

interface MemberProps {
  readonly bookId: string;
  readonly entryId?: WorldEntryId;
  readonly context: boolean;
  readonly phone?: boolean;
}

function Member({ bookId, entryId, context, phone = false }: MemberProps): ReactElement {
  const [previousPhone] = useState(useMobileViewport());
  useLayoutEffect(() => {
    setMobileViewport(phone);
    if (entryId === undefined) {
      clearWorldEntrySelection();
    } else {
      selectWorldEntry(entryId);
    }
    return (): void => {
      clearWorldEntrySelection();
      setMobileViewport(previousPhone);
    };
  }, [entryId, phone, previousPhone]);
  const body = worldInfoGroup.body;
  if (!("kind" in body) || body.kind !== "collection") {
    throw new Error("World Info must expose its production collection");
  }
  const collection = body.collection;
  if (context && collection.context.kind !== "body") {
    throw new Error("World Info must expose its production attachment context");
  }
  return (
    <Container data-testid={storyTestId("widthProbe")}>
      <QueryBoundary fallback={<Stack role="status">Loading book</Stack>}>
        {context && collection.context.kind === "body"
          ? collection.context.render({ memberId: bookId })
          : collection.detail({ memberId: bookId, library: worldInfoGroup.label })}
      </QueryBoundary>
    </Container>
  );
}

/** The real collection member or attachment context without mounting the shell's unrelated regions. */
export function WorldInfoMemberStory(props: MemberProps): ReactElement {
  return (
    <CtClientProviders>
      <Member {...props} />
    </CtClientProviders>
  );
}
