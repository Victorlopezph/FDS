# Team lab

Tu equipo organizado por un agente de IA. Grabás un audio o escribís qué hiciste, y Team lab actualiza tareas, porcentajes, estados y alertas sola.

Pensada para celular, con modo día y modo noche.

## Subirlo a Vercel (15 minutos)

1. **GitHub:** creen un repo vacío y suban esta carpeta:
   ```bash
   git init
   git add .
   git commit -m "Team lab"
   git branch -M main
   git remote add origin https://github.com/USUARIO/ronda.git
   git push -u origin main
   ```
2. **Vercel:** en vercel.com, **Add New → Project**, importen el repo y toquen **Deploy**.
3. **Base de datos:** en el proyecto de Vercel, **Storage → Marketplace → Upstash (Redis)**, créenla y conéctenla al proyecto. Las variables se cargan solas.
4. **Clave de Claude:** en **Settings → Environment Variables** agreguen `ANTHROPIC_API_KEY` (de console.anthropic.com).
5. **Redeploy:** en **Deployments**, los tres puntitos del último → **Redeploy**, para que tome las variables nuevas.

En desarrollo local sin Redis se usa memoria temporal y se muestra como tal; esos datos se pierden al reiniciar. En producción, si Redis no está conectado o responde con errores, la app falla de forma cerrada y no usa memoria local como si fuera durable.

## Activar el login con Google (10 minutos)

Hasta que lo configuren, la app funciona con **modo invitado** (se entra solo con el nombre).

1. Entren a **console.cloud.google.com** y creen un proyecto nuevo (ej: "Team lab").
2. Busquen **"Google Auth Platform"** (o "Pantalla de consentimiento de OAuth") y configúrenla:
   - Nombre de la app: Team lab. Mail de soporte: el de ustedes.
   - Tipo de usuarios: **Externo**.
   - En **Público / Audience**: toquen **Publicar app**, o agreguen como *usuarios de prueba* los mails de los 5 y de quien vaya a probarla. Si queda en modo prueba sin agregar mails, Google bloquea a los demás.
3. En **Clientes → Crear cliente**: tipo **Aplicación web**.
   - En **URI de redireccionamiento autorizados** agreguen exactamente:
     `https://SU-APP.vercel.app/api/auth/callback`
     (y `http://localhost:3000/api/auth/callback` si quieren probar local).
4. Copien el **ID de cliente** y el **Secreto**.
5. En Vercel, **Settings → Environment Variables**, agreguen:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `AUTH_SECRET`: secreto aleatorio independiente de al menos 32 bytes (por ejemplo, generen uno con `openssl rand -base64 32`). No reutilicen credenciales de Google ni de proveedores de IA.
   - Opcional: `ALLOW_GUEST=false` para desactivar el acceso invitado; por defecto sigue habilitado.
6. **Redeploy.** Aparece el botón "Continuar con Google".

`AUTH_SECRET` es obligatorio en producción. Si falta o es demasiado corto, el login falla de forma segura. Cambiarlo invalida inmediatamente todas las sesiones existentes; las personas deberán iniciar sesión de nuevo. Importante: usen siempre el dominio de producción (`su-app.vercel.app`). Los links de "preview" de Vercel tienen otra dirección y Google los rechaza.

## Proyectos e invitaciones

- Cada persona crea sus proyectos con **+ Nuevo** y solo ve los proyectos donde es integrante.
- Para sumar gente, dentro del proyecto:
  - **Invitar por mail:** cuando esa persona entra con Google con ese mail, queda adentro sola.
  - **Compartir link:** se manda por WhatsApp; quien lo abre e inicia sesión se suma al proyecto.
- **Sumar gente de tu equipo** con un toque: aparecen los compañeros de tus otros proyectos.
- **Sacar gente:** solo quien creó el proyecto. Sus tareas quedan sin asignar y le llega un aviso.
- **Salir del proyecto:** cualquiera. Si sale el creador, el proyecto queda a cargo del siguiente integrante; si sale el último, se elimina.
- **Tareas a mano:** botón **Nueva tarea** dentro del proyecto. Tocando una tarea se edita o se elimina.
- **Editar o eliminar el proyecto:** con el lápiz arriba a la derecha (eliminar, solo el creador).

## IA: chat y análisis de progreso

