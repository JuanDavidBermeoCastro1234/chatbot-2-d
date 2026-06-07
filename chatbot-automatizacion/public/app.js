const defaultFields = [
  {
    id: "productos",
    title: "Productos",
    content: "Camisetas basicas, oversize y premium. Tallas S, M, L y XL. Colores blanco, negro, arena, azul y verde.",
  },
  {
    id: "precios",
    title: "Precios",
    content:
      "Basica algodon 100%: 39.900 COP. Oversize pesada 240 g: 59.900 COP. Premium cuello reforzado: 69.900 COP.",
  },
  {
    id: "calidad",
    title: "Calidad",
    content:
      "Tela nacional, algodon suave, costura reforzada, no transparenta y garantia por defecto de fabricacion.",
  },
  {
    id: "envios",
    title: "Envios",
    content:
      "Envios a todo Colombia. Bogota 8.000 COP, ciudades principales 12.000 COP y otros municipios segun transportadora.",
  },
  {
    id: "pagos",
    title: "Pagos",
    content: "Transferencia, Nequi, Daviplata y pago contra entrega en ciudades principales.",
  },
  {
    id: "politicas",
    title: "Politicas",
    content: "Cambios por talla durante 7 dias si la prenda esta sin uso.",
  },
  {
    id: "objetivo",
    title: "Objetivo del chatbot",
    content:
      "Responder dudas, recomendar producto y pedir nombre, ciudad, talla, color y cantidad cuando el cliente quiera comprar.",
  },
];

const defaultBots = [
  {
    id: "denin",
    name: "Denin Camisetas",
    businessName: "Denin Camisetas",
    tone: "profesional",
    fields: defaultFields,
  },
];

let bots = loadBots();
let activeBotId = bots[0].id;
let messages = [];
let lastSavedSnapshot = "";
let saveTimer = null;
let whatsappBotId = "";
let whatsappInstanceName = "";

const botList = document.querySelector("#botList");
const chatLog = document.querySelector("#chatLog");
const messageForm = document.querySelector("#messageForm");
const messageInput = document.querySelector("#messageInput");
const activeBotTitle = document.querySelector("#activeBotTitle");
const botNameInput = document.querySelector("#botNameInput");
const businessNameInput = document.querySelector("#businessNameInput");
const toneInput = document.querySelector("#toneInput");
const fieldList = document.querySelector("#fieldList");
const quickTestList = document.querySelector("#quickTestList");
const saveBotButton = document.querySelector("#saveBotButton");
const newBotButton = document.querySelector("#newBotButton");
const resetChatButton = document.querySelector("#resetChatButton");
const deleteBotButton = document.querySelector("#deleteBotButton");
const connectWhatsappButton = document.querySelector("#connectWhatsappButton");
const addFieldButton = document.querySelector("#addFieldButton");
const saveStatus = document.querySelector("#saveStatus");
const connectionText = document.querySelector("#connectionText");
const confirmModal = document.querySelector("#confirmModal");
const confirmTitle = document.querySelector("#confirmTitle");
const confirmMessage = document.querySelector("#confirmMessage");
const confirmAcceptButton = document.querySelector("#confirmAcceptButton");
const confirmCancelButton = document.querySelector("#confirmCancelButton");
const whatsappModal = document.querySelector("#whatsappModal");
const closeWhatsappButton = document.querySelector("#closeWhatsappButton");
const whatsappPhoneInput = document.querySelector("#whatsappPhoneInput");
const startWhatsappButton = document.querySelector("#startWhatsappButton");
const checkWhatsappButton = document.querySelector("#checkWhatsappButton");
const whatsappStatusText = document.querySelector("#whatsappStatusText");
const qrBox = document.querySelector("#qrBox");
let pendingConfirmResolve = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadBots() {
  try {
    const stored = JSON.parse(localStorage.getItem("chatbot-automatizacion:bots"));
    const loaded = Array.isArray(stored) && stored.length ? stored : defaultBots;
    return loaded.map(normalizeBot);
  } catch {
    return clone(defaultBots);
  }
}

