'use client';
import { Icon } from './ui';

// Invitar amigos a usar Team lab (comparte el link de la app).
export async function shareApp(notify) {
  const url = location.origin;
  const text = 'Sumate a Team lab: organizamos el equipo con un agente de IA. Entrá desde acá:';
  try {
    if (navigator.share) { await navigator.share({ title: 'Team lab', text, url }); return; }
    await navigator.clipboard.writeText(`${text} ${url}`);
    notify?.('¡Link copiado! Pegalo en WhatsApp o donde quieras.');
  } catch (e) {
    if (e?.name !== 'AbortError') notify?.(url);
  }
}

export default function InviteFriends({ notify, compact }) {
  return (
    <button className={`btn ${compact ? 'soft' : 'primary'} row`} style={{ justifyContent: 'center', gap: 6, width: compact ? 'auto' : '100%', padding: compact ? '0 14px' : undefined, flex: compact ? '0 0 auto' : undefined }}
      onClick={() => shareApp(notify)}>
      <Icon name="userPlus" size={18} /> Invitar amigos
    </button>
  );
}
