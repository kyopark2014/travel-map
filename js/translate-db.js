/**
 * Client-side SQLite (sql.js) for 일한/한일 translation history.
 * Persisted via IndexedDB.
 */

const IDB_NAME = 'travel-map-translate';
const IDB_STORE = 'sqlite';
const IDB_KEY = 'translations-v2';
const SQL_CDN = 'https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/';

let sqlReady = null;
let db = null;

function openIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 2);
    req.onupgradeneeded = () => {
      const store = req.result;
      if (!store.objectStoreNames.contains(IDB_STORE)) {
        store.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

async function loadDbBytes() {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
  });
}

async function saveDbBytes(bytes) {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
  });
}

function loadSqlJsScript() {
  if (typeof window.initSqlJs === 'function') {
    return Promise.resolve(window.initSqlJs);
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${SQL_CDN}sql-wasm.js`;
    script.async = true;
    script.onload = () => {
      if (typeof window.initSqlJs === 'function') resolve(window.initSqlJs);
      else reject(new Error('initSqlJs not available'));
    };
    script.onerror = () => reject(new Error('Failed to load sql.js'));
    document.head.appendChild(script);
  });
}

function tableColumns(database, table) {
  const rows = database.exec(`PRAGMA table_info(${table})`);
  if (!rows?.[0]?.values) return new Set();
  return new Set(rows[0].values.map((v) => v[1]));
}

function ensureSchema(database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS translations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      direction TEXT NOT NULL DEFAULT 'ja2ko',
      korean TEXT,
      japanese TEXT,
      pronunciation TEXT,
      model_id TEXT,
      created_at TEXT NOT NULL
    );
  `);
  const cols = tableColumns(database, 'translations');
  if (!cols.has('direction')) {
    database.run(
      `ALTER TABLE translations ADD COLUMN direction TEXT NOT NULL DEFAULT 'ja2ko'`,
    );
  }
  if (!cols.has('japanese')) {
    database.run(`ALTER TABLE translations ADD COLUMN japanese TEXT`);
  }
  if (!cols.has('pronunciation')) {
    database.run(`ALTER TABLE translations ADD COLUMN pronunciation TEXT`);
  }
  database.run(`
    CREATE INDEX IF NOT EXISTS idx_translations_direction_id
    ON translations(direction, id);
  `);
}

async function persist() {
  if (!db) return;
  const data = db.export();
  await saveDbBytes(data);
}

export async function initTranslateDb() {
  if (db) return db;
  if (!sqlReady) {
    sqlReady = (async () => {
      const initSqlJs = await loadSqlJsScript();
      const SQL = await initSqlJs({
        locateFile: (file) => `${SQL_CDN}${file}`,
      });
      const saved = await loadDbBytes();
      const database = saved
        ? new SQL.Database(new Uint8Array(saved))
        : new SQL.Database();
      ensureSchema(database);
      db = database;
      await persist();
      return db;
    })();
  }
  return sqlReady;
}

export async function insertTranslation({
  direction = 'ja2ko',
  korean = '',
  japanese = '',
  pronunciation = '',
  modelId = '',
}) {
  const dir = direction === 'ko2ja' ? 'ko2ja' : 'ja2ko';
  const ko = String(korean || '').trim();
  const ja = String(japanese || '').trim();
  const pron = String(pronunciation || '').trim();
  if (dir === 'ja2ko' && !ko) return null;
  if (dir === 'ko2ja' && !ko && !ja) return null;

  const database = await initTranslateDb();
  const createdAt = new Date().toISOString();
  database.run(
    `INSERT INTO translations
      (direction, korean, japanese, pronunciation, model_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [dir, ko || null, ja || null, pron || null, modelId || null, createdAt],
  );
  const row = database.exec('SELECT last_insert_rowid() AS id');
  const id = row?.[0]?.values?.[0]?.[0] ?? null;
  await persist();
  return {
    id,
    direction: dir,
    korean: ko,
    japanese: ja,
    pronunciation: pron,
    modelId: modelId || '',
    createdAt,
  };
}

export async function listTranslations({ direction = 'ja2ko', limit = 500 } = {}) {
  const dir = direction === 'ko2ja' ? 'ko2ja' : 'ja2ko';
  const database = await initTranslateDb();
  const stmt = database.prepare(
    `SELECT id, direction, korean, japanese, pronunciation, model_id, created_at
     FROM translations
     WHERE direction = ?
     ORDER BY id ASC
     LIMIT ?`,
  );
  stmt.bind([dir, Math.max(1, Number(limit) || 500)]);
  const rows = [];
  while (stmt.step()) {
    const r = stmt.getAsObject();
    rows.push({
      id: r.id,
      direction: r.direction || dir,
      korean: r.korean || '',
      japanese: r.japanese || '',
      pronunciation: r.pronunciation || '',
      modelId: r.model_id || '',
      createdAt: r.created_at,
    });
  }
  stmt.free();
  return rows;
}
