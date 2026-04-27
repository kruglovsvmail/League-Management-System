import cron from 'node-cron';
import pool from '../config/db.js';

export default function setupCronJobs() {
  cron.schedule('0 3 * * *', async () => {
    console.log('⏰ [CRON] Запуск автоматической проверки истекших дисквалификаций...');
    try {
      const result = await pool.query(`
        UPDATE disqualifications
        SET status = 'completed', updated_at = NOW()
        WHERE status = 'active' AND penalty_type = 'time' AND end_date < CURRENT_DATE
        RETURNING id;
      `);
      if (result.rowCount > 0) {
        console.log(`✅ [CRON] Успешно снято временных штрафов: ${result.rowCount}. ID: ${result.rows.map(r => r.id).join(', ')}`);
      }
    } catch (err) {
      console.error('🔥 [CRON] Ошибка при автоматическом обновлении статусов штрафов:', err.message);
    }
  }, { scheduled: true, timezone: "Europe/Moscow" });
}