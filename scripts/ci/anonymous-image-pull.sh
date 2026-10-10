#!/usr/bin/env bash
# Download independently of the builder cache and verify every digest before claiming image identity.
set -euo pipefail
[[ "$DIGEST" =~ ^sha256:[a-f0-9]{64}$ ]]
[[ "$SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]]
[[ "$IMAGE_CHANNEL" == main || "$IMAGE_CHANNEL" == stable ]]
PROOF_TOOL=quay.io/skopeo/stable@sha256:e5d5d2815b94d74767d40be7111647c3e9cdc84406a638ffe1c7ea1f286f52a3
if ! docker pull "$PROOF_TOOL"; then
  echo "::error title=Anonymous proof tool::Cannot pull pinned Skopeo $PROOF_TOOL. Repair proof-tool availability; no user image was accessed."
  exit 2
fi
if ! docker run --rm --pull=never "$PROOF_TOOL" --version; then
  echo "::error title=Anonymous proof tool::Pinned Skopeo $PROOF_TOOL could not start. Repair the proof tool; no user image was accessed."
  exit 2
fi
proof=$(mktemp -d "$RUNNER_TEMP/anonymous-image.XXXXXX")
if docker run --rm --pull=never -v "$proof:/proof" "$PROOF_TOOL" copy --src-no-creds --preserve-digests "docker://$IMAGE@$DIGEST" oci:/proof/image:published; then
  :
else
  copy_status=$?
  if (( copy_status >= 125 && copy_status <= 127 )); then
    echo "::error title=Anonymous proof tool::Docker could not execute the pinned copy tool (exit $copy_status). No anonymous image verdict was measured."
    exit 2
  fi
  echo "::error title=Anonymous image copy::Could not download $IMAGE@$DIGEST without credentials (exit $copy_status). Read the registry or copy error above; check package visibility and connectivity."
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
