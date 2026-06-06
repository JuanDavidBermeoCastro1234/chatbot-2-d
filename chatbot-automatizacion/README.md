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

## WhatsApp local con Evolution API

La interfaz incluye `Conectar WhatsApp`.

Flujo:

1. Guarda la configuracion del bot que quieres usar.
2. Presiona `Conectar WhatsApp`.
3. Escribe el numero y genera QR.
4. Escanea desde WhatsApp > Dispositivos vinculados.
5. Cuando un cliente escriba a ese WhatsApp, Evolution envia el mensaje al servidor local, el servidor consulta n8n/OpenAI y responde por WhatsApp.

Variables usadas:

```text
EVOLUTION_API_URL=http://127.0.0.1:8082
EVOLUTION_API_KEY=miapikey123
EVOLUTION_INSTANCE=JuandAVID187
PUBLIC_WEBHOOK_BASE=http://host.docker.internal:8090
```

Esto es modo de prueba con WhatsApp Web/Evolution, no API oficial de Meta. Puede cerrar sesion, requerir reescanear QR o fallar si WhatsApp cambia controles.

## Live Server vs npm start

Live Server sirve para ver la interfaz visual, pero no sirve para el chat completo porque no levanta el proxy `/api/chat` ni el endpoint seguro `/api/ai`.

`npm start` no es exactamente `npm run dev`; aqui solo ejecuta `node server.js`. En este proyecto es obligatorio para probar el chat funcional desde la interfaz.
