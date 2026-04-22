const step1 = document.querySelector("#step1");
const step2 = document.querySelector("#step2");
const emailInput = document.querySelector("#emailInput");
const passwordInput = document.querySelector("#passwordInput");
const loginBtn = document.querySelector("#loginBtn");
const loginBtnText = document.querySelector("#loginBtnText");
const loginFeedback = document.querySelector("#loginFeedback");
const codeInput = document.querySelector("#codeInput");
const verifyBtn = document.querySelector("#verifyBtn");
const verifyBtnText = document.querySelector("#verifyBtnText");
const verifyFeedback = document.querySelector("#verifyFeedback");
const backBtn = document.querySelector("#backBtn");
const step2Desc = document.querySelector("#step2Desc");

// Redirect if already authenticated
(async () => {
  try {
    const res = await fetch("/api/auth/me");
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated) window.location.href = "/gestao";
    }
  } catch { /* not authenticated, stay on login */ }
})();

loginBtn.addEventListener("click", handleLogin);
verifyBtn.addEventListener("click", handleVerify);
backBtn.addEventListener("click", () => {
  step2.hidden = true;
  step1.hidden = false;
  loginFeedback.textContent = "";
  verifyFeedback.textContent = "";
});

passwordInput.addEventListener("keydown", (e) => { if (e.key === "Enter") handleLogin(); });
codeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") handleVerify(); });
codeInput.addEventListener("input", () => {
  codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6);
});

async function handleLogin() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) {
    loginFeedback.textContent = "Preencha todos os campos.";
    loginFeedback.className = "login-feedback error";
    return;
  }

  loginBtn.disabled = true;
  loginBtnText.textContent = "Enviando...";
  loginFeedback.textContent = "";

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      loginFeedback.textContent = data.error || "Credenciais inválidas.";
      loginFeedback.className = "login-feedback error";
      return;
    }

    step2Desc.textContent = data.emailSent
      ? `Um código de 6 dígitos foi enviado para ${email}. Verifique sua caixa de entrada.`
      : `Código gerado. Verifique o console do servidor (SMTP não configurado).`;

    step1.hidden = true;
    step2.hidden = false;
    codeInput.focus();
  } catch {
    loginFeedback.textContent = "Erro de conexão. Tente novamente.";
    loginFeedback.className = "login-feedback error";
  } finally {
    loginBtn.disabled = false;
    loginBtnText.textContent = "Continuar";
  }
}

async function handleVerify() {
  const code = codeInput.value.trim();
  if (!code || code.length < 6) {
    verifyFeedback.textContent = "Digite o código de 6 dígitos.";
    verifyFeedback.className = "login-feedback error";
    return;
  }

  verifyBtn.disabled = true;
  verifyBtnText.textContent = "Verificando...";
  verifyFeedback.textContent = "";

  try {
    const res = await fetch("/api/auth/verify-2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) {
      verifyFeedback.textContent = data.error || "Código inválido ou expirado.";
      verifyFeedback.className = "login-feedback error";
      return;
    }

    // Store token in sessionStorage as backup (cookie is the primary)
    sessionStorage.setItem("auth_token", data.token);
    window.location.href = "/gestao";
  } catch {
    verifyFeedback.textContent = "Erro de conexão. Tente novamente.";
    verifyFeedback.className = "login-feedback error";
  } finally {
    verifyBtn.disabled = false;
    verifyBtnText.textContent = "Verificar e entrar";
  }
}
