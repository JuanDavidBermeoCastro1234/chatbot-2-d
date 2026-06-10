# Chatbot Automatizacion

Interfaz local para crear, configurar y probar chatbots comerciales conectados a n8n, OpenAI y WhatsApp mediante Evolution API. El objetivo del proyecto es permitir que una empresa cargue su informacion, pruebe el chatbot desde el navegador y, opcionalmente, lo conecte a WhatsApp para responder mensajes de clientes.

> Este proyecto esta pensado para desarrollo y pruebas locales. La conexion de WhatsApp usa Evolution API/WhatsApp Web por QR, no la API oficial de Meta.

## Que incluye

- Interfaz web en HTML, CSS y JavaScript puro.
- Creacion y administracion local de varios chatbots.
- Configuracion por bot: nombre, empresa, tono, campos dinamicos y base de conocimiento.
- Importacion de conocimiento desde texto largo, `.txt`, `.md` o PDF con texto seleccionable.
- Chat local para probar respuestas antes de conectar WhatsApp.
- Proxy backend en Node.js para hablar con n8n, OpenAI y Evolution API.
- Workflows n8n exportados para chat local y WhatsApp.
- Conexion QR a WhatsApp usando Evolution API.
- Envio automatico de respuestas a WhatsApp cuando llegan mensajes.
- Notificaciones al dueno cuando se detecta venta o necesidad de atencion humana.
- Opcion para desactivar el chatbot y dejar que una persona responda.

## Estructura del proyecto

```text
chatbot-automatizacion/
  public/
    index.html          Interfaz principal
    app.js              Logica del frontend
    styles.css          Estilos de la interfaz
  n8n/
    chatbot-denin.workflow.json
    chatbot-denin-whatsapp.workflow.json
  tools/
    build-workflow.js
  tmp/
  server.js             Servidor local, proxy API y WhatsApp
  package.json
  .env.example
  README.md
```

Archivos locales generados por la app:

```text
.whatsapp-state.json    Estado de conexion, bot activo y configuracion
.whatsapp-events.jsonl  Historial tecnico de eventos de WhatsApp
```

Estos archivos no deben tratarse como configuracion limpia del proyecto; son estado local de ejecucion.

## Requisitos

- Node.js instalado.
- npm instalado.
- n8n corriendo localmente, normalmente en Docker.
- Evolution API corriendo localmente si se quiere probar WhatsApp.
- Una API key de OpenAI si se quiere usar IA real. Si OpenAI falla o llega al limite, el flujo conserva una respuesta de respaldo desde n8n.

Puertos usados por defecto:

```text
8090  App local Node.js
5678  n8n
8082  Evolution API, segun .env.example
```

En el entorno local actual tambien se ha usado Evolution en `8083`. Si tu contenedor esta en otro puerto, actualiza `.env`.

## Instalacion

Desde la carpeta del proyecto:

```powershell
cd "C:\Users\Juan David\OneDrive\Documents\chatbot 2 d\chatbot-automatizacion"
npm install
```

Crea el archivo `.env`:

```powershell
Copy-Item .env.example .env
notepad .env
```

Ejemplo de variables:

```text
OPENAI_API_KEY=tu_api_key_de_openai
OPENAI_MODEL=gpt-5.4-mini
N8N_CHATBOT_WEBHOOK=http://127.0.0.1:5678/webhook/chatbot-denin/chat
N8N_WHATSAPP_WEBHOOK=http://host.docker.internal:5678/webhook/chatbot-denin/whatsapp
EVOLUTION_API_URL=http://127.0.0.1:8082
EVOLUTION_API_KEY=miapikey123
EVOLUTION_INSTANCE=JuandAVID187
PUBLIC_WEBHOOK_BASE=http://host.docker.internal:8090
```

Notas importantes:

- No pongas la API key en `public/app.js`, `index.html`, CSS ni en archivos que se sirvan al navegador.
- ChatGPT Plus/Premium no es lo mismo que la API de OpenAI. La API usa una API key de la plataforma de OpenAI y tiene limites/creditos separados.
- Para PDFs escaneados como imagen se necesitaria OCR. La importacion actual funciona con PDFs que tengan texto seleccionable.

## Ejecutar la app

```powershell
npm start
```

Tambien existe:

```powershell
npm run dev
```

En este proyecto ambos ejecutan `node server.js`.

Luego abre:

```text
http://localhost:8090
```

## Live Server vs npm start

Live Server solo sirve para ver el HTML/CSS/JS estatico. No levanta el backend local.

Para que funcione el chat completo necesitas `npm start` o `npm run dev`, porque el navegador usa endpoints como:

```text
/api/chat
/api/ai
/api/knowledge/import
/api/whatsapp/status
/api/whatsapp/connect
```

Si abres el HTML con Live Server, la interfaz puede verse bien, pero no tendra el proxy local, n8n, OpenAI ni WhatsApp funcionando correctamente.

