'use client';
import { useEffect, useState } from 'react';
import { Avatar, Icon, isOnline, timeAgo } from './ui';
import { SKILLS, ROLES, DAYS, scheduleText } from '@/lib/skills';
import InviteFriends from './InviteFriends';

// Mi perfil: rol, habilidades y horario, todo con selección (el agente los usa para asignar tareas).
const HOURS = Array.from({ length: 25 }, (_, h) => h);
const PRESETS = [
  ['Lun a Vie', [0, 1, 2, 3, 4]],
  ['Fines de semana', [5, 6]],
  ['Todos los días', [0, 1, 2, 3, 4, 5, 6]],
];

function Profile({ meMember, user, post, onLogout }) {
  const [role, setRole] = useState(meMember?.role || '');
  const [skills, setSkills] = useState(meMember?.skills || []);
  const [days, setDays] = useState(meMember?.availability?.days || []);
  const [from, setFrom] = useState(meMember?.availability?.from ?? 18);
  const [to, setTo] = useState(meMember?.availability?.to ?? 22);
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setRole(meMember?.role || ''); }, [meMember?.role]);
  useEffect(() => { setSkills(meMember?.skills || []); }, [(meMember?.skills || []).join('|')]);
  useEffect(() => {
    const av = meMember?.availability;
    if (av) { setDays(av.days); setFrom(av.from); setTo(av.to); }
  }, [JSON.stringify(meMember?.availability || null)]);

  const roleInfo = ROLES.find((r) => r.id === role);
  const recommended = (roleInfo?.skills || []).filter((k) => !skills.includes(k));
  const others = SKILLS.map((k) => k.id).filter((k) => !skills.includes(k) && !recommended.includes(k));

  const addSkill = (k) => { if (k && !skills.includes(k)) setSkills([...skills, k].slice(0, 12)); };
  const removeSkill = (k) => setSkills(skills.filter((x) => x !== k));
  function addCustom() {
    const c = custom.trim().slice(0, 25);
    if (c && !skills.some((s) => s.toLowerCase() === c.toLowerCase())) addSkill(c);
    setCustom('');
    setShowCustom(false);
  }
  const toggleDay = (i) => setDays(days.includes(i) ? days.filter((d) => d !== i) : [...days, i]);
  const preview = scheduleText({ days, from, to });

  async function save(e) {
    e.preventDefault();
    await post({ action: 'updateProfile', role, skills, availability: days.length ? { days, from, to } : null });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <form className="card" onSubmit={save}>
      <div className="row">
        <Avatar member={meMember} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3>{meMember?.name}</h3>
          <div className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email || 'Invitado (sin cuenta de Google)'}</div>
        </div>
        <button type="button" className="icon-btn" onClick={onLogout} aria-label="Cerrar sesión" title="Cerrar sesión"><Icon name="logout" /></button>
      </div>

      <label className="label" htmlFor="rol">Mi rol</label>
      <select id="rol" className="field select-arrow" value={role} onChange={(e) => setRole(e.target.value)}>
        <option value="">Elegí tu rol…</option>
        {ROLES.map((r) => <option key={r.id} value={r.id}>{r.id}</option>)}
        {role && !roleInfo && <option value={role}>{role}</option>}
      </select>

      <label className="label">Mis habilidades <span style={{ fontWeight: 600 }}>· {skills.length}</span></label>
      {skills.length > 0 ? (
        <div className="skill-grid">
          {skills.map((k) => (
            <button type="button" key={k} className="skill on" onClick={() => removeSkill(k)} aria-label={`Quitar ${k}`}>
              {k} <Icon name="close" size={14} />
            </button>
          ))}
        </div>
      ) : <p className="small">Todavía no elegiste habilidades.</p>}

      {role && recommended.length > 0 && (
        <>
          <p className="small" style={{ margin: '10px 0 6px' }}>Sugeridas para {role} (tocá para sumar):</p>
          <div className="skill-grid">
            {recommended.map((k) => (
              <button type="button" key={k} className="skill" onClick={() => addSkill(k)}><Icon name="plus" size={14} />{k}</button>
            ))}
          </div>
        </>
      )}

      <select className="field select-arrow" style={{ marginTop: 10 }} value=""
        onChange={(e) => { if (e.target.value === '__otra') setShowCustom(true); else addSkill(e.target.value); }}>
        <option value="">{role ? 'Agregar otra habilidad…' : 'Agregar habilidad…'}</option>
        {recommended.length > 0 && (
          <optgroup label={`Para ${role}`}>
            {recommended.map((k) => <option key={k} value={k}>{k}</option>)}
          </optgroup>
        )}
        <optgroup label={role ? 'Otras habilidades' : 'Habilidades'}>
          {others.map((k) => <option key={k} value={k}>{k}</option>)}
        </optgroup>
        <option value="__otra">✏️ Otra que no está en la lista…</option>
      </select>
      {showCustom && (
        <div className="row" style={{ marginTop: 8 }}>
          <input className="field" style={{ flex: 1 }} autoFocus placeholder="Ej: Photoshop, Kotlin" value={custom} maxLength={25}
            onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} />
          <button type="button" className="btn soft" style={{ flex: '0 0 auto', padding: '0 16px' }} disabled={!custom.trim()} onClick={addCustom}>Agregar</button>
        </div>
      )}

      <label className="label">Mi horario disponible</label>
      <div className="day-grid">
        {DAYS.map((d, i) => (
          <button type="button" key={d} className={`day ${days.includes(i) ? 'on' : ''}`} onClick={() => toggleDay(i)}>{d}</button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
        {PRESETS.map(([label, ds]) => (
          <button type="button" key={label} className="chip-btn" onClick={() => setDays(ds)}>{label}</button>
        ))}
        {days.length > 0 && <button type="button" className="chip-btn" onClick={() => setDays([])}>Limpiar</button>}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="small" htmlFor="desde" style={{ minWidth: 42 }}>Desde</label>
        <select id="desde" className="field select-arrow" value={from}
          onChange={(e) => { const v = +e.target.value; setFrom(v); if (to <= v) setTo(Math.min(24, v + 1)); }}>
          {HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
        </select>
        <label className="small" htmlFor="hasta" style={{ minWidth: 40, textAlign: 'center' }}>hasta</label>
        <select id="hasta" className="field select-arrow" value={to} onChange={(e) => setTo(+e.target.value)}>
          {HOURS.filter((h) => h > from).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
        </select>
      </div>
      <p className="small mt"><Icon name="clock" size={14} /> {preview || 'Elegí los días en que podés trabajar.'}</p>

      <button className="btn primary" style={{ width: '100%', marginTop: 14 }}>{saved ? '¡Guardado!' : 'Guardar perfil'}</button>
      <p className="small mt">Team lab reparte las tareas según tus habilidades, tu horario y cuántas tareas tenés.</p>
    </form>
  );
}

export default function Team({ state, presence, me, user, post, onLogout, notify }) {
  const meMember = state.members.find((m) => m.id === me);
  const others = state.members.filter((m) => m.id !== me);

  return (
    <>
      <div className="page-head"><h1>Equipo</h1><InviteFriends notify={notify} compact /></div>

      <Profile meMember={meMember} user={user} post={post} onLogout={onLogout} />

      <div className="section-title">Mis compañeros <span className="count">{others.length}</span></div>
      {!others.length && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="small" style={{ marginBottom: 12 }}>Todavía no hay nadie. Invitá a tus amigos a Team lab y después sumalos a tus proyectos.</p>
          <InviteFriends notify={notify} />
        </div>
      )}
      <div className="list">
        {others.map((m) => {
          const open = state.tasks.filter((t) => t.assignee === m.id && t.status !== 'hecho');
          const blocked = open.filter((t) => t.status === 'trabado').length;
          const on = isOnline(presence, m.id);
          return (
            <div key={m.id} className="card member">
              <Avatar member={m} presence={presence} size="lg" />
              <div className="member-info">
                <div className="row between">
                  <h3>{m.name}</h3>
                  <span className={`small ${on ? 't-mint' : ''}`} style={{ fontWeight: 700 }}>
                    {on ? 'Conectado' : presence?.[m.id] ? `Visto ${timeAgo(presence[m.id])}` : 'Desconectado'}
                  </span>
                </div>
                {m.role && <div className="small">{m.role}</div>}
                {m.schedule && <div className="row small" style={{ gap: 5, marginTop: 4 }}><Icon name="clock" size={14} />{m.schedule}</div>}
                {m.skills?.length > 0 && (
                  <div className="skill-tags">{m.skills.map((k) => <span key={k} className="skill-tag">{k}</span>)}</div>
                )}
                <div className="row mt" style={{ gap: 6 }}>
                  <span className="chip c-lav">{open.length} {open.length === 1 ? 'tarea abierta' : 'tareas abiertas'}</span>
                  {blocked > 0 && <span className="chip c-rose">{blocked} trabada{blocked > 1 ? 's' : ''}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
