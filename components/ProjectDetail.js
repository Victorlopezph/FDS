'use client';
import { useState } from 'react';
import { PROJECT_STATUS, TASK_STATUS, TASK_ORDER, PRIORITY, Avatar, Icon, deadlineLabel } from './ui';
import TaskSheet from './TaskSheet';
import NewProject from './NewProject';
import ProjectChat from './Assistant';

const NEXT = { pendiente: 'curso', curso: 'hecho', hecho: 'pendiente', trabado: 'curso' };

// ---------- Integrantes: invitar, agregar del equipo, sacar ----------
function Members({ project, state, presence, me, post, notify }) {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const isOwner = project.ownerId === me;
  const people = project.members.map((id) => state.members.find((m) => m.id === id)).filter(Boolean);
  // Compañeros de otros proyectos que todavía no están en este
  const suggestions = state.members.filter((m) => !project.members.includes(m.id));

  async function act(body, confirmText) {
    if (confirmText && !confirm(confirmText)) return;
    const d = await post({ projectId: project.id, ...body });
    if (d.error) setMsg({ error: d.error }); else { setMsg(null); notify(d.message); }
    return d;
  }

  async function sendInvite(e) {
    e.preventDefault();
    setBusy(true);
    const d = await post({ action: 'invite', projectId: project.id, email });
    setBusy(false);
    setMsg(d.error ? { error: d.error } : { ok: d.message });
    if (!d.error) setEmail('');
  }

  async function share() {
    const url = `${location.origin}/?invite=${project.inviteCode}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'Team lab', text: `Sumate a "${project.name}" en Team lab`, url }); return; }
      await navigator.clipboard.writeText(url);
      setMsg({ ok: '¡Link copiado! Pegalo en WhatsApp o donde quieras.' });
    } catch (err) {
      if (err?.name !== 'AbortError') setMsg({ ok: url });
    }
  }

  return (
    <>
      <div className="card">
        <h3>Integrantes <span className="small">· {people.length}</span></h3>
        <div className="list" style={{ gap: 10, marginTop: 12 }}>
          {people.map((m) => {
            const open = state.tasks.filter((t) => t.projectId === project.id && t.assignee === m.id && t.status !== 'hecho').length;
            return (
              <div key={m.id} className="row">
                <Avatar member={m} presence={presence} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{m.name}{m.id === me ? ' (vos)' : ''}</div>
                  <div className="small">{m.id === project.ownerId ? 'Creador' : m.role || 'Integrante'} · {open} {open === 1 ? 'tarea' : 'tareas'}</div>
                  {m.skills?.length > 0 && <div className="skill-tags">{m.skills.slice(0, 4).map((k) => <span key={k} className="skill-tag">{k}</span>)}</div>}
                </div>
                {isOwner && m.id !== me && (
                  <button className="chip-btn danger" onClick={() => act({ action: 'removeMember', userId: m.id }, `¿Sacar a ${m.name} del proyecto? Sus tareas quedan sin asignar.`)}>
                    Sacar
                  </button>
                )}
              </div>
            );
          })}
          {project.invites.map((e) => (
            <div key={e} className="row">
              <span className="avatar c-butter"><Icon name="mail" size={15} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e}</div>
                <div className="small">Invitación pendiente</div>
              </div>
              <button className="chip-btn" onClick={() => act({ action: 'cancelInvite', email: e })}>Cancelar</button>
            </div>
          ))}
        </div>
      </div>

      <div className="card mt" style={{ marginTop: 12 }}>
        <h3>Agregar gente</h3>
        {suggestions.length > 0 && (
          <>
            <p className="small" style={{ margin: '8px 0' }}>De tus otros proyectos, con un toque:</p>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {suggestions.map((m) => (
                <button key={m.id} className="person-chip" onClick={() => act({ action: 'addMember', userId: m.id })}>
                  <Avatar member={m} /> {m.name} <Icon name="plus" size={16} />
                </button>
              ))}
            </div>
          </>
        )}
        <p className="small" style={{ margin: '12px 0 8px' }}>Por mail (entra con Google y queda adentro):</p>
        <form className="row" onSubmit={sendInvite}>
          <input className="field" style={{ flex: 1 }} type="email" placeholder="mail@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn primary" style={{ flex: '0 0 auto', padding: '0 16px' }} disabled={busy || !email.trim()}>Invitar</button>
        </form>
        <button className="btn soft mt row" style={{ width: '100%', justifyContent: 'center' }} onClick={share}>
          <Icon name="share" size={18} /> Compartir link de invitación
        </button>
        {msg?.ok && <p className="small mt" style={{ wordBreak: 'break-all' }}>{msg.ok}</p>}
        {msg?.error && <div className="error mt">{msg.error}</div>}
      </div>

      <button className="btn danger" style={{ width: '100%', marginTop: 16 }}
        onClick={() => act({ action: 'removeMember', userId: me },
          people.length === 1 ? '¿Salir? Sos el único integrante: el proyecto se va a eliminar.'
            : isOwner ? '¿Salir del proyecto? Va a quedar a cargo de otro integrante.' : '¿Salir del proyecto?')}>
        Salir del proyecto
      </button>
    </>
  );
}

// ---------- Tareas ----------
function Tasks({ project, state, onNewTask, onEditTask, onSetStatus }) {
  const tasks = state.tasks.filter((t) => t.projectId === project.id);
  return (
    <>
      <button className="btn primary row" style={{ width: '100%', justifyContent: 'center', gap: 6 }} onClick={onNewTask}>
        <Icon name="plus" size={18} /> Nueva tarea
      </button>
      {TASK_ORDER.map((s) => {
        const group = tasks.filter((t) => t.status === s);
        const ts = TASK_STATUS[s];
        return (
          <section key={s}>
            <div className="section-title"><span className={`dot d-${ts.c}`} /> {ts.label} <span className="count">{group.length}</span></div>
            <div className="list">
              {group.map((t) => {
                const m = state.members.find((x) => x.id === t.assignee);
                return (
                  <div key={t.id} className="card task" role="button" tabIndex={0} onClick={() => onEditTask(t)}>
                    <div className="row between" style={{ alignItems: 'flex-start' }}>
                      <div className="task-title">{t.title}</div>
                      <span className="small" style={{ flexShrink: 0 }}><Icon name="edit" size={15} /></span>
                    </div>
                    <div className="task-meta">
                      <button className={`status-btn c-${ts.c}`} title="Tocá para avanzar el estado"
                        onClick={(e) => { e.stopPropagation(); onSetStatus(t.id, NEXT[t.status]); }}>{ts.label} ›</button>
                      <span className={`chip c-${PRIORITY[t.priority]?.c || 'butter'}`}>{PRIORITY[t.priority]?.label}</span>
                      <span className="small">{deadlineLabel(t.deadline)}</span>
                      <span className="row small" style={{ marginLeft: 'auto', gap: 6 }}>
                        {m ? <><Avatar member={m} /> {m.name}</> : 'Sin asignar'}
                      </span>
                    </div>
                  </div>
                );
              })}
              {!group.length && <p className="empty">Nada por acá.</p>}
            </div>
          </section>
        );
      })}
    </>
  );
}

export default function ProjectDetail({ state, presence, me, projectId, tab, setTab, onBack, post, notify, onState }) {
  const [taskSheet, setTaskSheet] = useState(null); // null | 'new' | tarea
  const [editing, setEditing] = useState(false);
  const p = state.projects.find((x) => x.id === projectId);
  if (!p) return null;

  const st = PROJECT_STATUS[p.status] || PROJECT_STATUS.marcha;
  const pr = PRIORITY[p.priority];

  async function saveTask(data) {
    const d = taskSheet === 'new'
      ? await post({ action: 'createTask', projectId: p.id, ...data })
      : await post({ action: 'updateTask', taskId: taskSheet.id, ...data });
    if (d.error) return d.error;
    setTaskSheet(null);
    notify(d.message);
  }

  async function saveProject(data) {
    const d = await post({ action: 'updateProject', projectId: p.id, ...data });
    if (d.error) return d.error;
    setEditing(false);
    notify(d.message);
  }

  return (
    <>
      <button className="back" onClick={onBack}><Icon name="back" /> Proyectos</button>

      <div className="card">
        <div className="row between">
          <span className={`chip c-${pr.c}`}>{pr.label}</span>
          <div className="row" style={{ gap: 10 }}>
            <span className={`status-label t-${st.c}`}><span className={`dot d-${st.c}`} />{st.label}</span>
            <button className="icon-btn sm" onClick={() => setEditing(true)} aria-label="Editar proyecto"><Icon name="edit" size={17} /></button>
          </div>
        </div>
        <h1 style={{ marginTop: 10 }}>{p.name}</h1>
        <div className="progress"><div className={`d-${st.c}`} style={{ width: `${Math.max(p.progress, 3)}%` }} /></div>
        <div className="row between small">
          <span><b style={{ color: 'var(--text)' }}>{p.progress}%</b> completado</span>
          <span className="row" style={{ gap: 4 }}><Icon name="calendar" size={15} />{deadlineLabel(p.deadline)}</span>
        </div>
        <div className="avatars mt">
          {p.members.map((id) => <Avatar key={id} member={state.members.find((m) => m.id === id)} presence={presence} />)}
        </div>
      </div>

      <div className="seg" style={{ margin: '14px 0' }}>
        <button className={tab === 'tareas' ? 'on c-lav' : ''} onClick={() => setTab('tareas')}>Tareas</button>
        <button className={tab === 'chat' ? 'on c-lav' : ''} onClick={() => setTab('chat')}>Chat</button>
        <button className={tab === 'gente' ? 'on c-lav' : ''} onClick={() => setTab('gente')}>Integrantes</button>
      </div>

      {tab === 'tareas' && (
        <Tasks project={p} state={state}
          onNewTask={() => setTaskSheet('new')} onEditTask={setTaskSheet}
          onSetStatus={(taskId, status) => post({ action: 'setTaskStatus', taskId, status })} />
      )}
      {tab === 'chat' && <ProjectChat key={p.id} project={p} state={state} me={me} onState={onState} />}
      {tab === 'gente' && <Members project={p} state={state} presence={presence} me={me} post={post} notify={notify} />}

      {taskSheet && (
        <TaskSheet task={taskSheet === 'new' ? null : taskSheet} project={p} members={state.members} me={me} tasks={state.tasks}
          onClose={() => setTaskSheet(null)} onSave={saveTask}
          onDelete={async () => { const d = await post({ action: 'deleteTask', taskId: taskSheet.id }); setTaskSheet(null); notify(d.message || d.error); }} />
      )}
      {editing && (
        <NewProject initial={p} onClose={() => setEditing(false)} onCreate={saveProject}
          onDelete={p.ownerId === me ? async () => { const d = await post({ action: 'deleteProject', projectId: p.id }); setEditing(false); notify(d.message || d.error); } : null} />
      )}
    </>
  );
}
