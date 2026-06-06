const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const publicDir = path.join(root, "public");
loadEnvFile(path.join(root, ".env"));

const port = Number(process.env.PORT || 8090);
const n8nWebhook =
  process.env.N8N_CHATBOT_WEBHOOK || "http://127.0.0.1:5678/webhook/chatbot-denin/chat";
const openaiModel = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const evolutionApiUrl = (process.env.EVOLUTION_API_URL || "http://127.0.0.1:8082").replace(/\/$/, "");
const evolutionApiKey = process.env.EVOLUTION_API_KEY || "miapikey123";
const evolutionInstance = process.env.EVOLUTION_INSTANCE || "JuandAVID187";
const publicWebhookBase = (process.env.PUBLIC_WEBHOOK_BASE || "http://host.docker.internal:8090").replace(/\/$/, "");
const whatsappStatePath = path.join(root, ".whatsapp-state.json");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !process.env[key]) process.env[key] = value;
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Payload demasiado grande."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function proxyChat(req, res) {
  try {
    const rawBody = await readRequestBody(req);
    const response = await fetch(n8nWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: rawBody || "{}",
    });
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { ok: response.ok, reply: text };
    }
    sendJson(res, response.ok ? 200 : response.status, payload);
  } catch (error) {
    sendJson(res, 502, {
      ok: false,
      error: "n8n_unavailable",
      message:
        "No pude conectar con n8n. Revisa que el workflow chatbot denin este activo y que n8n este en localhost:5678.",
      detail: error.message,
    });
  }
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function readWhatsappState() {
  return readJsonFile(whatsappStatePath, {
    instanceName: evolutionInstance,
    phone: "",
    bot: null,
    connected: false,
    lastWebhookAt: "",
    lastMessageAt: "",
  });
}

function writeWhatsappState(nextState) {
  const current = readWhatsappState();
  const merged = { ...current, ...nextState, updatedAt: new Date().toISOString() };
  writeJsonFile(whatsappStatePath, merged);
  return merged;
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function instanceNameForPhone(phone) {
  const digits = normalizePhone(phone);
  return digits ? `chatbot_${digits}` : evolutionInstance;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function evolutionRequest(pathname, options = {}, timeoutMs = 12000) {
  const response = await fetchWithTimeout(
    `${evolutionApiUrl}${pathname}`,
    {
      ...options,
      headers: {
        apikey: evolutionApiKey,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    },
    timeoutMs,
  );
  const text = await response.text();
  const payload = safeJsonParse(text, { raw: text });
  return { ok: response.ok, status: response.status, payload };
}

function extractQr(payload) {
  const candidates = [
    payload?.base64,
    payload?.qrcode?.base64,
    payload?.qrcode,
    payload?.qr,
    payload?.code,
  ].filter(Boolean);
  const image = candidates.find((value) => String(value).startsWith("data:image"));
  return {
    image: image || "",
    code: payload?.code || payload?.qrcode?.code || "",
    pairingCode: payload?.pairingCode || payload?.pairing_code || "",
  };
}

function readInboundMessage(payload) {
  const data = payload.data || payload;
  const key = data.key || payload.key || {};
  const message = data.message || payload.message || {};
  const text =
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    data.text ||
    payload.text ||
    payload.messageText ||
    "";
  const remoteJid =
    key.remoteJid ||
    data.key?.remoteJid ||
    data.remoteJid ||
    payload.remoteJid ||
    payload.from ||
    payload.sender ||
    "";
  return {
    text: String(text || "").trim(),
    remoteJid: String(remoteJid || ""),
    fromMe: Boolean(key.fromMe || data.fromMe || payload.fromMe),
    pushName: data.pushName || payload.pushName || "",
    instanceName: payload.instance || payload.instanceName || data.instanceName || readWhatsappState().instanceName,
  };
}

async function sendWhatsappText(instanceName, remoteJid, text) {
  const number = String(remoteJid || "").replace(/@.+$/, "").replace(/\D/g, "");
  if (!number || !text) return { ok: false, error: "missing_number_or_text" };
  const result = await evolutionRequest(
    `/message/sendText/${encodeURIComponent(instanceName)}`,
    {
      method: "POST",
      body: JSON.stringify({
        number,
        textMessage: { text },
      }),
    },
    15000,
  );
  return result;
}

async function askN8nBot(message, bot, conversation = []) {
  const response = await fetchWithTimeout(
    n8nWebhook,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, bot, conversation }),
    },
    30000,
  );
  const text = await response.text();
  return safeJsonParse(text, { ok: response.ok, reply: text });
}

