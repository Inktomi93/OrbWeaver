#!/usr/bin/env bash
# Download independently of the builder cache and verify every digest before claiming image identity.
set -euo pipefail
[[ "$DIGEST" =~ ^sha256:[a-f0-9]{64}$ ]]
[[ "$SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]]
[[ "$IMAGE_CHANNEL" == main || "$IMAGE_CHANNEL" == stable ]]
proof=$(mktemp -d "$RUNNER_TEMP/anonymous-image.XXXXXX")
if ! docker run --rm -v "$proof:/proof" quay.io/skopeo/stable:latest@sha256:966b7d73acc4478906280e4967cafd93f4a85273e9a97b41b2ea8f9bd55292a5 copy --src-no-creds --preserve-digests "docker://$IMAGE@$DIGEST" oci:/proof/image:published; then
  echo "::error::Image bytes do not download anonymously. Make the GHCR package public, then re-run the failed job."
  exit 1
fi
python3 - "$proof/image" "$DIGEST" "$SOURCE_SHA" "$IMAGE_CHANNEL" "${VERSION:-}" <<'PYTHON'
import hashlib, json, pathlib, sys, tarfile
root, digest, sha, channel, version = pathlib.Path(sys.argv[1]), *sys.argv[2:]
def verified_blob(descriptor):
    algorithm, value = descriptor["digest"].split(":")
    assert algorithm == "sha256" and len(value) == 64 and all(c in "0123456789abcdef" for c in value)
    path = root / "blobs" / algorithm / value
    with path.open("rb") as stream:
        assert hashlib.file_digest(stream, "sha256").hexdigest() == value
    assert path.stat().st_size == descriptor["size"]
    return path
index = json.loads((root / "index.json").read_text())
descriptor, = index["manifests"]
assert descriptor["digest"] == digest
manifest = json.loads(verified_blob(descriptor).read_text())
config = json.loads(verified_blob(manifest["config"]).read_text())
assert config["config"]["Labels"]["org.opencontainers.image.revision"] == sha
stamp = None
for layer in manifest["layers"]:
    path = verified_blob(layer)
    with tarfile.open(path) as archive:
        for member in archive:
            if member.name.removeprefix("./") == "app/version.json":
                stream = archive.extractfile(member)
                assert stream is not None
                stamp = json.load(stream)
assert stamp is not None and stamp["commit"] == sha and stamp["channel"] == channel
assert not version or stamp["version"] == version
print(json.dumps({"digest": digest, "downloadedLayers": len(manifest["layers"]), "stamp": stamp}))
PYTHON
printf 'Verified anonymous image: %s@%s\nSource commit: %s\nChannel: %s\n' "$IMAGE" "$DIGEST" "$SOURCE_SHA" "$IMAGE_CHANNEL" >> "$GITHUB_STEP_SUMMARY"
