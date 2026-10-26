# Release proof-tool repair

The replacement Skopeo pin verifies the existing release image anonymously. The repair changes only the pinned tool reference; image checks remain unchanged.

## Failure

Release run `40260887798` builds and pushes `0.3.0`, passes the critical vulnerability check, and publishes its provenance and SBOM attestations.
The anonymous-pull step cannot download its pinned Skopeo digest. Quay returns `manifest unknown` before the step accesses the application image.
The workflow therefore skips `latest` promotion and publication. The GitHub release remains a draft.

The original tool reference also fails a direct registry inspection. This is not an anonymous-access verdict about the application image.

## Repair and verification

`scripts/ci/anonymous-image-pull.sh` uses the published `v1.22.3-immutable` reference at digest `sha256:c0ee1f4edca5c01cb8d5611124f92f3cc47196ecab68aee5d0f90834e00574d5`.
The registry confirms the versioned reference, digest and Linux amd64 manifest.

The actual script runs with an empty Docker configuration against the already-built image:

| Input | Value |
| - | - |
| Image | `ghcr.io/inktomi93/orbweaver` |
| Digest | `sha256:a8728a3e016eb3d3533b20a4961c8c30edf6b36423e3c84057a34c588aa4e926` |
| Source | `beb1f8c42fc6c390c7b27ee120df037f1753d2ca` |
| Version and channel | `0.3.0`, `stable` |

The script completes successfully. It downloads and verifies the manifest, configuration and every layer, then verifies the source label and version stamp.
The transcript is `/tmp/orb-release-40260887798-proof.log`; the proof directory is `/tmp/orb-release-proof.xHNrXf`.

`pnpm test:tools tests/tooling/anonymous-image-pull.int.test.ts tests/tooling/release-image-publication.int.test.ts` passes all 15 controls.
The transcript is `/tmp/orb-release-proof-controls.log`.

## Publication boundary

No image gate is removed, skipped or weakened. No release tag, published pointer or remote branch is changed by this repair.
The existing tag contains the unavailable pin, so re-running that workflow does not consume the local correction.
Publication recovery requires a new qualified source through the release process, rather than a blind retry or an unreviewed tag rewrite.
