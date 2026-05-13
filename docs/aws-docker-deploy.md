# AWS Docker Deployment

This project is containerized with:

- `frontend` exposed on `8088`
- `backend` exposed on `8089`

## 1) Prepare environment variables

Create or update:

- `backend/.env` (required for backend runtime secrets)
- `frontend/.env` (only needed for local dev; Docker frontend build uses `VITE_API_BASE_URL=/api` by default)

At minimum, backend needs:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PORT=8089`
- `CORS_ORIGIN=http://<your-aws-host>:8088` (or your domain)
- `FRONTEND_URL=http://<your-aws-host>:8088` (or your domain)

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

## 5) Optional custom frontend API base URL

By default, frontend build uses `VITE_API_BASE_URL=/api` and Nginx proxies to backend service.

If needed, override at build time:

```bash
VITE_API_BASE_URL=http://<your-aws-host>:8089 docker compose build frontend
docker compose up -d frontend
```
