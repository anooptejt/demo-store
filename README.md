# demo-store

Sample Node web app (a storefront with a product API, checkout and a small UI) used to demo repository onboarding with ZenseAI AIDLC Centre. Every release starts and stays healthy.

## Run locally

```bash
npm start        # http://localhost:8080
npm test
```

Endpoints: `/` (UI), `GET /api/products`, `POST /api/checkout`, `GET /api/orders`, `/api/info`, `/healthz`, `/readyz`.

## What is deliberately missing

This repository has no `Dockerfile`, no Kubernetes manifests and no CI workflow. Onboarding through the platform creates and commits those, and the first CI run builds and pushes `quay.io/anoop_thotapalli/demo-store`.

## Releases

- `main` is **v1.0.0**.
