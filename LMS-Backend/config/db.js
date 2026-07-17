import 'dotenv/config';
import pg from 'pg';

// OID 1082 = date. По умолчанию pg-types строит из него JS Date через локальный
// конструктор в таймзоне процесса Node, а затем res.json()/.toISOString() сдвигает
// календарный день назад в UTC-представлении на любом сервере, где локальная TZ
// впереди UTC — источник бага со сдвигом start_date/end_date в divisions.
// Отдаём как есть: значение и так однозначно ('YYYY-MM-DD', без времени/зоны).
// Эта версия pg не экспортирует types.TypeOverrides, поэтому переопределяем парсер
// глобально на процесс (единственный доступный API в этой версии).
pg.types.setTypeParser(1082, (val) => val);

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  // --- НАСТРОЙКИ СТАБИЛЬНОСТИ СЕТИ ---
  
  // Включает TCP keep-alive пакеты, чтобы соединение не казалось "мертвым" для роутеров
  keepAlive: true, 
  
  // Закрывать простаивающие соединения через 30 секунд. 
  // Это главный фикс: пул сам закроет соединение ДО того, как его грубо разорвет файрвол.
  idleTimeoutMillis: 30000, 
  
  // Таймаут на попытку установить новое соединение (10 секунд)
  connectionTimeoutMillis: 10000,
  
  // Максимальное количество соединений (по умолчанию 10)
  max: 20 
});

// Перехват ошибок на уровне пула
pool.on('error', (err, client) => {
  // Выводим в лог, но не даем приложению упасть. Пул автоматически создаст новое соединение при следующем запросе.
  console.error('⚠️ Ошибка на простаивающем клиенте БД:', err.message);
});

// Тестовое подключение при старте
pool.connect()
  .then(client => {
    console.log('✅ База данных: Успешное подключение к PostgreSQL');
    client.release(); // ВАЖНО: возвращаем клиента обратно в пул, иначе он зависнет навсегда!
  })
  .catch(err => {
    console.error('❌ База данных: Ошибка первичного подключения:', err.message);
  });

export default pool;