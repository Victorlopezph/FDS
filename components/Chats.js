'use client';
import { PROJECT_STATUS, Icon, timeAgo } from './ui';

// Lista de chats: uno por proyecto, ordenados por el último mensaje.
export default function Chats({ state, onOpen, onNew }) {
  const items = state.projects
    .map((p) => {
      const msgs = state.chats?.[p.id] || [];
      return { p, last: msgs[msgs.length - 1] };
    })
    .sort((a, b) => (b.last?.createdAt || 0) - (a.last?.createdAt || 0));

  const name = (id) => state.members.find((m) => m.id === id)?.name || 'Alguien';

  return (
    <>
      <div className="page-head"><h1>Chats</h1></div>
      <p className="small" style={{ marginTop: -8, marginBottom: 14 }}>Cada proyecto tiene su chat con el equipo y el agente.</p>

      {!items.length && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="small" style={{ marginBottom: 12 }}>Creá un proyecto para empezar a chatear con tu equipo.</p>
          <button className="btn primary" style={{ width: '100%' }} onClick={onNew}>Crear proyecto</button>
        </div>
      )}

      <div className="list">
        {items.map(({ p, last }) => {
          const st = PROJECT_STATUS[p.status] || PROJECT_STATUS.marcha;
          const preview = !last ? 'Todavía no hay mensajes'
            : last.role === 'assistant' ? `Team lab: ${last.content}` : `${name(last.authorId)}: ${last.content}`;
          return (
            <button key={p.id} className="card chat-item" onClick={() => onOpen(p.id)}>
              <span className={`chat-icon c-${st.c}`}><Icon name="spark" size={20} /></span>
              <span className="chat-body">
                <span className="row between">
                  <b>{p.name}</b>
                  {last && <span className="small">{timeAgo(last.createdAt)}</span>}
                </span>
                <span className="small chat-preview">{preview}</span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
