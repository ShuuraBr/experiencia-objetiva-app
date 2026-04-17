import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import mysql from "mysql2/promise";

import { buildSlug, escapeCsv, formatAverage, nowIso, toBoolean, toNullableText } from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sqlitePath = path.resolve(__dirname, "../data/experiencia-objetiva.sqlite");

const sqliteSchema = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS collection_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    unit_name TEXT NOT NULL,
    journey_stage TEXT NOT NULL,
    channel TEXT NOT NULL,
    responsible_area TEXT NOT NULL,
    delivery_applicable INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    point_id INTEGER NOT NULL REFERENCES collection_points(id) ON DELETE CASCADE,
    overall_score INTEGER NOT NULL CHECK (overall_score BETWEEN 1 AND 5),
    service_quality INTEGER NOT NULL CHECK (service_quality BETWEEN 1 AND 5),
    guidance_clarity INTEGER NOT NULL CHECK (guidance_clarity BETWEEN 1 AND 5),
    solution_fit INTEGER NOT NULL CHECK (solution_fit BETWEEN 1 AND 5),
    operational_efficiency INTEGER NOT NULL CHECK (operational_efficiency BETWEEN 1 AND 5),
    delivery_rating INTEGER CHECK (delivery_rating BETWEEN 1 AND 5),
    anonymous INTEGER NOT NULL DEFAULT 1,
    customer_name TEXT,
    contact_channel TEXT,
    comment TEXT,
    source_context TEXT,
    created_at TEXT NOT NULL
  );
