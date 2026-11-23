import type {
  DriveFileMeta,
  ExamConfig,
  ExamResultRow,
  ExamSession,
  FullBackupSnapshot,
  QuestionItem,
} from '../types';
import { clearCachedGoogleToken, getGoogleWorkspaceToken } from './googleWorkspace';

export const TKA_SPREADSHEET_TITLE = 'TKA 2027';

const SHEET_SCHEMAS: Record<string, string[]> = {
  identitas: ['kunci', 'nilai'],
  pengguna: ['username', 'sandi_hash', 'nama', 'kelas', 'jk', 'peran', 'sandi_kartu'],
  soal: [
    'id',
    'mapel',
    'topik',
    'paket',
    'stimulus',
    'pertanyaan',
    'opsi_a',
    'opsi_b',
    'opsi_c',
    'opsi_d',
    'kunci',
  ],
  ujian: ['id', 'mapel', 'paket', 'aktif', 'token', 'menit', 'acak'],
  sesi: ['id', 'nama', 'ujian_id', 'tanggal', 'jam_mulai', 'batas_masuk', 'tz_offset'],
  sesi_peserta: ['sesi_id', 'username'],
  hasil: ['id', 'waktu', 'username', 'nama', 'kelas', 'mapel', 'paket', 'benar', 'total', 'nilai'],
  hasil_detail: ['hasil_id', 'nomor', 'topik', 'benar'],
  pengaturan_sistem: ['kunci', 'nilai'],
};

const REQUIRED_TABS = Object.keys(SHEET_SCHEMAS);

function requireToken(): string {
  const token = getGoogleWorkspaceToken();
  if (!token) {
    throw new Error('AUTH_REQUIRED');
  }
  return token;
}

async function googleFetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = requireToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...((init.headers as Record<string, string>) || {}),
    },
  });

  if (res.status === 401) {
    clearCachedGoogleToken();
    throw new Error('AUTH_REQUIRED');
  }

  const data = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string; code?: number };
  };

  if (!res.ok) {
    throw new Error(data.error?.message || `Permintaan Google API gagal (${res.status}).`);
  }

  return data;
}

