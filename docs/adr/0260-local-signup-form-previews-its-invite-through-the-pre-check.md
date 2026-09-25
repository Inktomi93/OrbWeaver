---
kind: adr
status: active
updated: 2026-09-25
---

# The local sign-up form previews its invite through the signup pre-check

## Context

In `local` mode a signed-out friend who opens a sign-up link sees the sign-up form. Without a preview, the form cannot say who invited them or to which room, and a used or expired link shows four fields that can only end in a refusal. [ADR 0259](0259-signup-invites-mint-account-and-persona-in-one-gated-batch.md) already answers a dead token: the `local` signup route's invite pre-check returns 404 before any invite bucket or scrypt. The `oidc` pending join already shows a not-yet-member the strict invite preview.

## Decision

`POST /api/auth/signup/preview` exists in `local` mode only, registered beside the signup route in `packages/server/src/entry/http/auth-routes.ts`. It adds to 0259 and does not supersede it.

The route runs the signup route's steps up to its pre-check, in the same order: `csrfGuard`, the body cap, the `multiHumanCapable` 404, the per-address bucket (`login-ip`), a refusal of a request with a live session, and the strict `signupPreviewRequestSchema` (`{ token }` only, `@orb/contracts/chat`). It then calls `invites.admits`. A dead token gets the same 404 `invite_unavailable` body the signup pre-check gives. A live token gets `invites.previewHash` parsed through the strict `signedOutInvitePreviewSchema`, the preview the `oidc` pending join also answers, so a preview carrying any other key fails the call instead of reaching the visitor. The route spends no per-invite bucket, like the pre-check, and writes nothing.

While discreet login is on, both signed-out previews leave `hostHandle` out. In `local` mode the host handle is a login handle, which discreet login keeps off the sign-in page. `hostHandle` is optional in `signedOutInvitePreviewSchema` and never an empty string. The signed-in `invitePreviewSchema` still requires it. The form then reads "You're invited to <room>".

The client reads the preview once per form (`useSignupInvitePreview`). The read is never retried and never cached under a key, because the token is a secret. A dead link shows the unavailable state that the `oidc` pending join also shows, never the sign-up fields.

## Consequences

The route answers whether a token is live no more than the signup route already does, under the same controls, and it spends the same per-address bucket. A token holder learns the room name, the member count and the guest mode sentence before creating an account, which the `oidc` pending join also shows. The token holder learns the host's handle only while discreet login is off. The route's tests in `tests/server/entry/http/auth-routes.int.test.ts` pin each control, the byte-identical 404, the strict preview and the discreet-login omission. `tests/server/entry/oidc-signup-roundtrip.suite.int.test.ts` pins the same omission on the pending join.

## Alternatives rejected

- Show the form without a preview: a dead link then ends in a refusal after the visitor has typed a password.
- Preview through the signed-in `invites.previewInvite`: a signed-out visitor has no session to call it with.
- Answer a dead token with its own refusal code: the answer would add an oracle over why a link is dead.
