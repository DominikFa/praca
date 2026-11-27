import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app';
import { pool } from './config/db';

const PORT = Number(process.env.PORT) || 3000;

async function bootstrap() {
  await pool.query('SELECT 1');
  console.log('Connected to PostgreSQL');

  const { app, reservationService } = createApp();
  reservationService.startExpirationWorker(60_000);

  app.listen(PORT, () => {
    console.log(`API server listening on http://localhost:${PORT}/api`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});