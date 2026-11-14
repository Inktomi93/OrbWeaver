import { Notice } from "@orb/client/components";
import { CtClientProviders } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { NOTICE_STORY } from "./_notice-labels.ts";

/** The production notice in the warning tone with every part a site passes: detail lines, an action and a dismiss. */
export function NoticeStory({ alert }: { readonly alert: boolean }): ReactElement {
  return (
    <CtClientProviders>
      <Container>
        <Notice
          alert={alert}
          action={
            <Button size="sm" type="button" variant="outline">
              {NOTICE_STORY.action}
            </Button>
          }
          data-testid={NOTICE_STORY.testId}
          detail={NOTICE_STORY.detail}
          dismiss={{ name: NOTICE_STORY.dismissName, hint: NOTICE_STORY.dismissHint, onDismiss: (): void => undefined }}
          title={NOTICE_STORY.title}
          tone="warning"
        />
      </Container>
    </CtClientProviders>
  );
}