function normalizeBot(bot) {
  const fields = Array.isArray(bot.fields) && bot.fields.length ? bot.fields : fieldsFromLegacyKnowledge(bot);
  return {
    id: bot.id || `bot-${Date.now()}`,
    name: bot.name || "Nuevo chatbot",
    businessName: bot.businessName || "Empresa demo",
    tone: bot.tone || "profesional",
    fields: fields.map((field, index) => ({
      id: field.id || `field-${Date.now()}-${index}`,
      title: field.title || `Campo ${index + 1}`,
      content: field.content || "",
    })),
  };
}

function fieldsFromLegacyKnowledge(bot) {
  if (!bot.knowledge) return clone(defaultFields);
  return [
    { id: "informacion", title: "Informacion general", content: bot.knowledge },
    ...clone(defaultFields).filter((field) => field.id !== "productos"),
  ];
}

function saveBots() {
  localStorage.setItem("chatbot-automatizacion:bots", JSON.stringify(bots));
}

function activeBot() {
  return bots.find((bot) => bot.id === activeBotId) || bots[0];
}

function knowledgeFromFields(fields) {
  return fields
    .filter((field) => field.title.trim() || field.content.trim())
    .map((field) => `${field.title.trim() || "Informacion"}: ${field.content.trim()}`)
    .join("\n");
}

function editorSnapshot() {
  return JSON.stringify(readEditorBot());
}

function hasUnsavedChanges() {
  return lastSavedSnapshot && editorSnapshot() !== lastSavedSnapshot;
}

function markDirty() {
  if (!lastSavedSnapshot) return;
  saveStatus.textContent = hasUnsavedChanges() ? "Cambios sin guardar" : "";
}

function showSavedStatus(text = "Informacion guardada con exito") {
  saveStatus.textContent = text;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    if (!hasUnsavedChanges()) saveStatus.textContent = "";
  }, 2200);
}

function commitEditorBot({ showMessage = true } = {}) {
  const updated = readEditorBot();
  bots = bots.map((bot) => (bot.id === activeBotId ? updated : bot));
  saveBots();
  if (updated.id === whatsappBotId) syncWhatsappBot(updated);
  lastSavedSnapshot = JSON.stringify(updated);
  renderBots();
  renderQuickTests();
  activeBotTitle.textContent = updated.name;
  if (showMessage) showSavedStatus();
}

async function syncWhatsappBot(bot = readEditorBot()) {
  try {
    await fetch("/api/whatsapp/save-bot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        botId: bot?.id || "",
        bot: bot
          ? {
              ...bot,
              knowledge: knowledgeFromFields(bot.fields),
            }
          : null,
      }),
    });
  } catch {
    // La conexion WhatsApp es opcional; no debe romper la configuracion visual.
  }
}

function showConfirmModal({ title, message, acceptLabel = "Aceptar", cancelLabel = "Cancelar" }) {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmAcceptButton.textContent = acceptLabel;
  confirmCancelButton.textContent = cancelLabel;
  confirmModal.hidden = false;
  confirmAcceptButton.focus();

  return new Promise((resolve) => {
    pendingConfirmResolve = resolve;
  });
}

function closeConfirmModal(value) {
  if (!pendingConfirmResolve) return;
  const resolve = pendingConfirmResolve;
  pendingConfirmResolve = null;
  confirmModal.hidden = true;
  resolve(value);
}

async function confirmLeavingUnsavedChanges() {
  if (!hasUnsavedChanges()) return true;
  const shouldSave = await showConfirmModal({
    title: "Cambios sin guardar",
    message:
      "Tienes informacion nueva en este chatbot. Puedes guardarla automaticamente antes de cambiar, o continuar sin guardarla.",
    acceptLabel: "Guardar y continuar",
    cancelLabel: "Continuar sin guardar",
  });
  if (shouldSave) commitEditorBot({ showMessage: false });
  return true;
}

