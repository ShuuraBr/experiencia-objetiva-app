import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

import mysql from "mysql2/promise";

import { escapeCsv, formatAverage, nowIso, slugify, toNullableText } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sqlitePath = path.resolve(__dirname, "../data/experiencia-objetiva.sqlite");

// ---------------------------------------------------------------------------
// Cascade sector seed — 10 leaf sectors
// ---------------------------------------------------------------------------
const SECTOR_SEED = [
  // ── Comercial — Vendas ─────────────────────────────────────────────────
  {
    slug: "comercial-vendas", name: "Vendas", category: "Comercial",
    sortOrder: 1, employeesRequired: 1,
    questions: [
      { text: "Como você avalia o conhecimento do atendente sobre produtos/serviços?", reverse: false },
      { text: "Como você avalia a clareza das informações fornecidas?", reverse: false },
      { text: "Como você avalia o tempo de atendimento?", reverse: false },
      { text: "Como você avalia a capacidade de entender sua necessidade?", reverse: false },
      { text: "Como você avalia a abordagem do atendente (sem pressão excessiva)?", reverse: false },
    ],
  },
  // ── Comercial — Compras ────────────────────────────────────────────────
  {
    slug: "comercial-compras", name: "Compras", category: "Comercial",
    sortOrder: 2, employeesRequired: 1,
    questions: [
      { text: "Como você avalia a clareza das solicitações de compra (quantidades, especificações, prazos)?", reverse: false },
      { text: "Como você avalia a comunicação com o comprador (retorno, alinhamento)?", reverse: false },
      { text: "Como você avalia o cumprimento dos acordos firmados?", reverse: false },
      { text: "Como você avalia a condução das negociações (profissionalismo, transparência)?", reverse: false },
      { text: "Como você avalia o relacionamento comercial de forma geral?", reverse: false },
    ],
  },
  // ── Comercial — Caixa ─────────────────────────────────────────────────
  {
    slug: "comercial-caixa", name: "Caixa", category: "Comercial",
    sortOrder: 3, employeesRequired: 0,
    questions: [
      { text: "Como você avalia a agilidade no processo de pagamento?", reverse: false },
      { text: "Como você avalia a cordialidade do atendente?", reverse: false },
      { text: "Como você avalia a clareza nas informações de cobrança?", reverse: false },
      { text: "Como você avalia o tempo de espera na fila?", reverse: false },
      { text: "Como você avalia a eficiência geral do atendimento?", reverse: false },
    ],
  },
  // ── Expedição — Interna ───────────────────────────────────────────────
  {
    slug: "expedicao-interna", name: "Expedição Interna (Balcão Loja)", category: "Expedição",
    sortOrder: 4, employeesRequired: 0,
    questions: [
      { text: "Como você avalia o tempo de espera para retirada?", reverse: false },
      { text: "Como você avalia a organização do setor?", reverse: false },
      { text: "Como você avalia a precisão dos itens entregues?", reverse: false },
      { text: "Como você avalia a cordialidade dos colaboradores?", reverse: false },
      { text: "Como você avalia a facilidade de localização do setor?", reverse: false },
    ],
  },
  // ── Expedição — Externa ───────────────────────────────────────────────
  {
    slug: "expedicao-externa", name: "Expedição Externa (Pátio/Filial-Park Sul)", category: "Expedição",
    sortOrder: 5, employeesRequired: 0,
    questions: [
      { text: "Como você avalia a agilidade no atendimento?", reverse: false },
      { text: "Como você avalia a organização do processo (fila/ordem)?", reverse: false },
      { text: "Como você avalia a clareza das orientações?", reverse: false },
      { text: "Como você avalia a cordialidade dos colaboradores?", reverse: false },
      { text: "Como você avalia a precisão do pedido entregue?", reverse: false },
    ],
  },
  // ── Entrega — Objetiva ────────────────────────────────────────────────
  {
    slug: "entrega-objetiva", name: "Objetiva", category: "Entrega",
    sortOrder: 6, employeesRequired: 0,
    questions: [
      { text: "Como você avalia o cumprimento do prazo?", reverse: false },
      { text: "Como você avalia as condições do produto na entrega?", reverse: false },
      { text: "Como você avalia a postura do entregador?", reverse: false },
      { text: "Como você avalia a comunicação sobre o status da entrega?", reverse: false },
      { text: "Como você avalia a experiência geral da entrega?", reverse: false },
    ],
  },
  // ── Entrega — Freteiro ────────────────────────────────────────────────
  {
    slug: "entrega-freteiro", name: "Freteiro", category: "Entrega",
    sortOrder: 7, employeesRequired: 0,
    questions: [
      { text: "Como você avalia o cumprimento do prazo?", reverse: false },
      { text: "Como você avalia as condições do produto na entrega?", reverse: false },
      { text: "Como você avalia a postura do entregador?", reverse: false },
      { text: "Como você avalia a comunicação sobre o status da entrega?", reverse: false },
      { text: "Como você avalia a experiência geral da entrega?", reverse: false },
    ],
  },
  // ── Administrativo — Financeiro ───────────────────────────────────────
  {
    slug: "admin-financeiro", name: "Financeiro", category: "Administrativo",
    sortOrder: 8, employeesRequired: 0,
    questions: [
      { text: "Como você avalia a clareza nas informações financeiras (boletos, cobranças, faturas)?", reverse: false },
      { text: "Como você avalia o tempo de retorno às solicitações?", reverse: false },
      { text: "Como você avalia a precisão das informações fornecidas?", reverse: false },
      { text: "Como você avalia a facilidade de resolução de pendências?", reverse: false },
      { text: "Como você avalia o atendimento do setor de forma geral?", reverse: false },
    ],
  },
  // ── Administrativo — RH ───────────────────────────────────────────────
  {
    slug: "admin-rh", name: "RH", category: "Administrativo",
    sortOrder: 9, employeesRequired: 0,
    questions: [
      { text: "Como você avalia a clareza das orientações fornecidas?", reverse: false },
      { text: "Como você avalia o suporte prestado aos colaboradores?", reverse: false },
      { text: "Como você avalia o tempo de resposta às solicitações?", reverse: false },
      { text: "Como você avalia a disponibilidade para atendimento?", reverse: false },
      { text: "Como você avalia o atendimento de forma geral?", reverse: false },
    ],
  },
  // ── Administrativo — DP ───────────────────────────────────────────────
  {
    slug: "admin-dp", name: "DP", category: "Administrativo",
    sortOrder: 10, employeesRequired: 0,
    questions: [
      { text: "Como você avalia a precisão das informações (folha, benefícios, ponto)?", reverse: false },
      { text: "Como você avalia o cumprimento de prazos (pagamentos, documentos)?", reverse: false },
      { text: "Como você avalia a clareza nas orientações?", reverse: false },
      { text: "Como você avalia o tempo de resposta?", reverse: false },
      { text: "Como você avalia a eficiência na resolução de demandas?", reverse: false },
    ],
  },
];


