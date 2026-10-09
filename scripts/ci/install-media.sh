#!/usr/bin/env bash
# Use authenticated APT resolution with bounded retries; both media executables must work before tests run.
set -euo pipefail

if timeout 10s ffmpeg -version >/dev/null 2>&1 && timeout 10s ffprobe -version >/dev/null 2>&1; then
  exit 0
fi

apt_options=(-o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30
  -o Acquire::AllowInsecureRepositories=false -o Acquire::AllowDowngradeToInsecureRepositories=false
  -o APT::Get::AllowUnauthenticated=false)
timeout 300s sudo -n apt-get "${apt_options[@]}" update --error-on=any
timeout 600s sudo -n DEBIAN_FRONTEND=noninteractive apt-get "${apt_options[@]}" install -y --no-install-recommends ffmpeg
timeout 10s ffmpeg -version
timeout 10s ffprobe -version
