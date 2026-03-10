import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

pool.on('error', (err, client) => {
  console.error('Неожиданная ошибка на простаивающем клиенте БД:', err.message);
});

pool.connect()
  .then(() => console.log('✅ База данных: Успешное подключение к PostgreSQL'))
  .catch(err => console.error('❌ База данных: Ошибка подключения:', err.stack));

export default pool;