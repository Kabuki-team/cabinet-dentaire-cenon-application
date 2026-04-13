import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

// Code PIN défini ici — modifier cette valeur pour changer le code
const VALID_PIN = '1234';

const PIN_LENGTH = VALID_PIN.length;

export function Login() {
  const navigate = useNavigate();
  const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus le premier champ au montage
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleDigitChange = (index: number, value: string) => {
    // N'accepter qu'un seul chiffre
    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);
    setError('');

    if (digit && index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Vérification automatique quand tous les chiffres sont saisis
    if (digit && index === PIN_LENGTH - 1) {
      const pin = [...newDigits.slice(0, -1), digit].join('');
      setTimeout(() => checkPin(pin, newDigits.map((d, i) => (i === index ? digit : d))), 50);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const newDigits = [...digits];
      if (newDigits[index]) {
        newDigits[index] = '';
        setDigits(newDigits);
      } else if (index > 0) {
        newDigits[index - 1] = '';
        setDigits(newDigits);
        inputRefs.current[index - 1]?.focus();
      }
      setError('');
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    } else if (e.key === 'Enter') {
      const pin = digits.join('');
      if (pin.length === PIN_LENGTH) checkPin(pin, digits);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LENGTH);
    if (!pasted) return;
    const newDigits = Array(PIN_LENGTH).fill('');
    pasted.split('').forEach((d, i) => { newDigits[i] = d; });
    setDigits(newDigits);
    const nextEmpty = pasted.length < PIN_LENGTH ? pasted.length : PIN_LENGTH - 1;
    inputRefs.current[nextEmpty]?.focus();
    if (pasted.length === PIN_LENGTH) {
      setTimeout(() => checkPin(pasted, newDigits), 50);
    }
  };

  const checkPin = (pin: string, _currentDigits: string[]) => {
    if (pin === VALID_PIN) {
      sessionStorage.setItem('authenticated', '1');
      navigate('/');
    } else {
      setError('Code PIN incorrect. Veuillez réessayer.');
      setShake(true);
      setTimeout(() => {
        setShake(false);
        setDigits(Array(PIN_LENGTH).fill(''));
        inputRefs.current[0]?.focus();
      }, 600);
    }
  };

  const filledCount = digits.filter(Boolean).length;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', backgroundColor: 'var(--bg)', overflow: 'hidden' }}>
      {/* Colonne Gauche - Visuel / Marque */}
      <motion.div
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        style={{
          flex: 1,
          backgroundColor: 'var(--primary)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '4rem',
          color: 'white',
          overflow: 'hidden'
        }}
      >
        <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 70%)', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '600px', height: '600px', borderRadius: '50%', background: `radial-gradient(circle, var(--accent) 0%, rgba(255,255,255,0) 60%)`, opacity: 0.15, filter: 'blur(60px)' }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '9999px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
            <img src="https://cabinet-dentaire-cenon.fr/assets/logo-1SKykJd2.png" alt="Cabinet Dentaire de Cenon" style={{ height: '32px', width: '32px', objectFit: 'contain' }} />
          </div>
          <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#fff', letterSpacing: '0.01em' }}>
            Cabinet Dentaire de Cenon
          </span>
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="font-display"
            style={{ fontSize: '3.5rem', lineHeight: 1.1, marginBottom: '1.5rem', fontWeight: 500 }}
          >
            L'excellence dentaire <br /> au service de <span style={{ color: 'rgba(255,255,255,0.65)', fontStyle: 'italic' }}>votre sourire.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            style={{ fontSize: '1.125rem', opacity: 0.8, maxWidth: '400px', lineHeight: 1.6 }}
          >
            Plateforme interne sécurisée. Gérez votre activité, vos consultations et vos revenus avec une clarté absolue.
          </motion.p>
        </div>
      </motion.div>

      {/* Colonne Droite - PIN */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', position: 'relative' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          style={{ width: '100%', maxWidth: '380px', textAlign: 'center' }}
        >
          <div style={{ marginBottom: '2.5rem' }}>
            <h2 className="font-display" style={{ fontSize: '2.5rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.5rem' }}>
              Bienvenue
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>
              Entrez votre code PIN pour accéder au cabinet.
            </p>
          </div>

          {/* Icône cadenas */}
          <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'center' }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              backgroundColor: 'var(--primary)', opacity: 0.1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative'
            }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 10 }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
            </div>
          </div>

          {/* Cases PIN */}
          <motion.div
            animate={shake ? { x: [-8, 8, -8, 8, -4, 4, 0] } : { x: 0 }}
            transition={{ duration: 0.5 }}
            style={{ display: 'flex', gap: '0.875rem', justifyContent: 'center', marginBottom: '1.5rem' }}
          >
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => { inputRefs.current[index] = el; }}
                type="password"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                style={{
                  width: '64px',
                  height: '72px',
                  textAlign: 'center',
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  border: `2px solid ${digit ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: '0.75rem',
                  backgroundColor: digit ? 'rgba(94, 115, 124, 0.06)' : '#fff',
                  color: 'var(--text)',
                  outline: 'none',
                  transition: 'border-color 0.2s, background-color 0.2s, transform 0.1s',
                  cursor: 'text',
                  caretColor: 'transparent',
                  transform: digit ? 'scale(1.04)' : 'scale(1)',
                }}
                onFocus={(e) => {
                  if (!digit) e.target.style.borderColor = 'var(--primary)';
                }}
                onBlur={(e) => {
                  if (!digit) e.target.style.borderColor = 'var(--border)';
                }}
              />
            ))}
          </motion.div>

          {/* Indicateur de progression discret */}
          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginBottom: '1.5rem' }}>
            {Array(PIN_LENGTH).fill(0).map((_, i) => (
              <div key={i} style={{
                width: '6px', height: '6px', borderRadius: '50%',
                backgroundColor: i < filledCount ? 'var(--primary)' : 'var(--border)',
                transition: 'background-color 0.2s'
              }} />
            ))}
          </div>

          {/* Message d'erreur */}
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{
                  color: 'var(--danger)',
                  fontSize: '0.875rem',
                  backgroundColor: 'var(--danger-bg)',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  margin: '0 0 1rem 0'
                }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <p style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Accès restreint au personnel autorisé de la clinique.<br />
            &copy; 2026 Cabinet Dentaire de Cenon
          </p>
        </motion.div>
      </div>
    </div>
  );
}
