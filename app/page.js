'use client';
import { useEffect, useState, useCallback } from 'react';
import Projects from '@/components/Projects';
import ProjectDetail from '@/components/ProjectDetail';
import Team from '@/components/Team';
import Alerts from '@/components/Alerts';
import Chats from '@/components/Chats';
import Login from '@/components/Login';
import NewProject from '@/components/NewProject';
import { Icon } from '@/components/ui';
import Splash from '@/components/Splash';

const TABS = [
  { id: 'proyectos', label: 'Proyectos', icon: 'grid' },
  { id: 'chats', label: 'Chats', icon: 'spark' },
  { id: 'alertas', label: 'Alertas', icon: 'bell' },
  { id: 'equipo', label: 'Equipo', icon: 'users' },
];

const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

export default function Home() {
  const [auth, setAuth] = useState(null); // { user, google, guest }
  const [state, setState] = useState(null);
  const [presence, setPresence] = useState({});
  const [tab, setTab] = useState('proyectos');
  const [openId, setOpenId] = useState(null);
  const [detailTab, setDetailTab] = useState('tareas');
  const [theme, setTheme] = useState('light');
  const [error, setError] = useState('');
  const [storage, setStorage] = useState('redis');
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState('');
  const [splash, setSplash] = useState('show'); // show -> hiding -> gone
  const [startedAt] = useState(() => Date.now());

  const user = auth?.user;
  const me = user?.id;

  // Tema guardado, invitación pendiente en el link y sesión
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme || 'light');
    const params = new URLSearchParams(location.search);
    if (params.get('invite')) ls.set('ronda-invite', params.get('invite'));
    if (params.has('invite') || params.has('error')) {
      setTimeout(() => history.replaceState(null, '', '/'), 0);
    }
    fetch('/api/me').then((r) => r.json()).then(setAuth).catch(() => setError('Sin conexión con el servidor.'));
  }, []);

  const toggleTheme = () => {
    const t = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    ls.set('ronda-theme', t);
    setTheme(t);
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // Animación de entrada: se muestra al menos 1,8 s y hasta que cargan los datos
  const ready = !!auth && (!auth.user || !!state);
  useEffect(() => {
    if (!ready || splash !== 'show') return;
    const wait = Math.max(0, 1800 - (Date.now() - startedAt));
    const a = setTimeout(() => setSplash('hiding'), wait);
    const b = setTimeout(() => setSplash('gone'), wait + 500);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [ready]);
  const splashEl = splash !== 'gone' ? <Splash hide={splash === 'hiding'} /> : null;

  const apply = (d) => {
    if (d.state) setState(d.state);
    if (d.presence) setPresence(d.presence);
    if (d.storage) setStorage(d.storage);
  };

  // Trae el estado cada 10 s para ver lo que cargan los demás
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/state', { cache: 'no-store' });
      if (r.status === 401) { setAuth((a) => ({ ...a, user: null })); return; }
      apply(await r.json());
      setError('');
    } catch {
      setError('Sin conexión con el servidor.');
    }
  }, []);

  const post = useCallback(async (body) => {
    const r = await fetch('/api/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    apply(d);
    return d;
  }, []);

  useEffect(() => {
    if (!me) return;
    (async () => {
      await load();
      // Si llegó con un link de invitación, se suma al proyecto
      const code = ls.get('ronda-invite');
      if (code) {
        ls.set('ronda-invite', null);
        const d = await post({ action: 'join', code });
        if (d.projectId) { setTab('proyectos'); setOpenId(d.projectId); setDetailTab('tareas'); }
        showToast(d.message || d.error);
      }
    })();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [me, load, post]);

  // Estado de conexión: "estoy conectado" cada 25 s
  useEffect(() => {
    if (!me) return;
    const ping = () => fetch('/api/presence', { method: 'POST' }).catch(() => {});
    ping();
    const id = setInterval(ping, 25000);
    return () => clearInterval(id);
  }, [me]);

  // Si el proyecto abierto ya no existe (lo borraron o salí), vuelvo a la lista
  const showDetail = !!(openId && state?.projects.some((p) => p.id === openId) && (tab === 'proyectos' || tab === 'chats'));

  const unread = state ? state.alerts.filter((a) => !a.readBy?.includes(me)).length : 0;

  // Al abrir alertas, se marcan como leídas después de verlas un momento
  useEffect(() => {
    if (tab !== 'alertas' || !unread) return;
    const id = setTimeout(() => post({ action: 'readAlerts' }), 2500);
    return () => clearTimeout(id);
  }, [tab, unread, post]);

  function openProject(id, sub = 'tareas') {
    setOpenId(id);
    setDetailTab(sub);
    window.scrollTo({ top: 0 });
  }

  function go(id) {
    setTab(id);
    setOpenId(null);
    window.scrollTo({ top: 0 });
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setState(null);
    setAuth((a) => ({ ...a, user: null }));
    go('proyectos');
  }

  async function createProject(data) {
    const d = await post({ action: 'createProject', ...data });
    if (d.error) return d.error;
    setCreating(false);
    setTab('proyectos');
    openProject(d.projectId, 'gente');
    showToast('Proyecto creado. Ahora sumá a tu equipo.');
  }

  if (!auth) return <div className="app">{splashEl}</div>;

  if (!user) {
    return (
      <div className="app">
        <Login inviting={!!ls.get('ronda-invite')}
          onGuest={(u) => setAuth((a) => ({ ...a, user: u }))} />
        {splashEl}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          <img className="logo-img" src="/logo-mark.png" alt="" /> Team <span className="brand-lab">Lab</span>
        </div>
        <div className="top-actions">
          <button className="icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Modo día' : 'Modo noche'}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <button className="icon-btn" onClick={() => go('alertas')} aria-label="Alertas">
            <Icon name="bell" />
            {unread > 0 && <span className="badge">{unread}</span>}
          </button>
        </div>
      </header>

      <main>
        {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
        {storage === 'memoria' && location.hostname !== 'localhost' && (
          <div className="error" style={{ marginBottom: 12 }}>
            Falta conectar Upstash Redis en Vercel: los datos no se comparten entre celulares y se pueden perder.
          </div>
        )}
        {!state ? <p className="empty">Cargando…</p> : (
          <>
            {showDetail && (
              <ProjectDetail state={state} presence={presence} me={me} projectId={openId}
                tab={detailTab} setTab={setDetailTab} post={post} notify={showToast} onState={setState}
                onBack={() => setOpenId(null)} />
            )}
            {tab === 'proyectos' && !showDetail && (
              <Projects state={state} presence={presence} me={me}
                onOpen={(id) => openProject(id)}
                onNew={() => setCreating(true)}
                onDemo={() => post({ action: 'loadDemo' })} />
            )}
            {tab === 'chats' && !showDetail && (
              <Chats state={state} onOpen={(id) => openProject(id, 'chat')} onNew={() => setCreating(true)} />
            )}
            {tab === 'equipo' && (
              <>
                <Team state={state} presence={presence} me={me} user={user} post={post} onLogout={logout} notify={showToast} />
                <p style={{ textAlign: 'center', marginTop: 24 }}>
                  <button className="link" onClick={() => confirm('¿Cargar (o reiniciar) los proyectos de ejemplo?') && post({ action: 'loadDemo' })}>
                    Cargar o reiniciar proyectos de ejemplo
                  </button>
                </p>
              </>
            )}
            {tab === 'alertas' && <Alerts state={state} me={me} />}
          </>
        )}
      </main>

      {creating && <NewProject onClose={() => setCreating(false)} onCreate={createProject} />}
      {toast && <div className="toast">{toast}</div>}
      {splashEl}

      <nav className="tabbar">
        <div className="tabbar-inner">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => go(t.id)}>
              <span className="tab-icon"><Icon name={t.icon} /></span>
              {t.label}
              {t.id === 'alertas' && unread > 0 && <span className="badge">{unread}</span>}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
