# AWS Docker Deployment

This project is containerized with:

- `frontend` exposed on `8088`
- `backend` exposed on `8089`

## 1) Prepare environment variables

Create or update:

- `backend/.env` (required for backend runtime secrets)
- repo-root `.env` (optional; copied from `.env.example` when you want Docker Compose to pass a frontend API base URL)
- `frontend/.env` (only needed for local dev; Docker uses the `VITE_API_BASE_URL` build arg from the repo-root `.env` or shell)

At minimum, backend needs:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PORT=8089`
- `CORS_ORIGIN=https://awign-onboarding-system.awignhub.in,http://<your-aws-host>:8088`
- `FRONTEND_URL=https://awign-onboarding-system.awignhub.in`

`CORS_ORIGIN` may contain a comma-separated list when both the public domain and raw port URL need to work.

## 2) Build and start on the EC2 host

From project root:

```bash
docker compose build
docker compose up -d
```

Check status and logs:

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
```

## 3) Open ports in AWS

In your EC2 Security Group, allow inbound TCP:

- `8088` (frontend)
- `8089` (backend, only if you want direct access)

If you only want users to use frontend, you can keep backend access restricted and let frontend proxy API traffic through `/api`.

## 4) Update deployment

After pulling latest code on EC2:

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

## 5) Frontend API base URL

By default, the frontend build leaves `VITE_API_BASE_URL` empty. That makes browser requests use same-origin paths like `/api/me`, and the frontend container's Nginx proxy sends them to the backend service.

For the split production domains, build the frontend with the backend origin only. Do not include `/api`; the application already prefixes every endpoint with `/api`.

```bash
VITE_API_BASE_URL=https://awign-onboarding-system-api.awignhub.in docker compose build frontend
docker compose up -d frontend
```

Avoid setting `VITE_API_BASE_URL` to `/api` or `https://.../api`; older builds with that value generated requests like `/api/api/me`.
