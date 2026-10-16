# --- Base ---------------------------------------------------------------------
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Same pnpm major as the repo so the lockfile and `allowBuilds` policy are honoured.
RUN npm install -g pnpm@12.10.1

# --- Dependencies -------------------------------------------------------------
FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --prod=false

# --- Build --------------------------------------------------------------------
FROM deps AS build
WORKDIR /repo
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @traceback/api... build

# --- Runtime ------------------------------------------------------------------
# The bundled entrypoint inlines @traceback/shared, so the traced node_modules
# from the build stage are enough; keeping dev deps here means migrations can be
# run from the same image (see the `migrate` service in docker-compose.yml).
FROM build AS runner
WORKDIR /repo
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/server.js"]
