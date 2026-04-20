import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import mysql from "mysql2/promise";

import { escapeCsv, formatAverage, nowIso, slugify, toNullableText } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sqlitePath = path.resolve(__dirname, "../data/experiencia-objetiva.sqlite");

const SECTOR_SEED = [
  {
    slug: "vendas",
    name: "Vendas",
    sortOrder: 1,
    questions: [
      { text: "O atendente demonstrou conhecimento sobre os produtos/serviços?", reverse: false },
      { text: "Você se sentiu bem orientado(a) durante a compra?", reverse: false },
      { text: "O tempo de atendimento foi adequado?", reverse: false },
      { text: "O atendente entendeu sua necessidade rapidamente?", reverse: false },
      { text: "Foram apresentadas opções adequadas ao que você buscava?", reverse: false },
      { text: "Houve pressão excessiva para fechar a venda?", reverse: true },
    ],
  },
  {
    slug: "caixa",
    name: "Caixa",
    sortOrder: 2,
    questions: [
      { text: "O processo de pagamento foi rápido e sem erros?", reverse: false },
      { text: "O atendente foi cordial e educado?", reverse: false },
      { text: "Houve clareza nas informações (valores, troco, comprovante)?", reverse: false },
      { text: "O sistema apresentou falhas durante o atendimento?", reverse: true },
      { text: "O tempo na fila foi aceitável?", reverse: false },
      { text: "Você recebeu corretamente o comprovante da transação?", reverse: false },
    ],
  },
  {
    slug: "retira-interna",
    name: "Retira Interna",
    sortOrder: 3,
    questions: [
      { text: "Seu pedido estava separado corretamente?", reverse: false },
      { text: "O tempo de espera para retirada foi satisfatório?", reverse: false },
      { text: "O atendimento foi organizado e ágil?", reverse: false },
      { text: "Houve conferência dos itens no momento da retirada?", reverse: false },
      { text: "O local de retirada estava bem sinalizado?", reverse: false },
      { text: "Os colaboradores demonstraram atenção durante o atendimento?", reverse: false },
    ],
  },
  {
    slug: "retira-externa",
    name: "Retira Externa",
    sortOrder: 4,
    questions: [
      { text: "O atendimento foi rápido no ponto de retirada?", reverse: false },
      { text: "Houve facilidade para localizar e receber o pedido?", reverse: false },
      { text: "Os colaboradores foram prestativos durante a entrega?", reverse: false },
      { text: "O processo foi bem orientado (ex: onde parar, como retirar)?", reverse: false },
      { text: "Houve organização na fila ou ordem de atendimento?", reverse: false },
      { text: "O pedido foi entregue corretamente e sem avarias?", reverse: false },
    ],
  },
  {
    slug: "entrega",
    name: "Entrega",
    sortOrder: 5,
    questions: [
      { text: "O prazo de entrega foi cumprido?", reverse: false },
      { text: "O produto chegou em boas condições?", reverse: false },
      { text: "O entregador foi educado e profissional?", reverse: false },
      { text: "Você recebeu atualizações sobre o status da entrega?", reverse: false },
      { text: "Houve facilidade para contato em caso de problema?", reverse: false },
      { text: "A entrega ocorreu conforme combinado (horário/local)?", reverse: false },
    ],
  },
  {
    slug: "administrativo",
    name: "Administrativo",
    sortOrder: 6,
    questions: [
      { text: "Suas solicitações foram resolvidas com eficiência?", reverse: false },
      { text: "O atendimento foi claro e objetivo?", reverse: false },
      { text: "O tempo de resposta foi satisfatório?", reverse: false },
      { text: "Houve retorno dentro do prazo informado?", reverse: false },
      { text: "O atendimento demonstrou profissionalismo?", reverse: false },
      { text: "Seu problema foi resolvido na primeira interação?", reverse: false },
    ],
  },
];

