'use client';
import { useEffect, useState } from 'react';
import { Avatar, Icon, isOnline, timeAgo } from './ui';
import { SKILLS } from '@/lib/skills';

// Mi perfil: rol y horario (el agente los usa para asignar tareas).
function Profile({ meMember, user, post, onLogout }) {
  const [role, setRole] = useState(meMember?.role || '');
  const [schedule, setSchedule] = useState(meMember?.schedule || '');
  const [skills, setSkills] = useState(meMember?.skills || []);
  const [custom, setCustom] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => { setRole(meMember?.role || ''); setSchedule(meMember?.schedule || ''); }, [meMember?.role, meMember?.schedule]);
  useEffect(() => { setSkills(meMember?.skills || []); }, [(meMember?.skills || []).join('|')]);

  const toggle = (id) => setSkills((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(0, 12)));
  const extra = skills.filter((s) => !SKILLS.some((k) => k.id === s)); // habilidades propias
  function addCustom() {
    const c = custom.trim().slice(0, 25);
    if (c && !skills.some((s) => s.toLowerCase() === c.toLowerCase())) setSkills([...skills, c].slice(0, 12));
    setCustom('');
  }

  async function save(e) {
    e.preventDefault();
    await post({ action: 'updateProfile', role, schedule, skills });
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
      <label className="label">Mi rol</label>
      <input className="field" placeholder="Ej: Frontend, Diseño, Base de datos" value={role} onChange={(e) => setRole(e.target.value)} maxLength={40} />
      <label className="label">Mi horario disponible</label>
      <input className="field" placeholder="Ej: Lun a Vie, 18 a 22 h" value={schedule} onChange={(e) => setSchedule(e.target.value)} maxLength={80} />

      <label className="label">Mis habilidades <span style={{ fontWeight: 600 }}>· {skills.length} elegidas</span></label>
      <div className="skill-grid">
        {SKILLS.map((k) => (
          <button type="button" key={k.id} className={`skill ${skills.includes(k.id) ? 'on' : ''}`} onClick={() => toggle(k.id)}>
            {skills.includes(k.id) && <Icon name="check" size={15} />}{k.id}
          </button>
        ))}
        {extra.map((x) => (
          <button type="button" key={x} className="skill on" onClick={() => toggle(x)}><Icon name="check" size={15} />{x}</button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input className="field" style={{ flex: 1 }} placeholder="Otra: ej. Python, Excel, Canva" value={custom} maxLength={25}
          onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} />
        <button type="button" className="btn soft" style={{ flex: '0 0 auto', padding: '0 16px' }} disabled={!custom.trim()} onClick={addCustom}>Agregar</button>
      </div>

      <button className="btn primary" style={{ width: '100%', marginTop: 14 }}>{saved ? '¡Guardado!' : 'Guardar perfil'}</button>
      <p className="small mt">Team lab reparte las tareas según tus habilidades, tu horario y cuántas tareas tenés.</p>
    </form>
  );
}

export default function Team({ state, presence, me, user, post, onLogout }) {
  const meMember = state.members.find((m) => m.id === me);
  const others = state.members.filter((m) => m.id !== me);

  return (
    <>
      <div className="page-head"><h1>Equipo</h1></div>

      <Profile meMember={meMember} user={user} post={post} onLogout={onLogout} />

      <div className="section-title">Mis compañeros <span className="count">{others.length}</span></div>
      {!others.length && <p className="empty">Todavía no hay nadie. Invitá gente desde un proyecto.</p>}
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
