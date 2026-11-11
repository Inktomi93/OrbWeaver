FROM node:26@sha256:39cff0f037088f0d8faf3e5a3ca055d653a15b66faaba8af3daf72f0102f375f

ARG TZ
ENV TZ="$TZ"

# Install basic development tools and iptables/ipset
RUN apt-get update && apt-get install -y --no-install-recommends \
  less \
  git \
  procps \
  sudo \
  fzf \
  zsh \
  man-db \
  unzip \
  gnupg2 \
  gh \
  iptables \
  ipset \
  iproute2 \
  dnsutils \
  aggregate \
  jq \
  nano \
  vim \
  ffmpeg \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Ensure default node user has access to /usr/local/share
RUN mkdir -p /usr/local/share/npm-global && \
  chown -R node:node /usr/local/share

ARG USERNAME=node

# Persist bash history.
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  && mkdir /commandhistory \
  && touch /commandhistory/.bash_history \
  && chown -R $USERNAME /commandhistory

# Set `DEVCONTAINER` environment variable to help with orientation
ENV DEVCONTAINER=true

# Create workspace and config directories and set permissions. The node_modules of the root and of
# every importer that pnpm-workspace.yaml's `packages:` globs select are created here so their named
# volumes (mounted in devcontainer.json) seed as node-owned instead of root — pnpm installs into
# them without permission errors.
RUN mkdir -p \
      /workspace/node_modules \
      /workspace/tooling/node_modules \
      /workspace/packages/client/node_modules \
      /workspace/packages/contracts/node_modules \
      /workspace/packages/db/node_modules \
      /workspace/packages/default-content/node_modules \
      /workspace/packages/inference/node_modules \
      /workspace/packages/kit/node_modules \
      /workspace/packages/plugin-sdk/node_modules \
      /workspace/packages/plugin-toolchain/node_modules \
      /workspace/packages/server/node_modules \
      /workspace/packages/showcase-plugins/node_modules \
      /workspace/packages/ui/node_modules \
      /workspace/tests/support/node_modules \
      /home/node/.claude /home/node/.local/share/pnpm && \
  chown -R node:node /workspace /home/node/.claude /home/node/.local

WORKDIR /workspace

ARG GIT_DELTA_VERSION=0.18.2
# The release publishes no checksum, so these pin the bytes of this version's assets; a version bump
# changes them too, and a mismatch stops the build.
ARG GIT_DELTA_SHA256_AMD64=1658c7b61825d411b50734f34016101309e4b6e7f5799944cf8e4ac542cebd7f
ARG GIT_DELTA_SHA256_ARM64=937781aa7788e1510858743fff6c9a8b4a69fe0a22a7c8a69493e633227939a9
RUN ARCH=$(dpkg --print-architecture) && \
  case "$ARCH" in \
    amd64) DELTA_SHA256="$GIT_DELTA_SHA256_AMD64" ;; \
    arm64) DELTA_SHA256="$GIT_DELTA_SHA256_ARM64" ;; \
    *) echo "no pinned git-delta checksum for $ARCH" >&2; exit 1 ;; \
  esac && \
  wget "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  echo "${DELTA_SHA256}  git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" | sha256sum -c - && \
  sudo dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"


# Set up non-root user
USER node

# Native and optional tool packages share one integrity-locked install.
ENV PATH=$PATH:/usr/local/share/npm-global/node_modules/.bin
COPY --chown=node:node tools/package.json tools/package-lock.json /usr/local/share/npm-global/
RUN npm ci --prefix /usr/local/share/npm-global

# Set the default shell to zsh rather than sh
ENV SHELL=/bin/zsh

# Set the default editor and visual
ENV EDITOR=nano
ENV VISUAL=nano

# The shell setup is a checked-in file over the Debian zsh and fzf packages, so the build runs no fetched shell code.
COPY --chown=node:node zshrc /home/node/.zshrc

# Playwright Chromium for the client CT (`pnpm test:ct`) and e2e (`pnpm e2e`) suites.
# The OS libs must be baked in at build time: `install-deps` runs apt as root, and the
# runtime firewall (init-firewall.sh) admits no Debian mirror while `node` has no general sudo.
# The browser is baked beside them so a fresh container starts with it instead of downloading
# it first. Pin to the project's Playwright (pnpm-workspace.yaml catalog `@playwright/test`) so
# the baked browser revision matches what node_modules resolves at runtime. The browser installs
# as `node` into ~/.cache/ms-playwright (image layer, not a volume — survives container restarts).
ARG PLAYWRIGHT_VERSION=1.64.1
USER root
RUN npx --yes playwright-core@${PLAYWRIGHT_VERSION} install-deps chromium
USER node
RUN npx --yes playwright-core@${PLAYWRIGHT_VERSION} install chromium

# Copy and set up firewall script
COPY init-firewall.sh /usr/local/bin/
USER root
RUN chmod +x /usr/local/bin/init-firewall.sh && \
  echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall && \
  chmod 0440 /etc/sudoers.d/node-firewall
USER node
