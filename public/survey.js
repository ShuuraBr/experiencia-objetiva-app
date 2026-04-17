const surveyTitle = document.querySelector("#surveyTitle");
const surveyMeta = document.querySelector("#surveyMeta");
const surveyForm = document.querySelector("#surveyForm");
const surveyFeedback = document.querySelector("#surveyFeedback");
const thankYou = document.querySelector("#thankYou");
const surveyCard = document.querySelector("#surveyCard");
const deliveryBlock = document.querySelector("#deliveryBlock");
const anonymousField = document.querySelector('input[name="anonymous"]');
const identityFields = document.querySelector("#identityFields");

const slug = window.location.pathname.split("/").filter(Boolean).pop();
let currentPoint = null;

anonymousField.addEventListener("change", () => {
  identityFields.hidden = anonymousField.checked;
});

surveyForm.addEventListener("submit", handleSubmit);

init();

async function init() {
  renderRatingRows();

  try {
    const { point } = await fetchJson(`/api/public/${slug}`);
    currentPoint = point;
    surveyTitle.textContent = "Como foi sua experiencia na Objetiva?";
    surveyMeta.textContent = `${point.unitName} • ${point.title} • ${point.journeyStage}`;
    deliveryBlock.hidden = !point.deliveryApplicable;
  } catch (error) {
    surveyCard.innerHTML = `
      <div class="thank-you">
        <p class="eyebrow">Acesso indisponivel</p>
        <h2>Esse link nao esta ativo no momento.</h2>
        <p>Confirme se o ponto de coleta ainda esta valido ou gere um novo acesso pelo painel administrativo.</p>
        <a class="ghost-button" href="/">Voltar</a>
      </div>
    `;
  }
}

function renderRatingRows() {
  document.querySelectorAll(".rating-row").forEach((container) => {
    const field = container.dataset.field;
    container.innerHTML = [1, 2, 3, 4, 5]
      .map(
        (score) => `
          <label class="rating-option">
            <input type="radio" name="${field}" value="${score}" required />
            <span>${score}</span>
          </label>
        `,
      )
      .join("");
  });
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!currentPoint) {
    surveyFeedback.textContent = "Esse ponto de coleta nao esta disponivel.";
    return;
  }

  surveyFeedback.textContent = "Enviando avaliacao...";
  const formData = new FormData(surveyForm);
  const payload = Object.fromEntries(formData.entries());
  payload.anonymous = formData.get("anonymous") === "on";

  try {
    await fetchJson(`/api/public/${slug}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    surveyForm.hidden = true;
    thankYou.hidden = false;
    surveyFeedback.textContent = "";
  } catch (error) {
    surveyFeedback.textContent = error.message;
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Falha na requisicao.");
  }

  return payload;
}
