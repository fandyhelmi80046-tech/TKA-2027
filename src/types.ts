export interface AppIdent {
  nama: string;
  sub: string;
  logo: string;
}

export interface UserAccount {
  u: string;
  n: string;
  k?: string;
  g?: string;
  role?: 'admin' | 'siswa';
  p?: string; // Optional printable card password (cleared on "Hapus sandi tercetak")
  hasPassword?: boolean;
}

export interface QuestionItem {
  id: string;
  mapel: string;
  topik: string;
  paket: number;
  s?: string; // Stimulus / reading passage
  t: string;  // Question stem
  o: [string, string, string, string];
  a: number;  // Answer index 0..3 (admin-only)
}

export interface StudentQuestion {
  t: string;
  o: [string, string, string, string];
  s?: string;
}

export interface ExamConfig {
  id: string;
  mapel: string;
  paket: number;
  aktif: boolean;
  token: string;
  menit: number;
  acak: boolean;
}

export interface ExamSession {
  id: string;
  nm: string;
  e: string; // ExamConfig.id
  tgl: string;
  jam: string;
  bm: number; // Entry grace period in minutes (0 = unlimited)
  tzOffset?: number; // Minutes offset from UTC (e.g. -420 for WIB)
  ps: string[]; // Enrolled usernames
}

export interface LiveProgress {
  n: string;
  m: string;
  p: number;
  no: number;
  tot: number;
  j: number;
  r: number;
  s: number;
  st: 'Mengerjakan' | 'Selesai';
  ts: number;
  age?: number;
}

export interface ExamResultRow {
  id: string;
  u: string;
  n: string;
  k: string;
  m: string;
  p: number;
  b: number;
  tot: number;
  nilai: number;
  d: [string, number][]; // [topik, 1|0]
  w: number;
}

export interface SheetSyncConfig {
  autoSync: boolean;
  dirty: boolean;
  sheetId?: string;
  sheetName?: string;
  lastSyncedAt?: number;
}

export interface AdminDatabase {
  ident: AppIdent;
  users: UserAccount[];
  soal: QuestionItem[];
  ujian: ExamConfig[];
  sesi: ExamSession[];
  sheetSync?: SheetSyncConfig;
}

export interface PublicConfigResponse {
  ident: AppIdent;
  mapel: string[];
  adminSetupRequired: boolean;
  adminPasscodeManagedByEnv: boolean;
  autoSyncSheet?: boolean;
  sheetId?: string;
}

export interface LoginResponse {
  token: string;
  role: 'admin' | 'siswa';
  user: {
    u: string;
    n: string;
    g?: string;
    k?: string;
  };
  ujian?: {
    id: string;
    paket: number;
    menit: number;
    mapel: string;
    resuming?: boolean;
  };
}

export interface StartExamResponse {
  qs: StudentQuestion[];
  sisa: number;
  ans?: number[];
  flg?: boolean[];
  cur?: number;
}

export interface FinishExamResponse {
  benar: number;
  tot: number;
  nilai: number;
  resultRow?: ExamResultRow;
}

export interface FullBackupSnapshot {
  schemaVersion: number;
  exportedAt: number;
  salt: string;
  ident: AppIdent;
  users: Array<
    UserAccount & {
      passwordHash?: string;
      cardPassword?: string;
    }
  >;
  soal: QuestionItem[];
  ujian: ExamConfig[];
  sesi: ExamSession[];
  progress: Record<string, unknown>;
  hasil: ExamResultRow[];
  sheetSync?: SheetSyncConfig;
}

export interface DriveFileMeta {
  id: string;
  name: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
}
