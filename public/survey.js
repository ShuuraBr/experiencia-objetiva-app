const sectorSelect = document.querySelector("#sectorSelect");
const employeeSelect = document.querySelector("#employeeSelect");
const questionList = document.querySelector("#questionList");
const surveyForm = document.querySelector("#surveyForm");
const surveyFeedback = document.querySelector("#surveyFeedback");
const submitButton = document.querySelector("#submitButton");
const thankYou = document.querySelector("#thankYou");
const thankYouDetail = document.querySelector("#thankYouDetail");

const EMOJI_SCALE = [
  { score: 1, emoji: "😡", label: "Péssimo" },
  { score: 2, emoji: "😕", label: "Ruim" },
  { score: 3, emoji: "😐", label: "Neutro" },
  { score: 4, emoji: "🙂", label: "Bom" },
  { score: 5, emoji: "😍", label: "Excelente" },
];

const state = {
  sectors: [],
  currentSector: null,
};

init();

sectorSelect.addEventListener("change", async () => {
  surveyFeedback.textContent = "";
  const slug = sectorSelect.value;
  if (!slug) {
    state.currentSector = null;
    resetEmployees("Selecione o setor primeiro");
    renderQuestions([]);
    updateSubmitState();
    return;
  }

  try {
    const { sector } = await fetchJson(`/api/sectors/${slug}`);
    state.currentSector = sector;
    renderEmployees(sector.employees);
    renderQuestions(sector.questions);
  } catch (error) {
    surveyFeedback.textContent = error.message || "Não foi possível carregar este setor.";
  } finally {
    updateSubmitState();
  }
});

employeeSelect.addEventListener("change", updateSubmitState);
surveyForm.addEventListener("change", updateSubmitState);
surveyForm.addEventListener("input", updateSubmitState);
surveyForm.addEventListener("submit", handleSubmit);

async function init() {
  try {
    const { sectors } = await fetchJson("/api/sectors");
    state.sectors = sectors;
    sectorSelect.innerHTML =
      `<option value="">Selecione o setor</option>` +
      sectors.map((sector) => `<option value="${sector.slug}">${sector.name}</option>`).join("");
  } catch (error) {
    surveyFeedback.textContent = "Não foi possível carregar os setores disponíveis.";
  }
}

function resetEmployees(placeholder) {
  employeeSelect.innerHTML = `<option value="">${placeholder}</option>`;
  employeeSelect.disabled = true;
  employeeSelect.value = "";
}

function renderEmployees(employees) {
  if (!employees || employees.length === 0) {
    resetEmployees("Nenhum funcionário cadastrado");
    return;
  }

  employeeSelect.innerHTML =
    `<option value="">Selecione o funcionário</option>` +
    employees
      .map((employee) => `<option value="${employee.id}">${escapeHtml(employee.name)}</option>`)
      .join("");
  employeeSelect.disabled = false;
  employeeSelect.value = "";
}

function renderQuestions(questions) {
  if (!questions || questions.length === 0) {
    questionList.innerHTML = `<p class="empty-state muted-text">As perguntas do setor aparecerão aqui assim que você selecionar o setor.</p>`;
    return;
  }

  questionList.innerHTML = questions
    .map(
      (question, index) => `
        <article class="question-block">
          <label>${index + 1}. ${escapeHtml(question.text)}</label>
          <div class="emoji-rating" role="radiogroup" aria-label="Nota pergunta ${index + 1}">
            ${EMOJI_SCALE.map(
              (option) => `
              <label class="emoji-option">
                <input
                  type="radio"
                  name="question-${question.id}"
                  data-question-id="${question.id}"
                  value="${option.score}"
                  required
                />
                <span class="emoji" aria-hidden="true">${option.emoji}</span>
                <span class="emoji-label">${option.label}</span>
              </label>
              `,
            ).join("")}
          </div>
        </article>
      `,
    )
    .join("");
}

function updateSubmitState() {
  const sectorOk = Boolean(state.currentSector);
  const employeeOk = Boolean(employeeSelect.value);
  const name = surveyForm.elements.customerName.value.trim();
  const nameOk = name.length > 0;

  let answersOk = false;
  if (state.currentSector && state.currentSector.questions.length > 0) {
    answersOk = state.currentSector.questions.every((question) =>
      surveyForm.querySelector(`input[name="question-${question.id}"]:checked`),
    );
  }

  submitButton.disabled = !(sectorOk && employeeOk && nameOk && answersOk);
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!state.currentSector) {
    surveyFeedback.textContent = "Selecione um setor antes de enviar.";
    return;
  }

  const answers = state.currentSector.questions.map((question) => {
    const selected = surveyForm.querySelector(`input[name="question-${question.id}"]:checked`);
    return {
      questionId: question.id,
      score: selected ? Number(selected.value) : null,
    };
  });

  if (answers.some((answer) => answer.score === null)) {
    surveyFeedback.textContent = "Responda todas as perguntas antes de enviar.";
    return;
  }

  const payload = {
    sectorSlug: state.currentSector.slug,
    employeeId: Number(employeeSelect.value),
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

    surveyForm.hidden = true;
    thankYou.hidden = false;
    thankYouDetail.textContent = `Avaliação registrada para ${response.employeeName} no setor ${response.sectorName}.`;
    surveyFeedback.textContent = "";
  } catch (error) {
    surveyFeedback.textContent = error.message || "Não foi possível enviar agora, tente novamente.";
    submitButton.disabled = false;
  }
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Falha na requisição.");
  }

  return payload;
}
