/**
 * Génère et télécharge un fichier CSV.
 * Le BOM UTF-8 (\ufeff) garantit l'affichage correct des caractères français dans Excel.
 */
export function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [headers, ...rows].map(row => row.map(escape).join(';')).join('\r\n');
  const blob = new Blob(['\ufeff' + lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
