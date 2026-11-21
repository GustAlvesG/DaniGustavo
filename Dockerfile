# syntax=docker/dockerfile:1
#
# Imagens de produção do monorepo (contexto = raiz do repositório). Dois alvos finais:
#
#   docker build --target web -t happy4ever/web .   → site Next.js (output standalone)
#   docker build --target api -t happy4ever/api .   → API Hono + painel (e migrate/setup)
#
# Quem usa é o docker-compose.prod.yml; passo a passo em docs/DEPLOY.md.

ARG NODE_IMAGE=node:24-alpine

# ---------- base: Node 24 + pnpm na versão do packageManager (via corepack) ----------
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
ENV PATH=$PNPM_HOME:$PATH
# libc6-compat: binários nativos (SWC do Next, lightningcss, rolldown) têm versão musl,
# mas alguns ainda procuram libs glibc. O corepack lê "packageManager" do package.json.
RUN apk add --no-cache libc6-compat && corepack enable
WORKDIR /repo

# ---------- deps: todas as dependências (dev incluso), para os builds ----------
FROM base AS deps
# Só os manifestos: a camada do `pnpm install` fica em cache enquanto eles não mudam.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    corepack install && pnpm install --frozen-lockfile --store-dir /pnpm/store

# ---------- web-build: next build em modo standalone ----------
FROM deps AS web-build
COPY . .
# Tudo que o Next "congela" no build entra aqui como build arg:
# - NEXT_PUBLIC_*: embutidas no JavaScript do navegador.
# - API_URL: o rewrite de /uploads é calculado no build (vai para o routes-manifest) e
#   as leituras "use cache" do pré-render tentam a API (sem ela no build, a página sai com
#   o conteúdo provisório e se refaz sozinha em ~15 s quando a API estiver no ar).
# - BETTER_AUTH_URL: link "Entrar" do site da plataforma (layout pré-renderizado no build).
ARG NEXT_PUBLIC_SITE_URL
ARG API_URL=http://happy4ever-api:3333
ARG BETTER_AUTH_URL=
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    API_URL=$API_URL \
    BETTER_AUTH_URL=$BETTER_AUTH_URL \
    NEXT_OUTPUT=standalone \
    NODE_ENV=production
RUN test -n "$NEXT_PUBLIC_SITE_URL" || (echo "Defina o build arg NEXT_PUBLIC_SITE_URL (https://seu-dominio)." && exit 1)
RUN pnpm --filter @casamento/web build

# ---------- web: imagem final do site ----------
FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
# Em monorepo o standalone espelha a raiz: o server.js fica em apps/web/. O Next não copia
# public/ nem .next/static/ para o standalone; eles vão para o lado do server.js.
COPY --from=web-build /repo/apps/web/.next/standalone ./
COPY --from=web-build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build /repo/apps/web/public ./apps/web/public
# O cache ISR (páginas refeitas depois de uma revalidação) é gravado em .next: só essa pasta
# fica com o usuário sem privilégios; o resto do código é somente leitura para ele.
RUN chown -R node:node /app/apps/web/.next
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]

# ---------- painel-build: vite build do painel (React) ----------
FROM deps AS painel-build
COPY . .
RUN pnpm --filter @casamento/api build

# ---------- api-deps: só as dependências de produção da API (e de db/shared) ----------
FROM base AS api-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
# Não usamos `pnpm deploy`: ele copia os pacotes do workspace para dentro de node_modules,
# e o Node se recusa a rodar .ts que esteja em node_modules. Instalação filtrada mantém
# @casamento/db e @casamento/shared como links para packages/.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    corepack install && \
    pnpm install --frozen-lockfile --prod --filter "@casamento/api..." --store-dir /pnpm/store

# ---------- api: imagem final da API (também roda migrate/setup do banco) ----------
FROM ${NODE_IMAGE} AS api
ENV NODE_ENV=production \
    PORT=3333 \
    UPLOAD_DIR=/data/uploads
WORKDIR /app
COPY --from=api-deps /repo/ ./
COPY apps/api/src ./apps/api/src
COPY packages/db/src ./packages/db/src
COPY packages/db/migrations ./packages/db/migrations
COPY packages/db/legacy ./packages/db/legacy
COPY packages/shared/src ./packages/shared/src
COPY --from=painel-build /repo/apps/api/dist/painel ./apps/api/dist/painel
# Pasta das fotos dos presentes: vira um volume no compose. Criada aqui com o dono certo,
# o Docker copia a permissão para o volume novo.
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
WORKDIR /app/apps/api
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3333/api/health >/dev/null || exit 1
CMD ["node", "src/server.ts"]
