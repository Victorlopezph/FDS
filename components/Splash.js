'use client';
// Animación de entrada con barra de carga.
export default function Splash({ hide }) {
  return (
    <div className={`splash ${hide ? 'hide' : ''}`} aria-hidden={hide}>
      <img src="/logo-mark.png" alt="" />
      <h1>Team <span className="brand-lab">Lab</span></h1>
      <div className="splash-bar"><span /></div>
      <p>Organizando a tu equipo…</p>
    </div>
  );
}
