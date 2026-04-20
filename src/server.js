import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import QRCode from "qrcode";

import {
  createEmployee,
  deactivateEmployee,
  exportResponsesCsv,
  getDashboard,
  getDatabaseStatus,
  getSectorWithDetails,
  listEmployees,
  listSectors,
  saveResponse,
  storageMode,
} from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");
const configuredBaseUrl = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");

const app = express();
const port = Number(process.env.PORT || 3000);

app.set("trust proxy", true);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(publicDir));

function baseUrl(req) {
  return configuredBaseUrl || `${req.protocol}://${req.get("host")}`;
}

app.get("/api/config", (req, res) => {
  const databaseStatus = getDatabaseStatus();
  res.json({
    appName: "Experiência Objetiva",
    description:
      "Sistema corporativo de avaliação da experiência do cliente com coleta contínua, QR code e indicadores gerenciais.",
    privacyNotice:
      "A avaliação é utilizada exclusivamente para melhoria dos serviços prestados, de forma interna e confidencial.",
    storageMode,
    databaseReady: databaseStatus.ready,
    databaseError: databaseStatus.error,
    surveyUrl: `${baseUrl(req)}/avaliar`,
    qrCodeUrl: `${baseUrl(req)}/api/qr`,
  });
});

app.get("/health", (_req, res) => {
  const databaseStatus = getDatabaseStatus();
  res.status(databaseStatus.ready ? 200 : 500).json({
    status: databaseStatus.ready ? "ok" : "degraded",
    storageMode,
    databaseReady: databaseStatus.ready,
    databaseError: databaseStatus.error,
  });
});

app.get("/api/sectors", async (_req, res, next) => {
  try {
    const sectors = await listSectors();
    res.json({ sectors });
  } catch (error) {
    next(error);
  }
});

app.get("/api/sectors/:slug", async (req, res, next) => {
  try {
    const sector = await getSectorWithDetails(req.params.slug);
    if (!sector) {
      res.status(404).json({ error: "Setor não encontrado." });
      return;
    }
    res.json({ sector });
  } catch (error) {
    next(error);
  }
});

app.get("/api/employees", async (req, res, next) => {
  try {
    const employees = await listEmployees({ sectorId: req.query.sectorId });
    res.json({ employees });
  } catch (error) {
    next(error);
  }
});

app.post("/api/employees", async (req, res) => {
  try {
    const employee = await createEmployee(req.body);
    res.status(201).json({ employee });
  } catch (error) {
    res.status(400).json({ error: error.message || "Não foi possível cadastrar o funcionário." });
  }
});

app.delete("/api/employees/:id", async (req, res) => {
  try {
    await deactivateEmployee(req.params.id);
    res.status(204).end();
  } catch (error) {
    res.status(400).json({ error: error.message || "Não foi possível remover o funcionário." });
  }
});

app.post("/api/responses", async (req, res) => {
  try {
    const response = await saveResponse(req.body);
    res.status(201).json({
      response,
      message: "Avaliação registrada com sucesso.",
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Não foi possível salvar a avaliação." });
  }
});

app.get("/api/qr", async (req, res, next) => {
  try {
    const svg = await QRCode.toString(`${baseUrl(req)}/avaliar`, {
      type: "svg",
      margin: 2,
      width: 320,
      errorCorrectionLevel: "M",
      color: {
        dark: "#000928",
        light: "#F2F5FF",
      },
    });

    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(svg);
  } catch (error) {
    next(error);
  }
});

app.get("/api/dashboard", async (req, res, next) => {
  try {
    const dashboard = await getDashboard({
      sectorId: req.query.sectorId,
      employeeId: req.query.employeeId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    res.json({ dashboard });
  } catch (error) {
    next(error);
  }
});

app.get("/api/dashboard/export.csv", async (req, res, next) => {
  try {
    const csv = await exportResponsesCsv({
      sectorId: req.query.sectorId,
      employeeId: req.query.employeeId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="experiencia-objetiva-respostas.csv"',
    );
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/gestao", (_req, res) => {
  res.sendFile(path.join(publicDir, "admin.html"));
});

app.get(["/avaliar", "/avaliar/:legacy"], (_req, res) => {
  res.sendFile(path.join(publicDir, "survey.html"));
});

app.use((error, req, res, _next) => {
  console.error(`[server] ${req.method} ${req.originalUrl}`, error);
  res.status(500).json({
    error: "Erro interno ao processar a solicitação.",
    detail: error?.message,
  });
});

app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port} (storage: ${storageMode})`);
});
