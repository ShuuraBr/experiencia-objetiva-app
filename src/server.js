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

// Limpa aspas, espaços e \r que hospedagens às vezes adicionam
function cleanEnv(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

const ADMIN_EMAIL    = cleanEnv(process.env.ADMIN_EMAIL)    || "admin@objetiva.com.br";
const ADMIN_PASSWORD = cleanEnv(process.env.ADMIN_PASSWORD) || "Admin@2024";

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

async function sendTfaEmail(email, code) {
  const smtpHost = cleanEnv(process.env.SMTP_HOST);
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUser = cleanEnv(process.env.SMTP_USER);
  const smtpPass = process.env.SMTP_PASS || "";
  const smtpFrom = cleanEnv(process.env.SMTP_FROM) || `"Experiência Objetiva" <${ADMIN_EMAIL}>`;

  if (smtpHost && smtpUser) {
    try {
      const nodemailer = (await import("nodemailer")).default;
      const transporter = nodemailer.createTransport({
        host: smtpHost, port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });
      await transporter.sendMail({
        from: smtpFrom, to: email,
        subject: "Código de verificação — Experiência Objetiva",
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
          <h2 style="color:#000928;">Código de verificação</h2>
          <p style="color:#555;">Expira em <strong>10 minutos</strong>.</p>
          <div style="background:#f2f5ff;border-radius:16px;padding:24px;text-align:center;">
            <span style="font-size:2.8rem;font-weight:800;letter-spacing:0.2em;color:#0e2e9b;">${code}</span>
          </div></div>`,
      });
      return true;
    } catch (err) {
      console.error("[auth] falha ao enviar e-mail:", err.message);
    }
  }

  console.log(`\n  ┌──────────────────────────────────────────┐`);
  console.log(`  │  CÓDIGO 2FA                              │`);
  console.log(`  │  Código : ${code.padEnd(30)}│`);
  console.log(`  └──────────────────────────────────────────┘\n`);
  return false;
}

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------
app.get("/api/config", (req, res) => {
  const s = getDatabaseStatus();
  res.json({ appName: "Experiência Objetiva", storageMode, databaseReady: s.ready,
    surveyUrl: `${baseUrl(req)}/avaliar`, qrCodeUrl: `${baseUrl(req)}/api/qr` });
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
  } catch (e) { res.status(400).json({ error: e.message || "Não foi possível salvar." }); }
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
// Auth — rota de diagnóstico (remova em produção se desejar)
// ---------------------------------------------------------------------------
app.get("/api/auth/check", (_req, res) => {
  res.json({
    emailConfigured: ADMIN_EMAIL,
    passwordLength: ADMIN_PASSWORD.length,
    passwordFirstChar: ADMIN_PASSWORD[0],
    passwordLastChar: ADMIN_PASSWORD[ADMIN_PASSWORD.length - 1],
  });
});

app.post("/api/auth/login", async (req, res) => {
  const emailInput    = cleanEnv(req.body.email).toLowerCase();
  const passwordInput = cleanEnv(req.body.password);

  console.log(`[login] tentativa: email="${emailInput}" (${emailInput.length} chars) | senha (${passwordInput.length} chars)`);
  console.log(`[login] esperado:  email="${ADMIN_EMAIL.toLowerCase()}" | senha (${ADMIN_PASSWORD.length} chars)`);

  if (!emailInput || !passwordInput) {
    return res.status(400).json({ error: "Informe o e-mail e a senha." });
  }

  const emailOk    = emailInput    === ADMIN_EMAIL.toLowerCase();
  const passwordOk = passwordInput === ADMIN_PASSWORD;

  console.log(`[login] emailOk=${emailOk} | passwordOk=${passwordOk}`);

  if (!emailOk || !passwordOk) {
    return res.status(401).json({ error: "E-mail ou senha incorretos." });
  }

  try {
    const code = await createTfaCode();
    const emailSent = await sendTfaEmail(ADMIN_EMAIL, code);
    res.json({ ok: true, emailSent,
      message: emailSent ? `Código enviado para ${ADMIN_EMAIL}.` : `Código gerado — verifique o terminal.` });
  } catch (e) {
    res.status(500).json({ error: "Erro ao gerar código de verificação." });
  }
});

app.post("/api/auth/verify-2fa", async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "Informe o código." });
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
  try { res.status(201).json({ employee: await createEmployee(req.body) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete("/api/employees/:id", authMiddleware, async (req, res) => {
  try { await deactivateEmployee(req.params.id); res.status(204).end(); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get("/api/dashboard", authMiddleware, async (req, res, next) => {
  try {
    res.json({ dashboard: await getDashboard({
      sectorId: req.query.sectorId, employeeId: req.query.employeeId,
      startDate: req.query.startDate, endDate: req.query.endDate,
    })});
  } catch (e) { next(e); }
});

app.get("/api/dashboard/ranking", authMiddleware, async (req, res, next) => {
  try {
    res.json({ ranking: await getDashboardRanking(req.query.type, {
      sectorId: req.query.sectorId, startDate: req.query.startDate, endDate: req.query.endDate,
    })});
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
// Pages
// ---------------------------------------------------------------------------
app.get("/", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
app.get("/login", (_req, res) => res.sendFile(path.join(publicDir, "login.html")));
app.get("/gestao", (_req, res) => res.sendFile(path.join(publicDir, "admin.html")));
app.get(["/avaliar", "/avaliar/:legacy"], (_req, res) => res.sendFile(path.join(publicDir, "survey.html")));

app.use((error, req, res, _next) => {
  console.error(`[server] ${req.method} ${req.originalUrl}`, error);
  res.status(500).json({ error: "Erro interno.", detail: error?.message });
});

app.listen(port, () => {
  console.log(`\n  ┌──────────────────────────────────────────────┐`);
  console.log(`  │  Experiência Objetiva — Servidor iniciado    │`);
  console.log(`  │  E-mail : ${ADMIN_EMAIL.padEnd(34)}│`);
  console.log(`  │  Senha  : ${"*".repeat(ADMIN_PASSWORD.length).padEnd(34)}│`);
  console.log(`  │  Senha length: ${String(ADMIN_PASSWORD.length).padEnd(28)}│`);
  console.log(`  │  Storage: ${storageMode.padEnd(34)}│`);
  console.log(`  └──────────────────────────────────────────────┘\n`);
});
