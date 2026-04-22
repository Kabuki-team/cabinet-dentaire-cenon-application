import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface Props {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string | null;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  title = 'Confirmation',
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger = false,
  onConfirm,
  onClose,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter') {
        onConfirm();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onConfirm]);

  const accent = danger ? 'var(--danger-text, #b91c1c)' : 'var(--primary)';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 80,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '420px',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2
            style={{
              fontSize: '1.05rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: accent,
            }}
          >
            <AlertTriangle size={18} />
            {title}
          </h2>
          <button
            className="btn btn-ghost"
            onClick={onClose}
            style={{ padding: '0.25rem' }}
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: '0.9rem', color: 'var(--text)', margin: 0, lineHeight: 1.5 }}>
          {message}
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          {cancelLabel !== null && (
            <button className="btn btn-ghost" onClick={onClose} autoFocus>
              {cancelLabel}
            </button>
          )}
          <button
            className={danger ? 'btn' : 'btn btn-primary'}
            style={
              danger
                ? {
                    backgroundColor: 'var(--danger-text, #b91c1c)',
                    color: '#fff',
                    border: 'none',
                  }
                : undefined
            }
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
