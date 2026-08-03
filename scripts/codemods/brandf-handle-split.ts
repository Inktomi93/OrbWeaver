#!/usr/bin/env tsx
// BRAND-F burn-down, phase 3: the `handle` corpus, split PER-SITE (owner-approved Arm A). The gate
// vocabulary maps the position name `handle` to the auth brand `Handle` (user-facing username), but the
// tree carries a SECOND identity space under the same spelling: the character CARD's identity slug
// (`characters.handle`, per-owner unique, import/export-portable) — now the `CharacterHandle` brand.
// Typing a card slug as `Handle` would be the wrong-brand-compiles bug this campaign exists to kill, so
// every site was classified by hand (worklist artifact + context dump) into a FILE → brand map; a file
// carrying BOTH kinds is deliberately ABSENT here and hand-edited instead.
//
// Run: pnpm tsx scripts/codemods/brandf-handle-split.ts            (dry-run preview)
//      pnpm tsx scripts/codemods/brandf-handle-split.ts --apply --no-diagnostics-check
import type { Node } from "./codemod-kit.ts";
import { addNamedImport, applyTextReplacements, composePlans, replacementsForNodes, runCodemod, SyntaxKind } from "./codemod-kit.ts";

const IDS_MODULE = "@orb/kit/ids";
const USER_BRAND = "Handle";
const CHARACTER_BRAND = "CharacterHandle";

/** Files whose `handle` positions are the USER-FACING USERNAME (auth/sessions/admin/roster). */
const USER_HANDLE_FILES: readonly string[] = [
  "tests/e2e/support/actors.ts",
  "tests/e2e/support/browser-actors.ts",
  "tests/support/fixtures.ts",
  "tests/server/db/db-batch-atomicity.suite.int.test.ts",
  "tests/db/schema/_support.ts",
  "tests/server/domain/admin/_support.ts",
  "tests/server/domain/chat/_support.ts",
  "tests/server/domain/credentials/_support.ts",
  "tests/server/domain/embeddings/_support.ts",
  "tests/server/domain/imagery/_support.ts",
  "tests/server/domain/notifications/_support.ts",
  "tests/server/domain/regex/_support.ts",
  "tests/server/domain/search/_support.ts",
  "tests/server/domain/settings/_support.ts",
  "tests/server/domain/tool-use/_support.ts",
  "tests/server/entry/auth/seam.test.ts",
  "tests/client/features/auth/surfaces/account-surface.ct.tsx",
  "tests/server/domain/imagery/persistence/queries.int.test.ts",
  "packages/client/src/data/auth-bootstrap.ts",
  "packages/client/src/features/chat/lib/invite-form-model.ts",
  "packages/client/src/features/chat/lib/member-rows.ts",
  "packages/client/src/features/user-admin/components/admin-reset-password-dialog.tsx",
  "packages/client/src/features/user-admin/components/admin-user-sessions-dialog.tsx",
  "packages/client/src/features/user-admin/components/admin-users-section.tsx",
  "packages/client/src/features/user-admin/lib/admin-model.ts",
  "packages/server/src/domain/admin/contract/params.ts",
  "packages/server/src/domain/admin/verbs/create-user.ts",
  "packages/server/src/domain/chat/service.ts",
  "packages/server/src/domain/sessions/contract/service.ts",
  "packages/server/src/domain/sessions/substrate/role-policy.ts",
  "packages/server/src/entry/http/auth-routes.ts",
  "packages/server/src/entry/lifecycle.ts",
  "packages/server/src/infra/auth/contract.ts",
];

