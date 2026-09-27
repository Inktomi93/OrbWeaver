// The Share card's IP certificate block (D269): the offer, the order in progress, the https address while it serves, or
// the failure that left plain http alone. Only local mode can take it; single-user and forward-header see the offer
// held with its reason, and an oidc box, which friends reach at its registered address, gets no block.

import type { AuthMode, IpCertificateSetting, IpCertificateStatus } from "@orb/contracts/identity";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { CopyButton } from "@orb/ui/copy-button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId } from "react";
import { useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { useIpCertificateForm } from "../hooks/use-ip-certificate-form.ts";
import { useDisableIpCertificate, useEnableIpCertificate } from "../hooks/use-share-mutations.ts";
import type { IpCertificateFormValues } from "../lib/share-model.ts";
import { IP_CERTIFICATE_FORM_DEFAULTS, ipCertificateRefusal } from "../lib/share-model.ts";
import { ShareProse, ShareWarningText } from "./share-prose.tsx";

const PORT_MIN = 1;
const PORT_MAX = 65_535;

const STATE_BADGE: Record<IpCertificateStatus["state"], { readonly label: string; readonly intent: "success" | "info" | "neutral" | "danger" }> = {
  off: { label: "Off", intent: "neutral" },
  obtaining: { label: "Getting a certificate", intent: "info" },
  active: { label: "https on", intent: "success" },
  failed: { label: "Plain http only", intent: "danger" },
};

const WHEN = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function httpAddress(address: string): string {
  return address.includes(":") ? `http://[${address}]` : `http://${address}`;
}

export interface ShareIpCertificateProps {
  /** Undefined until `/api/auth/config` lands; the offer waits for it. */
  readonly mode: AuthMode | undefined;
  readonly certificate: IpCertificateStatus;
}

/** The block, keyed on the certificate's state; nothing under oidc. */
export function ShareIpCertificate({ mode, certificate }: ShareIpCertificateProps): ReactElement | null {
  if (mode === "oidc") {
    return null;
  }
  const badge = STATE_BADGE[certificate.state];
  return (
    <Stack gap="field" data-ip-certificate-state={certificate.state}>
      {/* Announced as it changes; the card's own status row stays the one `status` role. */}
      <Row gap="field" align="baseline" className="flex-wrap" aria-live="polite">
        <Text voice="label">HTTPS at your public address</Text>
        <Badge intent={badge.intent}>{badge.label}</Badge>
      </Row>
      <CertificateBody mode={mode} certificate={certificate} />
    </Stack>
  );
}

function CertificateBody({ mode, certificate }: ShareIpCertificateProps): ReactElement {
  if (certificate.state === "off") {
    return <Offer mode={mode} initial={null} />;
  }
  if (certificate.state === "obtaining") {
    return (
      <Stack gap="field">
        <ShareProse>{`Asking Let's Encrypt for a certificate for ${certificate.setting.address}. It checks port 80 through your router, which can take a few minutes.`}</ShareProse>
        <TurnOff />
      </Stack>
    );
  }
  if (certificate.state === "active") {
    return <Active certificate={certificate} />;
  }
  // Only `failed` is left; a new certificate state fails this assignment until it is handled above.
  const failed: Extract<IpCertificateStatus, { state: "failed" }> = certificate;
  return (
    <Stack gap="field">
      <Stack gap="tight" role="note" data-ip-certificate-warning="plain-http">
        <ShareWarningText role="alert">{`No certificate: ${failed.failure.message}`}</ShareWarningText>
        <ShareWarningText>
          {`This server answers over plain http only, so a password typed at ${httpAddress(failed.setting.address)} crosses the internet in clear. Check the port forwarding below and try again, or share through the relay instead.`}
        </ShareWarningText>
      </Stack>
      <Offer mode={mode} initial={failed.setting} />
      <TurnOff />
    </Stack>
  );
}

function Active({ certificate }: { readonly certificate: Extract<IpCertificateStatus, { state: "active" }> }): ReactElement {
  return (
    <Stack gap="field">
      <ShareProse>Friends sign in over https at the address below, with the password encrypted on the way.</ShareProse>
      <CopyButton text={certificate.url} what={`the https address ${certificate.url}`}>
        <Text voice="label" className="min-w-0 font-mono break-words" data-ip-certificate-url={certificate.url}>
          {certificate.url}
        </Text>
      </CopyButton>
      <ShareProse>{`It renews by itself from ${WHEN.format(certificate.renewAt)}; this certificate lasts until ${WHEN.format(certificate.notAfter)}.`}</ShareProse>
      {certificate.renewalFailure === null ? null : (
        <Stack gap="tight" role="note" data-ip-certificate-warning="renewal-failed">
          <ShareWarningText>{`The last renewal failed: ${certificate.renewalFailure.message}`}</ShareWarningText>
          <ShareProse>{`It tries again by itself. If every try fails, https stops at ${WHEN.format(certificate.notAfter)} and only plain http answers.`}</ShareProse>
        </Stack>
      )}
      <TurnOff />
    </Stack>
  );
}

function TurnOff(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const disable = useDisableIpCertificate({ trpc, invalidation });
  return (
    <Row gap="field" align="center">
      <Button type="button" intent="secondary" size="sm" loading={disable.isPending} onClick={(): void => disable.mutate()}>
        Turn off https
      </Button>
    </Row>
  );
}

// The offer: the address and the two ports, the router's forwarding in one sentence, and the one button. A failed
// order reopens it seeded with the setting it tried, so Try again sends the same choice or a corrected one.
function Offer({ mode, initial }: { readonly mode: AuthMode | undefined; readonly initial: IpCertificateSetting | null }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const enable = useEnableIpCertificate({ trpc, invalidation });
  const heldId = useId();
  // The mutation owns the answer: a coded refusal lands in `enable.error` below, anything else toasts.
  const save = (values: IpCertificateFormValues): Promise<IpCertificateFormValues> => {
    if (values.httpsPort !== null && values.challengePort !== null) {
      enable.mutate({ address: values.address.trim(), httpsPort: values.httpsPort, challengePort: values.challengePort });
    }
    return Promise.resolve(values);
  };
  const { form } = useIpCertificateForm({ entityId: `ip-certificate:${initial?.address ?? "new"}`, serverValues: initial ?? undefined, save });
  const refusal = ipCertificateRefusal(enable.error);
  const held = mode !== "local";
  return (
    <Stack gap="field" data-ip-certificate-offer={initial === null ? "new" : "retry"}>
      {initial === null ? (
        <ShareProse>
          If your router forwards ports to this machine, this server can get a free Let's Encrypt certificate for your public IP address and renew it every few
          days by itself. Friends then sign in with https, with no relay.
        </ShareProse>
      ) : null}
      <form.AppField name="address">
        {(field): ReactElement => <field.TextField label="Public IP address" placeholder="the WAN address your router shows" autoComplete="off" />}
      </form.AppField>
      <Row gap="field" align="end" className="flex-wrap">
        <form.AppField name="httpsPort">
          {(field): ReactElement => <field.NumberField label="https port on this machine" min={PORT_MIN} max={PORT_MAX} step={1} />}
        </form.AppField>
        <form.AppField name="challengePort">
          {(field): ReactElement => <field.NumberField label="Challenge port on this machine" min={PORT_MIN} max={PORT_MAX} step={1} />}
        </form.AppField>
      </Row>
      <form.Subscribe selector={(state): IpCertificateFormValues => state.values}>
        {(values): ReactElement => (
          <ShareProse>
            {`On your router, forward port 443 to port ${String(values.httpsPort ?? IP_CERTIFICATE_FORM_DEFAULTS.httpsPort)} on this machine, and port 80 to port ${String(values.challengePort ?? IP_CERTIFICATE_FORM_DEFAULTS.challengePort)}. Port 80 answers only Let's Encrypt's check, and only while a certificate is being issued.`}
          </ShareProse>
        )}
      </form.Subscribe>
      <ShareProse>
        A home network address (192.168.x.x, 10.x.x.x) or a carrier-shared one (100.64.x.x) cannot get a certificate; share through the relay instead. Getting
        one accepts Let's Encrypt's Subscriber Agreement.
      </ShareProse>
      {refusal === null ? null : <ShareProse role="alert">{`https was refused. ${refusal.message}`}</ShareProse>}
      <Stack gap="tight">
        <Row gap="field" align="center">
          <Button
            type="button"
            intent={initial === null ? "secondary" : "primary"}
            size="sm"
            disabled={held}
            focusableWhenDisabled={true}
            aria-describedby={held ? heldId : undefined}
            loading={enable.isPending}
            onClick={(): void => {
              form.handleSubmit().catch(() => notify.error("Couldn't turn on https."));
            }}
          >
            {initial === null ? "Get a certificate" : "Try again"}
          </Button>
        </Row>
        {held ? <ShareProse id={heldId}>https at the public address needs the local sign-in mode; see Sign-in mode above.</ShareProse> : null}
      </Stack>
    </Stack>
  );
}