// ---------------------------------------------------------------------------
// SQLite Schema
// ---------------------------------------------------------------------------
const sqliteSchema = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS sectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    employees_required INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sector_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sector_id INTEGER NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    text TEXT NOT NULL,
    is_reverse INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE(sector_id, position)
  );

  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sector_id INTEGER NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sector_id INTEGER NOT NULL REFERENCES sectors(id) ON DELETE RESTRICT,
    employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_contact TEXT,
    comment TEXT,
    overall_score REAL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS response_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    response_id INTEGER NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES sector_questions(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5)
  );

  CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tfa_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

// ---------------------------------------------------------------------------
// MySQL Schema
// ---------------------------------------------------------------------------
const mysqlSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS sectors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(120) NOT NULL UNIQUE,
    name VARCHAR(160) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT '',
    sort_order INT NOT NULL DEFAULT 0,
    employees_required TINYINT(1) NOT NULL DEFAULT 1,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at VARCHAR(30) NOT NULL,
    updated_at VARCHAR(30) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS sector_questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sector_id INT NOT NULL,
    position INT NOT NULL,
    text VARCHAR(500) NOT NULL,
    is_reverse TINYINT(1) NOT NULL DEFAULT 0,
    created_at VARCHAR(30) NOT NULL,
    UNIQUE KEY uniq_sector_position (sector_id, position),
    CONSTRAINT fk_sector_questions_sector FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sector_id INT NOT NULL,
    name VARCHAR(180) NOT NULL,
    role VARCHAR(180) NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at VARCHAR(30) NOT NULL,
    updated_at VARCHAR(30) NOT NULL,
    INDEX idx_employees_sector (sector_id),
    CONSTRAINT fk_employees_sector FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS responses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sector_id INT NOT NULL,
    employee_id INT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_contact VARCHAR(255) NULL,
    comment TEXT NULL,
    overall_score DECIMAL(4,2) NULL,
    created_at VARCHAR(30) NOT NULL,
    INDEX idx_responses_sector (sector_id),
    INDEX idx_responses_employee (employee_id),
    INDEX idx_responses_created (created_at),
    CONSTRAINT fk_responses_sector FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE RESTRICT,
    CONSTRAINT fk_responses_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS response_answers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    response_id INT NOT NULL,
    question_id INT NOT NULL,
    score TINYINT NOT NULL,
    INDEX idx_rr (response_id),
    INDEX idx_rq (question_id),
    CONSTRAINT fk_rr FOREIGN KEY (response_id) REFERENCES responses(id) ON DELETE CASCADE,
    CONSTRAINT fk_rq FOREIGN KEY (question_id) REFERENCES sector_questions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    id VARCHAR(64) PRIMARY KEY,
    created_at VARCHAR(30) NOT NULL,
    expires_at VARCHAR(30) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS tfa_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(10) NOT NULL,
    created_at VARCHAR(30) NOT NULL,
    expires_at VARCHAR(30) NOT NULL,
    used TINYINT(1) NOT NULL DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

// ---------------------------------------------------------------------------
// Adapter bootstrap
// ---------------------------------------------------------------------------
export const storageMode = detectDbClient();
let adapter = null;
let dbInitError = null;
const dbReadyPromise = initializeDatabase();

async function initializeDatabase() {
  try {
    adapter = await createAdapter(storageMode);
    await adapter.init();
    await runSqliteMigrations();
    await seedSectorsAndQuestions();
    await runSqlitePostSeedMigrations();
  } catch (error) {
    dbInitError = error;
    console.error("[db] initialization failed:", error);
  }
}

function detectDbClient() {
  const explicitClient = toNullableText(process.env.DB_CLIENT)?.toLowerCase();
  if (explicitClient === "mysql" || explicitClient === "sqlite") return explicitClient;
  if (process.env.DATABASE_URL || process.env.DB_HOST || process.env.DB_NAME) return "mysql";
  return "sqlite";
}

async function createAdapter(client) {
  return client === "mysql" ? createMySqlAdapter() : createSqliteAdapter();
}

function ensureSqliteDirectory() {
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
}

async function createSqliteAdapter() {
  const { DatabaseSync } = await import("node:sqlite");
  ensureSqliteDirectory();
  const sqlite = new DatabaseSync(sqlitePath);
  return {
    async init() { sqlite.exec(sqliteSchema); },
    async all(sql, params = []) { return sqlite.prepare(sql).all(...params); },
    async get(sql, params = []) { return sqlite.prepare(sql).get(...params) ?? null; },
    async run(sql, params = []) {
      const result = sqlite.prepare(sql).run(...params);
      return { lastInsertId: Number(result.lastInsertRowid ?? 0), changes: Number(result.changes ?? 0) };
    },
  };
}

