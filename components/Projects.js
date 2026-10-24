'use client';
import { useState } from 'react';
import { PROJECT_STATUS, PRIORITY, Avatar, Icon, deadlineLabel, daysLeft } from './ui';

const FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'alta', label: 'Alta prioridad' },
  { id: 'riesgo', label: 'En riesgo' },
  { id: 'sinfecha', label: 'Sin fecha' },
  { id: 'terminado', label: 'Terminados' },
];

export default function Projects({ state, presence, me, onOpen, onNew, onDemo }) {
  const [filter, setFilter] = useState('todos');
  const yo = state.members.find((m) => m.id === me);

  const list = [...state.projects]
    .filter((p) => {
      if (filter === 'alta') return p.priority === 'alta';
      if (filter === 'riesgo') return p.status === 'riesgo' || p.status === 'trabado';
      if (filter === 'sinfecha') return !p.deadline;
      if (filter === 'terminado') return p.status === 'terminado';
      return true;
    })
    // Orden: prioridad, después la fecha más cercana (los sin fecha al final)
    .sort((a, b) => PRIORITY[a.priority].n - PRIORITY[b.priority].n
      || (a.deadline || '9999').localeCompare(b.deadline || '9999'));

  const abiertas = state.tasks.filter((t) => t.assignee === me && t.status !== 'hecho').length;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="hello">Hola{yo ? `, ${yo.name}` : ''} · tenés {abiertas} {abiertas === 1 ? 'tarea abierta' : 'tareas abiertas'}</p>
          <h1>Proyectos</h1>
        </div>
        <button className="btn primary row" style={{ flex: '0 0 auto', padding: '0 14px', gap: 4 }} onClick={onNew}>
          <Icon name="plus" size={18} /> Nuevo
        </button>
      </div>

      {!state.projects.length && (
        <div className="card" style={{ textAlign: 'center', padding: 28 }}>
          <div className="login-mark" style={{ margin: '0 auto 12px' }}><Icon name="grid" size={28} /></div>
          <h2>Todavía no tenés proyectos</h2>
          <p className="small" style={{ margin: '6px 0 16px' }}>Creá uno e invitá a tu equipo, o cargá un ejemplo para probar el agente.</p>
          <button className="btn primary" style={{ width: '100%' }} onClick={onNew}>Crear mi primer proyecto</button>
          <button className="btn soft" style={{ width: '100%', marginTop: 8 }} onClick={onDemo}>Cargar proyectos de ejemplo</button>
        </div>
      )}

      {state.projects.length > 0 && (
        <div className="pills">
          {FILTERS.map((f) => (
            <button key={f.id} className={`pill ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
      )}

      <div className="list grid2">
        {list.map((p) => {
          const st = PROJECT_STATUS[p.status] || PROJECT_STATUS.marcha;
          const pr = PRIORITY[p.priority];
          const tasks = state.tasks.filter((t) => t.projectId === p.id);
          const done = tasks.filter((t) => t.status === 'hecho').length;
          const d = daysLeft(p.deadline);
          return (
            <button key={p.id} className="card" onClick={() => onOpen(p.id)}>
              <div className="row between">
                <span className={`chip c-${pr.c}`}>{pr.label}</span>
                <span className={`status-label t-${st.c}`}><span className={`dot d-${st.c}`} />{st.label}</span>
              </div>
              <div className="project-name">{p.name}</div>
              <div className="progress"><div className={`d-${st.c}`} style={{ width: `${Math.max(p.progress, 3)}%` }} /></div>
              <div className="row between small">
                <span><b style={{ color: 'var(--text)' }}>{p.progress}%</b> · {done}/{tasks.length} tareas</span>
                <span className={d !== null && d <= 2 ? 't-rose' : ''} style={{ fontWeight: 700 }}>{deadlineLabel(p.deadline)}</span>
              </div>
              <div className="avatars mt">
                {p.members.map((id) => (
                  <Avatar key={id} member={state.members.find((m) => m.id === id)} presence={presence} />
                ))}
              </div>
            </button>
          );
        })}
        {!list.length && state.projects.length > 0 && <p className="empty">No hay proyectos con este filtro.</p>}
      </div>
    </>
  );
}