function buildAiPrompt(payload) {
  const bot = payload.bot || {};
  const history = Array.isArray(payload.conversation)
    ? payload.conversation
        .slice(-8)
        .map((item) => `${item.role || "user"}: ${item.text || item.content || ""}`)
        .join("\n")
    : "";

  return [
    `Empresa: ${bot.businessName || bot.name || "Denin Camisetas"}`,
    `Nombre del bot: ${bot.name || "Chatbot"}`,
    `Tono: ${bot.tone || "profesional"}`,
    "",
    "Catalogo, politicas y conocimiento cargado desde la interfaz:",
    bot.knowledge || "Sin conocimiento adicional.",
    "",
    "Historial reciente:",
    history || "Sin historial.",
    "",
    `Mensaje actual del cliente: ${payload.message || ""}`,
    "",
    "Responde como asesor comercial por chat. Usa solo datos del catalogo/politicas. Si falta un dato para cerrar venta, pidelo de forma breve. No inventes precios, descuentos, stock ni promesas.",
    "Devuelve solamente JSON valido con estas claves: reply, intent, lead_status, needs_human.",
  ].join("\n");
}

async function runOpenAi(req, res) {
  try {
    const rawBody = await readRequestBody(req);
    const payload = safeJsonParse(rawBody || "{}", {});
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      sendJson(res, 200, {
        ok: false,
        error: "openai_key_missing",
        reply: payload.fallbackReply || "OpenAI no esta configurado todavia.",
        source: "fallback",
      });
      return;
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: openaiModel,
        instructions:
          "Eres un asistente comercial en espanol para una empresa. Debes responder con JSON valido, sin markdown.",
        input: buildAiPrompt(payload),
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      sendJson(res, 200, {
        ok: false,
        error: "openai_request_failed",
        status: response.status,
        detail: data.error?.message || "OpenAI rechazo la solicitud.",
        reply: payload.fallbackReply || "No pude consultar la IA en este momento.",
        source: "fallback",
      });
      return;
    }

    const text =
      data.output_text ||
      data.output?.flatMap((item) => item.content || []).find((part) => part.text)?.text ||
      "";
    const cleaned = String(text)
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = safeJsonParse(cleaned, null);

    sendJson(res, 200, {
      ok: true,
      source: "openai",
      model: openaiModel,
      reply: parsed?.reply || cleaned || payload.fallbackReply,
      intent: parsed?.intent || payload.intent || "general",
      lead_status: parsed?.lead_status || payload.lead_status || "nuevo",
      needs_human: Boolean(parsed?.needs_human),
    });
  } catch (error) {
    sendJson(res, 200, {
      ok: false,
      error: "ai_proxy_error",
      detail: error.message,
      source: "fallback",
    });
  }
}

async function saveWhatsappBot(req, res) {
  const rawBody = await readRequestBody(req);
  const payload = safeJsonParse(rawBody || "{}", {});
  const state = writeWhatsappState({
    bot: payload.bot || null,
    botId: payload.botId || payload.bot?.id || "",
  });
  sendJson(res, 200, { ok: true, configured: Boolean(state.bot), state: maskWhatsappState(state) });
}

function maskWhatsappState(state) {
  return {
    ...state,
    bot: state.bot
      ? {
          id: state.bot.id,
          name: state.bot.name,
          businessName: state.bot.businessName,
          tone: state.bot.tone,
        }
      : null,
  };
}

async function whatsappStatus(req, res) {
  const state = readWhatsappState();
  let evolution = { ok: false, state: "unknown" };
  try {
    const instanceName = state.instanceName || evolutionInstance;
    const result = await evolutionRequest(`/instance/connectionState/${encodeURIComponent(instanceName)}`, {
      method: "GET",
    });
    const value = result.payload?.instance?.state || result.payload?.state || result.payload?.status || "unknown";
    evolution = { ok: result.ok, state: value, raw: result.payload };
    writeWhatsappState({ connected: ["open", "connected"].includes(String(value).toLowerCase()) });
  } catch (error) {
    evolution = { ok: false, state: "error", error: error.message };
  }
  sendJson(res, 200, {
    ok: true,
    mode: "evolution_qr_local",
    risk:
      "Modo de prueba con WhatsApp Web/Evolution. No es la API oficial de Meta y puede cerrar sesion o bloquearse.",
    webhookUrl: `${publicWebhookBase}/api/whatsapp/webhook`,
    evolution,
    state: maskWhatsappState(readWhatsappState()),
  });
}

