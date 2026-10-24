'use client';
import { useState } from 'react';

export default function Login({ inviting, onGuest }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

      {inviting && <div className="note c-lav">Te invitaron a un proyecto. Escribí tu nombre para sumarte.</div>}
      {error && <div className="error">{error}</div>}

      <form onSubmit={enterGuest} className="guest-form">
        <input className="field" placeholder="Tu nombre" aria-label="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
        <button className="btn primary" style={{ width: '100%' }} disabled={busy || !name.trim()}>Entrar</button>
      </form>
      <p className="small" style={{ textAlign: 'center', marginTop: 8 }}>
        <a className="link" href="/privacidad">Privacidad</a> · <a className="link" href="/terminos">Condiciones</a>
      </p>
    </div>
  );
}
