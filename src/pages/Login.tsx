import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

export function Login() {
  const navigate = useNavigate();
  
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/');
  };

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
        {/* Abstract shapes / orbs */}
        <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 70%)', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '600px', height: '600px', borderRadius: '50%', background: `radial-gradient(circle, var(--accent) 0%, rgba(255,255,255,0) 60%)`, opacity: 0.15, filter: 'blur(60px)' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 className="font-display" style={{ fontSize: '2rem', fontWeight: 600, letterSpacing: '2px' }}>CENON</h2>
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="font-display" 
            style={{ fontSize: '3.5rem', lineHeight: 1.1, marginBottom: '1.5rem', fontWeight: 500 }}
          >
            L'excellence dentaire <br /> au service de <span style={{ color: 'var(--accent)', fontStyle: 'italic' }}>votre sourire.</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            style={{ fontSize: '1.125rem', opacity: 0.8, maxWidth: '400px', lineHeight: 1.6 }}
          >
            Plateforme interne sécurisée. Gerez votre activité, vos consultations et vos revenus avec une clarté absolue.
          </motion.p>
        </div>
      </motion.div>

      {/* Colonne Droite - Formulaire */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', position: 'relative' }}>
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          style={{ width: '100%', maxWidth: '420px' }}
        >
          <div style={{ textAlign: 'left', marginBottom: '3rem' }}>
            <h2 className="font-display" style={{ fontSize: '2.5rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.5rem' }}>Bienvenue</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>Veuillez vous identifier pour accéder au cabinet.</p>
          </div>
          
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>Email professionnel</label>
              <input 
                type="email" 
                className="input" 
                defaultValue="dr.mechouk@cabinet-cenon.fr" 
                required 
                style={{ height: '48px', fontSize: '1rem', backgroundColor: '#FFFFFF', border: '1px solid var(--border)', transition: 'border-color 0.3s', outline: 'none' }}
                onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
            
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>Mot de passe</label>
                <a href="#" style={{ fontSize: '0.875rem', color: 'var(--primary)', fontWeight: 500, textDecoration: 'none' }}>Oublié ?</a>
              </div>
              <input 
                type="password" 
                className="input" 
                defaultValue="password" 
                required 
                style={{ height: '48px', fontSize: '1rem', backgroundColor: '#FFFFFF', border: '1px solid var(--border)', transition: 'border-color 0.3s', outline: 'none' }}
                onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
              />
            </div>

            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit" 
              className="btn" 
              style={{ 
                width: '100%', 
                height: '52px', 
                marginTop: '1rem', 
                backgroundColor: 'var(--primary)', 
                color: 'white', 
                fontSize: '1rem', 
                fontWeight: 600,
                border: 'none',
                boxShadow: '0 4px 14px rgba(94, 115, 124, 0.3)'
              }}
            >
              Accéder au Dashboard
            </motion.button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Accès restreint au personnel autorisé de la clinique.<br/>
            &copy; 2026 Cabinet Dentaire de Cenon
          </p>
        </motion.div>
      </div>
    </div>
  );
}
