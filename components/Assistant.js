'use client';
import { useEffect, useRef, useState } from 'react';
import { Avatar, Icon, timeAgo } from './ui';

// Dictado del navegador: el servidor recibe sólo la transcripción, nunca el archivo de audio.
function useSpeech(onText, onError) {
  const rec = useRef(null);
  const [listening, setListening] = useState(false);
  const supported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  function start(prev) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.lang = 'es-AR';
    r.continuous = !/Android/i.test(navigator.userAgent);
    r.interimResults = true;
    const base = prev ? prev + ' ' : '';
    r.onresult = (e) => {
      let finals = '', interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const txt = e.results[i][0].transcript;
        if (e.results[i].isFinal) finals += txt + ' '; else interim += txt;
      }
      onText((base + finals + interim).trim());
    };
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      setListening(false);
      if (e.error === 'not-allowed') onError('Tenés que permitir el micrófono en el navegador.');
    };
    rec.current = r;
    try { r.start(); setListening(true); } catch { setListening(false); }
  }

  return { supported, listening, start, stop: () => rec.current?.stop() };
}

export default function ProjectChat({ project, state, me, onState }) {
  const messages = state.chats?.[project.id] || [];
  const analyses = state.progressAnalyses || [];
  const [pending, setPending] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState('');
  const [error, setError] = useState('');
  const endRef = useRef(null);
  const speechUsed = useRef(false);
  const retryMessage = useRef(null);
  const speech = useSpeech((value) => { speechUsed.current = true; setText(value); }, setError);
  const member = (id) => state.members.find((m) => m.id === id);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, busy]);

  function toggleMic() {
    setError('');
    if (!speech.supported) { setError('Tu navegador no permite dictado. Probá con Chrome o escribí el texto.'); return; }
    if (speech.listening) speech.stop(); else speech.start(text);
  }

  async function send(mode) {
    const content = text.trim();
    if (!content || busy) return;
    if (speech.listening) speech.stop();
    setError('');
    setText('');
    const messageId = mode === 'analyze'
      ? retryMessage.current?.content === content ? retryMessage.current.id : crypto.randomUUID()
      : null;
    if (messageId) retryMessage.current = { content, id: messageId };
    setPending({ content, tag: mode === 'analyze' ? 'avance' : null });
    setBusy(true);
    try {
      const res = await fetch(mode === 'analyze' ? '/api/analyze' : '/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: content,
          projectId: project.id,
          ...(mode === 'analyze' ? { messageId, source: speechUsed.current ? 'audio' : 'text' } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Algo falló');
      onState(data.state);
      if (mode === 'analyze') retryMessage.current = null;
      speechUsed.current = false;
    } catch (e) {
      setError(e.message);
      setText(content);
    } finally {
      setPending(null);
      setBusy(false);
    }
  }

  async function confirmRegression(analysisId) {
    setConfirming(analysisId);
    setError('');
    try {
      const res = await fetch('/api/analyze/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, analysisId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo confirmar el cambio.');
      onState(data.state);
    } catch (e) {
      setError(e.message);
    } finally {
      setConfirming('');
    }
  }

  return (
    <>
      <div className="chat">
        <div className="msg assistant">
          Este es el chat de <b>{project.name}</b>. Lo ven todos los integrantes.
          {'\n\n'}Contá qué hiciste y tocá <b>Registrar avance</b>: analizo tareas, pesos y porcentajes. El dictado de voz del navegador envía sólo la transcripción. Para consultas, tocá <b>Preguntar</b>.
        </div>

        {messages.map((m) => {
          const mine = m.role === 'user' && m.authorId === me;
          const author = m.role === 'user' ? member(m.authorId) : null;
          const analysis = m.analysisId ? analyses.find((item) => item.id === m.analysisId) : null;
          const pendingChanges = analysis?.proposals?.filter((item) => item.reviewStatus === 'pending') || [];
          return (
            <div key={m.id} className={`msg-row ${mine ? 'mine' : ''}`}>
              {m.role === 'user' && !mine && <Avatar member={author} />}
              <div className={`msg ${m.role === 'user' ? (mine ? 'user' : 'other') : 'assistant'}`}>
                {m.role === 'user' && !mine && <span className="msg-author">{author?.name || 'Ex integrante'}</span>}
                {m.tag === 'avance' && <span className="msg-tag">{m.source === 'audio' ? 'Audio transcrito · avance' : 'Avance registrado'}</span>}
                {m.tag === 'tablero' && <span className="msg-tag">{m.mode === 'openai' ? 'Análisis de progreso' : `Tablero actualizado${m.mode === 'local' ? ' · modo sin IA' : ''}`}</span>}
                {m.role === 'assistant' && m.tag !== 'tablero' && m.mode === 'local' && <span className="msg-tag">Modo sin IA</span>}
                {m.content}
                {analysis && (
                  <section className="analysis-card" aria-label="Resumen auditable del análisis">
                    <div className="analysis-progress"><span>Progreso del proyecto</span><b>{analysis.beforeProgress}% → {analysis.afterProgress}%</b></div>
                    {(analysis.changes?.length > 0 || pendingChanges.length > 0) && (
                      <details className="analysis-details">
                        <summary>Ver evidencia y tareas ({analysis.changes.length + pendingChanges.length})</summary>
                        <ul>
                          {analysis.changes.map((change) => (
                            <li key={`${change.taskId}-${change.afterProgress}`}>
                              <b>{change.title}</b>: {change.beforeProgress}% → {change.afterProgress}% ({change.beforeStatus} → {change.afterStatus}).
                              <span>{` Evidencia: “${change.evidence}”. ${change.reason} Confianza: ${Math.round(change.confidence * 100)}%.`}</span>
                            </li>
                          ))}
                          {pendingChanges.map((change) => (
                            <li key={`${change.taskId}-pending`}>
                              <b>{state.tasks.find((task) => task.id === change.taskId)?.title || 'Tarea'}</b>: {change.before.progress}% → {change.proposedProgress}% ({change.before.status} → {change.proposedStatus}), pendiente de confirmación.
                              <span>{` Evidencia: “${change.evidence}”. ${change.reason} Confianza: ${Math.round(change.confidence * 100)}%.`}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {pendingChanges.length > 0 && (
                      <button className="btn soft analysis-confirm" disabled={!!confirming} onClick={() => confirmRegression(analysis.id)}>
                        {confirming === analysis.id ? 'Confirmando…' : 'Confirmar regresión'}
                      </button>
                    )}
                  </section>
                )}
                <span className="msg-time">{timeAgo(m.createdAt)}</span>
              </div>
            </div>
          );
        })}

        {pending && (
          <div className="msg-row mine">
            <div className="msg user">
              {pending.tag && <span className="msg-tag">Avance registrado</span>}
              {pending.content}
            </div>
          </div>
        )}
        {busy && <div className="msg assistant"><span className="typing"><i /><i /><i /></span></div>}
        {error && <div className="error">{error}</div>}
        <div ref={endRef} />
      </div>

      <div className="composer">
        <div className="composer-inner">
          <textarea
            rows={2}
            placeholder={speech.listening ? 'Te escucho…' : 'Ej: “Terminé el login, me trabé con los pagos y el viernes no puedo venir”'}
            value={text}
            onChange={(e) => { speechUsed.current = false; setText(e.target.value); }}
          />
          <div className="composer-actions">
            <button className={`mic ${speech.listening ? 'rec' : ''}`} onClick={toggleMic} aria-label="Grabar audio">
              <Icon name={speech.listening ? 'stop' : 'mic'} size={22} />
            </button>
            <button className="btn primary" disabled={busy || !text.trim()} onClick={() => send('analyze')}>Registrar avance</button>
            <button className="btn soft" disabled={busy || !text.trim()} onClick={() => send('chat')}>Preguntar</button>
          </div>
        </div>
      </div>
    </>
  );
}
