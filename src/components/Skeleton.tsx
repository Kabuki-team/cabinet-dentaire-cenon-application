/** Bloc générique animé */
function Sk({ w = '100%', h = 16, r = 6, mb = 0 }: { w?: string | number; h?: string | number; r?: number; mb?: number }) {
  return (
    <div
      className="skeleton-box"
      style={{ width: w, height: h, borderRadius: r, marginBottom: mb, flexShrink: 0 }}
    />
  );
}

/** Carte KPI skeleton */
function KPICard() {
  return (
    <div className="kpi-card" style={{ gap: '0.75rem' }}>
      <Sk w={80} h={11} />
      <Sk w={120} h={32} r={8} />
      <Sk w={64} h={10} />
    </div>
  );
}

/** Ligne de tableau skeleton */
function TableRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: '0.75rem 1rem' }}>
          <Sk w={i === 0 ? '70%' : '50%'} h={13} />
        </td>
      ))}
    </tr>
  );
}

/** Ligne de tableau avec avatar (colonne Patient) */
function PatientTableRow() {
  return (
    <tr>
      <td style={{ padding: '0.75rem 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div className="skeleton-box" style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            <Sk w="55%" h={13} />
            <Sk w="35%" h={10} />
          </div>
        </div>
      </td>
      {[1,2,3,4,5].map(i => (
        <td key={i} style={{ padding: '0.75rem 1rem' }}><Sk w="60%" h={13} /></td>
      ))}
      <td style={{ padding: '0.75rem 1rem' }}><Sk w={16} h={16} r={4} /></td>
    </tr>
  );
}

/* ── Exports par page ──────────────────────────────────────── */

export function DashboardSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-in">
      <div className="kpi-grid">
        {[0,1,2,3].map(i => <KPICard key={i} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem' }}>
        <div className="card" style={{ height: 320 }}><Sk w="100%" h="100%" r={8} /></div>
        <div className="card" style={{ height: 320, display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem' }}>
          <Sk w={100} h={14} />
          {[0,1,2,3,4].map(i => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Sk w={28} h={28} r={14} />
              <Sk w="55%" h={12} />
              <Sk w="25%" h={12} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TablePageSkeleton({ kpis = 0, cols = 5, rows = 8 }: { kpis?: number; cols?: number; rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-in">
      {kpis > 0 && (
        <div className="kpi-grid">
          {Array.from({ length: kpis }).map((_, i) => <KPICard key={i} />)}
        </div>
      )}
      <div className="card" style={{ padding: 0 }}>
        {/* toolbar skeleton */}
        <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--separator-opaque)', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Sk w={220} h={32} r={8} />
          <Sk w={80} h={28} r={20} />
          <Sk w={80} h={28} r={20} />
          <Sk w={100} h={28} r={20} />
        </div>
        <div className="table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
          <table>
            <thead>
              <tr>
                {Array.from({ length: cols }).map((_, i) => (
                  <th key={i}><Sk w={i === 0 ? 80 : 60} h={11} /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }).map((_, i) => (
                cols > 5 ? <PatientTableRow key={i} /> : <TableRow key={i} cols={cols} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function RevenuesSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-in">
      <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
        <Sk w={200} h={32} r={8} />
        <Sk w={80} h={28} r={20} />
        <Sk w={80} h={28} r={20} />
        <Sk w={80} h={28} r={20} />
      </div>
      <div className="kpi-grid">
        {[0,1,2,3].map(i => <KPICard key={i} />)}
      </div>
      <div className="card" style={{ height: 380 }}><Sk w="100%" h="100%" r={8} /></div>
    </div>
  );
}

export function PatientDetailSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="animate-in">
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem' }}>
        <div className="skeleton-box" style={{ width: 56, height: 56, borderRadius: '50%' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          <Sk w={180} h={20} />
          <Sk w={120} h={13} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Sk w={80} h={28} r={20} />
          <Sk w={80} h={28} r={20} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.5rem' }}>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--separator-opaque)' }}>
            <Sk w={120} h={14} />
          </div>
          <div className="table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
            <table>
              <thead><tr>{[0,1,2,3,4].map(i => <th key={i}><Sk w={60} h={11} /></th>)}</tr></thead>
              <tbody>{Array.from({ length: 8 }).map((_, i) => <TableRow key={i} cols={5} />)}</tbody>
            </table>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Sk w={80} h={13} />
            {[0,1,2,3].map(i => <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}><Sk w="40%" h={12} /><Sk w="40%" h={12} /></div>)}
          </div>
          <div className="card" style={{ height: 160 }}><Sk w="100%" h="100%" r={8} /></div>
        </div>
      </div>
    </div>
  );
}
