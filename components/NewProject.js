'use client';
import { useState } from 'react';
import { Icon, PRIORITY } from './ui';

// Hoja que sube desde abajo para crear o editar un proyecto.
export default function NewProject({ initial, onClose, onCreate, onDelete }) {
  const editing = !!initial;
  const [name, setName] = useState(initial?.name || '');
  const [priority, setPriority] = useState(initial?.priority || 'media');
  const [noDate, setNoDate] = useState(editing && !initial.deadline);
  const [deadline, setDeadline] = useState(initial?.deadline || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const err = await onCreate({ name, priority, deadline: noDate ? null : deadline || null });
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="row between">
          <h2>{editing ? 'Editar proyecto' : 'Nuevo proyecto'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>

        <label className="label">Nombre</label>
        <input className="field" autoFocus={!editing} placeholder="Ej: App de turnos" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />

        <label className="label">Prioridad</label>
        <div className="seg">
          {Object.entries(PRIORITY).map(([id, p]) => (
            <button type="button" key={id} className={priority === id ? `on c-${p.c}` : ''} onClick={() => setPriority(id)}>{p.label}</button>
          ))}
        </div>

        <label className="label">Fecha límite</label>
        {!noDate && <input className="field" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />}
        <label className="check">
          <input type="checkbox" checked={noDate} onChange={(e) => setNoDate(e.target.checked)} /> Sin fecha (indefinida)
        </label>

        {error && <div className="error mt">{error}</div>}
        <button className="btn primary" style={{ width: '100%', marginTop: 16 }} disabled={busy || !name.trim()}>
          {editing ? 'Guardar cambios' : 'Crear proyecto'}
        </button>
        {onDelete && (
          <button type="button" className="btn danger" style={{ width: '100%', marginTop: 8 }}
            onClick={() => confirm('¿Eliminar el proyecto con todas sus tareas? No se puede deshacer.') && onDelete()}>
            Eliminar proyecto
          </button>
        )}
      </form>
    </div>
  );
}
