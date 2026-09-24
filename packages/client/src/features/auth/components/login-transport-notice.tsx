// The plain-http warning above a cookie-mode login. The server reports the request's transport and client
// scope per request (`/api/auth/config`); over https it renders nothing, and a public client is the red case.

import type { ClientScope, RequestTransport } from "@orb/contracts/identity";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { testId } from "#lib";

const NOTICE_TONE: Record<ClientScope, string> = {
  private: "text-warning",
  public: "text-destructive",
};

const NOTICE_COPY: Record<ClientScope, string> = {
  private: "This page is on plain http: your password and session cookie travel in clear on this network.",
  public:
    "This page is on plain http from the internet: your password and session cookie cross the internet in clear. Put TLS or a tunnel in front of this server.",
};

export interface LoginTransportNoticeProps {
  readonly transport: RequestTransport;
  readonly clientScope: ClientScope;
}

export function LoginTransportNotice({ transport, clientScope }: LoginTransportNoticeProps): ReactElement | null {
  if (transport === "https") {
    return null;
  }
  return (
    <Text voice="label" className={NOTICE_TONE[clientScope]} data-client-scope={clientScope} data-testid={testId("loginTransportNotice")}>
      {NOTICE_COPY[clientScope]}
    </Text>
  );
}
