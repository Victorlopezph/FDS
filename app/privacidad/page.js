export const metadata = { title: 'Privacidad · Team lab' };

export default function Privacidad() {
  return (
    <main className="legal">
      <a href="/" className="back">← Volver a Team lab</a>
      <h1>Política de privacidad</h1>
      <p className="small">Última actualización: 24 de octubre de 2026</p>
      <h2>Qué datos usamos</h2>
      <p>Si entrás con Google, Team lab recibe solo tu nombre, tu mail y tu foto de perfil. Si entrás como invitado, solo el nombre que escribas.</p>
      <p>Además guardamos lo que cargás en la app: proyectos, tareas, mensajes del chat, tu rol, habilidades y horario.</p>
      <h2>Para qué</h2>
      <p>Para identificarte, mostrar tus proyectos a los integrantes que vos invitás y organizar las tareas del equipo. No vendemos ni compartimos tus datos con terceros para publicidad.</p>
      <h2>Dónde se guardan</h2>
      <p>La app está alojada en Vercel y los datos se guardan en una base de datos de Upstash. Si se configura un servicio de IA, el texto de los mensajes del chat se envía a ese servicio solo para generar la respuesta.</p>
      <h2>Tus derechos</h2>
      <p>Podés salir de cualquier proyecto y pedir que borremos tus datos escribiendo a arcangel.loki@gmail.com.</p>
    </main>
  );
}
