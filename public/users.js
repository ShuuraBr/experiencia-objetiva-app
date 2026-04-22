// Auth check
async function checkAuth() {
  try {
    const res  = await fetch("/api/auth/me");
    if (!res.ok) { window.location.href = "/login"; return false; }
    const data = await res.json();
    if (!data.authenticated) { window.location.href = "/login"; return false; }
    const el = document.querySelector("#authEmail");
    if (el) el.textContent = data.email;
    return true;
  } catch { window.location.href = "/login"; return false; }
}

const userForm        = document.querySelector("#userForm");
const userFormFeedback= document.querySelector("#userFormFeedback");
const pwForm          = document.querySelector("#pwForm");
const pwFormFeedback  = document.querySelector("#pwFormFeedback");
const pwUserSelect    = document.querySelector("#pwUserSelect");
const usersList       = document.querySelector("#usersList");
const refreshBtn      = document.querySelector("#refreshBtn");
const logoutBtn       = document.querySelector("#logoutBtn");

logoutBtn?.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method:"POST" });
  sessionStorage.removeItem("auth_token");
  window.location.href = "/login";
});

const authed = await checkAuth();
if (authed) {
  await loadUsers();
  userForm?.addEventListener("submit", handleCreate);
  pwForm?.addEventListener("submit", handleChangePassword);
  refreshBtn?.addEventListener("click", loadUsers);
}

async function loadUsers() {
  try {
    const { users } = await fetchJson("/api/admin-users");
    renderUsers(users);
    populateSelect(users);
  } catch (err) {
    usersList.innerHTML = `<p class="empty-state">Erro ao carregar: ${err.message}</p>`;
  }
}

function renderUsers(users) {
  if (!users.length) {
    usersList.innerHTML = `<p class="empty-state">Nenhum usuário cadastrado ainda.<br/>Use o formulário ao lado para adicionar o primeiro.</p>`;
    return;
  }
  usersList.innerHTML = users.map((u) => `
    <article class="user-card">
      <div class="user-card-info">
        <strong>${escapeHtml(u.name || "Sem nome")}</strong>
        <span>${escapeHtml(u.email)}</span>
        <small>Desde ${new Date(u.createdAt).toLocaleDateString("pt-BR")}</small>
      </div>
      <button class="ghost-button small danger-btn" data-user-id="${u.id}" data-user-email="${escapeHtml(u.email)}">
        Remover
      </button>
    </article>`).join("");

  usersList.querySelectorAll("[data-user-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id    = btn.dataset.userId;
      const email = btn.dataset.userEmail;
      if (!confirm(`Remover o acesso de "${email}"?`)) return;
      try {
        await fetchJson(`/api/admin-users/${id}`, { method:"DELETE" });
        await loadUsers();
      } catch (err) { alert(err.message); }
    });
  });
}

function populateSelect(users) {
  pwUserSelect.innerHTML = `<option value="">Selecione o usuário</option>` +
    users.map((u) => `<option value="${u.id}">${escapeHtml(u.email)}</option>`).join("");
}

async function handleCreate(e) {
  e.preventDefault();
  userFormFeedback.textContent = "Cadastrando...";
  const fd = new FormData(userForm);
  try {
    await fetchJson("/api/admin-users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fd.get("name"), email: fd.get("email"), password: fd.get("password") }),
    });
    userForm.reset();
    userFormFeedback.textContent = "✓ Usuário cadastrado com sucesso.";
    userFormFeedback.style.color = "var(--success)";
    await loadUsers();
  } catch (err) {
    userFormFeedback.textContent = err.message;
    userFormFeedback.style.color = "var(--danger)";
  }
}

async function handleChangePassword(e) {
  e.preventDefault();
  pwFormFeedback.textContent = "Alterando...";
  const fd = new FormData(pwForm);
  const id = fd.get("userId");
  if (!id) { pwFormFeedback.textContent = "Selecione o usuário."; return; }
  try {
    await fetchJson(`/api/admin-users/${id}/password`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: fd.get("password") }),
    });
    pwForm.reset();
    pwFormFeedback.textContent = "✓ Senha alterada com sucesso.";
    pwFormFeedback.style.color = "var(--success)";
  } catch (err) {
    pwFormFeedback.textContent = err.message;
    pwFormFeedback.style.color = "var(--danger)";
  }
}

function escapeHtml(v) {
  if (v == null) return "";
  return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

async function fetchJson(url, options = {}) {
  const token = sessionStorage.getItem("auth_token");
  if (token) { options.headers = options.headers||{}; options.headers.Authorization = `Bearer ${token}`; }
  const res  = await fetch(url, options);
  if (res.status === 204) return {};
  if (res.status === 401) { window.location.href = "/login"; throw new Error("Não autenticado"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Falha na requisição.");
  return data;
}
