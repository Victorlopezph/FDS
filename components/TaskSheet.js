'use client';
import { useState } from 'react';
import { Avatar, Icon, PRIORITY, TASK_STATUS } from './ui';
import { suggestAssignee } from '@/lib/skills';

// Hoja para crear o editar una tarea a mano.
export default function TaskSheet({ task, project, members, me, tasks = [], onClose, onSave, onDelete }) {
  const editing = !!task;
  const [title, setTitle] = useState(task?.title || '');
  const [assignee, setAssignee] = useState(task ? task.assignee || '' : me);
  const [status, setStatus] = useState(task?.status || 'pendiente');
  const [priority, setPriority] = useState(task?.priority || 'media');
  const [weight, setWeight] = useState(task?.weight ?? 1);
  const [progress, setProgress] = useState(task?.progress ?? (task?.status === 'hecho' ? 100 : 0));
  const [noDate, setNoDate] = useState(editing ? !task.deadline : true);
  const [deadline, setDeadline] = useState(task?.deadline || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const people = project.members.map((id) => members.find((m) => m.id === id)).filter(Boolean);
  const suggestion = title.trim().length > 3 ? suggestAssignee(title, people, tasks) : null;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const taskProgress = status === 'hecho' ? 100 : status === 'pendiente' ? 0 : Number(progress);
    const err = await onSave({ title, assignee: assignee || null, status, priority, weight: Number(weight), progress: taskProgress, deadline: noDate ? null : deadline || null });
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="row between">
          <div>
            <h2>{editing ? 'Editar tarea' : 'Nueva tarea'}</h2>
            <div className="small">{project.name}</div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>

        <label className="label" htmlFor="task-title">¿Qué hay que hacer?</label>
        <input id="task-title" className="field" autoFocus={!editing} placeholder="Ej: Diseñar la pantalla de pagos" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />

        <label className="label">Responsable</label>
        {suggestion && suggestion.member.id !== assignee && (
          <button type="button" className="suggest" onClick={() => setAssignee(suggestion.member.id)}>
            <Avatar member={suggestion.member} />
            <span style={{ flex: 1, textAlign: 'left' }}>
              <b>Sugerido: {suggestion.member.name}</b>
              <span className="small" style={{ display: 'block' }}>
                Sabe {suggestion.match.join(' y ')} · {suggestion.open} {suggestion.open === 1 ? 'tarea abierta' : 'tareas abiertas'}
              </span>
            </span>
            <span className="chip c-lav">Asignar</span>
          </button>
        )}
        {suggestion && suggestion.member.id === assignee && (
          <p className="small" style={{ marginBottom: 6 }}><Icon name="check" size={14} /> Buena elección: {suggestion.member.name} sabe {suggestion.match.join(' y ')}.</p>
        )}
        <select className="field" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Sin asignar</option>
          {people.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === me ? ' (vos)' : ''}{m.role ? ` · ${m.role}` : ''}</option>)}
        </select>

        <label className="label">Estado</label>
        <div className="seg">
          {Object.entries(TASK_STATUS).map(([id, s]) => (
            <button type="button" key={id} className={status === id ? `on c-${s.c}` : ''} aria-pressed={status === id} onClick={() => {
              if (id === 'pendiente' && Number(progress) > 0 && Number(progress) < 100) {
                setError('La tarea conserva un avance parcial. Bajalo a 0 % antes de marcarla pendiente.');
                return;
              }
              setError('');
              setStatus(id);
              if (id === 'hecho') setProgress(100);
              else if (id === 'pendiente') setProgress(0);
              else if (progress >= 100) setProgress(0);
            }}>{s.label}</button>
          ))}
        </div>

        <label className="label">Prioridad</label>
        <div className="seg">
          {Object.entries(PRIORITY).map(([id, p]) => (
            <button type="button" key={id} className={priority === id ? `on c-${p.c}` : ''} aria-pressed={priority === id} onClick={() => setPriority(id)}>{p.label}</button>
          ))}
        </div>

        <label className="label" htmlFor="task-weight">Peso en el proyecto</label>
        <input id="task-weight" className="field" type="number" min="0.1" max="100" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
        {(status === 'curso' || status === 'trabado') && (
          <>
            <label className="label" htmlFor="task-progress">Avance parcial (%)</label>
            <input id="task-progress" className="field" type="number" min="0" max="100" step="1" value={progress} onChange={(e) => setProgress(e.target.value)} />
          </>
        )}

        <label className="label">Fecha límite</label>
        {!noDate && <input className="field" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />}
        <label className="check">
          <input type="checkbox" checked={noDate} onChange={(e) => setNoDate(e.target.checked)} /> Sin fecha
        </label>

        {error && <div className="error mt" role="alert">{error}</div>}
        <button className="btn primary" style={{ width: '100%', marginTop: 16 }} disabled={busy || !title.trim()}>
          {editing ? 'Guardar' : 'Crear tarea'}
        </button>
        {editing && (
          <button type="button" className="btn danger" style={{ width: '100%', marginTop: 8 }}
            onClick={() => confirm('¿Eliminar esta tarea?') && onDelete()}>
            Eliminar tarea
          </button>
        )}
      </form>
    </div>
  );
}
