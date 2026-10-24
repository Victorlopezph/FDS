'use client';
// Etiquetas, colores e íconos compartidos por todas las pantallas.

export const PROJECT_STATUS = {
  marcha: { label: 'En marcha', c: 'mint' },
  riesgo: { label: 'En riesgo', c: 'peach' },
  trabado: { label: 'Trabado', c: 'rose' },
  terminado: { label: 'Terminado', c: 'sky' },
};
export const TASK_STATUS = {
  pendiente: { label: 'Pendiente', c: 'butter' },
  curso: { label: 'En curso', c: 'sky' },
  trabado: { label: 'Trabado', c: 'rose' },
  hecho: { label: 'Hecho', c: 'mint' },
};
export const TASK_ORDER = ['trabado', 'curso', 'pendiente', 'hecho'];
export const PRIORITY = {
  alta: { label: 'Alta', c: 'peach', n: 0 },
  media: { label: 'Media', c: 'butter', n: 1 },
  baja: { label: 'Baja', c: 'mint', n: 2 },
};
export const LEVEL = {
  urgente: { label: 'Urgente', c: 'rose', icon: 'alert' },
  aviso: { label: 'Aviso', c: 'peach', icon: 'clock' },
  info: { label: 'Novedad', c: 'sky', icon: 'info' },
  logro: { label: 'Logro', c: 'mint', icon: 'check' },
};

export function daysLeft(iso) {
  if (!iso) return null;
  const end = new Date(iso + 'T23:59:59-03:00').getTime();
  return Math.ceil((end - Date.now()) / 86400000) - 1;
}

export function deadlineLabel(iso) {
  if (!iso) return 'Sin fecha';
  const d = daysLeft(iso);
  if (d < 0) return 'Vencido';
  if (d === 0) return 'Vence hoy';
  if (d === 1) return 'Vence mañana';
  if (d <= 6) return `Vence en ${d} días`;
  const date = new Date(iso + 'T12:00:00-03:00');
  return 'Vence ' + date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

export function timeAgo(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'recién';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}

export const isOnline = (presence, id) => Date.now() - (presence?.[id] || 0) < 60000;

export function Avatar({ member, presence, size }) {
  if (!member) return null;
  return (
    <span className={`avatar c-${member.color} ${size || ''}`} title={member.name}>
      {member.picture
        ? <img src={member.picture} alt="" referrerPolicy="no-referrer" />
        : member.name[0]?.toUpperCase()}
      {presence && <span className={`online ${isOnline(presence, member.id) ? 'on' : ''}`} />}
    </span>
  );
}

const PATHS = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M16.5 14.6c2.4.3 4.2 2 4.9 4.9" /></>,
  spark: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></>,
  bell: <><path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 004 0" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="3" />,
  back: <path d="M15 5l-7 7 7 7" />,
  alert: <><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17.5v.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.01" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  share: <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3.5 7l8.5 6 8.5-6" /></>,
  logout: <><path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3" /><path d="M10 8l-4 4 4 4M6 12h10" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  edit: <><path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" /></>,
  userPlus: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5 1.6 0 3 .5 4.1 1.4M18 14v6M15 17h6" /></>,
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
};

export function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
