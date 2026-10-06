# Security

Orbweaver runs on your machine, holds your API keys, lets friends into your scenes and runs plugins other
people wrote. That's a lot of trust for a roleplay app, so security bugs jump the queue.

## Reporting a vulnerability

Report it privately through
[GitHub Security Advisories](https://github.com/Inktomi93/orbweaver/security/advisories/new), or email
**<studio@inktomi.tech>**. Please don't open a public issue for it.

Tell me what you found, how to reproduce it, and what an attacker gets out of it. A proof of concept against
your own install is perfect. I'm one dude, so I'll be the one reading it, reproducing it and fixing it. You'll
hear back once I've reproduced it, and you'll get credit in the advisory unless you'd rather not.

## What counts

These are the walls Orbweaver is built around. Getting through one is a vulnerability:

- **Plugins stay in their box.** Plugin code runs in a QuickJS sandbox inside a separate broker process,
  under a memory and heartbeat watchdog, and it only reaches the network through the app's outbound-request
  firewall. A plugin that reads files, escapes the sandbox, reaches a private network address or acts without
  the permissions it was approved for is a vulnerability.
- **Sign-in means something.** In "me and friends" or single sign-on mode, getting in without valid
  credentials, acting as another user, or reading another user's chats, characters or keys is a vulnerability.
- **Keys stay secret.** Provider keys are encrypted at rest with a key in `data/secrets/`. Anything that leaks
  a key into a page, a log, an export or a plugin is a vulnerability.
- **Cards and themes are content, not code.** Imported cards, chats and themes are untrusted. Theme values are
  parsed and clamped before they reach the page. Script injection or broken markup from any of them is a
  vulnerability.

## What doesn't

- **"Just me" mode has no login, on purpose.** It listens on your machine only. Putting it on the internet
  through a port forward, proxy or tunnel is unsupported, and the README says not to.
- **Model output.** What a model says, jailbreaks, and prompt injection that only changes the story are out
  of scope. Prompt injection that triggers an action the user didn't approve is in scope.
- **Your providers.** Bugs in OpenAI, Anthropic, Google, local engines or other upstream services belong to
  them.

## Supported versions

The latest release gets security fixes, and so does `main`. Older releases don't, so upgrade.

## Testing

Test against your own install. Don't poke at anyone else's instance, and don't touch data that isn't yours.
