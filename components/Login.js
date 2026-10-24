'use client';
import { useState } from 'react';

const ERRORS = {
  login: 'No se pudo iniciar sesión. Probá de nuevo.',
};

export default function Login({ inviting, onGuest }) {
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
    try {
      const r = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || 'No se pudo entrar.');
        return;
      }
      onGuest(d.user);
    } catch {
      setError('Sin conexión. Revisá internet e intentá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <img className="login-logo" src="/logo-mark.png" alt="" />
      <h1 style={{ fontSize: 34 }}>Team <span className="brand-lab">Lab</span></h1>
      <p className="login-sub">Tu equipo organizado por un agente de IA. Contale qué hiciste y él se encarga del resto.</p>

      {inviting && <div className="note c-lav">Te invitaron a un proyecto. Entrá con tu nombre para sumarte.</div>}
      {error && <div className="error" role="alert">{error}</div>}

      <form onSubmit={enterGuest} className="guest-form">
        <input
          className="field"
          placeholder="Tu nombre"
          aria-label="Tu nombre"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
        />
        <button className="btn primary" style={{ width: '100%' }} disabled={busy || !name.trim()}>
          {busy ? 'Ingresando…' : 'Entrar como invitado'}
        </button>
      </form>
      <p className="small" style={{ textAlign: 'center', marginTop: 8 }}>
        <a className="link" href="/privacidad">Privacidad</a> · <a className="link" href="/terminos">Condiciones</a>
      </p>
    </div>
  );
}
