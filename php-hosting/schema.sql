-- Схема БД для GreenPark (PHP + MySQL, хостинг Рег.ру Host-0).
-- Импортируйте этот файл в свою базу через phpMyAdmin (панель Рег.ру → Базы данных → phpMyAdmin → Импорт).
-- Кодировка utf8mb4 обязательна (русский текст и эмодзи).

SET NAMES utf8mb4;

-- Базовые цены домов (id совпадает с api/houses.php и public/houses-data.js).
CREATE TABLE IF NOT EXISTS prices (
  house_id VARCHAR(32) NOT NULL PRIMARY KEY,
  price    INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Спеццены на конкретные даты (сезон/месяц/отдельные дни).
CREATE TABLE IF NOT EXISTS price_dates (
  house_id VARCHAR(32) NOT NULL,
  d        DATE NOT NULL,
  price    INT NOT NULL,
  PRIMARY KEY (house_id, d)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Занятые даты (в форме брони недоступны).
CREATE TABLE IF NOT EXISTS busy_dates (
  house_id VARCHAR(32) NOT NULL,
  d        DATE NOT NULL,
  PRIMARY KEY (house_id, d)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Журнал заявок (не теряются, даже если Telegram временно недоступен).
CREATE TABLE IF NOT EXISTS bookings (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  ref        VARCHAR(16)  NOT NULL,
  house_id   VARCHAR(32)  NOT NULL,
  house_name VARCHAR(128) NOT NULL,
  check_in   DATE NOT NULL,
  check_out  DATE NOT NULL,
  nights     INT NOT NULL,
  guests     INT NOT NULL,
  name       VARCHAR(128) NOT NULL,
  phone      VARCHAR(64)  NOT NULL,
  total      INT NOT NULL,
  ip         VARCHAR(64)  NULL,
  created_at DATETIME NOT NULL,
  INDEX (ref),
  INDEX (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Антиспам: метки времени запросов по IP.
CREATE TABLE IF NOT EXISTS rate_limit (
  ip VARCHAR(64) NOT NULL,
  ts INT NOT NULL,
  INDEX (ip, ts),
  INDEX (ts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Состояние пошагового диалога Telegram-бота (PHP не хранит память между запросами).
CREATE TABLE IF NOT EXISTS tg_pending (
  chat_id    BIGINT NOT NULL PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Стартовые базовые цены (совпадают с api/houses.php).
INSERT INTO prices (house_id, price) VALUES
  ('dom100', 10000),
  ('dom35',  3500),
  ('dom35b', 3500),
  ('remont', 0)
ON DUPLICATE KEY UPDATE price = VALUES(price);