export async function findTka2027Spreadsheet(): Promise<DriveFileMeta | null> {
  // Strictly search only for spreadsheet named "TKA 2027"; never touch other Drive files
  const q = encodeURIComponent(
    `name='${TKA_SPREADSHEET_TITLE}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
  );
  const fields = encodeURIComponent('files(id,name,modifiedTime,webViewLink)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime%20desc&pageSize=1&fields=${fields}`;
  const data = await googleFetchJson<{ files?: DriveFileMeta[] }>(url);
  const file = data.files && data.files.length > 0 ? data.files[0] : null;
  if (!file) return null;
  return {
    ...file,
    webViewLink:
      file.webViewLink ||
      `https://docs.google.com/spreadsheets/d/${encodeURIComponent(file.id)}/edit`,
  };
}

interface SpreadsheetMetadata {
  spreadsheetId: string;
  spreadsheetUrl?: string;
  properties?: { title?: string };
  sheets?: Array<{
    properties?: {
      sheetId?: number;
      title?: string;
    };
  }>;
}

async function getSpreadsheetMetadata(spreadsheetId: string): Promise<SpreadsheetMetadata> {
  const safeId = encodeURIComponent(spreadsheetId.trim());
  const fields = encodeURIComponent(
    'spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title)',
  );
  return googleFetchJson<SpreadsheetMetadata>(
    `https://sheets.googleapis.com/v4/spreadsheets/${safeId}?fields=${fields}`,
  );
}

export async function createTka2027Spreadsheet(): Promise<DriveFileMeta> {
  const body = {
    properties: {
      title: TKA_SPREADSHEET_TITLE,
    },
    sheets: REQUIRED_TABS.map((title) => ({
      properties: {
        title,
        gridProperties: {
          frozenRowCount: 1,
        },
      },
    })),
  };

  const created = await googleFetchJson<SpreadsheetMetadata>(
    'https://sheets.googleapis.com/v4/spreadsheets',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );

  // Style header rows nicely
  const formatRequests = (created.sheets || [])
    .filter((s) => typeof s.properties?.sheetId === 'number')
    .map((s) => ({
      repeatCell: {
        range: {
          sheetId: s.properties!.sheetId!,
          startRowIndex: 0,
          endRowIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.086, green: 0.161, blue: 0.267 },
            textFormat: {
              bold: true,
              foregroundColor: { red: 1, green: 1, blue: 1 },
            },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    }));

  if (formatRequests.length > 0) {
    const safeId = encodeURIComponent(created.spreadsheetId);
    await googleFetchJson(`https://sheets.googleapis.com/v4/spreadsheets/${safeId}:batchUpdate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: formatRequests }),
    }).catch(() => {});
  }

  return {
    id: created.spreadsheetId,
    name: created.properties?.title || TKA_SPREADSHEET_TITLE,
    modifiedTime: new Date().toISOString(),
    webViewLink:
      created.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${encodeURIComponent(created.spreadsheetId)}/edit`,
  };
}

function buildSheetRows(snapshot: FullBackupSnapshot): Record<string, string[][]> {
  // Identitas (chunk logo every 40k chars to respect Sheets 50k cell limit)
  const identRows: string[][] = [
    SHEET_SCHEMAS.identitas,
    ['nama', snapshot.ident.nama || 'TRY OUT'],
    ['sub', snapshot.ident.sub || ''],
  ];
  const logo = snapshot.ident.logo || '';
  if (logo) {
    const chunkSize = 40000;
    for (let i = 0, idx = 0; i < logo.length; i += chunkSize, idx++) {
      identRows.push([`logo_${idx}`, logo.slice(i, i + chunkSize)]);
    }
  } else {
    identRows.push(['logo_0', '']);
  }

  const penggunaRows: string[][] = [
    SHEET_SCHEMAS.pengguna,
    ...snapshot.users.map((u) => [
      u.u || '',
      u.passwordHash || '',
      u.n || '',
      u.k || '',
      u.g || '',
      u.role === 'admin' ? 'admin' : 'siswa',
      u.cardPassword || u.p || '',
    ]),
  ];

  const soalRows: string[][] = [
    SHEET_SCHEMAS.soal,
    ...snapshot.soal.map((q) => [
      q.id || '',
      q.mapel || '',
      q.topik || '-',
      String(q.paket || 1),
      q.s || '',
      q.t || '',
      q.o[0] || '',
      q.o[1] || '',
      q.o[2] || '',
      q.o[3] || '',
      'ABCD'[q.a] || 'A',
    ]),
  ];

  const ujianRows: string[][] = [
    SHEET_SCHEMAS.ujian,
    ...snapshot.ujian.map((e) => [
      e.id || '',
      e.mapel || '',
      String(e.paket || 1),
      e.aktif ? 'TRUE' : 'FALSE',
      e.token || '',
      String(e.menit || 75),
      e.acak ? 'TRUE' : 'FALSE',
    ]),
  ];

  const sesiRows: string[][] = [SHEET_SCHEMAS.sesi];
  const sesiPesertaRows: string[][] = [SHEET_SCHEMAS.sesi_peserta];
  for (const z of snapshot.sesi) {
    sesiRows.push([
      z.id || '',
      z.nm || '',
      z.e || '',
      z.tgl || '',
      z.jam || '',
      String(z.bm || 0),
      String(typeof z.tzOffset === 'number' ? z.tzOffset : -420),
    ]);
    for (const username of z.ps || []) {
      sesiPesertaRows.push([z.id, username]);
    }
  }

  const hasilRows: string[][] = [SHEET_SCHEMAS.hasil];
  const hasilDetailRows: string[][] = [SHEET_SCHEMAS.hasil_detail];
  for (const h of snapshot.hasil || []) {
    hasilRows.push([
      h.id || '',
      String(h.w || Date.now()),
      h.u || '',
      h.n || '',
      h.k || '-',
      h.m || '',
      String(h.p || 1),
      String(h.b || 0),
      String(h.tot || 0),
      String(h.nilai || 0),
    ]);
    (h.d || []).forEach(([topik, ok], idx) => {
      hasilDetailRows.push([h.id, String(idx + 1), topik || '-', ok ? '1' : '0']);
    });
  }

  const sysRows: string[][] = [
    SHEET_SCHEMAS.pengaturan_sistem,
    ['schemaVersion', String(snapshot.schemaVersion || 1)],
    ['exportedAt', String(snapshot.exportedAt || Date.now())],
    ['salt', snapshot.salt || ''],
    ['autoSync', snapshot.sheetSync?.autoSync ? 'TRUE' : 'FALSE'],
    ['progress', JSON.stringify(snapshot.progress || {})],
  ];

  return {
    identitas: identRows,
    pengguna: penggunaRows,
    soal: soalRows,
    ujian: ujianRows,
    sesi: sesiRows,
    sesi_peserta: sesiPesertaRows,
    hasil: hasilRows,
    hasil_detail: hasilDetailRows,
    pengaturan_sistem: sysRows,
  };
}

export async function writeTka2027Spreadsheet(
  snapshot: FullBackupSnapshot,
  existingSpreadsheetId?: string,
): Promise<DriveFileMeta> {
  let targetId = existingSpreadsheetId;
  let webViewLink: string | undefined;

  if (!targetId) {
    const created = await createTka2027Spreadsheet();
    targetId = created.id;
    webViewLink = created.webViewLink;
  }

  const meta = await getSpreadsheetMetadata(targetId);
  if (meta.properties?.title && meta.properties.title !== TKA_SPREADSHEET_TITLE) {
    throw new Error(
      `Spreadsheet target bukan "${TKA_SPREADSHEET_TITLE}" (terdeteksi "${meta.properties.title}"). Operasi dibatalkan demi keamanan data lain.`,
    );
  }
  webViewLink = webViewLink || meta.spreadsheetUrl;

  const existingTabNames = new Set(
    (meta.sheets || []).map((s) => s.properties?.title).filter(Boolean) as string[],
  );
  const missingTabs = REQUIRED_TABS.filter((name) => !existingTabNames.has(name));

  const safeId = encodeURIComponent(targetId);
  if (missingTabs.length > 0) {
    await googleFetchJson(`https://sheets.googleapis.com/v4/spreadsheets/${safeId}:batchUpdate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: missingTabs.map((title) => ({
          addSheet: {
            properties: {
              title,
              gridProperties: { frozenRowCount: 1 },
            },
          },
        })),
      }),
    });
  }

  const allTabRows = buildSheetRows(snapshot);

  // Clear existing ranges first so deleted rows don't remain
  await googleFetchJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${safeId}/values:batchClear`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ranges: REQUIRED_TABS.map((tab) => `'${tab}'!A:Z`),
      }),
    },
  );

  // Write all tabs atomically via batchUpdate
  await googleFetchJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${safeId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: REQUIRED_TABS.map((tab) => ({
          range: `'${tab}'!A1`,
          majorDimension: 'ROWS',
          values: allTabRows[tab],
        })),
      }),
    },
  );

  return {
    id: targetId,
    name: TKA_SPREADSHEET_TITLE,
    modifiedTime: new Date().toISOString(),
    webViewLink:
      webViewLink || `https://docs.google.com/spreadsheets/d/${safeId}/edit`,
  };
}

