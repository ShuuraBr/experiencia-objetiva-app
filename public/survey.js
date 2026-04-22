// ---------------------------------------------------------------------------
// Cascade structure — matches the backend sector slugs
// ---------------------------------------------------------------------------
const SURVEY_CASCADE = [
  {
    id: "comercial",
    label: "Comercial",
    sectors: [
      { slug: "comercial-vendas",  label: "Vendas",   hasEmployees: true },
      { slug: "comercial-compras", label: "Compras",  hasEmployees: true },
      { slug: "comercial-caixa",   label: "Caixa",    hasEmployees: false },
    ],
  },
  {
    id: "expedicao",
    label: "Expedição",
    sectors: [
      { slug: "expedicao-interna", label: "Expedição Interna (Balcão Loja)",             hasEmployees: false },
      { slug: "expedicao-externa", label: "Expedição Externa (Pátio/Filial-Park Sul)", hasEmployees: false },
    ],
  },
  {
    id: "entrega",
    label: "Entrega",
    sectors: [
      { slug: "entrega-objetiva", label: "Objetiva", hasEmployees: false },
      { slug: "entrega-freteiro", label: "Freteiro", hasEmployees: false },
    ],
  },
  {
    id: "administrativo",
    label: "Administrativo",
    sectors: [
      { slug: "admin-financeiro", label: "Financeiro", hasEmployees: false },
      { slug: "admin-rh",         label: "RH",         hasEmployees: false },
      { slug: "admin-dp",         label: "DP",         hasEmployees: false },
    ],
  },
];

// ---------------------------------------------------------------------------
// Emoji scale (1–5)
// ---------------------------------------------------------------------------
const EMOJI_SCALE = [
  { score: 1, emoji: "😡", label: "Péssimo" },
  { score: 2, emoji: "😕", label: "Ruim" },
  { score: 3, emoji: "😐", label: "Neutro" },
  { score: 4, emoji: "🙂", label: "Bom" },
  { score: 5, emoji: "😍", label: "Excelente" },
];

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const deptSelect      = document.querySelector("#deptSelect");
const sectorLabelEl   = document.querySelector("#sectorLabelEl");
const sectorSelect    = document.querySelector("#sectorSelect");
const employeeLabelEl = document.querySelector("#employeeLabelEl");
const employeeSelect  = document.querySelector("#employeeSelect");
const questionList    = document.querySelector("#questionList");
const extraFields     = document.querySelector("#extraFields");
const surveyForm      = document.querySelector("#surveyForm");
const surveyFeedback  = document.querySelector("#surveyFeedback");
const submitButton    = document.querySelector("#submitButton");
const thankYou        = document.querySelector("#thankYou");
const thankYouDetail  = document.querySelector("#thankYouDetail");
const surveyNote      = document.querySelector("#surveyNote");

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  currentDept: null,      // cascade dept object
  currentSectorMeta: null, // cascade sector object { slug, label, hasEmployees }
  currentSector: null,    // API sector data { questions, employees, ... }
};

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------
deptSelect.addEventListener("change", handleDeptChange);
sectorSelect.addEventListener("change", handleSectorChange);
employeeSelect.addEventListener("change", updateSubmitState);
surveyForm.addEventListener("change", updateSubmitState);
surveyForm.addEventListener("input", updateSubmitState);
surveyForm.addEventListener("submit", handleSubmit);

// ---------------------------------------------------------------------------
// Dept change — populate level 2 sectors
// ---------------------------------------------------------------------------
function handleDeptChange() {
  surveyFeedback.textContent = "";
  const deptId = deptSelect.value;
  state.currentDept = SURVEY_CASCADE.find((d) => d.id === deptId) || null;
  state.currentSectorMeta = null;
  state.currentSector = null;

  // Reset downstream
  resetElement(sectorLabelEl, sectorSelect, "Selecione o setor");
  resetElement(employeeLabelEl, employeeSelect, "Selecione o atendente");
  questionList.hidden = true;
  questionList.innerHTML = "";
  extraFields.hidden = true;
  updateSubmitState();

  if (!state.currentDept) return;

  // Populate sector options
  sectorSelect.innerHTML =
    `<option value="">Selecione o setor</option>` +
    state.currentDept.sectors
      .map((s) => `<option value="${s.slug}">${escapeHtml(s.label)}</option>`)
      .join("");
  sectorLabelEl.hidden = false;
}

