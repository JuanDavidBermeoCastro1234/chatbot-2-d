# Chatbot Automatizacion

Proyecto local para probar una interfaz de chatbot conectada a n8n.

## Que queda listo

- Interfaz HTML/CSS/JS inspirada en el panel oscuro de la referencia.
- Creacion local de varios chatbots desde la UI.
- Proxy local `server.js` para evitar bloqueos CORS.
- Workflow n8n llamado `chatbot denin` con endpoint:
  - `POST http://127.0.0.1:5678/webhook/chatbot-denin/chat`

## Ejecutar

```powershell
npm start
```

Luego abrir:

```text
http://localhost:8090
```

## Backend n8n

El workflow funciona localmente con n8n. Cuando `OPENAI_API_KEY` esta configurada en `.env`, n8n consulta la IA por medio del servidor local. Si la IA falla o no esta configurada, el flujo conserva respuestas de respaldo para no romper el chat.

No pongas la API key en el HTML, CSS, JS del navegador ni en el workflow JSON.

Configura una clave nueva asi:

```powershell
Copy-Item .env.example .env
notepad .env
```

Luego pon:

```text
OPENAI_API_KEY=tu_api_key_nueva
OPENAI_MODEL=gpt-5.4-mini
```

La cuenta ChatGPT Plus/Premium no sirve como token de API; la API key pertenece a la plataforma de OpenAI y consume credito/API billing por separado.

Para WhatsApp real se necesita Evolution API o WhatsApp Cloud configurado con QR/token e instancia conectada.

## Live Server vs npm start

Live Server sirve para ver la interfaz visual, pero no sirve para el chat completo porque no levanta el proxy `/api/chat` ni el endpoint seguro `/api/ai`.

`npm start` no es exactamente `npm run dev`; aqui solo ejecuta `node server.js`. En este proyecto es obligatorio para probar el chat funcional desde la interfaz.