const sqliteSchema = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS sectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
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
`;

const mysqlSchemaStatements = [
  `
    CREATE TABLE IF NOT EXISTS sectors (
      id INT AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(120) NOT NULL UNIQUE,
      name VARCHAR(160) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at VARCHAR(30) NOT NULL,
      updated_at VARCHAR(30) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS sector_questions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sector_id INT NOT NULL,
      position INT NOT NULL,
      text VARCHAR(500) NOT NULL,
      is_reverse TINYINT(1) NOT NULL DEFAULT 0,
      created_at VARCHAR(30) NOT NULL,
      UNIQUE KEY uniq_sector_position (sector_id, position),
      CONSTRAINT fk_sector_questions_sector
        FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS employees (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sector_id INT NOT NULL,
      name VARCHAR(180) NOT NULL,
      role VARCHAR(180) NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at VARCHAR(30) NOT NULL,
      updated_at VARCHAR(30) NOT NULL,
      INDEX idx_employees_sector (sector_id),
      CONSTRAINT fk_employees_sector
        FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS responses (
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
      CONSTRAINT fk_responses_sector
        FOREIGN KEY (sector_id) REFERENCES sectors(id) ON DELETE RESTRICT,
      CONSTRAINT fk_responses_employee
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS response_answers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      response_id INT NOT NULL,
      question_id INT NOT NULL,
      score TINYINT NOT NULL,
      INDEX idx_response_answers_response (response_id),
      INDEX idx_response_answers_question (question_id),
      CONSTRAINT fk_response_answers_response
        FOREIGN KEY (response_id) REFERENCES responses(id) ON DELETE CASCADE,
      CONSTRAINT fk_response_answers_question
        FOREIGN KEY (question_id) REFERENCES sector_questions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
];

export const storageMode = detectDbClient();
let adapter = null;
let dbInitError = null;
const dbReadyPromise = initializeDatabase();

async function initializeDatabase() {
  try {
    adapter = await createAdapter(storageMode);
    await adapter.init();
    await seedSectorsAndQuestions();
  } catch (error) {
    dbInitError = error;
    console.error("[db] initialization failed:", error);
  }
}

function detectDbClient() {
  const explicitClient = toNullableText(process.env.DB_CLIENT)?.toLowerCase();
  if (explicitClient === "mysql" || explicitClient === "sqlite") {
    return explicitClient;
  }

  if (process.env.DATABASE_URL || process.env.DB_HOST || process.env.DB_NAME) {
    return "mysql";
  }

  return "sqlite";
}

async function createAdapter(client) {
  if (client === "mysql") {
    return createMySqlAdapter();
  }

  return createSqliteAdapter();
}

function ensureSqliteDirectory() {
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
}

async function createSqliteAdapter() {
  const { DatabaseSync } = await import("node:sqlite");

  ensureSqliteDirectory();
  const sqlite = new DatabaseSync(sqlitePath);

  return {
    async init() {
      sqlite.exec(sqliteSchema);
    },
    async all(sql, params = []) {
      return sqlite.prepare(sql).all(...params);
    },
    async get(sql, params = []) {
      return sqlite.prepare(sql).get(...params) ?? null;
    },
    async run(sql, params = []) {
      const result = sqlite.prepare(sql).run(...params);
      return {
        lastInsertId: Number(result.lastInsertRowid ?? 0),
        changes: Number(result.changes ?? 0),
      };
    },
  };
}

function getMySqlConfig() {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    if (url.protocol !== "mysql:") {
      throw new Error("DATABASE_URL deve usar o protocolo mysql://.");
    }

    return {
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\/+/, ""),
    };
  }

  const host = toNullableText(process.env.DB_HOST);
  const user = toNullableText(process.env.DB_USER);
  const password = process.env.DB_PASSWORD ?? "";
  const database = toNullableText(process.env.DB_NAME);
  const port = Number(process.env.DB_PORT || 3306);

  if (!host || !user || !database) {
    throw new Error("Defina DB_HOST, DB_USER e DB_NAME para usar MySQL.");
  }

  return {
    host,
    port,
    user,
    password,
    database,
  };
}

/**
 * Idempotent schema migrations for MySQL.
 * Each block checks whether a change is needed before applying it,
 * so the app can be deployed/restarted safely on an existing database.
 */
async function runMysqlMigrations(pool) {
  // Migration 001 — add employee_id to responses (column was introduced after
  // the initial deploy; existing tables won't have it).
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'responses'
        AND COLUMN_NAME  = 'employee_id'`,
  );

  if (cols.length === 0) {
    console.log("[db] migration 001: adding employee_id column to responses…");

    await pool.query(
      `ALTER TABLE responses
         ADD COLUMN employee_id INT NULL AFTER sector_id`,
    );

    try {
      await pool.query(
        `ALTER TABLE responses
           ADD INDEX idx_responses_employee (employee_id)`,
      );
    } catch (e) {
      if (!e.message.includes("Duplicate key name")) throw e;
    }

    try {
      await pool.query(
        `ALTER TABLE responses
           ADD CONSTRAINT fk_responses_employee
             FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL`,
      );
    } catch (e) {
      if (!e.message.includes("Duplicate key name") && !e.message.includes("already exists")) throw e;
    }

    console.log("[db] migration 001: done.");
  }

  // Migration 002 — add customer_contact to responses
  const [cols2] = await pool.query(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME   = 'responses'
        AND COLUMN_NAME  = 'customer_contact'`,
  );

  if (cols2.length === 0) {
    console.log("[db] migration 002: adding customer_contact column to responses…");
    await pool.query(
      `ALTER TABLE responses
         ADD COLUMN customer_contact VARCHAR(255) NULL AFTER customer_name`,
    );
    console.log("[db] migration 002: done.");
  }
}

