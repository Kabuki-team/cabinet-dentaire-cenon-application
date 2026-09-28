import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { AnimatePresence, motion } from 'framer-motion';
import { OfflineBanner } from '../OfflineBanner';

export function Layout() {
  const location = useLocation();
  const contentRef = useRef<HTMLElement>(null);

  // `.page-content` est le conteneur scrollable, pas la fenêtre : sans ça on arrive
  // au milieu d'une page quand on navigue depuis une liste déjà défilée.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="app-container">
      <OfflineBanner />
      <Sidebar />
      <div className="main-content">
        <Topbar />
        <main ref={contentRef} className="page-content" style={{ position: 'relative' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