function toRecordRows(values?: unknown[][]): Array<Record<string, string>> {
  if (!values || values.length < 2) return [];
  const headers = values[0].map((h) => String(h ?? '').trim());
  return values
    .slice(1)
    .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
    .map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((col, i) => {
        if (col) obj[col] = row[i] == null ? '' : String(row[i]);
      });
      return obj;
    });
}

export async function readTka2027Spreadsheet(
  spreadsheetId: string,
): Promise<FullBackupSnapshot> {
  const meta = await getSpreadsheetMetadata(spreadsheetId);
  if (meta.properties?.title !== TKA_SPREADSHEET_TITLE) {
    throw new Error(
      `Spreadsheet "${meta.properties?.title || ''}" bukan "${TKA_SPREADSHEET_TITLE}".`,
    );
  }

  const existingTabNames = new Set(
    (meta.sheets || []).map((s) => s.properties?.title).filter(Boolean) as string[],
  );
  const tabsToRead = REQUIRED_TABS.filter((tab) => existingTabNames.has(tab));
  if (!tabsToRead.includes('pengguna') || !tabsToRead.includes('soal')) {
    throw new Error(`Sheet "${TKA_SPREADSHEET_TITLE}" belum berisi tab data Try Out TKA yang lengkap.`);
  }

  const safeId = encodeURIComponent(spreadsheetId.trim());
  const params = tabsToRead
    .map((t) => `ranges=${encodeURIComponent(`'${t}'!A:Z`)}`)
    .join('&');
  const res = await googleFetchJson<{
    valueRanges?: Array<{ range?: string; values?: unknown[][] }>;
  }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${safeId}/values:batchGet?${params}&valueRenderOption=UNFORMATTED_VALUE`,
  );

  const tabData: Record<string, Array<Record<string, string>>> = {};
  tabsToRead.forEach((tabName, idx) => {
    tabData[tabName] = toRecordRows(res.valueRanges?.[idx]?.values);
  });

  // 1. Identitas
  let nama = 'TRY OUT';
  let sub = 'Aplikasi Simulasi TKA';
  const logoChunks: string[] = [];
  for (const r of tabData.identitas || []) {
    if (r.kunci === 'nama' && r.nilai) nama = r.nilai;
    else if (r.kunci === 'sub') sub = r.nilai || '';
    else if (r.kunci === 'logo' && r.nilai) logoChunks[0] = r.nilai;
    else if (/^logo_\d+$/.test(r.kunci)) {
      logoChunks[Number(r.kunci.slice(5))] = r.nilai || '';
    }
  }

  // 2. Pengguna (deduplicate usernames case-insensitively)
  const seenSheetUsernames = new Set<string>();
  const users = (tabData.pengguna || [])
    .filter((r) => Boolean(r.username && r.username.trim()))
    .reduce<
      Array<{
        u: string;
        passwordHash: string;
        n: string;
        k: string;
        g: string;
        role: 'admin' | 'siswa';
        cardPassword: string;
        p: string;
      }>
    >((acc, r) => {
      const uname = r.username.trim();
      const lower = uname.toLowerCase();
      if (seenSheetUsernames.has(lower)) return acc;
      seenSheetUsernames.add(lower);
      acc.push({
        u: uname,
        passwordHash: r.sandi_hash || '',
        n: r.nama || uname,
        k: r.kelas || '',
        g: r.jk || '',
        role: (r.peran === 'admin' ? 'admin' : 'siswa') as 'admin' | 'siswa',
        cardPassword: r.sandi_kartu || '',
        p: r.sandi_kartu || '',
      });
      return acc;
    }, []);

  // 3. Soal
  const soal: QuestionItem[] = (tabData.soal || [])
    .filter((r) => Boolean(r.pertanyaan))
    .map((r) => {
      const kStr = (r.kunci || 'A').trim().toUpperCase();
      let aIdx = 'ABCD'.indexOf(kStr);
      if (aIdx < 0 && /^[0-3]$/.test(kStr)) aIdx = Number(kStr);
      if (aIdx < 0) aIdx = 0;
      return {
        id: r.id || Math.random().toString(36).slice(2, 9),
        mapel: r.mapel || '',
        topik: r.topik || '-',
        paket: Math.min(4, Math.max(1, Number(r.paket) || 1)),
        s: r.stimulus || '',
        t: r.pertanyaan || '',
        o: [r.opsi_a || '', r.opsi_b || '', r.opsi_c || '', r.opsi_d || ''],
        a: aIdx,
      };
    });

  // 4. Ujian
  const isTrue = (val: unknown) =>
    ['TRUE', 'YA', '1', 'AKTIF'].includes(String(val || '').trim().toUpperCase());
  const ujian: ExamConfig[] = (tabData.ujian || [])
    .filter((r) => Boolean(r.id && r.mapel))
    .map((r) => ({
      id: r.id,
      mapel: r.mapel,
      paket: Math.min(4, Math.max(1, Number(r.paket) || 1)),
      aktif: isTrue(r.aktif),
      token: (r.token || '').trim().toUpperCase(),
      menit: Math.max(1, Math.min(300, Number(r.menit) || 75)),
      acak: r.acak === '' ? true : isTrue(r.acak),
    }));

  // 5. Sesi & Peserta
  const pesertaBySesi = new Map<string, string[]>();
  for (const sp of tabData.sesi_peserta || []) {
    if (!sp.sesi_id || !sp.username) continue;
    const list = pesertaBySesi.get(sp.sesi_id) || [];
    list.push(sp.username);
    pesertaBySesi.set(sp.sesi_id, list);
  }
  const sesi: ExamSession[] = (tabData.sesi || [])
    .filter((r) => Boolean(r.id))
    .map((r) => ({
      id: r.id,
      nm: r.nama || '',
      e: r.ujian_id || '',
      tgl: r.tanggal || '',
      jam: r.jam_mulai || '',
      bm: Math.max(0, Number(r.batas_masuk) || 0),
      ps: pesertaBySesi.get(r.id) || [],
      ...(r.tz_offset !== undefined &&
      r.tz_offset !== '' &&
      Number.isFinite(Number(r.tz_offset))
        ? { tzOffset: Number(r.tz_offset) }
        : {}),
    }));

  // 6. Hasil & Detail
  const detailByHasil = new Map<string, Array<{ nomor: number; topik: string; ok: number }>>();
  for (const hd of tabData.hasil_detail || []) {
    if (!hd.hasil_id) continue;
    const list = detailByHasil.get(hd.hasil_id) || [];
    list.push({
      nomor: Number(hd.nomor) || 0,
      topik: hd.topik || '-',
      ok: Number(hd.benar) ? 1 : 0,
    });
    detailByHasil.set(hd.hasil_id, list);
  }
  const hasil: ExamResultRow[] = (tabData.hasil || [])
    .filter((r) => Boolean(r.id && r.username))
    .map((r) => {
      const det = (detailByHasil.get(r.id) || [])
        .sort((x, y) => x.nomor - y.nomor)
        .map((x) => [x.topik, x.ok] as [string, number]);
      return {
        id: r.id,
        u: r.username,
        n: r.nama || '',
        k: r.kelas || '-',
        m: r.mapel || '',
        p: Math.min(4, Math.max(1, Number(r.paket) || 1)),
        b: Math.max(0, Number(r.benar) || 0),
        tot: Math.max(0, Number(r.total) || 0),
        nilai: Math.max(0, Math.min(100, Number(r.nilai) || 0)),
        d: det,
        w: Number(r.waktu) || Date.now(),
      };
    });

  // 7. System metadata
  let salt = '';
  let exportedAt = Date.now();
  let progress: Record<string, unknown> = {};
  let autoSyncFromSheet: boolean | undefined;
  for (const sr of tabData.pengaturan_sistem || []) {
    if (sr.kunci === 'salt') salt = sr.nilai || '';
    else if (sr.kunci === 'exportedAt' && Number(sr.nilai)) exportedAt = Number(sr.nilai);
    else if (sr.kunci === 'autoSync') autoSyncFromSheet = isTrue(sr.nilai);
    else if (sr.kunci === 'progress' && sr.nilai) {
      try {
        const parsedProg = JSON.parse(sr.nilai);
        if (parsedProg && typeof parsedProg === 'object') progress = parsedProg;
      } catch {
        progress = {};
      }
    }
  }

  return {
    schemaVersion: 1,
    exportedAt,
    salt,
    ident: {
      nama,
      sub,
      logo: logoChunks.join(''),
    },
    users,
    soal,
    ujian,
    sesi,
    progress,
    hasil,
    ...(typeof autoSyncFromSheet === 'boolean'
      ? { sheetSync: { autoSync: autoSyncFromSheet, dirty: false } }
      : {}),
  };
}

export async function appendStudentResultToTka2027(
  row: ExamResultRow,
  knownSheetId?: string,
): Promise<boolean> {
  if (!getGoogleWorkspaceToken()) return false;

  let targetId = knownSheetId?.trim() || '';
  if (!targetId) {
    const found = await findTka2027Spreadsheet();
    if (!found) return false;
    targetId = found.id;
  }

  let meta: SpreadsheetMetadata;
  try {
    meta = await getSpreadsheetMetadata(targetId);
  } catch {
    if (!knownSheetId) return false;
    const found = await findTka2027Spreadsheet();
    if (!found) return false;
    targetId = found.id;
    meta = await getSpreadsheetMetadata(targetId);
  }
  if (meta.properties?.title !== TKA_SPREADSHEET_TITLE) {
    return false;
  }

  const existingTabs = new Set(
    (meta.sheets || []).map((s) => s.properties?.title).filter(Boolean) as string[],
  );
  if (!existingTabs.has('hasil')) return false;

  const safeId = encodeURIComponent(targetId);

  // Deduplicate by result ID so repeated calls never create duplicate rows
  const colRes = await googleFetchJson<{ values?: unknown[][] }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${safeId}/values/${encodeURIComponent("'hasil'!A:A")}?valueRenderOption=UNFORMATTED_VALUE`,
  );
  const existingIds = new Set(
    (colRes.values || []).map((r) => String(r[0] ?? '').trim()).filter(Boolean),
  );
  if (existingIds.has(row.id)) return true;

  const hasilRow = [
    row.id || '',
    String(row.w || Date.now()),
    row.u || '',
    row.n || '',
    row.k || '-',
    row.m || '',
    String(row.p || 1),
    String(row.b || 0),
    String(row.tot || 0),
    String(row.nilai || 0),
  ];
  const hasilPayload = existingIds.size === 0 ? [SHEET_SCHEMAS.hasil, hasilRow] : [hasilRow];

  await googleFetchJson(
    `https://sheets.googleapis.com/v4/spreadsheets/${safeId}/values/${encodeURIComponent("'hasil'!A1")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values: hasilPayload,
      }),
    },
  );

  if (existingTabs.has('hasil_detail') && Array.isArray(row.d) && row.d.length > 0) {
    const detColRes = await googleFetchJson<{ values?: unknown[][] }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${safeId}/values/${encodeURIComponent("'hasil_detail'!A:A")}?valueRenderOption=UNFORMATTED_VALUE`,
    ).catch(() => ({ values: [] as unknown[][] }));
    const hasHeader = (detColRes.values || []).length > 0;
    const detailRows = row.d.map(([topik, ok], idx) => [
      row.id,
      String(idx + 1),
      topik || '-',
      ok ? '1' : '0',
    ]);
    const detailPayload = hasHeader ? detailRows : [SHEET_SCHEMAS.hasil_detail, ...detailRows];

    await googleFetchJson(
      `https://sheets.googleapis.com/v4/spreadsheets/${safeId}/values/${encodeURIComponent("'hasil_detail'!A1")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          majorDimension: 'ROWS',
          values: detailPayload,
        }),
      },
    );
  }

  return true;
}