async function runSqliteMigrations() {
  if (storageMode !== "sqlite") return;
  const cols = await adapter.all(`PRAGMA table_info(sectors)`);
  const colNames = cols.map((c) => c.name);
  if (!colNames.includes("category")) {
    await adapter.run(`ALTER TABLE sectors ADD COLUMN category TEXT NOT NULL DEFAULT ''`);
  }
  if (!colNames.includes("employees_required")) {
    await adapter.run(`ALTER TABLE sectors ADD COLUMN employees_required INTEGER NOT NULL DEFAULT 1`);
  }
  // Auth tables (created by schema but handle pre-existing DBs)
  await adapter.run(`CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, expires_at TEXT NOT NULL
  )`);
  await adapter.run(`CREATE TABLE IF NOT EXISTS tfa_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL,
    created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0
  )`);
}

function normalizeLegacyText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function clampLegacyScore(value, fallback = 3) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.min(5, Math.max(1, Math.round(numeric)));
  }
  return Math.min(5, Math.max(1, Math.round(fallback)));
}

function inferLegacySectorSlug(pointRow) {
  const haystack = normalizeLegacyText([
    pointRow?.title,
    pointRow?.responsible_area,
    pointRow?.journey_stage,
    pointRow?.channel,
    pointRow?.description,
    pointRow?.unit_name,
  ].filter(Boolean).join(" "));

  if (!haystack) return "comercial-vendas";
  if (haystack.includes("caixa")) return "comercial-caixa";
  if (haystack.includes("compra")) return "comercial-compras";
  if (haystack.includes("balcao") || haystack.includes("interna")) return "expedicao-interna";
  if (haystack.includes("patio") || haystack.includes("externa") || haystack.includes("park sul")) return "expedicao-externa";
  if (haystack.includes("freteiro")) return "entrega-freteiro";
  if (haystack.includes("entrega") || haystack.includes("motorista")) return "entrega-objetiva";
  if (haystack.includes("finance")) return "admin-financeiro";
  if (haystack.includes("recursos humanos") || /\brh\b/.test(haystack)) return "admin-rh";
  if (haystack.includes("departamento pessoal") || /\bdp\b/.test(haystack)) return "admin-dp";
  return "comercial-vendas";
}

async function runSqlitePostSeedMigrations() {
  if (storageMode !== "sqlite") return;

  const responseCols = await adapter.all(`PRAGMA table_info(responses)`);
  const responseColNames = responseCols.map((c) => c.name);

  if (!responseColNames.includes("sector_id") && responseColNames.includes("point_id")) {
    await migrateLegacySqliteResponses();
    return;
  }

  if (responseColNames.includes("sector_id") && !responseColNames.includes("employee_id")) {
    await adapter.run(`ALTER TABLE responses ADD COLUMN employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL`);
  }

  if (responseColNames.includes("sector_id") && !responseColNames.includes("customer_contact")) {
    await adapter.run(`ALTER TABLE responses ADD COLUMN customer_contact TEXT`);
  }
}

async function migrateLegacySqliteResponses() {
  const legacyRows = await adapter.all(
    `SELECT r.*, cp.title, cp.unit_name, cp.journey_stage, cp.channel, cp.responsible_area, cp.description
      FROM responses r
      LEFT JOIN collection_points cp ON cp.id = r.point_id
      ORDER BY r.id ASC`,
  );

  const sectors = await adapter.all(`SELECT id, slug FROM sectors ORDER BY id ASC`);
  const sectorIdBySlug = new Map(sectors.map((sector) => [sector.slug, Number(sector.id)]));
  const fallbackSectorId = Number(sectors[0]?.id || 0);
  if (!fallbackSectorId) {
    throw new Error("Nenhum setor foi encontrado para migrar o banco SQLite legado.");
  }

  const questionRows = await adapter.all(
    `SELECT id, sector_id, position FROM sector_questions ORDER BY sector_id ASC, position ASC`,
  );
  const questionsBySectorId = new Map();
  for (const row of questionRows) {
    const sectorId = Number(row.sector_id);
    if (!questionsBySectorId.has(sectorId)) questionsBySectorId.set(sectorId, []);
    questionsBySectorId.get(sectorId).push({ id: Number(row.id), position: Number(row.position) });
  }

  const backupTableName = "responses_legacy_backup";

  try {
    await adapter.run(`BEGIN IMMEDIATE`);
    await adapter.run(`ALTER TABLE responses RENAME TO ${backupTableName}`);
    await adapter.run(`DROP TABLE IF EXISTS response_answers`);
    await adapter.run(`CREATE TABLE responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sector_id INTEGER NOT NULL REFERENCES sectors(id) ON DELETE RESTRICT,
      employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL,
      customer_contact TEXT,
      comment TEXT,
      overall_score REAL,
      created_at TEXT NOT NULL
    )`);
    await adapter.run(`CREATE TABLE response_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      response_id INTEGER NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES sector_questions(id) ON DELETE CASCADE,
      score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5)
    )`);

    for (const row of legacyRows) {
      const inferredSlug = inferLegacySectorSlug(row);
      const sectorId = sectorIdBySlug.get(inferredSlug) || fallbackSectorId;
      const questionSet = questionsBySectorId.get(sectorId) || [];
      const fallbackScore = clampLegacyScore(row.overall_score, 3);
      const answers = [
        clampLegacyScore(row.service_quality, fallbackScore),
        clampLegacyScore(row.guidance_clarity, fallbackScore),
        clampLegacyScore(row.solution_fit, fallbackScore),
        clampLegacyScore(row.operational_efficiency, fallbackScore),
        clampLegacyScore(row.delivery_rating, fallbackScore),
      ];

      const responseResult = await adapter.run(
        `INSERT INTO responses (sector_id, employee_id, customer_name, customer_contact, comment, overall_score, created_at)
         VALUES (?, NULL, ?, NULL, ?, ?, ?)`,
        [
          sectorId,
          row.customer_name || "Cliente nao identificado",
          row.comment ?? null,
          Number(row.overall_score ?? fallbackScore),
          row.created_at,
        ],
      );

      for (let index = 0; index < questionSet.length; index++) {
        const question = questionSet[index];
        await adapter.run(
          `INSERT INTO response_answers (response_id, question_id, score) VALUES (?, ?, ?)`,
          [responseResult.lastInsertId, question.id, answers[index] ?? fallbackScore],
        );
      }
    }

    await adapter.run(`COMMIT`);
  } catch (error) {
    await adapter.run(`ROLLBACK`).catch(() => {});
    throw error;
  }
}