`;

const mysqlSchemaStatements = [
  `
    CREATE TABLE IF NOT EXISTS collection_points (
      id INT AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(255) NOT NULL UNIQUE,
      title VARCHAR(255) NOT NULL,
      unit_name VARCHAR(255) NOT NULL,
      journey_stage VARCHAR(255) NOT NULL,
      channel VARCHAR(255) NOT NULL,
      responsible_area VARCHAR(255) NOT NULL,
      delivery_applicable TINYINT(1) NOT NULL DEFAULT 0,
      active TINYINT(1) NOT NULL DEFAULT 1,
      description TEXT NULL,
      created_at VARCHAR(30) NOT NULL,
      updated_at VARCHAR(30) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS responses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      point_id INT NOT NULL,
      overall_score TINYINT NOT NULL,
      service_quality TINYINT NOT NULL,
      guidance_clarity TINYINT NOT NULL,
      solution_fit TINYINT NOT NULL,
      operational_efficiency TINYINT NOT NULL,
      delivery_rating TINYINT NULL,
      anonymous TINYINT(1) NOT NULL DEFAULT 1,
      customer_name VARCHAR(255) NULL,
      contact_channel VARCHAR(255) NULL,
      comment TEXT NULL,
      source_context VARCHAR(255) NULL,
      created_at VARCHAR(30) NOT NULL,
      INDEX idx_responses_point_id (point_id),
      CONSTRAINT fk_responses_point
        FOREIGN KEY (point_id) REFERENCES collection_points(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
];

const pointStatsJoin = `
  LEFT JOIN (
    SELECT
      point_id,
      COUNT(*) AS response_count,
      ROUND(AVG(overall_score), 2) AS average_score
    FROM responses
    GROUP BY point_id
  ) response_stats ON response_stats.point_id = cp.id
`;

export const storageMode = detectDbClient();
let adapter = null;
let dbInitError = null;
const dbReadyPromise = initializeDatabase();

async function initializeDatabase() {
  try {
    adapter = await createAdapter(storageMode);
    await adapter.init();
    await seedDefaultPoint();
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

async function seedDefaultPoint() {
  const existing = await adapter.get("SELECT COUNT(*) AS total FROM collection_points");
  if (Number(existing?.total ?? 0) > 0) {
    return;
  }

  const now = nowIso();
  await adapter.run(
    `
      INSERT INTO collection_points (
        slug,
        title,
        unit_name,
        journey_stage,
        channel,
        responsible_area,
        delivery_applicable,
        active,
        description,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      "piloto-atendimento-loja",
      "Piloto Loja - Atendimento comercial",
      "Unidade piloto",
      "Atendimento na loja",
      "QR Code no caixa",
      "Atendimento comercial",
      0,
      1,
      "Ponto inicial para validar a experiencia logo apos o atendimento presencial.",
      now,
      now,
    ],
  );
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

function mapPoint(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    unitName: row.unit_name,
    journeyStage: row.journey_stage,
    channel: row.channel,
    responsibleArea: row.responsible_area,
    deliveryApplicable: Boolean(Number(row.delivery_applicable)),
    active: Boolean(Number(row.active)),
    description: row.description,
    responseCount: Number(row.response_count ?? 0),
    averageScore: row.average_score === null || row.average_score === undefined ? null : Number(row.average_score),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildResponseFilter(filters = {}) {
  const clauses = [];
  const params = [];

  if (filters.pointId) {
    clauses.push("r.point_id = ?");
    params.push(Number(filters.pointId));
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

export async function listCollectionPoints() {
  const db = await ensureAdapter();
  const rows = await db.all(`
    SELECT
      cp.*,
      COALESCE(response_stats.response_count, 0) AS response_count,
      response_stats.average_score
    FROM collection_points cp
    ${pointStatsJoin}
    ORDER BY cp.active DESC, cp.created_at DESC
  `);

  return rows.map(mapPoint);
}

export async function getCollectionPointById(id) {
  const db = await ensureAdapter();
  const row = await db.get(
    `
      SELECT
        cp.*,
        COALESCE(response_stats.response_count, 0) AS response_count,
        response_stats.average_score
      FROM collection_points cp
      ${pointStatsJoin}
      WHERE cp.id = ?
    `,
    [Number(id)],
  );

  return mapPoint(row);
}

export async function getCollectionPointBySlug(slug) {
  const db = await ensureAdapter();
  const row = await db.get(
    `
      SELECT
        cp.*,
        COALESCE(response_stats.response_count, 0) AS response_count,
        response_stats.average_score
      FROM collection_points cp
      ${pointStatsJoin}
      WHERE cp.slug = ?
    `,
    [slug],
  );

  return mapPoint(row);
}

export async function createCollectionPoint(payload) {
  const db = await ensureAdapter();
  const title = toNullableText(payload.title);
  const unitName = toNullableText(payload.unitName);
  const journeyStage = toNullableText(payload.journeyStage);
  const channel = toNullableText(payload.channel);
  const responsibleArea = toNullableText(payload.responsibleArea);

  if (!title || !unitName || !journeyStage || !channel || !responsibleArea) {
    throw new Error("Preencha titulo, unidade, etapa da jornada, canal e area responsavel.");
  }

  const deliveryApplicable = toBoolean(payload.deliveryApplicable);
  const description = toNullableText(payload.description);
  const now = nowIso();
  const slug = buildSlug([unitName, title, journeyStage]);

  const result = await db.run(
    `
      INSERT INTO collection_points (
        slug,
        title,
        unit_name,
        journey_stage,
        channel,
        responsible_area,
        delivery_applicable,
        active,
        description,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      slug,
      title,
      unitName,
      journeyStage,
      channel,
      responsibleArea,
      deliveryApplicable ? 1 : 0,
      1,
      description,
      now,
      now,
    ],
  );

  return getCollectionPointById(result.lastInsertId);
}

export async function saveResponse(slug, payload) {
  const db = await ensureAdapter();
  const point = await getCollectionPointBySlug(slug);
  if (!point || !point.active) {
    throw new Error("Ponto de coleta nao encontrado ou inativo.");
  }

  const scores = {
    overallScore: Number(payload.overallScore),
    serviceQuality: Number(payload.serviceQuality),
    guidanceClarity: Number(payload.guidanceClarity),
    solutionFit: Number(payload.solutionFit),
    operationalEfficiency: Number(payload.operationalEfficiency),
  };

  for (const [field, value] of Object.entries(scores)) {
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new Error(`Campo invalido: ${field}.`);
    }
  }

  const anonymous = toBoolean(payload.anonymous);
  const deliveryRating = point.deliveryApplicable ? Number(payload.deliveryRating) : null;

  if (point.deliveryApplicable && (!Number.isInteger(deliveryRating) || deliveryRating < 1 || deliveryRating > 5)) {
    throw new Error("Informe a avaliacao da entrega.");
  }

  const customerName = anonymous ? null : toNullableText(payload.customerName);
  const contactChannel = anonymous ? null : toNullableText(payload.contactChannel);
  const comment = toNullableText(payload.comment);
  const sourceContext = toNullableText(payload.sourceContext) || point.channel;

  const result = await db.run(
    `
      INSERT INTO responses (
        point_id,
        overall_score,
        service_quality,
        guidance_clarity,
        solution_fit,
        operational_efficiency,
        delivery_rating,
        anonymous,
        customer_name,
        contact_channel,
        comment,
        source_context,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      point.id,
      scores.overallScore,
      scores.serviceQuality,
      scores.guidanceClarity,
      scores.solutionFit,
      scores.operationalEfficiency,
      deliveryRating,
      anonymous ? 1 : 0,
      customerName,
      contactChannel,
      comment,
      sourceContext,
      nowIso(),
    ],
  );

  return {
    id: result.lastInsertId,
    point,
  };
}

export async function getDashboard(filters = {}) {
  const db = await ensureAdapter();
  const filter = buildResponseFilter(filters);
  const summary = await db.get(
    `
      SELECT
        COUNT(*) AS total_responses,
        ROUND(AVG(r.overall_score), 2) AS average_overall,
        ROUND(AVG(r.service_quality), 2) AS average_service_quality,
        ROUND(AVG(r.guidance_clarity), 2) AS average_guidance_clarity,
        ROUND(AVG(r.solution_fit), 2) AS average_solution_fit,
        ROUND(AVG(r.operational_efficiency), 2) AS average_operational_efficiency,
        ROUND(AVG(r.delivery_rating), 2) AS average_delivery_rating
      FROM responses r
      JOIN collection_points cp ON cp.id = r.point_id
      ${filter.sql}
    `,
    filter.params,
  );

  const trend = await db.all(
    `
      SELECT
        substr(r.created_at, 1, 10) AS day,
        COUNT(*) AS responses,
        ROUND(AVG(r.overall_score), 2) AS average_score
      FROM responses r
      JOIN collection_points cp ON cp.id = r.point_id
      ${filter.sql}
      GROUP BY substr(r.created_at, 1, 10)
      ORDER BY day DESC
      LIMIT 14
    `,
    filter.params,
  );

  const byJourney = await db.all(
    `
      SELECT
        cp.journey_stage AS label,
        COUNT(*) AS responses,
        ROUND(AVG(r.overall_score), 2) AS average_score
      FROM responses r
      JOIN collection_points cp ON cp.id = r.point_id
      ${filter.sql}
      GROUP BY cp.journey_stage
      ORDER BY responses DESC, label ASC
    `,
    filter.params,
  );

  const byChannel = await db.all(
    `
      SELECT
        cp.channel AS label,
        COUNT(*) AS responses,
        ROUND(AVG(r.overall_score), 2) AS average_score
      FROM responses r
      JOIN collection_points cp ON cp.id = r.point_id
      ${filter.sql}
      GROUP BY cp.channel
      ORDER BY responses DESC, label ASC
    `,
    filter.params,
  );

  const byArea = await db.all(
    `
      SELECT
        cp.responsible_area AS label,
        COUNT(*) AS responses,
        ROUND(AVG(r.overall_score), 2) AS average_score
      FROM responses r
      JOIN collection_points cp ON cp.id = r.point_id
      ${filter.sql}
      GROUP BY cp.responsible_area
      ORDER BY responses DESC, label ASC
    `,
    filter.params,
  );

  const comments = await db.all(
    `
      SELECT
        r.id,
        r.comment,
        r.overall_score AS overall_score,
        r.created_at,
        cp.title,
        cp.unit_name
      FROM responses r
      JOIN collection_points cp ON cp.id = r.point_id
      ${filter.sql ? `${filter.sql} AND` : "WHERE"} r.comment IS NOT NULL
      ORDER BY r.created_at DESC
      LIMIT 8
    `,
    filter.params,
  );

  const lowScoreSignals = await db.all(
    `
      SELECT
        cp.title,
        cp.unit_name,
        COUNT(*) AS low_score_count
      FROM responses r
      JOIN collection_points cp ON cp.id = r.point_id
      ${filter.sql ? `${filter.sql} AND` : "WHERE"} r.overall_score <= 2
      GROUP BY cp.id, cp.title, cp.unit_name
      ORDER BY low_score_count DESC, cp.title ASC
      LIMIT 5
    `,
    filter.params,
  );

  return {
    summary: {
      totalResponses: Number(summary?.total_responses ?? 0),
      averageOverall: formatAverage(summary?.average_overall),
      averageServiceQuality: formatAverage(summary?.average_service_quality),
      averageGuidanceClarity: formatAverage(summary?.average_guidance_clarity),
      averageSolutionFit: formatAverage(summary?.average_solution_fit),
      averageOperationalEfficiency: formatAverage(summary?.average_operational_efficiency),
      averageDeliveryRating: formatAverage(summary?.average_delivery_rating),
    },
    trend: [...trend]
      .reverse()
      .map((row) => ({
        day: row.day,
        responses: Number(row.responses),
        averageScore: row.average_score === null ? null : Number(row.average_score),
      })),
    breakdowns: {
      byJourney: byJourney.map((row) => ({
        label: row.label,
        responses: Number(row.responses),
        average_score: row.average_score === null ? null : Number(row.average_score),
      })),
      byChannel: byChannel.map((row) => ({
        label: row.label,
        responses: Number(row.responses),
        average_score: row.average_score === null ? null : Number(row.average_score),
      })),
      byArea: byArea.map((row) => ({
        label: row.label,
        responses: Number(row.responses),
        average_score: row.average_score === null ? null : Number(row.average_score),
      })),
    },
    comments: comments.map((row) => ({
      id: Number(row.id),
      comment: row.comment,
      overallScore: Number(row.overall_score),
      createdAt: row.created_at,
      title: row.title,
      unitName: row.unit_name,
    })),
    lowScoreSignals: lowScoreSignals.map((row) => ({
      title: row.title,
      unit_name: row.unit_name,
      low_score_count: Number(row.low_score_count),
    })),
  };
}

export async function exportResponsesCsv(filters = {}) {
  const db = await ensureAdapter();
  const filter = buildResponseFilter(filters);
  const rows = await db.all(
    `
      SELECT
        r.created_at,
        cp.title,
        cp.unit_name,
        cp.journey_stage,
        cp.channel,
        cp.responsible_area,
        r.overall_score,
        r.service_quality,
        r.guidance_clarity,
        r.solution_fit,
        r.operational_efficiency,
        r.delivery_rating,
        r.anonymous,
        r.customer_name,
        r.contact_channel,
        r.comment,
        r.source_context
      FROM responses r
      JOIN collection_points cp ON cp.id = r.point_id
      ${filter.sql}
      ORDER BY r.created_at DESC
    `,
    filter.params,
  );

  const header = [
    "created_at",
    "title",
    "unit_name",
    "journey_stage",
    "channel",
    "responsible_area",
    "overall_score",
    "service_quality",
    "guidance_clarity",
    "solution_fit",
    "operational_efficiency",
    "delivery_rating",
    "anonymous",
    "customer_name",
    "contact_channel",
    "comment",
    "source_context",
  ];

  const lines = [
    header.join(","),
    ...rows.map((row) => header.map((key) => escapeCsv(row[key])).join(",")),
  ];

  return lines.join("\n");
}
