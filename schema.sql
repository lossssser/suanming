CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '留言建议',
  category TEXT NOT NULL DEFAULT '其他',
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS werewolf_rooms (
  code TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quant_records (
  id TEXT PRIMARY KEY,
  trade_date TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  buy_price REAL,
  buy_shares REAL,
  sell_price REAL,
  market_value REAL,
  remark TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quant_notes (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trpg_rooms (
  code TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