/** Files whose `handle` positions are the CHARACTER CARD SLUG (library/import/export/rpg-promotion). */
const CHARACTER_HANDLE_FILES: readonly string[] = [
  "tests/e2e/live-hidden-span-resume.local.spec.ts",
  "tests/e2e/live-member-strip.local.spec.ts",
  "tests/e2e/live-parity-plus-capstone.spec.ts",
  "tests/e2e/live-reasoning-strip.local.spec.ts",
  "tests/e2e/members-tab-views.local.spec.ts",
  "tests/e2e/rpg-lite-loop.spec.ts",
  "tests/e2e/support/global-setup.ts",
  "tests/e2e/support/trpc.ts",
  "tests/client/features/character/_ct-stories.tsx",
  "tests/client/features/character/fixtures.ts",
  "tests/server/domain/import/_support.ts",
  "tests/server/entry/import/run-profile-import.test.ts",
  "tests/server/domain/assets/verbs/export-gallery.int.test.ts",
  "tests/server/domain/assets/verbs/import-gallery.int.test.ts",
  "tests/server/domain/assets/verbs/resolve-variant.int.test.ts",
  "tests/server/domain/character/persistence/card.int.test.ts",
  "tests/server/domain/character/persistence/handoff-copy-write.int.test.ts",
  "tests/server/domain/import/verbs/import-chat-file.test.ts",
  "packages/client/src/features/character/components/character-card.tsx",
  "packages/client/src/features/character/components/character-hero-band.tsx",
  "packages/server/src/domain/assets/contract/service.ts",
  "packages/server/src/domain/character/contract/params.ts",
  "packages/server/src/domain/character/contract/seeder.ts",
  "packages/server/src/domain/character/contract/views.ts",
  "packages/server/src/domain/character/persistence/queries.ts",
  "packages/server/src/domain/character/substrate/group-character.ts",
  "packages/server/src/domain/character/verbs/mint-synthetic-group-character.ts",
  "packages/server/src/domain/chat/contract/seeder.ts",
  "packages/server/src/domain/chat/seeder/seed.ts",
  "packages/server/src/domain/export/contract/results.ts",
  "packages/server/src/domain/import/contract/service.ts",
  "packages/server/src/domain/import/contract/views.ts",
  "packages/server/src/domain/import/loader/collect.ts",
  "packages/server/src/domain/import/workload-contributions.ts",
  "packages/server/src/domain/rpg/contract/service.ts",
  "packages/server/src/entry/boot/seed-assets/index.ts",
  "packages/server/src/entry/compose/rpg.ts",
];

const STRING_PARTS: ReadonlySet<string> = new Set(["string", "null", "undefined"]);

/** The `string` keyword node(s) of a string-family annotation — the gate's own predicate shape. */
function stringKeywords(typeNode: Node | undefined): Node[] {
  if (typeNode === undefined) {
    return [];
  }
  if (typeNode.getKind() === SyntaxKind.StringKeyword) {
    return [typeNode];
  }
  const union = typeNode.asKind(SyntaxKind.UnionType);
  if (union === undefined) {
    return [];
  }
  const members = union.getTypeNodes();
  if (!members.every((m) => STRING_PARTS.has(m.getText()))) {
    return [];
  }
  return members.filter((m) => m.getKind() === SyntaxKind.StringKeyword);
}

const POSITION_KINDS = [SyntaxKind.Parameter, SyntaxKind.PropertySignature, SyntaxKind.PropertyDeclaration, SyntaxKind.VariableDeclaration] as const;

await runCodemod("brandf-handle-split", (ctx) => {
  const brandByFile = new Map<string, string>();
  for (const f of USER_HANDLE_FILES) {
    brandByFile.set(f, USER_BRAND);
  }
  for (const f of CHARACTER_HANDLE_FILES) {
    brandByFile.set(f, CHARACTER_BRAND);
  }

  for (const sf of ctx.project.getSourceFiles()) {
    const fp = sf.getFilePath();
    const rel = [...brandByFile.keys()].find((k) => fp.endsWith(`/${k}`));
    if (rel === undefined) {
      continue;
    }
    const brand = brandByFile.get(rel);
    if (brand === undefined) {
      continue;
    }
    const keywords: Node[] = [];
    for (const kind of POSITION_KINDS) {
      for (const node of sf.getDescendantsOfKind(kind)) {
        const nameNode = (node as { getNameNode?: () => Node }).getNameNode?.();
        if (nameNode?.isKind(SyntaxKind.Identifier) !== true || nameNode.getText() !== "handle") {
          continue;
        }
        const typeNode = (node as { getTypeNode?: () => Node | undefined }).getTypeNode?.();
        keywords.push(...stringKeywords(typeNode));
      }
    }
    if (keywords.length === 0) {
      continue;
    }
    ctx.plan(
      composePlans(`retype ${keywords.length} handle site(s) → ${brand} in ${rel}`, [
        applyTextReplacements(
          ctx,
          replacementsForNodes(keywords, () => ({ text: brand, label: `string → ${brand}` })),
        ),
        addNamedImport(ctx, fp, { moduleSpecifier: IDS_MODULE, name: brand, isTypeOnly: true }),
      ]),
    );
  }
});
