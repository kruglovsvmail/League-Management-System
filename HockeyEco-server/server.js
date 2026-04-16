// HockeyEco-server/server.js
import 'dotenv/config'; 
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';

// Импортируем изолированные модули логики
import setupTimerSockets from './sockets/timerHandler.js';
import setupCronJobs from './jobs/cronTasks.js';

// Импортируем маршруты
import publicRoutes from './routes/publicRoutes.js'; 
import authRoutes from './routes/authRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import handbookRoutes from './routes/handbookRoutes.js';
import playerRoutes from './routes/playerRoutes.js'; 
import divisionRoutes from './routes/divisionRoutes.js'; 
import tournamentTeamRoutes from './routes/tournamentTeamRoutes.js';
import tournamentRosterRoutes from './routes/tournamentRosterRoutes.js';
import transferRoutes from './routes/transferRoutes.js';
import disqualificationRoutes from './routes/disqualificationRoutes.js';
import registryRoutes from './routes/registryRoutes.js';
import teamManagementRoutes from './routes/teamManagementRoutes.js';
import gameRoutes from './routes/gameRoutes.js';
import gameLiveDeskRoutes from './routes/gameLiveDeskRoutes.js';
import protocolPDFRoutes from './routes/protocolPDFRoutes.js'; // <-- НАШ НОВЫЙ РОУТЕР

import pool from './config/db.js';

const app = express();
const server = createServer(app);

// --- ИНИЦИАЛИЗАЦИЯ SOCKET.IO ---
const io = new Server(server, {
  cors: {
    origin: '*', // В продакшене лучше указать URL твоего фронта
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Простой хелс-чек БД
app.get('/api/db-check', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ success: true, time: result.rows[0].now });
  } catch (err) {
    console.error('Ошибка проверки БД:', err.message);
    res.status(500).json({ success: false, error: 'Ошибка подключения к базе данных' });
  }
});

// =========================================================
// МАРШРУТЫ
// =========================================================

// 1. Публичные маршруты (монтируем ПЕРЕД всеми остальными, чтобы избежать перехвата токена)
app.use('/api/public', publicRoutes);

// 2. Защищенные маршруты
app.use('/api', authRoutes);
app.use('/api', uploadRoutes);
app.use('/api', settingsRoutes);
app.use('/api', handbookRoutes);
app.use('/api', playerRoutes); 
app.use('/api', divisionRoutes);
app.use('/api', tournamentTeamRoutes);
app.use('/api', tournamentRosterRoutes);
app.use('/api', transferRoutes);
app.use('/api', disqualificationRoutes);
app.use('/api', registryRoutes);
app.use('/api', teamManagementRoutes);
app.use('/api', gameRoutes);
app.use('/api', gameLiveDeskRoutes);
app.use('/api', protocolPDFRoutes); // <-- ПОДКЛЮЧИЛИ РОУТЕР ДЛЯ ПРОТОКОЛОВ

// Инициализация вынесенной логики
setupTimerSockets(io);
setupCronJobs();

const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Сервер HockeyEco LMS (HTTP + WebSockets) запущен на порту ${PORT}`);
});

process.on('uncaughtException', (err) => { console.error('🔥 Критическая ошибка (uncaughtException):', err); });
process.on('unhandledRejection', (reason, promise) => { console.error('⚠️ Необработанный отказ (unhandledRejection) в:', promise, 'причина:', reason); });