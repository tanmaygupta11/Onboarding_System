import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { requireAuth } from './middleware/requireAuth.js';
import programManagersRouter from './routes/programManagers.js';
import clientsRouter from './routes/clients.js';
import meRouter from './routes/me.js';
import pmClientsRouter from './routes/pmClients.js';
import employeesRouter from './routes/employees.js';

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/me', requireAuth, meRouter);
app.use('/api/program-managers', requireAuth, programManagersRouter);
app.use('/api/clients', requireAuth, clientsRouter);
app.use('/api/pm/clients', requireAuth, pmClientsRouter);
app.use('/api/employees', requireAuth, employeesRouter);

app.use((err, _req, res, _next) => {
  console.error('[api error]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
