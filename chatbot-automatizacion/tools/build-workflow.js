const fs = require("fs");
const path = require("path");

const prepareCode = `
const payload = $json.body || $json;
const message = String(payload.message || payload.mensaje || payload.text || "").trim();
const bot = payload.bot || {};
const knowledge = String(bot.knowledge || "");
const businessName = bot.businessName || bot.name || "Denin Camisetas";
const tone = bot.tone || "profesional";

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
}

function money(value) {
  return new Intl.NumberFormat("es-CO").format(value) + " COP";
}

const catalog = [
  { name: "Basica algodon 100%", price: 39900, quality: "algodon suave, fresca y no transparenta" },
  { name: "Oversize pesada 240 g", price: 59900, quality: "tela gruesa, caida amplia y costura reforzada" },
  { name: "Premium cuello reforzado", price: 69900, quality: "acabado premium, cuello firme y mayor durabilidad" },
];

function detectIntent(text) {
  const lower = normalize(text);
  if (/(precio|cuanto|cuesta|valor|vale|catalogo)/.test(lower)) return "precio";
  if (/(contra entrega|contraentrega|pago|nequi|daviplata|transferencia)/.test(lower)) return "pagos";
  if (/(envio|envios|entrega|pais|ciudad|domicilio)/.test(lower)) return "envios";
  if (/(marca|calidad|tela|material|algodon|garantia)/.test(lower)) return "calidad";
  if (/(talla|color|colores|disponible|stock)/.test(lower)) return "disponibilidad";
  if (/(comprar|quiero|pedido|orden|separar|me interesa)/.test(lower)) return "compra";
  return "general";
}

function style(text) {
  if (tone === "cercano") return text.replace(/^Hola\\. /, "Hola, que mas. ");
  if (tone === "premium") return text + " Te puedo orientar con una recomendacion segun el uso que buscas.";
  return text;
}

function responseFor(intent) {
  if (!message) {
    return {
      reply: "No recibi un mensaje. Escribeme una pregunta sobre precios, envios, pagos o disponibilidad.",
      lead_status: "sin_mensaje",
    };
  }

  if (intent === "precio") {
    return {
      reply: style(
        "Hola. Estos son los precios de " + businessName + ":\\n" +
          catalog.map((item) => "- " + item.name + ": " + money(item.price)).join("\\n") +
          "\\n\\nSi me dices talla, color y cantidad, te confirmo disponibilidad y total."
      ),
      lead_status: "cotizando",
    };
  }

  if (intent === "envios") {
    return {
      reply: style(
        "Si, hacemos envios a todo Colombia. Bogota cuesta 8.000 COP, ciudades principales 12.000 COP y otros municipios se cotizan segun transportadora. Entrega: Bogota 1 a 2 dias habiles, otras ciudades 2 a 5 dias habiles."
      ),
      lead_status: "informado",
    };
  }

  if (intent === "pagos") {
    return {
      reply: style(
        "Puedes pagar por transferencia, Nequi, Daviplata y pago contra entrega en ciudades principales. Para pago contra entrega necesito ciudad, barrio, talla, color y cantidad."
      ),
      lead_status: "pago_consultado",
    };
  }

  if (intent === "calidad") {
    return {
      reply: style(
        "La calidad depende de la linea: basica en algodon suave, oversize en tela pesada 240 g y premium con cuello reforzado. Todas tienen costura reforzada y garantia por defecto de fabricacion."
      ),
      lead_status: "calidad_consultada",
    };
  }

  if (intent === "disponibilidad") {
    return {
      reply: style(
        "Manejamos tallas S, M, L y XL. Colores: blanco, negro, arena, azul y verde. Dime que talla y color quieres para confirmarte la disponibilidad del pedido."
      ),
      lead_status: "calificando",
    };
  }

  if (intent === "compra") {
    return {
      reply: style(
        "Perfecto. Para armar tu pedido necesito: nombre, ciudad, talla, color, cantidad y metodo de pago. Con eso te confirmo total y siguiente paso."
      ),
      lead_status: "lead_caliente",
    };
  }

  return {
    reply: style(
      "Hola. Soy el asistente de " + businessName + ". Te puedo ayudar con precios, marcas, calidad, envios a todo el pais, pago contra entrega y disponibilidad. Que te gustaria saber?"
    ),
    lead_status: "nuevo",
  };
}

const intent = detectIntent(message);
const fallback = responseFor(intent);

return [
  {
    json: {
      ok: true,
      source: "n8n",
      bot: { name: bot.name || "Denin Camisetas", businessName, tone, knowledge },
      message,
      conversation: Array.isArray(payload.conversation) ? payload.conversation.slice(-8) : [],
      intent,
      fallbackReply: fallback.reply,
      lead_status: fallback.lead_status,
      reusable: true,
      knowledge_used: knowledge ? "frontend_bot_config" : "default_catalog",
      aiRequest: {
        message,
        bot: { name: bot.name || "Denin Camisetas", businessName, tone, knowledge },
        conversation: Array.isArray(payload.conversation) ? payload.conversation.slice(-8) : [],
        intent,
        lead_status: fallback.lead_status,
        fallbackReply: fallback.reply
      }
    },
  },
];
`.trim();

