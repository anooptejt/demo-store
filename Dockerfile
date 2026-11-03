FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build --if-present && npm prune --omit=dev --ignore-scripts

FROM node:22-alpine AS runtime
WORKDIR /app
ARG GIT_SHA=unknown
ENV NODE_ENV=production PORT=8080 GIT_SHA=$GIT_SHA
LABEL org.opencontainers.image.title="demo-store" org.opencontainers.image.source="https://github.com/anooptejt/demo-store" org.opencontainers.image.ref.name="quay.io/anoop_thotapalli/demo-store"
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
