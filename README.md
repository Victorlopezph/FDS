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

Sin Redis la app igual funciona, pero los datos se guardan en memoria y se pierden.

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
   - `AUTH_SECRET`: cualquier texto largo al azar (firma las sesiones).
   - Opcional: `ALLOW_GUEST=true` si quieren dejar también el modo invitado.
6. **Redeploy.** Aparece el botón "Continuar con Google".

Importante: usen siempre el dominio de producción (`su-app.vercel.app`). Los links de "preview" de Vercel tienen otra dirección y Google los rechaza.

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

## IA: con clave o sin clave

- **Sin ninguna clave**, la app funciona en **modo sin IA**: un agente por reglas (`lib/offline.js`) entiende frases como *"terminé el login, me trabé con los pagos, el viernes no puedo venir, hay que hacer el logo"*, actualiza tareas, crea nuevas, asigna por habilidades y avisa al equipo. En el chat aparece la etiqueta "modo sin IA".
- **Con IA real** (se activa sola al cargar la variable en Vercel y hacer Redeploy):
  - `ANTHROPIC_API_KEY`: clave de console.anthropic.com, o
  - `AI_GATEWAY_API_KEY`: clave del AI Gateway de Vercel (o `USE_AI_GATEWAY=true` para usar el token del proyecto). Modelo configurable con `AI_GATEWAY_MODEL`.
- Si la IA falla, la app vuelve sola al modo sin IA: el chat nunca se queda sin responder.

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
