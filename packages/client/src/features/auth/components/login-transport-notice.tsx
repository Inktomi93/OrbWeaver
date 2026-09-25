// The plain-http warning above a cookie-mode login. The server reports the request's transport and client
// scope per request (`/api/auth/config`); over https, or from this machine itself, it renders nothing, and a public
// client is the red case.

import type { ClientScope, RequestTransport } from "@orb/contracts/identity";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { testId } from "#lib";

// A loopback client's password crosses no network, so it gets no notice.
const NOTICE: Record<ClientScope, { readonly tone: string; readonly copy: string } | null> = {
  loopback: null,
  private: { tone: "text-warning", copy: "This page is on plain http: your password and session cookie travel in clear on this network." },
  public: {
    tone: "text-destructive",
    copy: "This page is on plain http from the internet: your password and session cookie cross the internet in clear. Put TLS or a tunnel in front of this server.",
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
