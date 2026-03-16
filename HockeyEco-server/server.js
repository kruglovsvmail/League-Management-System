import 'dotenv/config'; // Загружаем переменные из .env в самом начале
import express from 'express';
import cors from 'cors';
import cron from 'node-cron'; // <-- ДОБАВИЛИ ИМПОРТ ПЛАНИРОВЩИКА

// Импортируем маршруты
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

// Импортируем pool для проверки связи
import pool from './config/db.js';

const app = express();

// Настройки Middlewares
app.use(cors());
app.use(express.json());

// Проверка связи с БД (использует переменные из .env через pool)
app.get('/api/db-check', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ success: true, time: result.rows[0].now });
  } catch (err) {
    console.error('Ошибка проверки БД:', err.message);
    res.status(500).json({ success: false, error: 'Ошибка подключения к базе данных' });
  }
});

// --- МАРШРУТЫ ---
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

// --- ФОНОВЫЕ ЗАДАЧИ (CRON) ---
// Проверка и снятие временных штрафов каждый день в 03:00 по Москве
cron.schedule('0 3 * * *', async () => {
  console.log('⏰ [CRON] Запуск автоматической проверки истекших дисквалификаций...');
  try {
    const result = await pool.query(`
      UPDATE disqualifications
      SET status = 'completed', updated_at = NOW()
      WHERE status = 'active' 
        AND penalty_type = 'time' 
        AND end_date < CURRENT_DATE
      RETURNING id;
    `);
    
    if (result.rowCount > 0) {
      console.log(`✅ [CRON] Успешно снято временных штрафов: ${result.rowCount}. ID: ${result.rows.map(r => r.id).join(', ')}`);
    } else {
      console.log('ℹ️ [CRON] На сегодня нет временных штрафов для автоматического снятия.');
    }
  } catch (err) {
    console.error('🔥 [CRON] Ошибка при автоматическом обновлении статусов штрафов:', err.message);
  }
}, {
  scheduled: true,
  timezone: "Europe/Moscow" // Строго задаем московское время
});



// Используем PORT из .env, если его нет — 3001
const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Сервер HockeyEco LMS запущен на порту ${PORT}`);
});

// Глобальная обработка ошибок для предотвращения падения сервера
process.on('uncaughtException', (err) => {
  console.error('🔥 Критическая ошибка (uncaughtException):', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Необработанный отказ (unhandledRejection) в:', promise, 'причина:', reason);
});