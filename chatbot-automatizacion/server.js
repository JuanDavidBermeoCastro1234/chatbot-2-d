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
  if (req.method === "GET" && req.url === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      n8nWebhook,
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      openaiModel,
    });
    return;
  }
  serveStatic(req, res);
});

server.listen(port, () => {
  console.log(`Chatbot Automatizacion listo en http://localhost:${port}`);
  console.log(`Proxy n8n: ${n8nWebhook}`);
});
