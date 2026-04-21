import { useState, useEffect } from 'react';
import { X, Edit3 } from 'lucide-react';
import {
  createAdjustment,
  updateAdjustment,
  type AdjustmentType,
  type ManualAdjustment,
} from '../lib/adjustments';

interface Props {
  patientId: number;
  patientName?: string;
  existing?: ManualAdjustment | null;
  defaultDate?: string;
  onClose: () => void;
  onSaved: () => void;
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function AdjustmentModal({
  patientId,
  patientName,
  existing,
  defaultDate,
  onClose,
  onSaved,
}: Props) {
  const [date, setDate] = useState<string>(
    existing?.date || defaultDate || todayISO()
  );
  const [libelle, setLibelle] = useState<string>(existing?.libelle || '');
  const [type, setType] = useState<AdjustmentType>(existing?.type || 'ACTE');
  const [montant, setMontant] = useState<string>(
    existing
      ? String(existing.type === 'ACTE' ? existing.montant_acte : existing.reglement_somme)
      : ''
  );
  const [comment, setComment] = useState<string>(existing?.comment || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const handleSave = async () => {
    setError(null);
    const trimmedLibelle = libelle.trim();
    if (!trimmedLibelle) {
      setError('Le libellé est obligatoire.');
      return;
    }
    const num = Number(montant.replace(',', '.'));
    if (!isFinite(num) || num < 0) {
      setError('Le montant doit être un nombre positif.');
      return;
    }
    if (!date) {
      setError('La date est obligatoire.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        patient_id: patientId,
        date,
        libelle: trimmedLibelle,
        type,
        montant_acte: type === 'ACTE' ? num : 0,
        reglement_somme: type === 'REGLEMENT' ? num : 0,
        comment: comment.trim() || undefined,
      };
      if (existing) {
        await updateAdjustment(existing.id, payload);
      } else {
        await createAdjustment(payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      setError('Erreur lors de l’enregistrement.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 70,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '500px',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2
            style={{
              fontSize: '1.2rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Edit3 size={18} color="#7c3aed" />
            {existing ? 'Modifier l’ajustement manuel' : 'Ajouter un ajustement manuel'}
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

        {patientName && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Patient : <strong style={{ color: 'var(--text)' }}>{patientName}</strong>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>
                Date
              </span>
              <input
                className="input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>
                Type
              </span>
              <select
                className="input"
                value={type}
                onChange={(e) => setType(e.target.value as AdjustmentType)}
              >
                <option value="ACTE">Acte (facturation)</option>
                <option value="REGLEMENT">Règlement (encaissement)</option>
              </select>
            </label>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>
              Libellé
            </span>
            <input
              className="input"
              type="text"
              placeholder={type === 'ACTE' ? 'Ex : Consultation complémentaire' : 'Ex : Règlement chèque'}
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              autoFocus
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>
              Montant (€)
            </span>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              placeholder="0,00"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>
              Commentaire (nature de l’ajustement)
            </span>
            <textarea
              className="input"
              rows={3}
              placeholder="Ex : Écart de caisse du 12/04, paiement espèces non remonté par LogosW…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
        </div>

        {error && (
          <div
            style={{
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--danger-bg, #fef2f2)',
              color: 'var(--danger-text, #b91c1c)',
              fontSize: '0.8rem',
              borderRadius: '0.5rem',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement…' : existing ? 'Enregistrer' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  );
}
