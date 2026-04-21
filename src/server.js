import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import cookieParser from "cookie-parser";
import QRCode from "qrcode";

import {
  createEmployee, createSession, createTfaCode,
  deactivateEmployee, deleteSession,
  exportResponsesCsv, getDashboard, getDashboardRanking,
  getDatabaseStatus, getSectorWithDetails,
  listEmployees, listSectors, saveResponse,
  storageMode, validateSession, validateTfaCode,
} from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");
const configuredBaseUrl = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");

// Admin credentials from env (change in production!)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@objetiva.com.br";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@2024";

const app = express();
const port = Number(process.env.PORT || 3000);

app.set("trust proxy", true);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(publicDir));

function baseUrl(req) {
  return configuredBaseUrl || `${req.protocol}://${req.get("host")}`;
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
function getSessionToken(req) {
  return req.cookies?.session_token || req.headers.authorization?.replace("Bearer ", "");
}

async function authMiddleware(req, res, next) {
  const token = getSessionToken(req);
  if (!token || !(await validateSession(token))) {
    return res.status(401).json({ error: "Não autenticado. Faça login para continuar." });
  }
  next();
}

// ---------------------------------------------------------------------------
// Email sender (nodemailer with fallback to console)
// ---------------------------------------------------------------------------
async function sendTfaEmail(email, code) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM || `"Experiência Objetiva" <${ADMIN_EMAIL}>`;

  if (smtpHost && smtpUser) {
    try {
      const nodemailer = (await import("nodemailer")).default;
      const transporter = nodemailer.createTransport({
        host: smtpHost, port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });
      await transporter.sendMail({
        from: smtpFrom,
        to: email,
        subject: "Código de verificação — Experiência Objetiva",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
            <h2 style="color:#000928;margin-bottom:8px;">Código de verificação</h2>
            <p style="color:#555;margin-bottom:24px;">Use o código abaixo para acessar o painel gerencial. Ele expira em <strong>10 minutos</strong>.</p>
            <div style="background:#f2f5ff;border:1px solid #ccd4f0;border-radius:16px;padding:24px;text-align:center;margin-bottom:24px;">
              <span style="font-size:2.8rem;font-weight:800;letter-spacing:0.2em;color:#0e2e9b;">${code}</span>
            </div>
            <p style="color:#888;font-size:0.85rem;">Se você não solicitou este código, ignore este e-mail.</p>
          </div>`,
      });
      return true;
    } catch (err) {
      console.error("[auth] failed to send email:", err.message);
    }
  }

  // Fallback: log to console
  console.log(`\n  ┌─────────────────────────────────────┐`);
  console.log(`  │  CÓDIGO 2FA PARA ${email.padEnd(20)}│`);
  console.log(`  │  Código: ${code}                      │`);
  console.log(`  └─────────────────────────────────────┘\n`);
  return false;
}

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------
app.get("/api/config", (req, res) => {
  const databaseStatus = getDatabaseStatus();
  res.json({
    appName: "Experiência Objetiva",
    description: "Sistema corporativo de avaliação da experiência do cliente.",
    privacyNotice: "A avaliação é utilizada exclusivamente para melhoria dos serviços prestados, de forma interna e confidencial.",
    storageMode, databaseReady: databaseStatus.ready, databaseError: databaseStatus.error,
    surveyUrl: `${baseUrl(req)}/avaliar`, qrCodeUrl: `${baseUrl(req)}/api/qr`,
  });
});

app.get("/health", (_req, res) => {
  const s = getDatabaseStatus();
  res.status(s.ready ? 200 : 500).json({ status: s.ready ? "ok" : "degraded", ...s });
});

app.get("/api/sectors", async (_req, res, next) => {
  try { res.json({ sectors: await listSectors() }); } catch (e) { next(e); }
});

app.get("/api/sectors/:slug", async (req, res, next) => {
  try {
    const sector = await getSectorWithDetails(req.params.slug);
    if (!sector) return res.status(404).json({ error: "Setor não encontrado." });
    res.json({ sector });
  } catch (e) { next(e); }
});

app.post("/api/responses", async (req, res) => {
  try {
    const response = await saveResponse(req.body);
    res.status(201).json({ response, message: "Avaliação registrada com sucesso." });
  } catch (e) {
    res.status(400).json({ error: e.message || "Não foi possível salvar a avaliação." });
  }
});

app.get("/api/qr", async (req, res, next) => {
  try {
    const svg = await QRCode.toString(`${baseUrl(req)}/avaliar`, {
      type: "svg", margin: 2, width: 320, errorCorrectionLevel: "M",
      color: { dark: "#000928", light: "#F2F5FF" },
    });
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(svg);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Informe o e-mail e a senha." });
  }
  if (email.trim().toLowerCase() !== ADMIN_EMAIL.toLowerCase() || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "E-mail ou senha incorretos." });
  }
  try {
    const code = await createTfaCode();
    const emailSent = await sendTfaEmail(ADMIN_EMAIL, code);
    res.json({
      ok: true,
      message: emailSent
        ? `Código enviado para ${ADMIN_EMAIL}. Verifique sua caixa de entrada.`
        : `Código gerado (verifique o console do servidor): ${code}`,
      emailSent,
    });
  } catch (e) {
    res.status(500).json({ error: "Erro ao gerar código de verificação." });
  }
});

app.post("/api/auth/verify-2fa", async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "Informe o código de verificação." });
  const valid = await validateTfaCode(String(code).trim());
  if (!valid) return res.status(401).json({ error: "Código inválido ou expirado." });
  const session = await createSession();
  res.cookie("session_token", session.id, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", expires: new Date(session.expiresAt),
  });
  res.json({ ok: true, token: session.id, expiresAt: session.expiresAt });
});

app.post("/api/auth/logout", async (req, res) => {
  const token = getSessionToken(req);
  if (token) await deleteSession(token);
  res.clearCookie("session_token");
  res.json({ ok: true });
});

app.get("/api/auth/me", async (req, res) => {
  const token = getSessionToken(req);
  const valid = token ? await validateSession(token) : false;
  if (!valid) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, email: ADMIN_EMAIL });
});

// ---------------------------------------------------------------------------
// Protected admin routes
// ---------------------------------------------------------------------------
app.get("/api/employees", authMiddleware, async (req, res, next) => {
  try { res.json({ employees: await listEmployees({ sectorId: req.query.sectorId }) }); } catch (e) { next(e); }
});

app.post("/api/employees", authMiddleware, async (req, res) => {
  try {
    const employee = await createEmployee(req.body);
    res.status(201).json({ employee });
  } catch (e) {
    res.status(400).json({ error: e.message || "Não foi possível cadastrar o funcionário." });
  }
});

app.delete("/api/employees/:id", authMiddleware, async (req, res) => {
  try { await deactivateEmployee(req.params.id); res.status(204).end(); }
  catch (e) { res.status(400).json({ error: e.message || "Não foi possível remover o funcionário." }); }
});

app.get("/api/dashboard", authMiddleware, async (req, res, next) => {
  try {
    const dashboard = await getDashboard({
      sectorId: req.query.sectorId, employeeId: req.query.employeeId,
      startDate: req.query.startDate, endDate: req.query.endDate,
    });
    res.json({ dashboard });
  } catch (e) { next(e); }
});

app.get("/api/dashboard/ranking", authMiddleware, async (req, res, next) => {
  try {
    const ranking = await getDashboardRanking(req.query.type, {
      sectorId: req.query.sectorId, startDate: req.query.startDate, endDate: req.query.endDate,
    });
    res.json({ ranking });
  } catch (e) { next(e); }
});

app.get("/api/dashboard/export.csv", authMiddleware, async (req, res, next) => {
  try {
    const csv = await exportResponsesCsv({
      sectorId: req.query.sectorId, employeeId: req.query.employeeId,
      startDate: req.query.startDate, endDate: req.query.endDate,
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="experiencia-objetiva-respostas.csv"');
    res.send(csv);
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Page routes
// ---------------------------------------------------------------------------
app.get("/", (_req, res) => { res.sendFile(path.join(publicDir, "index.html")); });
app.get("/login", (_req, res) => { res.sendFile(path.join(publicDir, "login.html")); });
app.get("/gestao", (_req, res) => { res.sendFile(path.join(publicDir, "admin.html")); });
app.get(["/avaliar", "/avaliar/:legacy"], (_req, res) => { res.sendFile(path.join(publicDir, "survey.html")); });

app.use((error, req, res, _next) => {
  console.error(`[server] ${req.method} ${req.originalUrl}`, error);
  res.status(500).json({ error: "Erro interno ao processar a solicitação.", detail: error?.message });
});

app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port} (storage: ${storageMode})`);
  console.log(`[auth] admin email: ${ADMIN_EMAIL}`);
  if (!process.env.SMTP_HOST) {
    console.log("[auth] SMTP não configurado — códigos 2FA serão exibidos no console");
  }
});