function getMySqlConfig() {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    if (url.protocol !== "mysql:") throw new Error("DATABASE_URL deve usar o protocolo mysql://.");
    return { host: url.hostname, port: Number(url.port || 3306),
      user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\/+/, ""), };
  }
  const host = toNullableText(process.env.DB_HOST);
  const user = toNullableText(process.env.DB_USER);
  const password = process.env.DB_PASSWORD ?? "";
  const database = toNullableText(process.env.DB_NAME);
  const port = Number(process.env.DB_PORT || 3306);
  if (!host || !user || !database) throw new Error("Defina DB_HOST, DB_USER e DB_NAME para usar MySQL.");
  return { host, port, user, password, database };
}

async function runMysqlMigrations(pool) {
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sectors'`
  );
  const colNames = cols.map((c) => c.COLUMN_NAME);
  if (!colNames.includes("category")) {
    await pool.query(`ALTER TABLE sectors ADD COLUMN category VARCHAR(100) NOT NULL DEFAULT '' AFTER name`);
  }
  if (!colNames.includes("employees_required")) {
    await pool.query(`ALTER TABLE sectors ADD COLUMN employees_required TINYINT(1) NOT NULL DEFAULT 1 AFTER category`);
  }
  const [rCols] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'responses' AND COLUMN_NAME = 'employee_id'`
  );
  if (rCols.length === 0) {
    await pool.query(`ALTER TABLE responses ADD COLUMN employee_id INT NULL AFTER sector_id`);
  }
  const [cc] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'responses' AND COLUMN_NAME = 'customer_contact'`
  );
  if (cc.length === 0) {
    await pool.query(`ALTER TABLE responses ADD COLUMN customer_contact VARCHAR(255) NULL AFTER customer_name`);
  }
}

async function createMySqlAdapter() {
  const config = getMySqlConfig();
  const pool = mysql.createPool({ ...config, waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10), queueLimit: 0, charset: "utf8mb4" });
  return {
    async init() {
      for (const stmt of mysqlSchemaStatements) await pool.query(stmt);
      await runMysqlMigrations(pool);
    },
    async all(sql, params = []) { const [rows] = await pool.execute(sql, params); return rows; },
    async get(sql, params = []) { const [rows] = await pool.execute(sql, params); return rows[0] ?? null; },
    async run(sql, params = []) {
      const [result] = await pool.execute(sql, params);
      return { lastInsertId: Number(result.insertId ?? 0), changes: Number(result.affectedRows ?? 0) };
    },
  };
}