const finalizeCode = `
const prepared = $("Preparar Contexto").first().json;
const ai = $json || {};
const hasAiReply = ai.ok === true && typeof ai.reply === "string" && ai.reply.trim();

return [
  {
    json: {
      ok: true,
      source: hasAiReply ? "openai+n8n" : "n8n",
      bot: prepared.bot,
      message: prepared.message,
      intent: hasAiReply ? (ai.intent || prepared.intent) : prepared.intent,
      reply: hasAiReply ? ai.reply : prepared.fallbackReply,
      lead_status: hasAiReply ? (ai.lead_status || prepared.lead_status) : prepared.lead_status,
      needs_human: Boolean(ai.needs_human),
      reusable: true,
      received_at: new Date().toISOString(),
      knowledge_used: prepared.knowledge_used,
      openai_model: ai.model || null,
      fallback_used: !hasAiReply
    },
  },
];
`.trim();

const workflow = {
  id: "chatbotDenin001",
  name: "chatbot denin",
  active: true,
  isArchived: false,
  nodes: [
    {
      parameters: {
        httpMethod: "POST",
        path: "chatbot-denin/chat",
        responseMode: "responseNode",
        options: {},
      },
      id: "chatbot-denin-webhook",
      name: "Chatbot Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [-760, 0],
      webhookId: "chatbot-denin-chat",
    },
    {
      parameters: {
        jsCode: prepareCode,
      },
      id: "chatbot-denin-prepare",
      name: "Preparar Contexto",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [-500, 0],
    },
    {
      parameters: {
        method: "POST",
        url: "http://host.docker.internal:8090/api/ai",
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: "Content-Type", value: "application/json" }],
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ $json.aiRequest }}",
        options: {
          timeout: 20000,
        },
      },
      id: "chatbot-denin-ai-proxy",
      name: "Consultar IA Local",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [-240, 0],
      continueOnFail: true,
    },
    {
      parameters: {
        jsCode: finalizeCode,
      },
      id: "chatbot-denin-finalize",
      name: "Finalizar Respuesta",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [20, 0],
    },
    {
      parameters: {
        respondWith: "text",
        responseBody: "={{ JSON.stringify($json) }}",
        options: {},
      },
      id: "chatbot-denin-respond",
      name: "Responder Chatbot",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.1,
      position: [280, 0],
    },
  ],
  connections: {
    "Chatbot Webhook": {
      main: [[{ node: "Preparar Contexto", type: "main", index: 0 }]],
    },
    "Preparar Contexto": {
      main: [[{ node: "Consultar IA Local", type: "main", index: 0 }]],
    },
    "Consultar IA Local": {
      main: [[{ node: "Finalizar Respuesta", type: "main", index: 0 }]],
    },
    "Finalizar Respuesta": {
      main: [[{ node: "Responder Chatbot", type: "main", index: 0 }]],
    },
  },
  settings: {
    executionOrder: "v1",
  },
  staticData: null,
  meta: null,
  pinData: {},
  versionId: "7e80551a-9f7f-4f91-bb38-b2a9201ce8bb",
  versionCounter: 2,
  tags: [],
};

const outputDir = path.join(__dirname, "..", "n8n");
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  path.join(outputDir, "chatbot-denin.workflow.json"),
  JSON.stringify(workflow, null, 2),
);
console.log("Workflow generado en n8n/chatbot-denin.workflow.json");
