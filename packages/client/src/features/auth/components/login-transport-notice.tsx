// The plain-http warning above a cookie-mode login. The server reports the request's transport and client
// scope per request (`/api/auth/config`); over https, or from this machine itself, it renders nothing, and a public
// client is the red case.

import type { ClientScope, RequestTransport } from "@orb/contracts/identity";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { testId } from "#lib";

// A loopback client's password crosses no network, so it gets no notice. The notice speaks to the person signing in:
// what is at risk for them and what they can do, never a server setting only the operator can change.
const NOTICE: Record<ClientScope, { readonly tone: string; readonly copy: string } | null> = {
  loopback: null,
  private: {
    tone: "text-warning",
    copy: "This page isn't encrypted: others on this network could read your password as it is sent. Sign in only on a network you trust.",
  },
  public: {
    tone: "text-destructive",
    copy: "This page isn't encrypted: anyone between you and this server could read your password as it is sent. Don't sign in here; ask whoever runs this server for a secure link.",
  },
};

export interface LoginTransportNoticeProps {
  readonly transport: RequestTransport;
  readonly clientScope: ClientScope;
}

export function LoginTransportNotice({ transport, clientScope }: LoginTransportNoticeProps): ReactElement | null {
  const notice = NOTICE[clientScope];
  if (transport === "https" || notice === null) {
    return null;
  }
  return (
    <Text voice="label" className={notice.tone} data-client-scope={clientScope} data-testid={testId("loginTransportNotice")}>
      {notice.copy}
    </Text>
  );
}