async function connectWhatsapp(req, res) {
  const rawBody = await readRequestBody(req);
  const payload = safeJsonParse(rawBody || "{}", {});
  const phone = normalizePhone(payload.phone);
  const instanceName = payload.instanceName || instanceNameForPhone(phone);
  const state = writeWhatsappState({
    phone,
    instanceName,
    bot: payload.bot || readWhatsappState().bot,
    botId: payload.botId || payload.bot?.id || readWhatsappState().botId || "",
  });

  const webhookUrl = `${publicWebhookBase}/api/whatsapp/webhook`;
  let createResult = null;
  let webhookResult = null;
  let qrResult = null;
  let connection = null;

  try {
    createResult = await evolutionRequest(
      "/instance/create",
      {
        method: "POST",
        body: JSON.stringify({
          instanceName,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
        }),
      },
      15000,
    );
  } catch (error) {
    createResult = { ok: false, error: error.message };
  }

  try {
    webhookResult = await evolutionRequest(
      `/webhook/set/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        body: JSON.stringify({
          enabled: true,
          url: webhookUrl,
          webhook_by_events: false,
          webhook_base64: false,
          events: ["MESSAGES_UPSERT"],
        }),
      },
      12000,
    );
  } catch (error) {
    webhookResult = { ok: false, error: error.message };
  }

  try {
    connection = await evolutionRequest(`/instance/connectionState/${encodeURIComponent(instanceName)}`, {
      method: "GET",
    });
  } catch (error) {
    connection = { ok: false, error: error.message };
  }

  try {
    qrResult = await evolutionRequest(`/instance/connect/${encodeURIComponent(instanceName)}`, { method: "GET" }, 20000);
  } catch (error) {
    qrResult = { ok: false, error: error.message };
  }

  const qr = extractQr(qrResult?.payload || createResult?.payload || {});
  sendJson(res, 200, {
    ok: true,
    state: maskWhatsappState(state),
    instanceName,
    webhookUrl,
    qr,
    create: createResult?.ok ? "ok" : createResult?.payload || createResult?.error || "not_created",
    webhook: webhookResult?.ok ? "ok" : webhookResult?.payload || webhookResult?.error || "not_configured",
    connection: connection?.payload || connection?.error || null,
    note: qr.image
      ? "Escanea el QR desde WhatsApp > Dispositivos vinculados."
      : "No pude obtener QR por API. Reintenta; si sigue igual, revisa logs de Evolution.",
  });
}

async function whatsappWebhook(req, res) {
  const rawBody = await readRequestBody(req);
  const payload = safeJsonParse(rawBody || "{}", {});
  const inbound = readInboundMessage(payload);
  writeWhatsappState({ lastWebhookAt: new Date().toISOString() });

  if (!inbound.text || inbound.fromMe || inbound.remoteJid.includes("@g.us")) {
    sendJson(res, 200, { ok: true, ignored: true, reason: "empty_from_me_or_group" });
    return;
  }

  const state = readWhatsappState();
  const bot = state.bot || {
    name: "Chatbot WhatsApp",
    businessName: "Empresa",
    tone: "profesional",
    knowledge: "Responde de forma breve y pide datos si el cliente quiere comprar.",
  };

  try {
    const answer = await askN8nBot(inbound.text, bot, [
      { role: "user", text: inbound.text, channel: "whatsapp", from: inbound.remoteJid },
    ]);
    const reply = answer.reply || "Gracias por escribirnos. Ya recibimos tu mensaje.";
    let sendResult = { ok: false, error: "not_sent" };
    try {
      sendResult = await sendWhatsappText(inbound.instanceName || state.instanceName, inbound.remoteJid, reply);
    } catch (sendError) {
      sendResult = { ok: false, error: sendError.message };
    }
    writeWhatsappState({ lastMessageAt: new Date().toISOString() });
    sendJson(res, 200, {
      ok: true,
      inbound,
      reply,
      sent: Boolean(sendResult.ok),
      sendResult: sendResult.ok ? "ok" : sendResult.payload || sendResult.error,
    });
  } catch (error) {
    sendJson(res, 200, { ok: false, error: error.message, inbound });
  }
}

function serveStatic(req, res) {
  const urlPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  const safePath = path
    .normalize(urlPath === "/" ? "/index.html" : urlPath)
    .replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/chat") {
    proxyChat(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/ai") {
    runOpenAi(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/whatsapp/save-bot") {
    saveWhatsappBot(req, res).catch((error) => sendJson(res, 500, { ok: false, error: error.message }));
    return;
  }
  if (req.method === "GET" && req.url === "/api/whatsapp/status") {
    whatsappStatus(req, res).catch((error) => sendJson(res, 500, { ok: false, error: error.message }));
    return;
  }
  if (req.method === "POST" && req.url === "/api/whatsapp/connect") {
    connectWhatsapp(req, res).catch((error) => sendJson(res, 500, { ok: false, error: error.message }));
    return;
  }
  if (req.method === "POST" && req.url === "/api/whatsapp/webhook") {
    whatsappWebhook(req, res).catch((error) => sendJson(res, 500, { ok: false, error: error.message }));
    return;
  }
  if (req.method === "GET" && req.url === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      n8nWebhook,
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      openaiModel,
      evolutionApiUrl,
      evolutionInstance,
    });
    return;
  }
  serveStatic(req, res);
});

server.listen(port, () => {
  console.log(`Chatbot Automatizacion listo en http://localhost:${port}`);
  console.log(`Proxy n8n: ${n8nWebhook}`);
});
