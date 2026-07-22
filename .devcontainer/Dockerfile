FROM node:26

ARG TZ
ENV TZ="$TZ"

ARG CLAUDE_CODE_VERSION=latest

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

# Create workspace and config directories and set permissions. Orbweaver is a 6-package
# pnpm workspace: the ROOT node_modules + every packages/*/node_modules are created here
# so their named volumes (mounted in devcontainer.json) seed as node-owned instead of
# root — pnpm installs into them without permission errors.
RUN mkdir -p \
      /workspace/node_modules \
      /workspace/packages/kit/node_modules \
      /workspace/packages/contracts/node_modules \
      /workspace/packages/db/node_modules \
      /workspace/packages/server/node_modules \
      /workspace/packages/ui/node_modules \
      /workspace/packages/client/node_modules \
      /home/node/.claude /home/node/.local/share/pnpm && \
  chown -R node:node /workspace /home/node/.claude /home/node/.local

WORKDIR /workspace

ARG GIT_DELTA_VERSION=0.18.2
RUN ARCH=$(dpkg --print-architecture) && \
  wget "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  sudo dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

# Enable Corepack so the project's pinned pnpm is available (root: writes shims to /usr/local/bin)
RUN corepack enable

# Set up non-root user
USER node

# Install global packages
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# Set the default shell to zsh rather than sh
ENV SHELL=/bin/zsh

# Set the default editor and visual
ENV EDITOR=nano
ENV VISUAL=nano

# Default powerline10k theme
ARG ZSH_IN_DOCKER_VERSION=1.2.0
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh)" -- \
  -p git \
  -p fzf \
  -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
  -a "source /usr/share/doc/fzf/examples/completion.zsh" \
  -a "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  -x

# Install Claude + ast-grep (the house structural-sweep tool — agents lean on `sg`)
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} @ast-grep/cli

# Activate the pnpm version this project pins (package.json packageManager). Downloads
# at build time (network is open during build; the runtime firewall isn't up yet).
# NB: NO store-dir wrapper here (neo carried one in /usr/local/sbin) — the
# pnpm_config_store_dir env var in devcontainer.json does the same job without the
# fragile per-subcommand case list (verified working on pnpm 11.5.1).
RUN corepack prepare pnpm@11.5.1 --activate

# Playwright Chromium for the client CT (`pnpm test:ct`) and e2e (`pnpm e2e`) suites.
# The browser binary AND its OS libs must be baked in at build time: the runtime
# firewall (init-firewall.sh) blocks cdn.playwright.dev, so a runtime
# `playwright install` dies with ENETUNREACH. Pin to the project's Playwright
# (pnpm-workspace.yaml catalog `@playwright/test` ^1.61.1) so the baked browser
# revision matches what node_modules resolves at runtime. `install-deps` (apt) needs
# root; the browser itself installs as `node` into ~/.cache/ms-playwright (image
# layer, not a volume — survives container restarts).
ARG PLAYWRIGHT_VERSION=1.61.1
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
