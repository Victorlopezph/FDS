'use client';
import { useState } from 'react';
import { Icon } from './ui';

const ERRORS = {
  google_off: 'El login con Google todavía no está configurado.',
  login: 'No se pudo iniciar sesión. Probá de nuevo.',
  google_token: 'Google rechazó el inicio de sesión. Revisá la configuración.',
  google_email: 'Tu cuenta de Google no tiene un mail verificado.',
};

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function Login({ google, guest, inviting, onGuest }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => {
    if (typeof window === 'undefined') return '';
    return ERRORS[new URLSearchParams(location.search).get('error')] || '';
  });

  async function enterGuest(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await fetch('/api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setError(d.error || 'No se pudo entrar.');
    onGuest(d.user);
  }

  return (
    <div className="login">
      <img className="login-logo" src="/logo-mark.png" alt="" />
      <h1 style={{ fontSize: 34 }}>Team <span className="brand-lab">Lab</span></h1>
      <p className="login-sub">Tu equipo organizado por un agente de IA. Contale qué hiciste y él se encarga del resto.</p>

      {inviting && <div className="note c-lav">Te invitaron a un proyecto. Iniciá sesión para sumarte.</div>}
      {error && <div className="error">{error}</div>}

      {google && (
        <a className="google-btn" href="/api/auth/google">
          <GoogleLogo /> Continuar con Google
        </a>
      )}

      {guest && (
        <form onSubmit={enterGuest} className="guest-form">
          {google && <div className="divider"><span>o entrá sin cuenta</span></div>}
          <input className="field" placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
          <button className="btn primary" style={{ width: '100%' }} disabled={busy || !name.trim()}>Entrar como invitado</button>
          {!google && <p className="small" style={{ textAlign: 'center' }}>El login con Google se activa cuando se configuran sus credenciales.</p>}
        </form>
      )}
    </div>
  );
}