function renderBots() {
  botList.innerHTML = "";
  bots.forEach((bot) => {
    const button = document.createElement("button");
    button.className = `bot-item${bot.id === activeBotId ? " active" : ""}`;
    button.type = "button";
    const isWhatsappBot = bot.id === whatsappBotId;
    button.innerHTML = `
      <span class="bot-name-row">
        <strong>${escapeHtml(bot.name)}</strong>
        ${isWhatsappBot ? '<em class="whatsapp-badge">WhatsApp</em>' : ""}
      </span>
      <span>${escapeHtml(bot.businessName)}</span>
    `;
    button.addEventListener("click", () => switchBot(bot.id));
    botList.appendChild(button);
  });
}

function renderEditor() {
  const bot = normalizeBot(activeBot());
  activeBotTitle.textContent = bot.name;
  botNameInput.value = bot.name;
  businessNameInput.value = bot.businessName;
  toneInput.value = bot.tone;
  renderFields(bot.fields);
  renderQuickTests(bot);
  lastSavedSnapshot = JSON.stringify(bot);
  saveStatus.textContent = "";
}

function renderFields(fields) {
  fieldList.innerHTML = "";
  fields.forEach((field) => {
    const section = document.createElement("section");
    section.className = "info-field";
    section.dataset.fieldId = field.id;
    section.innerHTML = `
      <div class="field-header">
        <input class="field-title-input" data-field-title="${escapeHtml(field.id)}" value="${escapeHtml(field.title)}" aria-label="Nombre del campo" />
        <button class="field-delete-button" type="button" data-delete-field="${escapeHtml(field.id)}">Borrar</button>
      </div>
      <textarea data-field-content="${escapeHtml(field.id)}" rows="4" aria-label="Contenido de ${escapeHtml(field.title)}">${escapeHtml(field.content)}</textarea>
    `;
    fieldList.appendChild(section);
  });
}

function renderQuickTests(bot = readEditorBot()) {
  const fields = bot.fields.filter((field) => field.title.trim() && field.content.trim());
  const prompts = buildQuickPrompts(bot, fields);
  quickTestList.innerHTML = "";

  if (!prompts.length) {
    const empty = document.createElement("p");
    empty.className = "helper-text";
    empty.textContent = "Agrega informacion para generar pruebas.";
    quickTestList.appendChild(empty);
    return;
  }

  prompts.forEach((prompt) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = prompt.label;
    button.dataset.prompt = prompt.text;
    quickTestList.appendChild(button);
  });
}

function buildQuickPrompts(bot, fields) {
  const company = bot.businessName || bot.name || "la empresa";
  const prompts = fields.slice(0, 5).map((field) => ({
    label: field.title,
    text: questionForField(field.title, company),
  }));

  if (!prompts.some((prompt) => /precio/i.test(prompt.label))) {
    const priceField = fields.find((field) => /precio|valor|plan|tarifa/i.test(field.title + " " + field.content));
    if (priceField) prompts.unshift({ label: "Precio", text: questionForField(priceField.title, company) });
  }

  return prompts.slice(0, 6);
}

