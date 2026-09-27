// The IP certificate offer's form (D269; UI-Primitives-and-Reuse.md §13.4 — three fields and a submit make it a
// factory form). Button-gated: Get a certificate submits. After a failed order the stored choice is `serverValues`, so
// Try again resends it or a corrected one. The server refuses a non-public address; the checks here only teach.

import { createSavedEntityForm } from "#forms/editor";
import type { IpCertificateFormValues } from "../lib/share-model.ts";
import { IP_CERTIFICATE_FORM_DEFAULTS } from "../lib/share-model.ts";

export const useIpCertificateForm = createSavedEntityForm<IpCertificateFormValues>({
  defaultValues: IP_CERTIFICATE_FORM_DEFAULTS,
  options: {
    validators: {
      onDynamic: ({ value }: { value: IpCertificateFormValues }): { fields: Record<string, string> } | undefined => {
        const fields: Record<string, string> = {};
        if (value.address.trim().length === 0) {
          fields["address"] = "Enter the public address your router shows.";
        }
        if (value.httpsPort === null) {
          fields["httpsPort"] = "Enter the port 443 forwards to.";
        }
        if (value.challengePort === null) {
          fields["challengePort"] = "Enter the port 80 forwards to.";
        }
        return Object.keys(fields).length > 0 ? { fields } : undefined;
      },
    },
  },
});