- El chat usa `ANTHROPIC_API_KEY` o el AI Gateway (`AI_GATEWAY_API_KEY` / `USE_AI_GATEWAY=true`), con `AI_GATEWAY_MODEL` opcional. Si el proveedor del chat falla, responde el modo local.
- **Registrar avance** usa el AI SDK con el **Vercel AI Gateway** y salida estructurada. En Vercel no hace falta ninguna clave: la autenticación es automática (OIDC). El modelo predeterminado es `openai/gpt-6-luna`; podés cambiarlo con `AI_ANALYSIS_MODEL` usando cualquier ID `proveedor/modelo` del catálogo del Gateway (por ejemplo `anthropic/claude-sonnet-5.5` o `google/gemini-3.8-flash`). Un modelo sin acceso o incompatible devuelve un error controlado; no se simula una actualización.
- El consumo se factura en los créditos del AI Gateway del equipo de Vercel. Ninguna credencial se envía al navegador.
- Límites actuales: 30 análisis por usuario autenticado y hora, 90 por IP confiable en Vercel y un máximo de 4.000 caracteres por mensaje. No hay reintentos automáticos de la llamada; la reserva distribuida evita solicitudes concurrentes y el resultado idempotente expira en 24 horas. Esto no puede garantizar facturación exactamente una vez: si OpenAI acepta y cobra una llamada pero la conexión o el proceso falla antes de guardar el resultado, un reintento posterior al vencimiento puede volver a cobrar. Configurá alertas de consumo en el panel de uso de OpenAI además del límite de la aplicación.
- El análisis envía a OpenAI el proyecto, las tareas y el mensaje actual, no el historial del chat; la solicitud usa `store: false`. Eso no garantiza por sí solo que no exista retención del proveedor. El chat conserva como máximo 150 mensajes por proyecto y las auditorías hasta 500 análisis en el estado de la app.
- El micrófono usa el reconocimiento de voz del navegador. Según navegador y configuración, la transcripción puede depender de servicios externos; la app envía a su servidor sólo el texto transcripto, no un archivo de audio.

## Habilidades y asignación

- En **Equipo → Mi perfil** cada uno elige su **rol** de un desplegable; según el rol se sugieren **habilidades** (también hay un desplegable con todas y la opción de escribir una propia). El **horario** se elige tocando los días y las horas desde/hasta.
- Roles y habilidades se editan en `lib/skills.js`.
- El agente reparte en este orden: **habilidades** que coinciden con la tarea, **horario** disponible antes de la fecha y **menos tareas abiertas**. En el chat explica por qué eligió a cada uno.
- Al crear una tarea a mano, la app **sugiere un responsable** según las palabras de la tarea ("diseñar logo" → quien sabe Diseño UX/UI).
- Siempre que se asigna una tarea a alguien, le llega una alerta, la asigne una persona o el agente.
- La lista de habilidades y sus palabras clave está en `lib/skills.js`.

## Chats por proyecto

- Cada proyecto tiene **su propio chat** (pestaña **Chat** dentro del proyecto, o la pestaña **Chats** de abajo).
- El chat es **grupal**: lo ven todos los integrantes, con el nombre de quien escribió.
- El agente de ese chat **solo trabaja sobre ese proyecto**: no puede tocar ni ver otros.

## Probar en la compu

```bash
npm install
echo "ANTHROPIC_API_KEY=tu-clave" > .env.local
npm run dev
```
Abrir http://localhost:3000 (con las herramientas de desarrollador en vista de celular).

## Cómo está armado (para repartirse el trabajo)

| Archivo | Qué hace |
|---|---|
| `app/api/analyze/route.js` | El agente: lee el audio o nota y devuelve tareas, cambios y alertas. Acá está el prompt. |
| `app/api/chat/route.js` | El chat para hacerle preguntas al equipo. |
| `app/api/state/route.js` | Leer el estado, crear proyectos, invitar, unirse, perfil, cambiar tareas, cargar ejemplo. |
| `app/api/auth/*` | Login con Google, modo invitado y cerrar sesión. |
| `lib/auth.js` | Sesiones con cookie firmada. |
| `app/api/presence/route.js` | Estado de conexión (cada celular avisa cada 25 s). |
| `lib/logic.js` | Permisos, invitaciones, porcentajes, estados y alertas automáticas. |
| `lib/seed.js` | Datos de ejemplo de la demo. |
| `components/ProjectDetail.js` | Detalle del proyecto: pestañas Tareas, Chat e Integrantes. |
| `components/Assistant.js` | El chat del proyecto con micrófono. |
| `components/Chats.js` | Lista de chats (uno por proyecto). |
| `components/TaskSheet.js` / `NewProject.js` | Crear y editar tareas y proyectos. |
| `components/` (resto) | Login, Proyectos, Alertas, Equipo y perfil. |
| `app/globals.css` | Colores pastel, modo noche y diseño mobile. |

Opcional: `ANTHROPIC_MODEL` para cambiar el modelo (por defecto `claude-sonnet-5-5`).

## Demo sugerida

1. Pantalla de proyectos: tarjetas ordenadas por prioridad con su porcentaje.
2. Entrar a **App de turnos → Chat** → micrófono: *"Terminé la pantalla de login, me trabé con los pagos y el viernes no puedo venir"* → **Registrar avance**.
3. Pestaña **Tareas**: el login pasó a hecho, pagos quedó trabado, el proyecto pasó a Trabado. La campanita tiene alertas nuevas.
4. Volver al **Chat** → *"¿A quién le paso lo de pagos?"* → **Preguntar**.

Para la demo: en Proyectos (o abajo de todo en Equipo) está **Cargar proyectos de ejemplo**, que crea 4 proyectos con compañeros ficticios. Se puede reiniciar las veces que quieran.
