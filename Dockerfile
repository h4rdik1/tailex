# Production image: one container serves the API and the built web app (same origin, no CORS).
# Multi-stage, so the compilers and dev tools used to BUILD the web app are not in the final image.
# Why each choice: docs/DECISIONS.md ADR-043, docs/LEARNING.md (Phase 6).

# ---- Stage 1: build the web app (needs dev dependencies: Vite, TypeScript, Tailwind) ----
FROM node:24-trixie-slim AS build
WORKDIR /app

# Manifests first: this layer is cached until a dependency changes, so rebuilds are fast.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build

# ---- Stage 2: the runtime image ----
FROM node:24-trixie-slim AS runtime

# Only the TeX Live packages the template needs (same four as Dockerfile.dev, ADR-020).
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      texlive-latex-base \
      texlive-latex-recommended \
      texlive-fonts-recommended \
      lmodern \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app

# Production dependencies of the server (and of the shared package it imports) only.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --no-audit --no-fund -w @tailex/server -w @tailex/shared \
 && npm cache clean --force

# The server runs TypeScript natively on Node 24 (ADR-016): no compile step, just the sources.
COPY packages/shared packages/shared
COPY apps/server/src apps/server/src
COPY --from=build /app/apps/web/dist apps/web/dist

# Never run as root. The "node" user exists in the base image; /tmp stays writable for pdflatex.
USER node
EXPOSE 8080

# The platform restarts the container if this keeps failing. Node's own fetch: no curl needed.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "apps/server/src/index.ts"]
