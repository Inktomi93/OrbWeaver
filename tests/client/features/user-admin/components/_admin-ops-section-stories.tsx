import { adminEmbeddingsSection } from "@orb/client/features/user-admin";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";

/** The production Admin embeddings contribution: the inline single-card embed. */
export function AdminEmbedCardStory(): ReactElement {
  return <CtClientProviders>{adminEmbeddingsSection.body("admin-embed-subject")}</CtClientProviders>;
}
