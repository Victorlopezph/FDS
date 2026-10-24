'use client';
import { useState } from 'react';
import { LEVEL, Icon, timeAgo } from './ui';

export default function Alerts({ state, me }) {
  const [only, setOnly] = useState('todas');
  const name = (id) => state.members.find((m) => m.id === id)?.name;

  const list = state.alerts
    .filter((a) => only === 'todas' || (only === 'mias' ? a.to === me : a.to === 'todos'))
    .slice(0, 40);

  return (
    <>
      <div className="page-head"><h1>Alertas</h1></div>
      <div className="pills">
        {[['todas', 'Todas'], ['generales', 'Generales'], ['mias', 'Para mí']].map(([id, label]) => (
          <button key={id} className={`pill ${only === id ? 'on' : ''}`} onClick={() => setOnly(id)}>{label}</button>
        ))}
      </div>

      <div className="list">
        {list.map((a) => {
          const lv = LEVEL[a.level] || LEVEL.info;
          const unread = !a.readBy?.includes(me);
          return (
            // El color del nivel pinta el fondo y el marco (border: currentColor)
            <div key={a.id} className={`alert c-${lv.c} level-${a.level} ${unread ? 'unread' : ''}`}>
              <div className="alert-icon"><Icon name={lv.icon} /></div>
              <div className="alert-body">
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <span className={`chip t-${lv.c}`} style={{ padding: 0 }}>{lv.label}</span>
                  <span className="small">· {a.to === 'todos' ? 'Para todo el equipo' : a.to === me ? 'Para vos' : `Para ${name(a.to)}`} · {timeAgo(a.createdAt)}</span>
                </div>
                <div className="alert-msg">{a.message}</div>
              </div>
            </div>
          );
        })}
        {!list.length && <p className="empty">No hay alertas. Todo tranquilo.</p>}
      </div>
    </>
  );
}
