import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { requireAuth } from './middleware/requireAuth.js';
import programManagersRouter from './routes/programManagers.js';
import clientsRouter from './routes/clients.js';
import meRouter from './routes/me.js';
import pmClientsRouter from './routes/pmClients.js';
import employeesRouter from './routes/employees.js';
import publicOnboardingRouter from './routes/publicOnboarding.js';

const app = express();

function parseCorsOrigin(value) {
  const origins = String(value || 'http://localhost:8088')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length === 1 ? origins[0] : origins;
}

app.use(cors({ origin: parseCorsOrigin(process.env.CORS_ORIGIN) }));
app.use(express.json());

app.get('/', (_req, res) =>
  res.json({
    ok: true,
    service: 'onboarding-system-api',
    health: '/health',
  }),
);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/me', requireAuth, meRouter);
app.use('/api/program-managers', requireAuth, programManagersRouter);
app.use('/api/clients', requireAuth, clientsRouter);
app.use('/api/pm/clients', requireAuth, pmClientsRouter);
app.use('/api/employees', requireAuth, employeesRouter);
app.use('/api/public/onboarding', publicOnboardingRouter);

app.use((err, _req, res, _next) => {
  console.error('[api error]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const port = Number(process.env.PORT) || 8089;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port} (GET / + /health)`);
});