function questionForField(title, company) {
  const lower = normalize(title);
  if (/precio|valor|tarifa|plan/.test(lower)) return `Cuales son los precios de ${company}?`;
  if (/producto|servicio|menu|catalogo/.test(lower)) return `Que productos o servicios ofrece ${company}?`;
  if (/calidad|material|marca|garantia/.test(lower)) return `Que calidad o garantia ofrece ${company}?`;
  if (/envio|domicilio|entrega/.test(lower)) return `Como funcionan los envios o entregas de ${company}?`;
  if (/pago|contra/.test(lower)) return `Que metodos de pago acepta ${company}?`;
  if (/politica|cambio|devolucion/.test(lower)) return `Cuales son las politicas de ${company}?`;
  if (/objetivo|chatbot|asesor/.test(lower)) return `Como me puede ayudar el chatbot de ${company}?`;
  return `Cuentame sobre ${title.toLowerCase()} de ${company}`;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function welcomeMessage() {
  const bot = activeBot();
  return {
    role: "assistant",
    text:
      `Bienvenido al asistente de ${bot.businessName}.\n\n` +
      "Puedo responder usando los campos que configures en el panel derecho.",
    meta: ["n8n local", "OpenAI", "configurable"],
  };
}

function renderMessages() {
  chatLog.innerHTML = "";
  const visibleMessages = messages.length ? messages : [welcomeMessage()];
  visibleMessages.forEach((message) => {
    const row = document.createElement("div");
    row.className = `message-row ${message.role === "user" ? "user" : "assistant"}`;
    row.innerHTML = `
      <div class="avatar">${message.role === "user" ? "TU" : "AI"}</div>
      <div class="message">
        <p>${escapeHtml(message.text)}</p>
        ${
          message.meta?.length
            ? `<div class="meta-line">${message.meta.map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("")}</div>`
            : ""
        }
      </div>
    `;
    chatLog.appendChild(row);
  });
  chatLog.scrollTop = chatLog.scrollHeight;
}

function render() {
  renderBots();
  renderEditor();
  renderMessages();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function readEditorBot() {
  const fields = [...fieldList.querySelectorAll(".info-field")].map((section) => {
    const id = section.dataset.fieldId;
    return {
      id,
      title: section.querySelector("[data-field-title]")?.value.trim() || "Informacion",
      content: section.querySelector("[data-field-content]")?.value.trim() || "",
    };
  });

  return normalizeBot({
    ...activeBot(),
    name: botNameInput.value.trim() || "Nuevo chatbot",
    businessName: businessNameInput.value.trim() || "Empresa demo",
    tone: toneInput.value,
    fields,
    knowledge: knowledgeFromFields(fields),
  });
}

async function switchBot(id) {
  if (id === activeBotId) return;
  if (!(await confirmLeavingUnsavedChanges())) return;
  activeBotId = id;
  messages = [];
  render();
}

async function createNewBot() {
  if (!(await confirmLeavingUnsavedChanges())) return;
  const id = `bot-${Date.now()}`;
  const bot = {
    id,
    name: "Nuevo chatbot",
    businessName: "Empresa demo",
    tone: "profesional",
    fields: [
      { id: `field-${Date.now()}-productos`, title: "Productos o servicios", content: "" },
      { id: `field-${Date.now()}-precios`, title: "Precios", content: "" },
      { id: `field-${Date.now()}-objetivo`, title: "Objetivo del chatbot", content: "" },
    ],
  };
  bots = [bot, ...bots];
  activeBotId = id;
  messages = [];
  saveBots();
  render();
}

async function deleteActiveBot() {
  const bot = activeBot();
  const confirmed = await showConfirmModal({
    title: "Borrar chatbot",
    message: `Vas a borrar "${bot.name}". Esta accion elimina su configuracion local y no se puede deshacer.`,
    acceptLabel: "Borrar chatbot",
    cancelLabel: "Cancelar",
  });
  if (!confirmed) return;

  bots = bots.filter((item) => item.id !== activeBotId);
  if (bot.id === whatsappBotId) {
    whatsappBotId = "";
    await syncWhatsappBot(null);
  }
  if (!bots.length) bots = clone(defaultBots);
  activeBotId = bots[0].id;
  messages = [];
  saveBots();
  render();
}

function setWhatsappStatus(text) {
  whatsappStatusText.textContent = text;
}

async function refreshWhatsappState() {
  const response = await fetch("/api/whatsapp/status");
  const data = await response.json();
  whatsappBotId = data.state?.botId || data.state?.bot?.id || "";
  whatsappInstanceName = data.state?.instanceName || "";
  renderBots();
  return data;
}

function renderQr(qr) {
  qrBox.innerHTML = "";
  if (qr?.image) {
    const image = document.createElement("img");
    image.src = qr.image;
    image.alt = "QR para vincular WhatsApp";
    qrBox.appendChild(image);
    return;
  }
  const message = document.createElement("p");
  message.textContent = qr?.pairingCode
    ? `Codigo de vinculacion: ${qr.pairingCode}`
    : "No se recibio QR todavia. Revisa estado o intenta generar de nuevo.";
  qrBox.appendChild(message);
}

async function openWhatsappModal() {
  whatsappModal.hidden = false;
  setWhatsappStatus("Consultando estado de WhatsApp...");
  qrBox.innerHTML = "<p>El QR aparecera aqui cuando Evolution lo entregue.</p>";
  try {
    const data = await refreshWhatsappState();
    whatsappPhoneInput.value = data.state?.phone || whatsappPhoneInput.value || "";
    const state = data.evolution?.state || "desconocido";
    const assignedBot = bots.find((bot) => bot.id === whatsappBotId);
    setWhatsappStatus(
      assignedBot
        ? `WhatsApp usa ahora "${assignedBot.name}". Instancia: ${data.state?.instanceName || "sin instancia"}. Estado: ${state}.`
        : "Todavia no hay un chatbot asignado a WhatsApp. Pulsa conectar para asignar el bot actual.",
    );
  } catch (error) {
    setWhatsappStatus(`No pude consultar Evolution API: ${error.message}`);
  }
}

function closeWhatsappModal() {
  whatsappModal.hidden = true;
}

async function startWhatsappConnection() {
  const bot = readEditorBot();
  bots = bots.map((item) => (item.id === activeBotId ? bot : item));
  saveBots();
  lastSavedSnapshot = JSON.stringify(bot);
  setWhatsappStatus(`Asignando "${bot.name}" como unico chatbot de WhatsApp y generando QR...`);
  qrBox.innerHTML = "<p>Generando QR...</p>";
  startWhatsappButton.disabled = true;
  try {
    const response = await fetch("/api/whatsapp/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: whatsappPhoneInput.value,
        botId: bot.id,
        bot: {
          ...bot,
          knowledge: knowledgeFromFields(bot.fields),
        },
      }),
    });
    const data = await response.json();
    whatsappBotId = bot.id;
    whatsappInstanceName = data.instanceName || whatsappInstanceName;
    renderBots();
    renderQr(data.qr);
    const connectionState = data.connection?.instance?.state || data.connection?.state || "pendiente";
    setWhatsappStatus(
      `${data.note} "${bot.name}" es el unico chatbot asignado a WhatsApp. Instancia: ${data.instanceName}. Estado: ${connectionState}.`,
    );
  } catch (error) {
    setWhatsappStatus(`No pude generar QR: ${error.message}`);
    renderQr(null);
  } finally {
    startWhatsappButton.disabled = false;
  }
}

