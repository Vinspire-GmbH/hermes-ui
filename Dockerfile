# Two stages: build with the toolchain, run without it.
#
# Node 22 on purpose, not "latest". Nuxt 4.5 needs at least 22.19, and the
# Node 26 build in some slim images fails to start for want of libatomic.so.1
# — measured on a railpack runtime image. `.node-version` says the same thing
# for builders that read it.
FROM node:22-slim AS build
WORKDIR /app

# better-sqlite3 ships prebuilt binaries for common platforms and falls back
# to compiling. The fallback needs a toolchain, and it is cheaper to have one
# here than to debug its absence.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Runtime ──────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HERMES_UI_DB=/data/hermes-ui.db \
    PORT=3000

# Only the built output and the native modules it links against.
COPY --from=build /app/.output ./.output

# The database lives on a volume; without one it is lost on every restart.
VOLUME /data
EXPOSE 3000

# Not root. The volume has to belong to the same user, hence the chown.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

# No HEALTHCHECK curl here — the image has none, and adding curl for a
# healthcheck is a package to patch forever. Orchestrators can probe /login.
CMD ["node", ".output/server/index.mjs"]