// ---------------------------------------------------------------------------
// Sector change — load questions + optionally employees
// ---------------------------------------------------------------------------
async function handleSectorChange() {
  surveyFeedback.textContent = "";
  const slug = sectorSelect.value;
  state.currentSectorMeta = null;
  state.currentSector = null;

  // Reset downstream
  resetElement(employeeLabelEl, employeeSelect, "Selecione o atendente");
  questionList.hidden = true;
  questionList.innerHTML = "";
  extraFields.hidden = true;
  updateSubmitState();

  if (!slug || !state.currentDept) return;

  state.currentSectorMeta = state.currentDept.sectors.find((s) => s.slug === slug) || null;
  if (!state.currentSectorMeta) return;

  try {
    const { sector } = await fetchJson(`/api/sectors/${slug}`);
    state.currentSector = sector;

    if (state.currentSectorMeta.hasEmployees) {
      renderEmployees(sector.employees);
      employeeLabelEl.hidden = false;
    } else {
      employeeLabelEl.hidden = true;
      employeeSelect.innerHTML = `<option value="">-</option>`;
    }

    renderQuestions(sector.questions);
  } catch (err) {
    surveyFeedback.textContent = err.message || "Não foi possível carregar este setor.";
  } finally {
    updateSubmitState();
  }
}

// ---------------------------------------------------------------------------
// Render employees
// ---------------------------------------------------------------------------
function renderEmployees(employees) {
  if (!employees || employees.length === 0) {
    resetElement(employeeLabelEl, employeeSelect, "Nenhum funcionário cadastrado");
    return;
  }
  employeeSelect.innerHTML =
    `<option value="">Selecione o atendente</option>` +
    employees.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join("");
  employeeSelect.value = "";
}

// ---------------------------------------------------------------------------
// Render questions
// ---------------------------------------------------------------------------
function renderQuestions(questions) {
  if (!questions || questions.length === 0) {
    questionList.innerHTML = `<p class="empty-state muted-text">Nenhuma pergunta cadastrada para este setor.</p>`;
    questionList.hidden = false;
    return;
  }

  questionList.innerHTML = questions
    .map(
      (q, i) => `
      <article class="question-block">
        <label>${i + 1}. ${escapeHtml(q.text)}</label>
        <div class="emoji-rating" role="radiogroup" aria-label="Nota pergunta ${i + 1}">
          ${EMOJI_SCALE.map(
            (opt) => `
            <label class="emoji-option">
              <input type="radio" name="question-${q.id}" data-question-id="${q.id}" value="${opt.score}" required />
              <span class="emoji" aria-hidden="true">${opt.emoji}</span>
              <span class="emoji-label">${opt.label}</span>
            </label>`,
          ).join("")}
        </div>
      </article>`,
    )
    .join("");

  questionList.hidden = false;
  extraFields.hidden = false;
}

// ---------------------------------------------------------------------------
// Submit state
// ---------------------------------------------------------------------------
function updateSubmitState() {
  const sectorOk = Boolean(state.currentSector);
  const needsEmployee = state.currentSectorMeta?.hasEmployees ?? false;
  const employeeOk = !needsEmployee || Boolean(employeeSelect.value);
  const nameEl = surveyForm.elements.customerName;
  const nameOk = nameEl ? nameEl.value.trim().length > 0 : false;

  let answersOk = false;
  if (state.currentSector?.questions?.length > 0) {
    answersOk = state.currentSector.questions.every((q) =>
      surveyForm.querySelector(`input[name="question-${q.id}"]:checked`),
    );
  }

  submitButton.disabled = !(sectorOk && employeeOk && nameOk && answersOk);
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------
async function handleSubmit(event) {
  event.preventDefault();
  if (!state.currentSector) { surveyFeedback.textContent = "Selecione um setor antes de enviar."; return; }

  const answers = state.currentSector.questions.map((q) => {
    const selected = surveyForm.querySelector(`input[name="question-${q.id}"]:checked`);
    return { questionId: q.id, score: selected ? Number(selected.value) : null };
  });

  if (answers.some((a) => a.score === null)) {
    surveyFeedback.textContent = "Responda todas as perguntas antes de enviar.";
    return;
  }

  const payload = {
    sectorSlug: state.currentSector.slug,
    employeeId: employeeSelect.value ? Number(employeeSelect.value) : null,
    customerName: surveyForm.elements.customerName.value,
    customerContact: surveyForm.elements.customerContact.value,
    comment: surveyForm.elements.comment.value,
    answers,
  };

  surveyFeedback.textContent = "Enviando avaliação...";
  submitButton.disabled = true;

  try {
    const { response } = await fetchJson("/api/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Step 5: hide form content, hide "uso interno" note, show thank you
    surveyForm.hidden = true;
    if (surveyNote) surveyNote.hidden = true; // Remove "uso interno" from header

    thankYou.hidden = false;
    const who = response.employeeName ? ` para ${response.employeeName}` : "";
    thankYouDetail.textContent = `Avaliação registrada${who} no setor ${response.sectorName}. Obrigado pelo seu feedback!`;
    surveyFeedback.textContent = "";
  } catch (err) {
    surveyFeedback.textContent = err.message || "Não foi possível enviar agora, tente novamente.";
    submitButton.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function resetElement(labelEl, selectEl, placeholder) {
  labelEl.hidden = true;
  selectEl.innerHTML = `<option value="">${placeholder}</option>`;
  selectEl.value = "";
}

function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Falha na requisição.");
  return payload;
}
