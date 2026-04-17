import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import QRCode from "qrcode";

import {
  createCollectionPoint,
  exportResponsesCsv,
  getCollectionPointById,
  getCollectionPointBySlug,
  getDashboard,
  listCollectionPoints,
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

function enrichPoint(point, req) {
  return {
    ...point,
    accessUrl: `${baseUrl(req)}/avaliar/${point.slug}`,
    qrCodeUrl: `${baseUrl(req)}/api/points/${point.id}/qr`,
  };
}

app.get("/api/config", (_req, res) => {
  res.json({
    appName: "Experiencia Objetiva",
    description: "Sistema corporativo de avaliacao da experiencia do cliente com coleta continua, QR code e indicadores gerenciais.",
    privacyNotice: "A avaliacao sera utilizada exclusivamente para melhoria dos servicos prestados, de forma interna e confidencial.",
    storageMode,
  });
});

app.get("/api/points", async (req, res) => {
  const points = (await listCollectionPoints()).map((point) => enrichPoint(point, req));
  res.json({ points });
});

app.get("/api/points/:id", async (req, res) => {
  const point = await getCollectionPointById(req.params.id);
  if (!point) {
    res.status(404).json({ error: "Ponto de coleta nao encontrado." });
    return;
  }

  res.json({ point: enrichPoint(point, req) });
});

app.post("/api/points", async (req, res) => {
  try {
    const point = await createCollectionPoint(req.body);
    res.status(201).json({ point: enrichPoint(point, req) });
  } catch (error) {
    res.status(400).json({ error: error.message || "Nao foi possivel criar o ponto de coleta." });
  }
});

app.get("/api/points/:id/qr", async (req, res) => {
  const point = await getCollectionPointById(req.params.id);
  if (!point) {
    res.status(404).send("Ponto de coleta nao encontrado.");
    return;
  }

  const svg = await QRCode.toString(`${baseUrl(req)}/avaliar/${point.slug}`, {
    type: "svg",
    margin: 1,
    width: 320,
    color: {
      dark: "#0f172a",
      light: "#0000",
    },
  });

  res.setHeader("Content-Type", "image/svg+xml");
  res.send(svg);
});

app.get("/api/public/:slug", async (req, res) => {
  const point = await getCollectionPointBySlug(req.params.slug);
  if (!point || !point.active) {
    res.status(404).json({ error: "Ponto de coleta nao encontrado ou inativo." });
    return;
  }

  res.json({ point: enrichPoint(point, req) });
});

app.post("/api/public/:slug/responses", async (req, res) => {
  try {
    const response = await saveResponse(req.params.slug, req.body);
    res.status(201).json({
      response,
      message: "Avaliacao registrada com sucesso.",
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Nao foi possivel salvar a avaliacao." });
  }
});

app.get("/api/dashboard", async (req, res) => {
  const dashboard = await getDashboard({
    pointId: req.query.pointId,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
  });

  res.json({ dashboard });
});

app.get("/api/dashboard/export.csv", async (req, res) => {
  const csv = await exportResponsesCsv({
    pointId: req.query.pointId,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="experiencia-objetiva-respostas.csv"');
  res.send(csv);
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/gestao", (_req, res) => {
  res.sendFile(path.join(publicDir, "admin.html"));
});

app.get("/avaliar/:slug", (_req, res) => {
  res.sendFile(path.join(publicDir, "survey.html"));
});

export const server = app.listen(port, () => {
  console.log(`Experiencia Objetiva disponivel em ${configuredBaseUrl || `http://localhost:${port}`} usando ${storageMode}.`);
});