async function checkWhatsappStatus() {
  setWhatsappStatus("Revisando estado...");
  try {
    const data = await refreshWhatsappState();
    const state = data.evolution?.state || "desconocido";
    const connected = ["open", "connected"].includes(String(state).toLowerCase());
    const assignedBot = bots.find((bot) => bot.id === whatsappBotId);
    setWhatsappStatus(
      connected
        ? `WhatsApp conectado. Responde con "${assignedBot?.name || "el chatbot asignado"}". Instancia: ${data.state?.instanceName}.`
        : `Todavia no esta conectado. Estado: ${state}. Si tienes QR visible, escanealo desde WhatsApp.`,
    );
  } catch (error) {
    setWhatsappStatus(`No pude revisar estado: ${error.message}`);
  }
}

function addField() {
  const id = `field-${Date.now()}`;
  const section = document.createElement("section");
  section.className = "info-field";
  section.dataset.fieldId = id;
  section.innerHTML = `
    <div class="field-header">
      <input class="field-title-input" data-field-title="${id}" value="Nuevo campo" aria-label="Nombre del campo" />
      <button class="field-delete-button" type="button" data-delete-field="${id}">Borrar</button>
    </div>
    <textarea data-field-content="${id}" rows="4" aria-label="Contenido del campo"></textarea>
  `;
  fieldList.appendChild(section);
  section.querySelector("input").focus();
  markDirty();
  renderQuickTests();
}

