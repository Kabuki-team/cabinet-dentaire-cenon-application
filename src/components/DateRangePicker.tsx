import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { getDB } from '../lib/db';

interface DateRangePickerProps {
  onRangeChange?: (start: Date | null, end: Date | null) => void;
  singleDate?: boolean;
  initialDate?: Date;
}

export function DateRangePicker({ onRangeChange, singleDate, initialDate }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const defaultD = initialDate || new Date(2025, 10, 1);
  const [startDate, setStartDate] = useState<Date | null>(defaultD);
  const [endDate, setEndDate] = useState<Date | null>(initialDate ? defaultD : new Date(2026, 2, 31));
  const [currentMonth, setCurrentMonth] = useState(defaultD);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [activeDates, setActiveDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchActiveDates = () => {
      const db = getDB();
      if (db) {
        try {
          const res = db.exec("SELECT DISTINCT date FROM appointments UNION SELECT DISTINCT date FROM clinical_acts");
          if (res.length > 0) {
            setActiveDates(new Set(res[0].values.map(v => String(v[0]).trim())));
          }
        } catch (e) {
          console.error(e);
        }
      }
    };

    fetchActiveDates();
    const interval = setInterval(fetchActiveDates, 3000);
    return () => clearInterval(interval);
  }, []);

  // Sync with prop changes
  useEffect(() => {
    if (initialDate) {
      setStartDate(initialDate);
      if (singleDate) setEndDate(initialDate);
      setCurrentMonth(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
    }
  }, [initialDate]);

  // Ensure current month is visible when opening
  useEffect(() => {
    if (isOpen && startDate) {
      setCurrentMonth(new Date(startDate.getFullYear(), startDate.getMonth(), 1));
    }
  }, [isOpen]);

  const daysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = (date: Date) => {
    let d = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    return d === 0 ? 6 : d - 1; // Ajustement pour que Lundi soit 0
  };

  const handleDateClick = (day: number) => {
    const clickedDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    
    if (singleDate) {
      setStartDate(clickedDate);
      setEndDate(clickedDate);
      setIsOpen(false);
      onRangeChange?.(clickedDate, clickedDate);
      return;
    }

    if (!startDate || (startDate && endDate)) {
      setStartDate(clickedDate);
      setEndDate(null);
    } else {
      if (clickedDate < startDate) {
        setStartDate(clickedDate);
        setEndDate(null);
      } else {
        setEndDate(clickedDate);
        onRangeChange?.(startDate, clickedDate);
        setIsOpen(false);
      }
    }
  };

  const isBetween = (day: number) => {
    if (!startDate) return false;
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const end = endDate || hoverDate;
    if (!end) return startDate.getTime() === date.getTime();
    return date >= startDate && date <= end;
  };

  const isSelected = (day: number) => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    return (startDate?.getTime() === date.getTime()) || (endDate?.getTime() === date.getTime());
  };

  const changeMonth = (offset: number) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1));
  };

  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

  const triggerDateStr = startDate ? `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}` : '';
  const triggerHasData = activeDates.has(triggerDateStr);
  const todayRaw = new Date();
  todayRaw.setHours(23, 59, 59, 999);
  const triggerIsEmptyAndPast = startDate && startDate <= todayRaw && !triggerHasData;

  const getTriggerBg = () => {
     if (!singleDate) return 'white';
     if (triggerHasData) return '#f0fdf4';
     if (triggerIsEmptyAndPast) return '#fef2f2';
     return 'white';
  };

  const getTriggerBorder = () => {
     if (!singleDate) return '1px solid var(--border)';
     if (triggerHasData) return '1px solid #22c55e';
     if (triggerIsEmptyAndPast) return '1px solid #ef4444';
     return '1px solid var(--border)';
  };

  const getTriggerColor = () => {
     if (!singleDate) return 'var(--text)';
     if (triggerHasData) return '#16a34a';
     if (triggerIsEmptyAndPast) return '#ef4444';
     return 'var(--text)';
  };

  return (
    <div style={{ position: 'relative' }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.75rem', 
          backgroundColor: getTriggerBg(), 
          padding: '0.6rem 1.25rem', 
          borderRadius: '0.75rem', 
          border: getTriggerBorder(), 
          color: getTriggerColor(),
          boxShadow: 'var(--shadow-sm)',
          cursor: 'pointer',
          minWidth: '280px',
          transition: 'all 0.2s ease'
        }}
      >
        <CalendarIcon size={18} color={getTriggerColor() !== 'var(--text)' ? getTriggerColor() : "var(--primary)"} />
        <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
          {singleDate ? (
             startDate ? startDate.toLocaleDateString('fr-FR') : 'Sélectionner une date'
          ) : (
             <>
               {startDate ? startDate.toLocaleDateString('fr-FR') : 'Début'} 
               <span style={{ margin: '0 0.5rem', color: 'var(--text-muted)' }}>→</span>
               {endDate ? endDate.toLocaleDateString('fr-FR') : 'Fin'}
             </>
          )}
        </span>
      </div>

      {isOpen && (
        <div style={{ 
          position: 'absolute', 
          top: '110%', 
          left: 0, 
          zIndex: 1000, 
          backgroundColor: 'white', 
          borderRadius: '1rem', 
          boxShadow: 'var(--shadow-lg)', 
          border: '1px solid var(--border)',
          padding: '1.5rem',
          width: '320px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <button onClick={() => changeMonth(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><ChevronLeft size={20} /></button>
            <span style={{ fontWeight: 600 }}>{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</span>
            <button onClick={() => changeMonth(1)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><ChevronRight size={20} /></button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center' }}>
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => (
              <span key={d} style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{d}</span>
            ))}
            
            {Array.from({ length: firstDayOfMonth(currentMonth) }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {Array.from({ length: daysInMonth(currentMonth) }).map((_, i) => {
              const day = i + 1;
              const selected = isSelected(day);
              const inRange = isBetween(day);
              
              const dateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
              const today = new Date();
              today.setHours(23, 59, 59, 999);
              const isPastOrPresent = dateObj <= today;
              const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth()+1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const hasData = activeDates.has(dateStr);
              const isEmptyAndPast = isPastOrPresent && !hasData;
              
              return (
                <div 
                  key={day}
                  onClick={() => handleDateClick(day)}
                  onMouseEnter={() => !endDate && setHoverDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day))}
                  style={{
                    padding: '0.5rem 0',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    position: 'relative',
                    borderRadius: selected ? '0.5rem' : '0',
                    backgroundColor: selected ? 'var(--primary)' : inRange ? 'var(--primary-light)' : isEmptyAndPast ? '#fef2f2' : hasData ? '#f0fdf4' : 'transparent',
                    color: selected ? 'white' : inRange ? 'var(--primary)' : isEmptyAndPast ? '#ef4444' : hasData ? '#16a34a' : 'var(--text)',
                    fontWeight: (isEmptyAndPast || hasData) ? 500 : 'normal',
                    transition: 'all 0.1s'
                  }}
                  title={isEmptyAndPast ? "Aucune donnée importée pour ce jour" : hasData ? "Données importées" : ""}
                >
                  {day}
                </div>
              );
            })}
          </div>

          {!singleDate && (
            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
               <button className="btn btn-ghost" onClick={() => { setStartDate(null); setEndDate(null); onRangeChange?.(null, null); setIsOpen(false); }}>Effacer</button>
               <button className="btn btn-primary" onClick={() => setIsOpen(false)}>Appliquer</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
