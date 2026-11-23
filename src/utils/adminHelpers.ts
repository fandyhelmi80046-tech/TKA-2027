import mammoth from 'mammoth';
import type { ExamResultRow } from '../types';

export interface ParsedQuestion {
  t: string;
  o: [string, string, string, string];
  a: number;
}

export interface ParsedUserRow {
  u: string;
  p: string;
  n: string;
  k: string;
  g: string;
}

export async function extractTextFromFile(file: File): Promise<string> {
  if (/\.docx$/i.test(file.name)) {
    const buffer = await file.arrayBuffer();
    const res = await mammoth.extractRawText({ arrayBuffer: buffer });
    return res.value || '';
  }
  return await file.text();
}

export function parseImportedQuestions(text: string): ParsedQuestion[] {
  const out: ParsedQuestion[] = [];
  let current: { t: string; o: string[]; a: number } | null = null;

  const flush = () => {
    if (current && current.o.length === 4 && current.a >= 0) {
      out.push({
        t: current.t.trim(),
        o: current.o as [string, string, string, string],
        a: current.a,
      });
    }
    current = null;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const keyMatch = line.match(/^(?:kunci|jawaban)\s*[:=]\s*([A-Da-d])/i);
    if (keyMatch) {
      if (current) {
        current.a = 'abcd'.indexOf(keyMatch[1].toLowerCase());
      }
      continue;
    }

    const optMatch = line.match(/^([A-Da-d])[.)]\s+(.+)/);
    if (optMatch) {
      if (current) {
        current.o.push(optMatch[2].trim());
      }
      continue;
    }

    const qMatch = line.match(/^\d+[.)]\s+(.+)/);
    if (qMatch) {
      flush();
      current = { t: qMatch[1].trim(), o: [], a: -1 };
      continue;
    }

    if (current && current.o.length === 0) {
      current.t += ` ${line}`;
    }
  }
  flush();
  return out;
}

export function parseImportedUsers(text: string): ParsedUserRow[] {
  const rows: ParsedUserRow[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const cols = line.split(/[,;\t]/).map((c) => c.trim());
    if (cols.length < 3 || !cols[0] || /^username$/i.test(cols[0])) continue;
    rows.push({
      u: cols[0],
      p: cols[1],
      n: cols[2],
      k: cols[3] || '',
      g: cols[4] || '',
    });
  }
  return rows;
}

export function resizeLogoToPng(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Berkas gambar tidak dapat dibaca.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak valid.'));
      img.onload = () => {
        const scale = Math.min(1, 256 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas tidak tersedia.'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function generateToken6(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function formatDurationHMS(seconds: number): string {
  const x = Math.max(0, Math.floor(seconds || 0));
  const z = (n: number) => String(n).padStart(2, '0');
  return `${z(Math.floor(x / 3600))}:${z(Math.floor((x % 3600) / 60))}:${z(x % 60)}`;
}

export function downloadResultsCsv(
  rows: Array<ExamResultRow & { bb: number; tt: number; nl: number }>,
  filterMapel: string,
  filterTopik: string,
): void {
  const escapeCsv = (val: string | number) => {
    const s = String(val ?? '');
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = ['No', 'Username', 'Nama', 'Kelas', 'Mapel', 'Paket', 'Benar', 'Salah', 'Nilai'];
  const lines = [
    header.join(','),
    ...rows.map((r, i) =>
      [i + 1, r.u, r.n, r.k || '-', r.m, r.p, r.bb, r.tt - r.bb, r.nl]
        .map(escapeCsv)
        .join(','),
    ),
  ];
  const bom = '\uFEFF';
  const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const suffix = [filterMapel || 'Semua', filterTopik].filter(Boolean).join('-');
  a.download = `rekap-hasil-${suffix}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function downloadPrintableResultsHtml(
  rows: Array<ExamResultRow & { bb: number; tt: number; nl: number }>,
  ident: { nama: string; sub: string },
  filterMapel: string,
  filterTopik: string,
): void {
  const title = `Laporan Hasil Ujian - ${ident.nama || 'TRY OUT'}`;
  const subtitle = [
    filterMapel || 'Semua Mata Pelajaran',
    filterTopik ? `Topik ${filterTopik}` : '',
    `Dicetak ${new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const avg = rows.length
    ? (rows.reduce((acc, r) => acc + r.nl, 0) / rows.length).toFixed(1)
    : '0';

  const bodyRows = rows.length
    ? rows
        .map(
          (r, i) => `<tr>
            <td class="num">${i + 1}</td>
            <td class="mono">${escapeHtml(r.u)}</td>
            <td>${escapeHtml(r.n)}</td>
            <td>${escapeHtml(r.k || '-')}</td>
            <td>${escapeHtml(r.m)}</td>
            <td class="num">${escapeHtml(r.p)}</td>
            <td class="num">${escapeHtml(r.bb)}</td>
            <td class="num">${escapeHtml(r.tt - r.bb)}</td>
            <td class="num bold">${escapeHtml(r.nl)}</td>
          </tr>`,
        )
        .join('\n')
    : '<tr><td colspan="9" class="empty">Belum ada hasil ujian.</td></tr>';

  const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #111827; margin: 24px; }
  .toolbar { display: flex; justify-content: flex-end; margin-bottom: 16px; }
  .btn { background: #1d4ed8; color: #fff; border: 0; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px; }
  @media print { .toolbar { display: none; } body { margin: 0; } }
  header { border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 16px; }
  h1 { font-size: 18px; margin: 0; }
  .sub { font-size: 12px; color: #4b5563; margin-top: 4px; }
  .meta { font-size: 12px; margin-bottom: 12px; color: #374151; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 7px 9px; text-align: left; }
  th { background: #f1f5f9; font-weight: 700; }
  .num, .mono { font-family: ui-monospace, monospace; }
  .num { text-align: center; }
  .bold { font-weight: 700; color: #1d4ed8; }
  .empty { text-align: center; padding: 20px; color: #6b7280; }
</style>
</head>
<body>
  <div class="toolbar"><button class="btn" onclick="window.print()">Cetak / Simpan PDF</button></div>
  <header>
    <h1>${escapeHtml(ident.nama || 'TRY OUT')}</h1>
    <div class="sub">${escapeHtml(ident.sub || 'Laporan Hasil Ujian')}</div>
  </header>
  <div class="meta">${escapeHtml(subtitle)} · Jumlah Peserta: <strong>${rows.length}</strong> · Rata-rata Nilai: <strong>${avg}</strong></div>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Username</th><th>Nama</th><th>Kelas</th><th>Mapel</th><th>Paket</th><th>Benar</th><th>Salah</th><th>Nilai</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const suffix = [filterMapel || 'Semua', filterTopik].filter(Boolean).join('-');
  a.download = `cetak-hasil-ujian-${suffix}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