async function sendMessage(text) {
  const bot = readEditorBot();
  messages.push({ role: "user", text });
  messages.push({ role: "assistant", text: "Procesando con n8n...", meta: ["esperando respuesta"] });
  renderMessages();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        bot: {
          ...bot,
          knowledge: knowledgeFromFields(bot.fields),
        },
        conversation: messages
          .filter((message) => message.role !== "assistant" || message.text !== "Procesando con n8n...")
          .slice(-8),
      }),
    });
    const data = await response.json();
    messages.pop();
    messages.push({
      role: "assistant",
      text: data.reply || data.respuesta_cliente || data.message || "n8n respondio sin texto.",
      meta: [
        data.intent || data.stage || "respuesta",
        data.lead_status || data.temperature || "demo",
        data.source || "n8n",
      ].filter(Boolean),
    });
    connectionText.textContent = "Conectado a n8n local";
  } catch (error) {
    messages.pop();
    messages.push({
      role: "assistant",
      text:
        "No pude conectar con n8n. Revisa que el workflow chatbot denin este activo y que el servidor local siga corriendo.",
      meta: [error.message],
    });
    connectionText.textContent = "n8n no disponible";
  }
  renderMessages();
}

messageForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;
  messageInput.value = "";
  sendMessage(text);
});

saveBotButton.addEventListener("click", () => commitEditorBot());
newBotButton.addEventListener("click", createNewBot);
deleteBotButton.addEventListener("click", deleteActiveBot);
connectWhatsappButton.addEventListener("click", openWhatsappModal);
addFieldButton.addEventListener("click", addField);
closeWhatsappButton.addEventListener("click", closeWhatsappModal);
startWhatsappButton.addEventListener("click", startWhatsappConnection);
checkWhatsappButton.addEventListener("click", checkWhatsappStatus);

confirmAcceptButton.addEventListener("click", () => closeConfirmModal(true));
confirmCancelButton.addEventListener("click", () => closeConfirmModal(false));
confirmModal.addEventListener("click", (event) => {
  if (event.target === confirmModal) closeConfirmModal(false);
});
whatsappModal.addEventListener("click", (event) => {
  if (event.target === whatsappModal) closeWhatsappModal();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !confirmModal.hidden) closeConfirmModal(false);
  if (event.key === "Escape" && !whatsappModal.hidden) closeWhatsappModal();
});

resetChatButton.addEventListener("click", () => {
  messages = [];
  renderMessages();
});

[botNameInput, businessNameInput, toneInput].forEach((input) => {
  input.addEventListener("input", () => {
    markDirty();
    renderQuickTests();
  });
});

fieldList.addEventListener("input", () => {
  markDirty();
  renderQuickTests();
});

fieldList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-field]");
  if (!button) return;
  const id = button.dataset.deleteField;
  const section = [...fieldList.querySelectorAll(".info-field")].find((field) => field.dataset.fieldId === id);
  section?.remove();
  markDirty();
  renderQuickTests();
});

quickTestList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-prompt]");
  if (!button) return;
  messageInput.value = button.dataset.prompt;
  messageInput.focus();
});

window.addEventListener("beforeunload", (event) => {
  if (!hasUnsavedChanges()) return;
  event.preventDefault();
  event.returnValue = "";
});

render();
refreshWhatsappState().catch(() => {
  renderBots();
});