async function createMySqlAdapter() {
  const config = getMySqlConfig();
  const pool = mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0,
    charset: "utf8mb4",
  });

  return {
    async init() {
      for (const statement of mysqlSchemaStatements) {
        await pool.query(statement);
      }
      await runMysqlMigrations(pool);
    },
    async all(sql, params = []) {
      const [rows] = await pool.execute(sql, params);
      return rows;
    },
    async get(sql, params = []) {
      const [rows] = await pool.execute(sql, params);
      return rows[0] ?? null;
    },
    async run(sql, params = []) {
      const [result] = await pool.execute(sql, params);
      return {
        lastInsertId: Number(result.insertId ?? 0),
        changes: Number(result.affectedRows ?? 0),
      };
    },
  };
}

async function seedSectorsAndQuestions() {
  const now = nowIso();

  for (const seed of SECTOR_SEED) {
    let sector = await adapter.get("SELECT id FROM sectors WHERE slug = ?", [seed.slug]);

    if (!sector) {
      const result = await adapter.run(
        `INSERT INTO sectors (slug, name, sort_order, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [seed.slug, seed.name, seed.sortOrder, 1, now, now],
      );
      sector = { id: result.lastInsertId };
    } else {
      await adapter.run(
        `UPDATE sectors SET name = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
        [seed.name, seed.sortOrder, now, sector.id],
      );
    }

    for (let index = 0; index < seed.questions.length; index += 1) {
      const question = seed.questions[index];
      const position = index + 1;
      const existing = await adapter.get(
        "SELECT id FROM sector_questions WHERE sector_id = ? AND position = ?",
        [sector.id, position],
      );
      if (existing) {
        await adapter.run(
          `UPDATE sector_questions SET text = ?, is_reverse = ? WHERE id = ?`,
          [question.text, question.reverse ? 1 : 0, existing.id],
        );
      } else {
        await adapter.run(
          `INSERT INTO sector_questions (sector_id, position, text, is_reverse, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [sector.id, position, question.text, question.reverse ? 1 : 0, now],
        );
      }
    }
  }
}

async function ensureAdapter() {
  await dbReadyPromise;

  if (dbInitError) {
    throw new Error(`Falha ao inicializar o banco de dados: ${dbInitError.message}`);
  }

  if (!adapter) {
    throw new Error("Banco de dados indisponivel.");
  }

  return adapter;
}

export function getDatabaseStatus() {
  return {
    storageMode,
    ready: Boolean(adapter) && !dbInitError,
    error: dbInitError ? dbInitError.message : null,
  };
}

function mapSector(row, extras = {}) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    sortOrder: Number(row.sort_order ?? 0),
    active: Boolean(Number(row.active ?? 1)),
    responseCount: Number(row.response_count ?? 0),
    employeeCount: Number(row.employee_count ?? 0),
    averageScore:
      row.average_score === null || row.average_score === undefined
        ? null
        : Number(row.average_score),
    ...extras,
  };
}

function mapQuestion(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    sectorId: Number(row.sector_id),
    position: Number(row.position),
    text: row.text,
    isReverse: Boolean(Number(row.is_reverse ?? 0)),
  };
}

function mapEmployee(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    sectorId: Number(row.sector_id),
    sectorName: row.sector_name,
    sectorSlug: row.sector_slug,
    name: row.name,
    role: row.role,
    active: Boolean(Number(row.active ?? 1)),
    responseCount: Number(row.response_count ?? 0),
    averageScore:
      row.average_score === null || row.average_score === undefined
        ? null
        : Number(row.average_score),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSectors() {
  const db = await ensureAdapter();
  const rows = await db.all(`
    SELECT
      s.*,
      COALESCE(employee_counts.employee_count, 0) AS employee_count,
      COALESCE(response_stats.response_count, 0) AS response_count,
      response_stats.average_score
    FROM sectors s
    LEFT JOIN (
      SELECT sector_id, COUNT(*) AS employee_count 
      FROM employees 
      WHERE active = 1 
      GROUP BY sector_id
    ) employee_counts ON employee_counts.sector_id = s.id
    LEFT JOIN (
      SELECT sector_id, COUNT(*) AS response_count, ROUND(AVG(overall_score), 2) AS average_score
      FROM responses 
      GROUP BY sector_id
    ) response_stats ON response_stats.sector_id = s.id
    WHERE s.active = 1
    ORDER BY s.sort_order ASC, s.name ASC
  `);
  return rows.map((row) => mapSector(row));
}

export async function getSectorWithDetails(slug) {
  const db = await ensureAdapter();
  const sectorRow = await db.get(
    `SELECT * FROM sectors WHERE slug = ? AND active = 1`,
    [slug],
  );
  if (!sectorRow) {
    return null;
  }

  const questions = await db.all(
    `SELECT * FROM sector_questions WHERE sector_id = ? ORDER BY position ASC`,
    [sectorRow.id],
  );

  const employees = await db.all(
    `SELECT e.*, s.name AS sector_name, s.slug AS sector_slug
     FROM employees e JOIN sectors s ON s.id = e.sector_id
     WHERE e.sector_id = ? AND e.active = 1
     ORDER BY e.name ASC`,
    [sectorRow.id],
  );

  return {
    ...mapSector(sectorRow),
    questions: questions.map(mapQuestion),
    employees: employees.map(mapEmployee),
  };
}

export async function listEmployees({ sectorId } = {}) {
  const db = await ensureAdapter();
  const clauses = ["e.active = 1"];
  const params = [];
  if (sectorId) {
    clauses.push("e.sector_id = ?");
    params.push(Number(sectorId));
  }

  const rows = await db.all(
    `SELECT
        e.*,
        s.name AS sector_name,
        s.slug AS sector_slug,
        COALESCE(emp_stats.response_count, 0) AS response_count,
        emp_stats.average_score
      FROM employees e
      JOIN sectors s ON s.id = e.sector_id
      LEFT JOIN (
        SELECT employee_id, COUNT(*) AS response_count, ROUND(AVG(overall_score), 2) AS average_score
        FROM responses 
        WHERE employee_id IS NOT NULL 
        GROUP BY employee_id
      ) emp_stats ON emp_stats.employee_id = e.id
      WHERE ${clauses.join(" AND ")}
      ORDER BY s.sort_order ASC, e.name ASC`,
    params,
  );
  return rows.map(mapEmployee);
}

export async function createEmployee(payload) {
  const db = await ensureAdapter();
  const name = toNullableText(payload.name);
  const sectorId = Number(payload.sectorId);
  const role = toNullableText(payload.role);

  if (!name) {
    throw new Error("Informe o nome do funcionário.");
  }
  if (!Number.isInteger(sectorId) || sectorId <= 0) {
    throw new Error("Informe um setor válido.");
  }

  const sector = await db.get(`SELECT id FROM sectors WHERE id = ? AND active = 1`, [sectorId]);
  if (!sector) {
    throw new Error("Setor não encontrado.");
  }

  const now = nowIso();
  const result = await db.run(
    `INSERT INTO employees (sector_id, name, role, active, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
    [sectorId, name, role, now, now],
  );

  return getEmployeeById(result.lastInsertId);
}

export async function getEmployeeById(id) {
  const db = await ensureAdapter();
  const row = await db.get(
    `SELECT
        e.*,
        s.name AS sector_name,
        s.slug AS sector_slug,
        COALESCE(emp_stats.response_count, 0) AS response_count,
        emp_stats.average_score
      FROM employees e
      JOIN sectors s ON s.id = e.sector_id
      LEFT JOIN (
        SELECT employee_id, COUNT(*) AS response_count, ROUND(AVG(overall_score), 2) AS average_score
        FROM responses 
        WHERE employee_id IS NOT NULL 
        GROUP BY employee_id
      ) emp_stats ON emp_stats.employee_id = e.id
      WHERE e.id = ?`,
    [Number(id)],
  );
  return mapEmployee(row);
}

export async function deactivateEmployee(id) {
  const db = await ensureAdapter();
  const now = nowIso();
  await db.run(
    `UPDATE employees SET active = 0, updated_at = ? WHERE id = ?`,
    [now, Number(id)],
  );
}

export async function saveResponse(payload) {
  const db = await ensureAdapter();

  const sectorSlug = toNullableText(payload.sectorSlug);
  if (!sectorSlug) {
    throw new Error("Selecione o setor avaliado.");
  }

  const sector = await db.get(
    `SELECT * FROM sectors WHERE slug = ? AND active = 1`,
    [sectorSlug],
  );
  if (!sector) {
    throw new Error("Setor não encontrado.");
  }

  const employeeId = payload.employeeId ? Number(payload.employeeId) : null;
  if (!employeeId || !Number.isInteger(employeeId) || employeeId <= 0) {
    throw new Error("Selecione o funcionário avaliado.");
  }

  const employee = await db.get(
    `SELECT * FROM employees WHERE id = ? AND sector_id = ? AND active = 1`,
    [employeeId, sector.id],
  );
  if (!employee) {
    throw new Error("Funcionário não encontrado para este setor.");
  }

  const customerName = toNullableText(payload.customerName);
  if (!customerName) {
    throw new Error("Informe seu nome para enviar a avaliação.");
  }

  const customerContact = toNullableText(payload.customerContact);
  const comment = toNullableText(payload.comment);

  const questions = await db.all(
    `SELECT * FROM sector_questions WHERE sector_id = ? ORDER BY position ASC`,
    [sector.id],
  );

  if (!Array.isArray(payload.answers) || payload.answers.length === 0) {
    throw new Error("Responda todas as perguntas do setor.");
  }

  const answersByQuestion = new Map();
  for (const answer of payload.answers) {
    const questionId = Number(answer.questionId);
    const score = Number(answer.score);
    if (!Number.isInteger(questionId) || !Number.isInteger(score) || score < 1 || score > 5) {
      throw new Error("Respostas inválidas.");
    }
    answersByQuestion.set(questionId, score);
  }

  for (const question of questions) {
    if (!answersByQuestion.has(Number(question.id))) {
      throw new Error(`Responda todas as perguntas do setor ${sector.name}.`);
    }
  }

  const now = nowIso();
  const normalizedScores = questions.map((question) => {
    const raw = answersByQuestion.get(Number(question.id));
    return Number(question.is_reverse) === 1 ? 6 - raw : raw;
  });
  const overallScore = Number(
    (normalizedScores.reduce((sum, score) => sum + score, 0) / normalizedScores.length).toFixed(2),
  );

  const result = await db.run(
    `INSERT INTO responses (sector_id, employee_id, customer_name, customer_contact, comment, overall_score, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [sector.id, employee.id, customerName, customerContact, comment, overallScore, now],
  );

  const responseId = result.lastInsertId;
  for (const question of questions) {
    await db.run(
      `INSERT INTO response_answers (response_id, question_id, score) VALUES (?, ?, ?)`,
      [responseId, question.id, answersByQuestion.get(Number(question.id))],
    );
  }

  return {
    id: responseId,
    sectorId: sector.id,
    sectorName: sector.name,
    employeeId: employee.id,
    employeeName: employee.name,
    overallScore,
  };
}

function buildResponseFilter(filters = {}) {
  const clauses = [];
  const params = [];

  if (filters.sectorId) {
    clauses.push("r.sector_id = ?");
    params.push(Number(filters.sectorId));
  }

  if (filters.employeeId) {
    clauses.push("r.employee_id = ?");
    params.push(Number(filters.employeeId));
  }

  if (filters.startDate) {
    clauses.push("substr(r.created_at, 1, 10) >= ?");
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    clauses.push("substr(r.created_at, 1, 10) <= ?");
    params.push(filters.endDate);
  }

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

export async function getDashboard(filters = {}) {
  const db = await ensureAdapter();
  const filter = buildResponseFilter(filters);

  const summary = await db.get(
    `SELECT
        COUNT(*) AS total_responses,
        ROUND(AVG(r.overall_score), 2) AS average_overall
      FROM responses r
      JOIN sectors s ON s.id = r.sector_id
      ${filter.sql}`,
    filter.params,
  );

  const trend = await db.all(
    `SELECT
        substr(r.created_at, 1, 10) AS day,
        COUNT(*) AS responses,
        ROUND(AVG(r.overall_score), 2) AS average_score
      FROM responses r
      JOIN sectors s ON s.id = r.sector_id
      ${filter.sql}
      GROUP BY substr(r.created_at, 1, 10)
      ORDER BY day DESC
      LIMIT 14`,
    filter.params,
  );

  const bySector = await db.all(
    `SELECT
        s.name AS label,
        s.slug AS slug,
        COUNT(*) AS responses,
        ROUND(AVG(r.overall_score), 2) AS average_score
      FROM responses r
      JOIN sectors s ON s.id = r.sector_id
      ${filter.sql}
      GROUP BY s.id, s.name, s.slug
      ORDER BY responses DESC, label ASC`,
    filter.params,
  );

  const topEmployees = await db.all(
    `SELECT
        e.id AS employee_id,
        e.name AS label,
        s.name AS sector_name,
        COUNT(*) AS responses,
        ROUND(AVG(r.overall_score), 2) AS average_score
      FROM responses r
      JOIN employees e ON e.id = r.employee_id
      JOIN sectors s ON s.id = r.sector_id
      ${filter.sql}
      GROUP BY e.id, e.name, s.name
      HAVING COUNT(*) >= 1
      ORDER BY average_score DESC, responses DESC
      LIMIT 6`,
    filter.params,
  );

  const comments = await db.all(
    `SELECT
        r.id,
        r.comment,
        r.overall_score,
        r.customer_name,
        r.created_at,
        s.name AS sector_name,
        e.name AS employee_name
      FROM responses r
      JOIN sectors s ON s.id = r.sector_id
      LEFT JOIN employees e ON e.id = r.employee_id
      ${filter.sql ? `${filter.sql} AND` : "WHERE"} r.comment IS NOT NULL AND r.comment <> ''
      ORDER BY r.created_at DESC
      LIMIT 8`,
    filter.params,
  );

  const lowScoreSignals = await db.all(
    `SELECT
        e.name AS employee_name,
        s.name AS sector_name,
        COUNT(*) AS low_score_count
      FROM responses r
      JOIN sectors s ON s.id = r.sector_id
      LEFT JOIN employees e ON e.id = r.employee_id
      ${filter.sql ? `${filter.sql} AND` : "WHERE"} r.overall_score <= 2
      GROUP BY s.id, s.name, e.id, e.name
      ORDER BY low_score_count DESC, s.name ASC
      LIMIT 5`,
    filter.params,
  );

  return {
    summary: {
      totalResponses: Number(summary?.total_responses ?? 0),
      averageOverall: formatAverage(summary?.average_overall),
    },
    trend: [...trend]
      .reverse()
      .map((row) => ({
        day: row.day,
        responses: Number(row.responses),
        averageScore: row.average_score === null ? null : Number(row.average_score),
      })),
    breakdowns: {
      bySector: bySector.map((row) => ({
        label: row.label,
        slug: row.slug,
        responses: Number(row.responses),
        average_score: row.average_score === null ? null : Number(row.average_score),
      })),
      topEmployees: topEmployees.map((row) => ({
        employeeId: Number(row.employee_id),
        label: row.label,
        sectorName: row.sector_name,
        responses: Number(row.responses),
        average_score: row.average_score === null ? null : Number(row.average_score),
      })),
    },
    comments: comments.map((row) => ({
      id: Number(row.id),
      comment: row.comment,
      overallScore: row.overall_score === null ? null : Number(row.overall_score),
      customerName: row.customer_name,
      sectorName: row.sector_name,
      employeeName: row.employee_name,
      createdAt: row.created_at,
    })),
    lowScoreSignals: lowScoreSignals.map((row) => ({
      employeeName: row.employee_name,
      sectorName: row.sector_name,
      lowScoreCount: Number(row.low_score_count),
    })),
  };
}

export async function exportResponsesCsv(filters = {}) {
  const db = await ensureAdapter();
  const filter = buildResponseFilter(filters);
  const rows = await db.all(
    `SELECT
        r.created_at,
        s.name AS sector_name,
        e.name AS employee_name,
        r.customer_name,
        r.customer_contact,
        r.overall_score,
        r.comment
      FROM responses r
      JOIN sectors s ON s.id = r.sector_id
      LEFT JOIN employees e ON e.id = r.employee_id
      ${filter.sql}
      ORDER BY r.created_at DESC`,
    filter.params,
  );

  const header = [
    "created_at",
    "sector_name",
    "employee_name",
    "customer_name",
    "customer_contact",
    "overall_score",
    "comment",
  ];

  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        escapeCsv(row.created_at),
        escapeCsv(row.sector_name),
        escapeCsv(row.employee_name),
        escapeCsv(row.customer_name),
        escapeCsv(row.customer_contact),
        escapeCsv(row.overall_score),
        escapeCsv(row.comment),
      ].join(","),
    );
  }

  return lines.join("\n");
}

export function slugifyName(value) {
  return slugify(value);
}