## Como funciona

Flujo del chat local:

```text
Usuario en la interfaz
  -> POST /api/chat
  -> servidor Node.js
  -> webhook de n8n chatbot-denin/chat
  -> OpenAI por medio de /api/ai, si esta disponible
  -> fallback de n8n si OpenAI falla
  -> respuesta al navegador
```

Flujo con WhatsApp:

```text
Cliente escribe al WhatsApp vinculado
  -> Evolution API recibe el mensaje
  -> Evolution envia webhook a n8n
  -> n8n prepara el contexto del bot activo
  -> n8n consulta OpenAI o fallback
  -> n8n llama /api/whatsapp/send
  -> servidor Node.js envia la respuesta por Evolution API
  -> cliente recibe el mensaje en WhatsApp
```

El bot activo de WhatsApp se guarda desde la interfaz. Solo debe haber un bot conectado a WhatsApp a la vez, porque un mismo numero no puede responder como varias empresas distintas al mismo tiempo sin generar respuestas incoherentes.

## Workflows n8n

Los workflows exportados estan en:

```text
n8n/chatbot-denin.workflow.json
n8n/chatbot-denin-whatsapp.workflow.json
```

Nombres esperados en n8n:

```text
chatbot denin
chatbot denin whatsapp
```

Endpoints esperados:

```text
POST http://127.0.0.1:5678/webhook/chatbot-denin/chat
POST http://host.docker.internal:5678/webhook/chatbot-denin/whatsapp
```

Si editas los JSON locales, recuerda que n8n no se actualiza automaticamente. Debes importar de nuevo el workflow en el contenedor y activarlo.

Ejemplo con Docker:

```powershell
docker cp .\n8n\chatbot-denin.workflow.json n8n:/tmp/chatbot-denin.workflow.json
docker exec n8n n8n import:workflow --input=/tmp/chatbot-denin.workflow.json
docker exec n8n n8n update:workflow --id=chatbotDenin001 --active=true
docker restart n8n
```

Para WhatsApp:

```powershell
docker cp .\n8n\chatbot-denin-whatsapp.workflow.json n8n:/tmp/chatbot-denin-whatsapp.workflow.json
docker exec n8n n8n import:workflow --input=/tmp/chatbot-denin-whatsapp.workflow.json
docker exec n8n n8n update:workflow --id=chatbotDeninWhatsapp001 --active=true
docker restart n8n
```

En algunas versiones nuevas de n8n `update:workflow` aparece como comando deprecado y recomienda `publish:workflow`. Si el workflow queda importado pero no responde, revisa que este publicado/activo en la UI de n8n.

## Como probar

### 1. Probar salud del servidor

Con la app corriendo:

```powershell
Invoke-RestMethod http://localhost:8090/api/health
```

Debe responder JSON con informacion del puerto, modelo OpenAI, URL de Evolution y workflow de n8n.

### 2. Probar la interfaz

1. Abre `http://localhost:8090`.
2. Crea o selecciona un chatbot.
3. Configura empresa, tono y campos.
4. Pega informacion en la base de conocimiento o sube un archivo.
5. Haz clic en `Guardar configuracion`.
6. Escribe una pregunta en el chat.

Ejemplos de preguntas:

```text
Cuanto cuesta la camiseta premium?
Que camisa me recomiendas para uso diario?
Hacen envios a Medellin?
Como puedo pagar?
Quiero comprar una hoy
```

### 3. Probar el endpoint de chat sin la interfaz

```powershell
$body = @{
  message = "quiero una camisa buena para comprar hoy, cual me recomiendas y como pago?"
  bot = @{
    name = "camisa"
    businessName = "Empresa camisa"
    tone = "profesional"
    knowledge = "Productos: camisetas premium para uso diario, camisetas oversize, buzos y gorras.`nPrecios: camiseta premium 45000 COP, oversize 65000 COP.`nPagos: Nequi, transferencia y pago contra entrega."
  }
} | ConvertTo-Json -Depth 6

Invoke-RestMethod `
  -Uri http://localhost:8090/api/chat `
  -Method Post `
  -Body $body `
  -ContentType "application/json"
```

La respuesta debe ser corta, concreta y orientada a venta.

### 4. Probar OpenAI directamente

```powershell
Invoke-RestMethod `
  -Uri http://localhost:8090/api/ai `
  -Method Post `
  -Body $body `
  -ContentType "application/json"