async function seedSectorsAndQuestions() {
  const now = nowIso();
  for (const seed of SECTOR_SEED) {
    let sector = await adapter.get("SELECT id FROM sectors WHERE slug = ?", [seed.slug]);
    if (!sector) {
      const result = await adapter.run(
        `INSERT INTO sectors (slug, name, category, sort_order, employees_required, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        [seed.slug, seed.name, seed.category, seed.sortOrder, seed.employeesRequired, now, now],
      );
      sector = { id: result.lastInsertId };
    } else {
      await adapter.run(
        `UPDATE sectors SET name=?, category=?, sort_order=?, employees_required=?, updated_at=? WHERE id=?`,
        [seed.name, seed.category, seed.sortOrder, seed.employeesRequired, now, sector.id],
      );
    }
    for (let i = 0; i < seed.questions.length; i++) {
      const q = seed.questions[i];
      const pos = i + 1;
      const ex = await adapter.get("SELECT id FROM sector_questions WHERE sector_id=? AND position=?", [sector.id, pos]);
      if (ex) {
        await adapter.run(`UPDATE sector_questions SET text=?, is_reverse=? WHERE id=?`, [q.text, q.reverse ? 1 : 0, ex.id]);
      } else {
        await adapter.run(
          `INSERT INTO sector_questions (sector_id, position, text, is_reverse, created_at) VALUES (?,?,?,?,?)`,
          [sector.id, pos, q.text, q.reverse ? 1 : 0, now],
        );
      }
    }
  }
}

async function ensureAdapter() {
  await dbReadyPromise;
  if (dbInitError) throw new Error(`Falha ao inicializar o banco de dados: ${dbInitError.message}`);
  if (!adapter) throw new Error("Banco de dados indisponivel.");
  return adapter;
}

export function getDatabaseStatus() {
  return { storageMode, ready: Boolean(adapter) && !dbInitError, error: dbInitError ? dbInitError.message : null };
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
function mapSector(row, extras = {}) {
  if (!row) return null;
  return {
    id: Number(row.id), slug: row.slug, name: row.name, category: row.category || "",
    sortOrder: Number(row.sort_order ?? 0), active: Boolean(Number(row.active ?? 1)),
    employeesRequired: Boolean(Number(row.employees_required ?? 1)),
    responseCount: Number(row.response_count ?? 0), employeeCount: Number(row.employee_count ?? 0),
    averageScore: row.average_score == null ? null : Number(row.average_score),
    ...extras,
  };
}

function mapQuestion(row) {
  if (!row) return null;
  return { id: Number(row.id), sectorId: Number(row.sector_id), position: Number(row.position),
    text: row.text, isReverse: Boolean(Number(row.is_reverse ?? 0)) };
}

function mapEmployee(row) {
  if (!row) return null;
  return { id: Number(row.id), sectorId: Number(row.sector_id), sectorName: row.sector_name,
    sectorSlug: row.sector_slug, name: row.name, role: row.role,
    active: Boolean(Number(row.active ?? 1)), responseCount: Number(row.response_count ?? 0),
    averageScore: row.average_score == null ? null : Number(row.average_score),
    createdAt: row.created_at, updatedAt: row.updated_at };
}

// ---------------------------------------------------------------------------
// Sector queries
// ---------------------------------------------------------------------------
export async function listSectors() {
  const db = await ensureAdapter();
  const rows = await db.all(`
    SELECT s.*,
      COALESCE(ec.employee_count, 0) AS employee_count,
      COALESCE(rs.response_count, 0) AS response_count, rs.average_score
    FROM sectors s
    LEFT JOIN (SELECT sector_id, COUNT(*) AS employee_count FROM employees WHERE active=1 GROUP BY sector_id) ec ON ec.sector_id=s.id
    LEFT JOIN (SELECT sector_id, COUNT(*) AS response_count, ROUND(AVG(overall_score),2) AS average_score FROM responses GROUP BY sector_id) rs ON rs.sector_id=s.id
    WHERE s.active=1 ORDER BY s.sort_order ASC, s.name ASC`);
  return rows.map((r) => mapSector(r));
}

export async function getSectorWithDetails(slug) {
  const db = await ensureAdapter();
  const sectorRow = await db.get(`SELECT * FROM sectors WHERE slug=? AND active=1`, [slug]);
  if (!sectorRow) return null;
  const questions = await db.all(`SELECT * FROM sector_questions WHERE sector_id=? ORDER BY position ASC`, [sectorRow.id]);
  const employees = await db.all(
    `SELECT e.*, s.name AS sector_name, s.slug AS sector_slug FROM employees e JOIN sectors s ON s.id=e.sector_id
     WHERE e.sector_id=? AND e.active=1 ORDER BY e.name ASC`, [sectorRow.id]);
  return { ...mapSector(sectorRow), questions: questions.map(mapQuestion), employees: employees.map(mapEmployee) };
}

export async function listEmployees({ sectorId } = {}) {
  const db = await ensureAdapter();
  const clauses = ["e.active=1"];
  const params = [];
  if (sectorId) { clauses.push("e.sector_id=?"); params.push(Number(sectorId)); }
  const rows = await db.all(
    `SELECT e.*, s.name AS sector_name, s.slug AS sector_slug,
        COALESCE(es.response_count,0) AS response_count, es.average_score
      FROM employees e JOIN sectors s ON s.id=e.sector_id
      LEFT JOIN (SELECT employee_id, COUNT(*) AS response_count, ROUND(AVG(overall_score),2) AS average_score
        FROM responses WHERE employee_id IS NOT NULL GROUP BY employee_id) es ON es.employee_id=e.id
      WHERE ${clauses.join(" AND ")} ORDER BY s.sort_order ASC, e.name ASC`, params);
  return rows.map(mapEmployee);
}

export async function createEmployee(payload) {
  const db = await ensureAdapter();
  const name = toNullableText(payload.name);
  const sectorId = Number(payload.sectorId);
  const role = toNullableText(payload.role);
  if (!name) throw new Error("Informe o nome do funcionário.");
  if (!Number.isInteger(sectorId) || sectorId <= 0) throw new Error("Informe um setor válido.");
  const sector = await db.get(`SELECT id FROM sectors WHERE id=? AND active=1`, [sectorId]);
  if (!sector) throw new Error("Setor não encontrado.");
  const now = nowIso();
  const result = await db.run(
    `INSERT INTO employees (sector_id, name, role, active, created_at, updated_at) VALUES (?,?,?,1,?,?)`,
    [sectorId, name, role, now, now]);
  return getEmployeeById(result.lastInsertId);
}

export async function getEmployeeById(id) {
  const db = await ensureAdapter();
  const row = await db.get(
    `SELECT e.*, s.name AS sector_name, s.slug AS sector_slug,
        COALESCE(es.response_count,0) AS response_count, es.average_score
      FROM employees e JOIN sectors s ON s.id=e.sector_id
      LEFT JOIN (SELECT employee_id, COUNT(*) AS response_count, ROUND(AVG(overall_score),2) AS average_score
        FROM responses WHERE employee_id IS NOT NULL GROUP BY employee_id) es ON es.employee_id=e.id
      WHERE e.id=?`, [Number(id)]);
  return mapEmployee(row);
}

export async function deactivateEmployee(id) {
  const db = await ensureAdapter();
  await db.run(`UPDATE employees SET active=0, updated_at=? WHERE id=?`, [nowIso(), Number(id)]);
}

// ---------------------------------------------------------------------------
// Save response — employeeId optional for sectors with employees_required=0
// ---------------------------------------------------------------------------
export async function saveResponse(payload) {
  const db = await ensureAdapter();
  const sectorSlug = toNullableText(payload.sectorSlug);
  if (!sectorSlug) throw new Error("Selecione o setor avaliado.");

  const sector = await db.get(`SELECT * FROM sectors WHERE slug=? AND active=1`, [sectorSlug]);
  if (!sector) throw new Error("Setor não encontrado.");

  const employeesRequired = Boolean(Number(sector.employees_required ?? 1));
  let employeeId = null;
  let employee = null;

  if (employeesRequired) {
    employeeId = payload.employeeId ? Number(payload.employeeId) : null;
    if (!employeeId || !Number.isInteger(employeeId) || employeeId <= 0) {
      throw new Error("Selecione o funcionário avaliado.");
    }
    employee = await db.get(`SELECT * FROM employees WHERE id=? AND sector_id=? AND active=1`, [employeeId, sector.id]);
    if (!employee) throw new Error("Funcionário não encontrado para este setor.");
  }

  const customerName = toNullableText(payload.customerName);
  if (!customerName) throw new Error("Informe seu nome para enviar a avaliação.");
  const customerContact = toNullableText(payload.customerContact);
  const comment = toNullableText(payload.comment);

  const questions = await db.all(`SELECT * FROM sector_questions WHERE sector_id=? ORDER BY position ASC`, [sector.id]);
  if (!Array.isArray(payload.answers) || payload.answers.length === 0) throw new Error("Responda todas as perguntas.");

  const answersByQuestion = new Map();
  for (const answer of payload.answers) {
    const qId = Number(answer.questionId);
    const score = Number(answer.score);
    if (!Number.isInteger(qId) || !Number.isInteger(score) || score < 1 || score > 5) throw new Error("Respostas inválidas.");
    answersByQuestion.set(qId, score);
  }
  for (const q of questions) {
    if (!answersByQuestion.has(Number(q.id))) throw new Error(`Responda todas as perguntas do setor ${sector.name}.`);
  }

  const now = nowIso();
  const normalized = questions.map((q) => {
    const raw = answersByQuestion.get(Number(q.id));
    return Number(q.is_reverse) === 1 ? 6 - raw : raw;
  });
  const overallScore = Number((normalized.reduce((s, v) => s + v, 0) / normalized.length).toFixed(2));

  const result = await db.run(
    `INSERT INTO responses (sector_id, employee_id, customer_name, customer_contact, comment, overall_score, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    [sector.id, employeeId, customerName, customerContact, comment, overallScore, now]);

  const responseId = result.lastInsertId;
  for (const q of questions) {
    await db.run(`INSERT INTO response_answers (response_id, question_id, score) VALUES (?,?,?)`,
      [responseId, q.id, answersByQuestion.get(Number(q.id))]);
  }

  return { id: responseId, sectorId: sector.id, sectorName: sector.name,
    employeeId, employeeName: employee ? employee.name : null, overallScore };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
function buildResponseFilter(filters = {}) {
  const clauses = [];
  const params = [];
  if (filters.sectorId) { clauses.push("r.sector_id=?"); params.push(Number(filters.sectorId)); }
  if (filters.employeeId) { clauses.push("r.employee_id=?"); params.push(Number(filters.employeeId)); }
  if (filters.startDate) { clauses.push("substr(r.created_at,1,10)>=?"); params.push(filters.startDate); }
  if (filters.endDate) { clauses.push("substr(r.created_at,1,10)<=?"); params.push(filters.endDate); }
  return { sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

export async function getDashboard(filters = {}) {
  const db = await ensureAdapter();
  const filter = buildResponseFilter(filters);

  const summary = await db.get(
    `SELECT COUNT(*) AS total_responses, ROUND(AVG(r.overall_score),2) AS average_overall
      FROM responses r JOIN sectors s ON s.id=r.sector_id ${filter.sql}`, filter.params);

  // Score distribution — count EACH answer score (not rounded overall)
  const distRows = await db.all(
    `SELECT ra.score AS score_cat, COUNT(*) AS cnt
      FROM response_answers ra
      JOIN responses r ON r.id = ra.response_id
      JOIN sectors s ON s.id = r.sector_id ${filter.sql}
      GROUP BY ra.score`, filter.params);

  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of distRows) {
    const cat = Math.min(5, Math.max(1, Math.round(Number(row.score_cat))));
    dist[cat] = (dist[cat] || 0) + Number(row.cnt);
  }

  // Per-score question breakdown — for each score level, which questions got that rating and how many times
  const questionScoreRows = await db.all(
    `SELECT ra.score, sq.id AS question_id, sq.text AS question_text, sq.position,
        COUNT(*) AS cnt
      FROM response_answers ra
      JOIN responses r ON r.id = ra.response_id
      JOIN sectors s ON s.id = r.sector_id
      JOIN sector_questions sq ON sq.id = ra.question_id ${filter.sql}
      GROUP BY ra.score, sq.id, sq.text, sq.position
      ORDER BY ra.score ASC, cnt DESC`, filter.params);

  // Group by score: { 1: [{questionId, text, count},...], ... }
  const questionsByScore = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const row of questionScoreRows) {
    const s = Math.min(5, Math.max(1, Number(row.score)));
    questionsByScore[s].push({ questionId: Number(row.question_id), text: row.question_text, count: Number(row.cnt) });
  }
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  const lowCount = dist[1] + dist[2];
  const highCount = dist[4] + dist[5];

  const trend = await db.all(
    `SELECT substr(r.created_at,1,10) AS day, COUNT(*) AS responses,
        ROUND(AVG(r.overall_score),2) AS average_score
      FROM responses r JOIN sectors s ON s.id=r.sector_id ${filter.sql}
      GROUP BY substr(r.created_at,1,10) ORDER BY day DESC LIMIT 14`, filter.params);

  const bySector = await db.all(
    `SELECT s.name AS label, s.slug AS slug, s.category AS category,
        COUNT(*) AS responses, ROUND(AVG(r.overall_score),2) AS average_score
      FROM responses r JOIN sectors s ON s.id=r.sector_id ${filter.sql}
      GROUP BY s.id, s.name, s.slug, s.category ORDER BY responses DESC, label ASC`, filter.params);

  const topEmployees = await db.all(
    `SELECT e.id AS employee_id, e.name AS label, s.name AS sector_name,
        COUNT(*) AS responses, ROUND(AVG(r.overall_score),2) AS average_score
      FROM responses r JOIN employees e ON e.id=r.employee_id JOIN sectors s ON s.id=r.sector_id
      ${filter.sql} GROUP BY e.id, e.name, s.name HAVING COUNT(*)>=1
      ORDER BY average_score DESC, responses DESC LIMIT 10`, filter.params);

  const comments = await db.all(
    `SELECT r.id, r.comment, r.overall_score, r.customer_name, r.created_at,
        s.name AS sector_name, e.name AS employee_name
      FROM responses r JOIN sectors s ON s.id=r.sector_id LEFT JOIN employees e ON e.id=r.employee_id
      ${filter.sql ? `${filter.sql} AND` : "WHERE"} r.comment IS NOT NULL AND r.comment<>''
      ORDER BY r.created_at DESC LIMIT 8`, filter.params);

  const lowScoreSignals = await db.all(
    `SELECT e.name AS employee_name, s.name AS sector_name, COUNT(*) AS low_score_count
      FROM responses r JOIN sectors s ON s.id=r.sector_id LEFT JOIN employees e ON e.id=r.employee_id
      ${filter.sql ? `${filter.sql} AND` : "WHERE"} r.overall_score<=2
      GROUP BY s.id, s.name, e.id, e.name ORDER BY low_score_count DESC, s.name ASC LIMIT 5`, filter.params);

  return {
    summary: { totalResponses: Number(summary?.total_responses ?? 0), averageOverall: formatAverage(summary?.average_overall) },
    scoreDistribution: {
      counts: dist,
      lowPercent: total > 0 ? Math.round((lowCount / total) * 100) : 0,
      highPercent: total > 0 ? Math.round((highCount / total) * 100) : 0,
      lowCount, highCount, total,
      questionsByScore,
    },
    trend: [...trend].reverse().map((r) => ({ day: r.day, responses: Number(r.responses), averageScore: r.average_score == null ? null : Number(r.average_score) })),
    breakdowns: {
      bySector: bySector.map((r) => ({ label: r.label, slug: r.slug, category: r.category, responses: Number(r.responses), average_score: r.average_score == null ? null : Number(r.average_score) })),
      topEmployees: topEmployees.map((r) => ({ employeeId: Number(r.employee_id), label: r.label, sectorName: r.sector_name, responses: Number(r.responses), average_score: r.average_score == null ? null : Number(r.average_score) })),
    },
    comments: comments.map((r) => ({ id: Number(r.id), comment: r.comment, overallScore: r.overall_score == null ? null : Number(r.overall_score), customerName: r.customer_name, sectorName: r.sector_name, employeeName: r.employee_name, createdAt: r.created_at })),
    lowScoreSignals: lowScoreSignals.map((r) => ({ employeeName: r.employee_name, sectorName: r.sector_name, lowScoreCount: Number(r.low_score_count) })),
  };
}

export async function getQuestionsDistribution(filters = {}) {
  const db = await ensureAdapter();
  const filter = buildResponseFilter(filters);

  const rows = await db.all(
    `SELECT sq.id, sq.text, sq.position,
        COUNT(ra.id) AS total,
        SUM(CASE WHEN ra.score=1 THEN 1 ELSE 0 END) AS score_1,
        SUM(CASE WHEN ra.score=2 THEN 1 ELSE 0 END) AS score_2,
        SUM(CASE WHEN ra.score=3 THEN 1 ELSE 0 END) AS score_3,
        SUM(CASE WHEN ra.score=4 THEN 1 ELSE 0 END) AS score_4,
        SUM(CASE WHEN ra.score=5 THEN 1 ELSE 0 END) AS score_5,
        s.name AS sector_name
      FROM response_answers ra
      JOIN responses r ON r.id=ra.response_id
      JOIN sector_questions sq ON sq.id=ra.question_id
      JOIN sectors s ON s.id=r.sector_id
      ${filter.sql}
      GROUP BY sq.id, sq.text, sq.position, s.name
      ORDER BY s.name ASC, sq.position ASC`, filter.params);

  return rows.map((r) => ({
    id: Number(r.id),
    text: r.text,
    position: Number(r.position),
    sectorName: r.sector_name,
    total: Number(r.total),
    counts: {
      1: Number(r.score_1),
      2: Number(r.score_2),
      3: Number(r.score_3),
      4: Number(r.score_4),
      5: Number(r.score_5),
    },
  }));
}

export async function getDashboardRanking(type, filters = {}) {
  const db = await ensureAdapter();
  const filter = buildResponseFilter(filters);
  let extraFilter = "";
  const validTypes = { low: "ROUND(r.overall_score) IN (1,2)", high: "ROUND(r.overall_score) IN (4,5)",
    "1": "ROUND(r.overall_score)=1", "2": "ROUND(r.overall_score)=2", "3": "ROUND(r.overall_score)=3",
    "4": "ROUND(r.overall_score)=4", "5": "ROUND(r.overall_score)=5" };
  if (validTypes[type]) {
    extraFilter = filter.sql ? ` AND ${validTypes[type]}` : ` WHERE ${validTypes[type]}`;
  }
  const baseWhere = `${filter.sql}${extraFilter}`;

  const bySector = await db.all(
    `SELECT s.name AS label, s.category AS category, COUNT(*) AS responses, ROUND(AVG(r.overall_score),2) AS average_score
      FROM responses r JOIN sectors s ON s.id=r.sector_id ${baseWhere}
      GROUP BY s.id, s.name, s.category ORDER BY responses DESC LIMIT 10`, filter.params);

  const byEmployee = await db.all(
    `SELECT e.name AS label, s.name AS sector_name, COUNT(*) AS responses, ROUND(AVG(r.overall_score),2) AS average_score
      FROM responses r JOIN employees e ON e.id=r.employee_id JOIN sectors s ON s.id=r.sector_id
      ${baseWhere} GROUP BY e.id, e.name, s.name ORDER BY responses DESC LIMIT 10`, filter.params);

  return { bySector, byEmployee };
}

export async function exportResponsesCsv(filters = {}) {
  const db = await ensureAdapter();
  const filter = buildResponseFilter(filters);
  const rows = await db.all(
    `SELECT r.created_at, s.name AS sector_name, e.name AS employee_name,
        r.customer_name, r.customer_contact, r.overall_score, r.comment
      FROM responses r JOIN sectors s ON s.id=r.sector_id LEFT JOIN employees e ON e.id=r.employee_id
      ${filter.sql} ORDER BY r.created_at DESC`, filter.params);
  const header = ["created_at","sector_name","employee_name","customer_name","customer_contact","overall_score","comment"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push([escapeCsv(row.created_at), escapeCsv(row.sector_name), escapeCsv(row.employee_name),
      escapeCsv(row.customer_name), escapeCsv(row.customer_contact), escapeCsv(row.overall_score), escapeCsv(row.comment)].join(","));
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export async function createTfaCode() {
  const db = await ensureAdapter();
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const now = new Date();
  const expires = new Date(now.getTime() + 10 * 60 * 1000);
  await db.run(`DELETE FROM tfa_codes WHERE used=1 OR expires_at<?`, [now.toISOString()]);
  await db.run(`INSERT INTO tfa_codes (code, created_at, expires_at, used) VALUES (?,?,?,0)`,
    [code, now.toISOString(), expires.toISOString()]);
  return code;
}

export async function validateTfaCode(code) {
  const db = await ensureAdapter();
  const now = new Date().toISOString();
  const row = await db.get(
    `SELECT id FROM tfa_codes WHERE code=? AND used=0 AND expires_at>? ORDER BY id DESC LIMIT 1`,
    [String(code), now]);
  if (!row) return false;
  await db.run(`UPDATE tfa_codes SET used=1 WHERE id=?`, [row.id]);
  return true;
}

export async function createSession(userEmail = "", userName = "") {
  const db = await ensureAdapter();
  const id = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  // Try to add user_email/user_name columns if they don't exist yet (safe migration)
  try {
    await db.run(`ALTER TABLE auth_sessions ADD COLUMN user_email TEXT DEFAULT ''`);
  } catch { /* column already exists */ }
  try {
    await db.run(`ALTER TABLE auth_sessions ADD COLUMN user_name TEXT DEFAULT ''`);
  } catch { /* column already exists */ }
  await db.run(`INSERT INTO auth_sessions (id, created_at, expires_at, user_email, user_name) VALUES (?,?,?,?,?)`,
    [id, now.toISOString(), expires.toISOString(), userEmail, userName]);
  return { id, expiresAt: expires.toISOString() };
}

export async function validateSession(id) {
  if (!id) return false;
  const db = await ensureAdapter();
  const row = await db.get(`SELECT id, user_email, user_name FROM auth_sessions WHERE id=? AND expires_at>?`, [id, new Date().toISOString()]);
  if (!row) return false;
  return { id: row.id, email: row.user_email || "", name: row.user_name || "" };
}

export async function deleteSession(id) {
  if (!id) return;
  const db = await ensureAdapter();
  await db.run(`DELETE FROM auth_sessions WHERE id=?`, [id]);
}

export function slugifyName(value) { return slugify(value); }

// ---------------------------------------------------------------------------
// Admin users management
// ---------------------------------------------------------------------------
import { createHash } from "node:crypto";

function hashPassword(password) {
  return createHash("sha256").update(password + "objetiva_salt_2024").digest("hex");
}

export async function listAdminUsers() {
  const db = await ensureAdapter();
  const rows = await db.all(
    `SELECT id, email, name, active, created_at, updated_at FROM admin_users ORDER BY created_at ASC`
  );
  return rows.map((r) => ({
    id: Number(r.id), email: r.email, name: r.name,
    active: Boolean(Number(r.active)), createdAt: r.created_at,
  }));
}

export async function createAdminUser(payload) {
  const db = await ensureAdapter();
  const email    = toNullableText(payload.email)?.toLowerCase();
  const password = toNullableText(payload.password);
  const name     = toNullableText(payload.name) || "";
  if (!email || !email.includes("@")) throw new Error("Informe um e-mail válido.");
  if (!password || password.length < 6)  throw new Error("A senha deve ter ao menos 6 caracteres.");
  const exists = await db.get(`SELECT id FROM admin_users WHERE email = ?`, [email]);
  if (exists) throw new Error("Este e-mail já está cadastrado.");
  const now = nowIso();
  const result = await db.run(
    `INSERT INTO admin_users (email, password_hash, name, active, created_at, updated_at) VALUES (?,?,?,1,?,?)`,
    [email, hashPassword(password), name, now, now]
  );
  return { id: result.lastInsertId, email, name };
}

export async function updateAdminUserPassword(id, newPassword) {
  const db = await ensureAdapter();
  if (!newPassword || newPassword.length < 6) throw new Error("A senha deve ter ao menos 6 caracteres.");
  await db.run(
    `UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE id = ?`,
    [hashPassword(newPassword), nowIso(), Number(id)]
  );
}

export async function deactivateAdminUser(id) {
  const db = await ensureAdapter();
  await db.run(`UPDATE admin_users SET active = 0, updated_at = ? WHERE id = ?`, [nowIso(), Number(id)]);
}

export async function validateAdminCredentials(email, password) {
  const db = await ensureAdapter();
  const row = await db.get(
    `SELECT id, email, name FROM admin_users WHERE email = ? AND password_hash = ? AND active = 1`,
    [email.toLowerCase(), hashPassword(password)]
  );
  return row ? { id: Number(row.id), email: row.email, name: row.name } : null;
}

export async function getAdminUserByEmail(email) {
  const db = await ensureAdapter();
  return db.get(`SELECT id, email, name, active FROM admin_users WHERE email = ?`, [email.toLowerCase()]);
}