```

Si aparece un error `429`, significa que la API key llego al limite de uso. En ese caso el sistema puede seguir respondiendo con fallback de n8n.

### 5. Probar importacion de conocimiento

Desde la interfaz:

1. Ve a `Base de conocimiento`.
2. Pega un texto largo o selecciona un archivo.
3. Guarda la configuracion.
4. Pregunta algo especifico de ese texto.

El servidor resume y selecciona partes relevantes para no enviar todo el documento en cada respuesta.

### 6. Probar WhatsApp

1. Asegurate de que n8n y Evolution API esten corriendo.
2. Abre la app en `http://localhost:8090`.
3. Selecciona el bot que quieres usar.
4. Guarda la configuracion.
5. Haz clic en `Conectar WhatsApp`.
6. Genera el QR.
7. Escanea el QR desde WhatsApp o WhatsApp Business:

```text
WhatsApp > Ajustes > Dispositivos vinculados > Vincular un dispositivo
```

8. Cuando el estado quede conectado, escribe desde otro numero al WhatsApp vinculado.
9. Revisa que aparezcan executions en n8n y que el cliente reciba respuesta.

Puedes revisar el estado tecnico con:

```powershell
Invoke-RestMethod http://localhost:8090/api/whatsapp/status
```

Y eventos recientes:

```powershell
Invoke-RestMethod "http://localhost:8090/api/whatsapp/events?limit=20"
```

## Notificaciones y modo humano

La interfaz tiene botones:

```text
Notificar
Desactivar chatbot
```

`Notificar` permite guardar un numero o correo para avisar cuando:

- El cliente confirma compra o muestra intencion fuerte de comprar.
- El bot detecta que se necesita una persona real.

El aviso por WhatsApp usa la misma instancia de Evolution. El correo queda guardado como configuracion, pero para envio real por email haria falta configurar un proveedor SMTP/API.

`Desactivar chatbot` evita que se mande respuesta automatica por WhatsApp. En ese caso el sistema puede notificar al dueno para que responda manualmente.

## Endpoints principales

```text
GET  /api/health
POST /api/chat
POST /api/ai
POST /api/knowledge/import
POST /api/whatsapp/save-bot
GET  /api/whatsapp/n8n-config
GET  /api/whatsapp/status
POST /api/whatsapp/connect
POST /api/whatsapp/send
POST /api/whatsapp/webhook
GET  /api/whatsapp/events?limit=20
GET  /api/notifications/config
POST /api/notifications/config
POST /api/notifications/event
```

## Comandos utiles

Ver contenedores:

```powershell
docker ps
```

Ver logs de n8n:

```powershell
docker logs n8n --tail 80
```

Listar workflows:

```powershell
docker exec n8n n8n list:workflow
```

Ver que proceso usa el puerto 8090:

```powershell
netstat -ano | Select-String ":8090"
```

## Problemas comunes

### `npm run dev` o `npm start` no existen

Ejecuta los comandos dentro de `chatbot-automatizacion`, no en la carpeta padre.

```powershell
cd "C:\Users\Juan David\OneDrive\Documents\chatbot 2 d\chatbot-automatizacion"
npm start
```

### La interfaz abre pero el chat no responde

Probablemente abriste con Live Server o el servidor Node no esta corriendo. Usa `npm start` y entra por:

```text
http://localhost:8090
```

### WhatsApp vincula por QR pero no responde

Revisa en orden:

1. `GET /api/whatsapp/status` debe mostrar Evolution en estado `open`.
2. n8n debe tener activo `chatbot denin whatsapp`.
3. Evolution debe tener webhook apuntando a:

```text
http://host.docker.internal:5678/webhook/chatbot-denin/whatsapp
```

4. En n8n deben aparecer executions cuando llega un mensaje.
5. El nodo final debe llamar a `/api/whatsapp/send` con el `remoteJid` correcto.

### OpenAI responde `429`

La API key llego al limite de solicitudes o credito. El bot puede usar fallback de n8n, pero la calidad sera menor que con IA real.

### El bot responde demasiado largo

El prompt y el fallback estan configurados para respuestas cortas. Si vuelve a pasar, revisa que el workflow importado en n8n sea la version actual y que n8n se haya reiniciado despues de importar.

### El PDF no se entiende

Si el PDF es una imagen escaneada, no tiene texto para extraer. Hace falta OCR antes de importarlo.

## Limitaciones actuales

- WhatsApp usa Evolution API/QR, no la API oficial de Meta.
- El modo QR puede cerrarse o requerir re-vinculacion.
- El envio real por email no esta implementado; solo queda la configuracion guardada.
- No hay base de datos multiusuario; la persistencia local se maneja con archivos JSON.
- No hay autenticacion de usuarios.
- No es una arquitectura lista para produccion publica sin endurecer seguridad, secretos, logs y despliegue.

## Buenas practicas para continuar

- Mantener secretos solo en `.env`.
- No subir `.whatsapp-state.json` ni `.whatsapp-events.jsonl` a Git.
- Probar primero en chat local antes de conectar WhatsApp.
- Hacer commit despues de cada mejora que funcione.
- Importar y activar workflows despues de cambiar JSON en `n8n/`.
- Verificar en executions de n8n cuando algo falle en WhatsApp.

