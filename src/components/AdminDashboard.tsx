import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Award,
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  Download,
  FileSpreadsheet,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Moon,
  Plus,
  Printer,
  RotateCcw,
  Settings,
  Sliders,
  Sun,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import type {
  AdminDatabase,
  ExamConfig,
  ExamResultRow,
  ExamSession,
  LiveProgress,
  QuestionItem,
  UserAccount,
} from '../types';
import { getAdminExtra, resetStudentExam, restoreAdminBackup, saveAdminData } from '../api';
import {
  downloadPrintableResultsHtml,
  downloadResultsCsv,
  extractTextFromFile,
  formatDurationHMS,
  generateToken6,
  parseImportedQuestions,
  parseImportedUsers,
  resizeLogoToPng,
} from '../utils/adminHelpers';
import { useTkaSheetSync } from '../hooks/useTkaSheetSync';
import { TKA_SPREADSHEET_TITLE } from '../utils/googleSheets';
import { BrandMark } from './BrandMark';
import { GoogleDrivePanel } from './GoogleDrivePanel';
import { GoogleFormsImportModal } from './GoogleFormsImportModal';

type AdminTab =
  | 'dash'
  | 'users'
  | 'soal'
  | 'ujian'
  | 'token'
  | 'sesi'
  | 'kartu'
  | 'mon'
  | 'hasil'
  | 'drive'
  | 'ident';

interface AdminDashboardProps {
  initialDb: AdminDatabase;
  adminUser: { u: string; n: string };
  dark: boolean;
  onToggleDark: () => void;
  onDbUpdated: (ident: AdminDatabase['ident']) => void;
  onLogout: () => void;
}

const MENU_ITEMS: Array<{ key: AdminTab; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'dash', label: 'Dasbor', icon: LayoutDashboard },
  { key: 'users', label: 'Data Pengguna', icon: Users },
  { key: 'soal', label: 'Master Soal', icon: BookOpen },
  { key: 'ujian', label: 'Ujian', icon: Sliders },
  { key: 'token', label: 'Token Ujian', icon: KeyRound },
  { key: 'sesi', label: 'Sesi Ujian', icon: CalendarClock },
  { key: 'kartu', label: 'Kartu Ujian', icon: FileSpreadsheet },
  { key: 'mon', label: 'Monitor Live', icon: Activity },
  { key: 'hasil', label: 'Hasil dan Cetak', icon: Award },
  { key: 'drive', label: 'Sheet TKA 2027', icon: Cloud },
  { key: 'ident', label: 'Identitas Ujian', icon: Settings },
];

const uid = () => Math.random().toString(36).slice(2, 9);

export function AdminDashboard({
  initialDb,
  adminUser,
  dark,
  onToggleDark,
  onDbUpdated,
  onLogout,
}: AdminDashboardProps) {
  const [db, setDb] = useState<AdminDatabase>(initialDb);
  const [tab, setTab] = useState<AdminTab>('dash');
  const [saveState, setSaveState] = useState<string>('');
  const sheetSync = useTkaSheetSync(initialDb.sheetSync);
  const [live, setLive] = useState<Record<string, LiveProgress>>({});
  const [hasil, setHasil] = useState<ExamResultRow[]>([]);
  const [extraLoading, setExtraLoading] = useState(false);

  // Filters
  const [userSearch, setUserSearch] = useState('');
  const [filterMapel, setFilterMapel] = useState('');
  const [filterPaket, setFilterPaket] = useState('');
  const [soalSearch, setSoalSearch] = useState('');
  const [filterKartuSesi, setFilterKartuSesi] = useState('');
  const [filterHasilMapel, setFilterHasilMapel] = useState('');
  const [filterHasilTopik, setFilterHasilTopik] = useState('');
  const [copiedId, setCopiedId] = useState('');

  // Identity local draft
  const [identNama, setIdentNama] = useState(initialDb.ident.nama);
  const [identSub, setIdentSub] = useState(initialDb.ident.sub);
  const [identLogo, setIdentLogo] = useState(initialDb.ident.logo);
  const [logoMsg, setLogoMsg] = useState('Gunakan PNG, JPEG, atau WebP (maksimal 256 px).');

  // Modals
  const [userModal, setUserModal] = useState<{ open: boolean; editingUsername?: string }>({ open: false });
  const [uForm, setUForm] = useState({ u: '', p: '', n: '', k: '', g: '', role: 'siswa' as 'siswa' | 'admin' });
  const [userFormError, setUserFormError] = useState('');

  const [importUserModal, setImportUserModal] = useState(false);
  const [importUserText, setImportUserText] = useState('');
  const [importUserError, setImportUserError] = useState('');
  const [printHasilModal, setPrintHasilModal] = useState(false);
  const [restoringSheetModal, setRestoringSheetModal] = useState(false);

  const [sampleStudentModal, setSampleStudentModal] = useState(false);
  const [sampleStudentPw, setSampleStudentPw] = useState('');

  const [soalModal, setSoalModal] = useState<{ open: boolean; editingId?: string }>({ open: false });
  const [sForm, setSForm] = useState({
    mapel: '',
    topik: '',
    paket: 1,
    s: '',
    t: '',
    o: ['', '', '', ''] as [string, string, string, string],
    a: 0,
  });

  const [importSoalModal, setImportSoalModal] = useState(false);
  const [importSoalMeta, setImportSoalMeta] = useState({ mapel: '', topik: '', paket: 1 });
  const [importSoalText, setImportSoalText] = useState('');
  const [importSoalMsg, setImportSoalMsg] = useState('');
  const [importGoogleFormModal, setImportGoogleFormModal] = useState(false);
  const [bulkDeleteSoalModal, setBulkDeleteSoalModal] = useState(false);
  const [bulkDeleteMapel, setBulkDeleteMapel] = useState('');
  const [bulkDeletePaket, setBulkDeletePaket] = useState('');

  const [examModal, setExamModal] = useState(false);
  const [eForm, setEForm] = useState({ mapel: '', paket: 1, menit: 75 });

  const [sesiModal, setSesiModal] = useState(false);
  const [zForm, setZForm] = useState({
    nm: '',
    e: '',
    tgl: '',
    jam: '',
    bm: 30,
    ps: [] as string[],
  });

  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  const subjectOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [...db.ujian.map((ex) => ex.mapel), ...db.soal.map((q) => q.mapel)]
            .map((m) => m.trim())
            .filter(Boolean),
        ),
      ),
    [db.soal, db.ujian],
  );

  async function persist(
    nextDb: AdminDatabase,
    extraUsersFlag?: Record<string, Record<string, unknown>>,
  ) {
    setDb(nextDb);
    setSaveState('Menyimpan...');
    try {
      const payloadUsers = nextDb.users.map((u) => ({
        ...u,
        ...(extraUsersFlag?.[u.u] || {}),
      }));
      await saveAdminData({ ...nextDb, users: payloadUsers });
      onDbUpdated(nextDb.ident);
      const synced = await sheetSync.notifyDataSaved();
      setSaveState(
        synced
          ? `Tersimpan & sinkron ke ${TKA_SPREADSHEET_TITLE}`
          : 'Tersimpan di server',
      );
      window.setTimeout(() => setSaveState(''), 3000);
    } catch (err) {
      setSaveState(err instanceof Error ? `Gagal: ${err.message}` : 'Gagal menyimpan');
    }
  }

  async function refreshExtra(showLoader = false) {
    if (showLoader) setExtraLoading(true);
    try {
      const res = await getAdminExtra();
      const normalizedLive: Record<string, LiveProgress> = {};
      for (const [k, v] of Object.entries(res.live)) {
        normalizedLive[k] = {
          ...v,
          ts: Date.now() - (v.age || 0),
        };
      }
      setLive(normalizedLive);
      setHasil(res.hasil);
      if (res.sheetSync?.dirty) {
        sheetSync.setDriveDirty(true);
        if (sheetSync.autoSyncEnabled && !sheetSync.needsAuth && !sheetSync.syncing) {
          void sheetSync.syncNowToSheet();
        }
      }
    } catch {
      // ignore transient poll error
    } finally {
      if (showLoader) setExtraLoading(false);
    }
  }

  useEffect(() => {
    if (tab === 'dash' || tab === 'mon' || tab === 'hasil' || sheetSync.autoSyncEnabled) {
      void refreshExtra(tab === 'dash' || tab === 'mon' || tab === 'hasil');
    }
    if (tab === 'mon' || sheetSync.autoSyncEnabled) {
      const intervalMs = tab === 'mon' ? 3000 : 7000;
      const id = window.setInterval(() => void refreshExtra(false), intervalMs);
      return () => window.clearInterval(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sheetSync.autoSyncEnabled, sheetSync.needsAuth]);

  const studentUsers = useMemo(
    () => db.users.filter((u) => u.role !== 'admin'),
    [db.users],
  );

  const liveActiveCount = useMemo(
    () =>
      Object.values(live).filter(
        (x) => x.st !== 'Selesai' && Date.now() - x.ts < 20000,
      ).length,
    [live],
  );

  // Filtered lists
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return db.users;
    return db.users.filter(
      (u) =>
        u.u.toLowerCase().includes(q) ||
        u.n.toLowerCase().includes(q) ||
        (u.k || '').toLowerCase().includes(q),
    );
  }, [db.users, userSearch]);

  const filteredSoal = useMemo(() => {
    const q = soalSearch.trim().toLowerCase();
    return db.soal.filter((item) => {
      if (filterMapel && item.mapel !== filterMapel) return false;
      if (filterPaket && String(item.paket) !== filterPaket) return false;
      if (
        q &&
        !item.t.toLowerCase().includes(q) &&
        !item.topik.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [db.soal, filterMapel, filterPaket, soalSearch]);

  const kartuList = useMemo(() => {
    if (db.sesi.length === 0) return [];
    const selectedSessions = db.sesi.filter((z) => !filterKartuSesi || z.id === filterKartuSesi);
    const cards: Array<{ s: UserAccount; z: ExamSession }> = [];
    selectedSessions.forEach((z) => {
      z.ps.forEach((username) => {
        const userObj = db.users.find((y) => y.u === username);
        if (userObj) cards.push({ s: userObj, z });
      });
    });
    return cards;
  }, [db.sesi, db.users, filterKartuSesi]);

  const hasilMapels = useMemo(
    () => Array.from(new Set(hasil.map((h) => h.m))),
    [hasil],
  );

  const hasilTopiks = useMemo(
    () =>
      Array.from(
        new Set(
          hasil
            .filter((h) => !filterHasilMapel || h.m === filterHasilMapel)
            .flatMap((h) => h.d.map((x) => x[0])),
        ),
      ),
    [hasil, filterHasilMapel],
  );

  const filteredHasil = useMemo(() => {
    return hasil
      .filter((h) => !filterHasilMapel || h.m === filterHasilMapel)
      .map((h) => {
        const det = filterHasilTopik ? h.d.filter((x) => x[0] === filterHasilTopik) : h.d;
        const bb = det.reduce((acc, x) => acc + x[1], 0);
        const tt = det.length;
        const nl = tt ? Math.round((bb / tt) * 100) : 0;
        return { ...h, bb, tt, nl };
      })
      .filter((r) => r.tt > 0);
  }, [hasil, filterHasilMapel, filterHasilTopik]);

  const currentTabMeta = MENU_ITEMS.find((m) => m.key === tab)!;

  return (
    <>
    <div
      className={`${
        printHasilModal ? 'no-print ' : ''
      }min-h-screen flex flex-col lg:flex-row`}
    >
      {/* Sidebar */}
      <aside className="no-print w-full shrink-0 border-b border-slate-200 bg-[#162944] text-white lg:w-64 lg:border-b-0 lg:border-r lg:border-slate-800">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <BrandMark logo={db.ident.logo} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">{db.ident.nama || 'TRY OUT'}</p>
              <p className="truncate text-xs text-blue-200/80">Panel Admin</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleDark}
            aria-label="Ubah tema"
            className="grid h-8 w-8 place-items-center rounded-lg text-white/80 hover:bg-white/10 lg:hidden"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 py-3 lg:flex-col lg:overflow-visible">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`inline-flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 lg:w-full ${
                  active
                    ? 'bg-white/15 text-white'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="hidden lg:block mt-auto border-t border-white/10 p-4">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
            <span className="truncate font-medium">{adminUser.n}</span>
            <button
              type="button"
              onClick={onToggleDark}
              aria-label="Ubah tema"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-white/10"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
          >
            <LogOut className="h-3.5 w-3.5" />
            Keluar
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-[#131E2D]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-400 dark:text-slate-500">Admin</span>
              <span className="text-slate-300 dark:text-slate-600">/</span>
              <h1 className="font-bold text-slate-900 dark:text-white">{currentTabMeta.label}</h1>
              {saveState && (
                <span className="ml-2 text-xs font-medium text-blue-700 dark:text-blue-400">
                  {saveState}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {sheetSync.syncing ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300 whitespace-nowrap">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Menyinkronkan {TKA_SPREADSHEET_TITLE}...
                </span>
              ) : !sheetSync.needsAuth && sheetSync.autoSyncEnabled ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTab('drive')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 whitespace-nowrap"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Terhubung · {TKA_SPREADSHEET_TITLE}
                  </button>
                  <button
                    type="button"
                    onClick={() => void sheetSync.disableAutoSync()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 whitespace-nowrap"
                  >
                    Nonaktifkan Sinkronisasi
                  </button>
                </div>
              ) : !sheetSync.needsAuth ? (
                <button
                  type="button"
                  onClick={() => void sheetSync.requestEnableAutoSync()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1E40AF] whitespace-nowrap"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Aktifkan Sinkronisasi
                </button>
              ) : sheetSync.autoSyncEnabled ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={sheetSync.signingIn}
                    onClick={() => void sheetSync.signIn(false)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 whitespace-nowrap"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    {sheetSync.signingIn ? 'Menghubungkan...' : 'Hubungkan Google'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void sheetSync.disableAutoSync()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 whitespace-nowrap"
                  >
                    Nonaktifkan Sinkronisasi
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={sheetSync.signingIn}
                  onClick={() => void sheetSync.signIn(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1E40AF] disabled:opacity-60 whitespace-nowrap"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  {sheetSync.signingIn ? 'Menghubungkan...' : 'Aktifkan Sinkronisasi'}
                </button>
              )}
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 lg:hidden"
              >
                <LogOut className="h-3.5 w-3.5" />
                Keluar
              </button>
            </div>
          </div>
          {sheetSync.syncError && (
            <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
              {sheetSync.syncError}
            </p>
          )}
          {!sheetSync.syncError &&
            sheetSync.autoSyncEnabled &&
            sheetSync.needsAuth &&
            sheetSync.driveDirty && (
              <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                Ada perubahan atau hasil ujian baru yang siap dikirim ke Sheet{' '}
                <strong>{TKA_SPREADSHEET_TITLE}</strong>. Klik{' '}
                <strong>Hubungkan Google</strong> untuk menyinkronkan sekarang.
              </p>
            )}
        </header>

        <main className="flex-1 p-6">
          {/* 1. DASHBOARD */}
          {tab === 'dash' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  { label: 'Total Siswa', val: studentUsers.length },
                  { label: 'Bank Soal', val: db.soal.length },
                  { label: 'Ujian Aktif', val: db.ujian.filter((e) => e.aktif).length },
                  { label: 'Jadwal Sesi', val: db.sesi.length },
                  { label: 'Sedang Ujian', val: liveActiveCount },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#131E2D]"
                  >
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {kpi.label}
                    </p>
                    <p className="font-mono-num mt-2 text-3xl font-bold text-blue-700 dark:text-blue-400">
                      {kpi.val}
                    </p>
                  </div>
                ))}
              </div>

              <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#131E2D]">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Alur Persiapan Try Out
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Ikuti urutan berikut untuk menyiapkan simulasi ujian hingga selesai.
                </p>
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                    <p className="font-mono-num text-xs font-bold text-blue-700 dark:text-blue-400">01</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                      Siapkan Pengguna &amp; Soal
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Tambahkan akun siswa dan impor atau buat butir soal per mata pelajaran.
                    </p>
                    <button
                      type="button"
                      onClick={() => setTab('users')}
                      className="mt-3 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
                    >
                      Buka Data Pengguna
                    </button>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                    <p className="font-mono-num text-xs font-bold text-blue-700 dark:text-blue-400">02</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                      Aktifkan Ujian &amp; Token
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Pilih paket ujian yang aktif, rilis token ujian, dan atur jadwal sesi.
                    </p>
                    <button
                      type="button"
                      onClick={() => setTab('token')}
                      className="mt-3 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
                    >
                      Kelola Token Ujian
                    </button>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                    <p className="font-mono-num text-xs font-bold text-blue-700 dark:text-blue-400">03</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                      Pantau &amp; Rekap Nilai
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Pantau pengerjaan peserta secara langsung dan ekspor rekap nilai ke CSV.
                    </p>
                    <button
                      type="button"
                      onClick={() => setTab('mon')}
                      className="mt-3 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
                    >
                      Buka Monitor Live
                    </button>
                  </div>
                </div>
              </section>

              <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#131E2D]">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                    <FileSpreadsheet className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      Penyimpanan Google Sheet TKA 2027
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {sheetSync.autoSyncEnabled
                        ? 'Simpan otomatis aktif: setiap perubahan pada semua menu langsung tersimpan ke Sheet TKA 2027.'
                        : sheetSync.driveDirty
                        ? 'Ada perubahan terbaru yang belum disinkronkan ke Sheet TKA 2027.'
                        : 'Simpan dan pulihkan seluruh data di spreadsheet baru bernama TKA 2027 tanpa menyentuh file lain.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTab('drive')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E40AF] whitespace-nowrap"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  Kelola Sheet TKA 2027
                </button>
              </section>
            </div>
          )}

          {/* 2. DATA PENGGUNA */}
          {tab === 'users' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setUForm({ u: '', p: '', n: '', k: '', g: 'Laki-Laki', role: 'siswa' });
                      setUserFormError('');
                      setUserModal({ open: true });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E40AF] whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Tambah Pengguna
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImportUserText('');
                      setImportUserError('');
                      setImportUserModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Impor Siswa
                  </button>
                  {studentUsers.length === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSampleStudentPw('');
                        setSampleStudentModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300 whitespace-nowrap"
                    >
                      Buat 2 Siswa Latihan
                    </button>
                  )}
                </div>

                <input
                  type="search"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Cari username, nama, kelas..."
                  className="w-full sm:w-64 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#131E2D]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                      <th className="px-4 py-3 font-semibold">Username</th>
                      <th className="px-4 py-3 font-semibold">Nama</th>
                      <th className="px-4 py-3 font-semibold">Kelas</th>
                      <th className="px-4 py-3 font-semibold">Jenis Kelamin</th>
                      <th className="px-4 py-3 font-semibold">Peran</th>
                      <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredUsers.map((u) => (
                      <tr key={u.u} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="font-mono-num px-4 py-3 font-semibold text-slate-900 dark:text-white">
                          {u.u}
                        </td>
                        <td className="px-4 py-3 text-slate-800 dark:text-slate-200">{u.n}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{u.k || '-'}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{u.g || '-'}</td>
                        <td className="px-4 py-3 font-medium">
                          {u.role === 'admin' ? 'Admin' : 'Siswa'}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setUForm({
                                u: u.u,
                                p: '',
                                n: u.n,
                                k: u.k || '',
                                g: u.g || '',
                                role: u.role === 'admin' ? 'admin' : 'siswa',
                              });
                              setUserFormError('');
                              setUserModal({ open: true, editingUsername: u.u });
                            }}
                            className="mr-2 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={u.u === adminUser.u}
                            onClick={() =>
                              setConfirmAction({
                                title: 'Hapus Pengguna',
                                message: `Hapus akun "${u.u}" (${u.n}) secara permanen?`,
                                onConfirm: async () => {
                                  const next = {
                                    ...db,
                                    users: db.users.filter((x) => x.u !== u.u),
                                  };
                                  await persist(next);
                                  setConfirmAction(null);
                                },
                              })
                            }
                            className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-40 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. MASTER SOAL */}
          {tab === 'soal' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSForm({
                        mapel: filterMapel || subjectOptions[0] || '',
                        topik: '',
                        paket: Number(filterPaket) || 1,
                        s: '',
                        t: '',
                        o: ['', '', '', ''],
                        a: 0,
                      });
                      setSoalModal({ open: true });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E40AF] whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Buat Soal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImportSoalMeta({
                        mapel: filterMapel || subjectOptions[0] || '',
                        topik: '',
                        paket: Number(filterPaket) || 1,
                      });
                      setImportSoalText('');
                      setImportSoalMsg('');
                      setImportSoalModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Impor Soal
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportGoogleFormModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300 whitespace-nowrap"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Impor Google Form
                  </button>
                  <button
                    type="button"
                    disabled={db.soal.length === 0}
                    onClick={() => {
                      setBulkDeleteMapel(filterMapel);
                      setBulkDeletePaket(filterPaket);
                      setBulkDeleteSoalModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-40 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 whitespace-nowrap"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Hapus Soal Massal
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={filterMapel}
                    onChange={(e) => setFilterMapel(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">Semua mapel</option>
                    {subjectOptions.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filterPaket}
                    onChange={(e) => setFilterPaket(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">Semua paket</option>
                    {[1, 2, 3, 4].map((p) => (
                      <option key={p} value={String(p)}>
                        Paket {p}
                      </option>
                    ))}
                  </select>
                  <input
                    type="search"
                    value={soalSearch}
                    onChange={(e) => setSoalSearch(e.target.value)}
                    placeholder="Cari soal atau topik..."
                    className="w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#131E2D]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                      <th className="px-4 py-3 font-semibold">#</th>
                      <th className="px-4 py-3 font-semibold">Mapel</th>
                      <th className="px-4 py-3 font-semibold">Topik</th>
                      <th className="px-4 py-3 font-semibold">Paket</th>
                      <th className="px-4 py-3 font-semibold">Pertanyaan</th>
                      <th className="px-4 py-3 font-semibold">Kunci</th>
                      <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredSoal.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                          Tidak ada soal yang cocok dengan filter.
                        </td>
                      </tr>
                    ) : (
                      filteredSoal.map((q, idx) => (
                        <tr key={q.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                          <td className="font-mono-num px-4 py-3 text-slate-500">{idx + 1}</td>
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                            {q.mapel}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{q.topik}</td>
                          <td className="font-mono-num px-4 py-3">{q.paket}</td>
                          <td className="px-4 py-3 max-w-md text-slate-700 dark:text-slate-200">
                            {q.t.length > 90 ? `${q.t.slice(0, 90)}…` : q.t}
                          </td>
                          <td className="font-mono-num px-4 py-3 font-bold text-blue-700 dark:text-blue-400">
                            {'ABCD'[q.a]}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                setSForm({
                                  mapel: q.mapel,
                                  topik: q.topik,
                                  paket: q.paket,
                                  s: q.s || '',
                                  t: q.t,
                                  o: [...q.o] as [string, string, string, string],
                                  a: q.a,
                                });
                                setSoalModal({ open: true, editingId: q.id });
                              }}
                              className="mr-2 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmAction({
                                  title: 'Hapus Soal',
                                  message: 'Hapus butir soal ini dari bank soal?',
                                  onConfirm: async () => {
                                    await persist({
                                      ...db,
                                      soal: db.soal.filter((x) => x.id !== q.id),
                                    });
                                    setConfirmAction(null);
                                  },
                                })
                              }
                              className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                            >
                              Hapus
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. UJIAN */}
          {tab === 'ujian' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setEForm({ mapel: subjectOptions[0] || '', paket: 1, menit: 75 });
                    setExamModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E40AF]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Tambah Ujian
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#131E2D]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                      <th className="px-4 py-3 font-semibold">Mata Pelajaran</th>
                      <th className="px-4 py-3 font-semibold">Paket</th>
                      <th className="px-4 py-3 font-semibold">Jumlah Soal</th>
                      <th className="px-4 py-3 font-semibold">Durasi</th>
                      <th className="px-4 py-3 font-semibold">Acak Soal &amp; Opsi</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {db.ujian.map((ex) => {
                      const count = db.soal.filter(
                        (q) => q.mapel === ex.mapel && q.paket === ex.paket,
                      ).length;
                      return (
                        <tr key={ex.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                            {ex.mapel}
                          </td>
                          <td className="font-mono-num px-4 py-3">Paket {ex.paket}</td>
                          <td className="font-mono-num px-4 py-3">{count} soal</td>
                          <td className="font-mono-num px-4 py-3">{ex.menit} menit</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => {
                                const next = {
                                  ...db,
                                  ujian: db.ujian.map((item) =>
                                    item.id === ex.id ? { ...item, acak: !item.acak } : item,
                                  ),
                                };
                                void persist(next);
                              }}
                              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                                ex.acak
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                              }`}
                            >
                              {ex.acak ? 'Ya (Acak)' : 'Tidak'}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => {
                                const nextAktif = !ex.aktif;
                                const next = {
                                  ...db,
                                  ujian: db.ujian.map((item) => {
                                    if (item.id === ex.id) return { ...item, aktif: nextAktif };
                                    if (nextAktif && item.mapel === ex.mapel) {
                                      return { ...item, aktif: false };
                                    }
                                    return item;
                                  }),
                                };
                                void persist(next);
                              }}
                              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                                ex.aktif
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                              }`}
                            >
                              {ex.aktif ? 'Aktif' : 'Nonaktif'}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmAction({
                                  title: 'Hapus Ujian',
                                  message: `Hapus konfigurasi ujian ${ex.mapel} Paket ${ex.paket}?`,
                                  onConfirm: async () => {
                                    await persist({
                                      ...db,
                                      ujian: db.ujian.filter((x) => x.id !== ex.id),
                                    });
                                    setConfirmAction(null);
                                  },
                                })
                              }
                              className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                            >
                              Hapus
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Hanya satu paket yang aktif per mata pelajaran. Jika Acak aktif, urutan soal dan opsi
                diacak deterministik per peserta dengan mempertahankan pengelompokan teks bacaan.
              </p>
            </div>
          )}

          {/* 5. TOKEN UJIAN */}
          {tab === 'token' && (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#131E2D]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                      <th className="px-4 py-3 font-semibold">Ujian</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Token Saat Ini</th>
                      <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {db.ujian.map((ex) => (
                      <tr key={ex.id}>
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                          {ex.mapel} · Paket {ex.paket}
                        </td>
                        <td className="px-4 py-3">
                          {ex.aktif ? (
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                              Aktif
                            </span>
                          ) : (
                            <span className="text-slate-500">Nonaktif</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {ex.token ? (
                            <div className="inline-flex items-center gap-2">
                              <span className="font-mono-num text-base font-bold tracking-widest text-blue-700 dark:text-blue-400">
                                {ex.token}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  void navigator.clipboard.writeText(ex.token);
                                  setCopiedId(ex.id);
                                  window.setTimeout(() => setCopiedId(''), 1500);
                                }}
                                aria-label="Salin token"
                                className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                {copiedId === ex.id ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400">(belum dirilis)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              const next = {
                                ...db,
                                ujian: db.ujian.map((item) =>
                                  item.id === ex.id
                                    ? { ...item, token: generateToken6() }
                                    : item,
                                ),
                              };
                              void persist(next);
                            }}
                            className="mr-2 rounded-md bg-[#1D4ED8] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1E40AF]"
                          >
                            Generate Token
                          </button>
                          <button
                            type="button"
                            disabled={!ex.token}
                            onClick={() => {
                              const next = {
                                ...db,
                                ujian: db.ujian.map((item) =>
                                  item.id === ex.id ? { ...item, token: '' } : item,
                                ),
                              };
                              void persist(next);
                            }}
                            className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-40 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                          >
                            Hapus Token
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Siswa hanya dapat memulai ujian jika token sudah dirilis oleh admin.
              </p>
            </div>
          )}

          {/* 6. SESI UJIAN */}
          {tab === 'sesi' && (
            <div className="space-y-4">
              <div>
                <button
                  type="button"
                  onClick={() => {
                    const firstExamId = db.ujian[0]?.id || '';
                    setZForm({ nm: '', e: firstExamId, tgl: '', jam: '', bm: 30, ps: [] });
                    setSesiModal(true);
                  }}
                  disabled={db.ujian.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E40AF] disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Buat Sesi
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#131E2D]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                      <th className="px-4 py-3 font-semibold">Nama Sesi</th>
                      <th className="px-4 py-3 font-semibold">Ujian</th>
                      <th className="px-4 py-3 font-semibold">Tanggal</th>
                      <th className="px-4 py-3 font-semibold">Jam Mulai</th>
                      <th className="px-4 py-3 font-semibold">Batas Masuk</th>
                      <th className="px-4 py-3 font-semibold">Peserta</th>
                      <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {db.sesi.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                          Belum ada sesi terjadwal. Buat sesi ujian dan masukkan peserta agar kartu
                          ujian muncul dan siswa dapat login.
                        </td>
                      </tr>
                    ) : (
                      db.sesi.map((z) => {
                        const ex = db.ujian.find((x) => x.id === z.e);
                        return (
                          <tr key={z.id}>
                            <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                              {z.nm}
                            </td>
                            <td className="px-4 py-3">
                              {ex ? `${ex.mapel} P${ex.paket}` : '-'}
                            </td>
                            <td className="font-mono-num px-4 py-3">{z.tgl}</td>
                            <td className="font-mono-num px-4 py-3">{z.jam}</td>
                            <td className="font-mono-num px-4 py-3">
                              {z.bm ? `${z.bm} menit` : 'Tanpa batas'}
                            </td>
                            <td className="font-mono-num px-4 py-3">{z.ps.length} peserta</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmAction({
                                    title: 'Hapus Sesi',
                                    message: `Hapus sesi ujian "${z.nm}"?`,
                                    onConfirm: async () => {
                                      await persist({
                                        ...db,
                                        sesi: db.sesi.filter((item) => item.id !== z.id),
                                      });
                                      setConfirmAction(null);
                                    },
                                  })
                                }
                                className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                              >
                                Hapus
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 7. KARTU UJIAN */}
          {tab === 'kartu' && (
            <div className="space-y-4">
              <div className="no-print flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={filterKartuSesi}
                    onChange={(e) => setFilterKartuSesi(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">Semua sesi</option>
                    {db.sesi.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.nm}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E40AF]"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Cetak Kartu
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmAction({
                        title: 'Hapus Sandi Tercetak',
                        message:
                          'Hapus semua sandi tercetak dari kartu ujian? Akun siswa tetap aktif, namun kartu tidak akan menampilkan kata sandi lagi sampai diatur ulang.',
                        onConfirm: async () => {
                          const flags: Record<string, Record<string, unknown>> = {};
                          const nextUsers = db.users.map((u) => {
                            flags[u.u] = { clearCardPassword: true };
                            return { ...u, p: '' };
                          });
                          await persist({ ...db, users: nextUsers }, flags);
                          setConfirmAction(null);
                        },
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Hapus Sandi Tercetak
                  </button>
                </div>
                <span className="font-mono-num text-xs text-slate-500 dark:text-slate-400">
                  {kartuList.length} kartu
                </span>
              </div>

              {kartuList.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-[#131E2D]">
                  {db.sesi.length === 0
                    ? 'Kartu ujian belum tersedia karena sesi ujian belum dibuat. Silakan buat sesi di menu Sesi Ujian terlebih dahulu.'
                    : 'Belum ada peserta pada sesi yang dipilih. Tambahkan peserta ke sesi di menu Sesi Ujian.'}
                </div>
              ) : (
                <div className="print-only-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {kartuList.map(({ s, z }, idx) => {
                    const ex = z ? db.ujian.find((y) => y.id === z.e) : null;
                    return (
                      <article
                        key={`${s.u}-${z?.id || 'none'}-${idx}`}
                        className="print-card rounded-xl border border-slate-300 bg-white p-4 text-xs dark:border-slate-700 dark:bg-[#131E2D]"
                      >
                        <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2 dark:border-slate-600">
                          <span className="font-bold tracking-wide">KARTU UJIAN</span>
                          <span className="flex items-center gap-1.5 font-semibold">
                            {db.ident.logo && (
                              <img
                                src={db.ident.logo}
                                alt=""
                                referrerPolicy="no-referrer"
                                className="h-5 w-5 object-contain"
                              />
                            )}
                            {db.ident.nama}
                          </span>
                        </div>
                        <dl className="mt-3 space-y-1.5">
                          <div className="flex justify-between gap-2">
                            <dt className="text-slate-500 dark:text-slate-400">Nama</dt>
                            <dd className="font-semibold text-right">{s.n}</dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-slate-500 dark:text-slate-400">Kelas</dt>
                            <dd className="text-right">{s.k || '-'}</dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-slate-500 dark:text-slate-400">Username</dt>
                            <dd className="font-mono-num font-bold text-right">{s.u}</dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-slate-500 dark:text-slate-400">Kata Sandi</dt>
                            <dd className="font-mono-num font-bold text-right">{s.p || '-'}</dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-slate-500 dark:text-slate-400">Mata Uji</dt>
                            <dd className="text-right">
                              {ex ? `${ex.mapel} (Paket ${ex.paket})` : '-'}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-slate-500 dark:text-slate-400">Sesi / Waktu</dt>
                            <dd className="font-mono-num text-right">
                              {z ? `${z.nm} · ${z.tgl} ${z.jam}` : '-'}
                            </dd>
                          </div>
                        </dl>
                        <p className="mt-3 border-t border-slate-200 pt-2 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                          Token ujian diberikan oleh proktor di ruang ujian.
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 8. MONITOR LIVE */}
          {tab === 'mon' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pembaruan otomatis setiap 3 detik. Reset mengizinkan peserta mengulang ujian.
                </p>
                <button
                  type="button"
                  onClick={() => void refreshExtra(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Muat Ulang
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#131E2D]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                      <th className="px-4 py-3 font-semibold">Peserta</th>
                      <th className="px-4 py-3 font-semibold">Ujian</th>
                      <th className="px-4 py-3 font-semibold">Soal ke</th>
                      <th className="px-4 py-3 font-semibold">Terjawab</th>
                      <th className="px-4 py-3 font-semibold">Ragu</th>
                      <th className="px-4 py-3 font-semibold">Sisa Waktu</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {extraLoading && Object.keys(live).length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                          Memuat data live...
                        </td>
                      </tr>
                    ) : Object.keys(live).length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                          Belum ada peserta yang sedang atau telah mengerjakan ujian.
                        </td>
                      </tr>
                    ) : (
                      Object.entries(live).map(([u, x]) => {
                        const offline = x.st !== 'Selesai' && Date.now() - x.ts > 20000;
                        const statusText = offline ? 'Terputus' : x.st;
                        return (
                          <tr key={u}>
                            <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                              <span className="font-mono-num">{u}</span> · {x.n}
                            </td>
                            <td className="px-4 py-3">
                              {x.m} P{x.p}
                            </td>
                            <td className="font-mono-num px-4 py-3">
                              {x.no}/{x.tot}
                            </td>
                            <td className="font-mono-num px-4 py-3">{x.j}</td>
                            <td className="font-mono-num px-4 py-3">{x.r}</td>
                            <td className="font-mono-num px-4 py-3">{formatDurationHMS(x.s)}</td>
                            <td className="px-4 py-3 font-semibold">
                              <span
                                className={
                                  statusText === 'Selesai'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : statusText === 'Terputus'
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-blue-600 dark:text-blue-400'
                                }
                              >
                                {statusText}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmAction({
                                    title: 'Reset Peserta',
                                    message: `Hapus progres dan hasil ujian untuk ${u} (${x.n}) pada ${x.m} Paket ${x.p} agar peserta dapat mengulang?`,
                                    onConfirm: async () => {
                                      await resetStudentExam(u, x.m, x.p);
                                      await refreshExtra(false);
                                      await sheetSync.notifyDataSaved();
                                      setConfirmAction(null);
                                    },
                                  })
                                }
                                className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                              >
                                Reset
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 9. HASIL DAN CETAK */}
          {tab === 'hasil' && (
            <div className="space-y-4">
              <div className="no-print flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={filterHasilMapel}
                    onChange={(e) => {
                      setFilterHasilMapel(e.target.value);
                      setFilterHasilTopik('');
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">Semua mapel</option>
                    {hasilMapels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filterHasilTopik}
                    onChange={(e) => setFilterHasilTopik(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">Semua topik</option>
                    {hasilTopiks.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPrintHasilModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Cetak
                  </button>
                  <button
                    type="button"
                    disabled={filteredHasil.length === 0}
                    onClick={() =>
                      downloadResultsCsv(filteredHasil, filterHasilMapel, filterHasilTopik)
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E40AF] disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Ekspor CSV / Excel
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#131E2D]">
                <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Rekap Hasil {filterHasilMapel || 'Semua Mata Pelajaran'}
                    {filterHasilTopik ? ` · Topik ${filterHasilTopik}` : ''}
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                        <th className="px-4 py-3 font-semibold">#</th>
                        <th className="px-4 py-3 font-semibold">Username</th>
                        <th className="px-4 py-3 font-semibold">Nama</th>
                        <th className="px-4 py-3 font-semibold">Kelas</th>
                        <th className="px-4 py-3 font-semibold">Mapel</th>
                        <th className="px-4 py-3 font-semibold">Paket</th>
                        <th className="px-4 py-3 font-semibold">Benar</th>
                        <th className="px-4 py-3 font-semibold">Salah</th>
                        <th className="px-4 py-3 font-semibold">Nilai</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredHasil.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                            Belum ada hasil ujian.
                          </td>
                        </tr>
                      ) : (
                        filteredHasil.map((r, i) => (
                          <tr key={r.id || `${r.u}-${r.w}`}>
                            <td className="font-mono-num px-4 py-3">{i + 1}</td>
                            <td className="font-mono-num px-4 py-3 font-semibold">{r.u}</td>
                            <td className="px-4 py-3">{r.n}</td>
                            <td className="px-4 py-3">{r.k || '-'}</td>
                            <td className="px-4 py-3">{r.m}</td>
                            <td className="font-mono-num px-4 py-3">{r.p}</td>
                            <td className="font-mono-num px-4 py-3">{r.bb}</td>
                            <td className="font-mono-num px-4 py-3">{r.tt - r.bb}</td>
                            <td className="font-mono-num px-4 py-3 font-bold text-blue-700 dark:text-blue-400">
                              {r.nl}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 10. IDENTITAS UJIAN */}
          {tab === 'ident' && (
            <section className="max-w-lg rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#131E2D]">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Identitas Aplikasi &amp; Instansi
              </h2>
              <div className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Nama Aplikasi / Sekolah
                  </label>
                  <input
                    type="text"
                    value={identNama}
                    onChange={(e) => setIdentNama(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Subjudul
                  </label>
                  <input
                    type="text"
                    value={identSub}
                    onChange={(e) => setIdentSub(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Logo Aplikasi
                  </label>
                  <div className="mt-2 flex items-center gap-4">
                    <BrandMark logo={identLogo} size="lg" />
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const pngDataUrl = await resizeLogoToPng(file);
                          setIdentLogo(pngDataUrl);
                          setLogoMsg('Logo siap disimpan.');
                        } catch (err) {
                          setLogoMsg(
                            err instanceof Error ? err.message : 'Gambar tidak dapat diproses.',
                          );
                        }
                      }}
                      className="text-xs text-slate-600 dark:text-slate-300"
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{logoMsg}</p>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() =>
                      void persist({
                        ...db,
                        ident: {
                          nama: identNama.trim() || 'TRY OUT',
                          sub: identSub.trim(),
                          logo: identLogo,
                        },
                      })
                    }
                    className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E40AF]"
                  >
                    Simpan Identitas
                  </button>
                  {identLogo && (
                    <button
                      type="button"
                      onClick={() => {
                        setIdentLogo('');
                        void persist({
                          ...db,
                          ident: {
                            nama: identNama.trim() || 'TRY OUT',
                            sub: identSub.trim(),
                            logo: '',
                          },
                        });
                      }}
                      className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                    >
                      Hapus Logo
                    </button>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* 10b. GOOGLE DRIVE STORAGE */}
          {tab === 'drive' && (
            <GoogleDrivePanel
              currentCounts={{
                users: db.users.length,
                soal: db.soal.length,
                ujian: db.ujian.length,
                sesi: db.sesi.length,
                hasil: hasil.length,
              }}
              sheetSync={sheetSync}
              onRestored={(nextDb) => {
                setDb(nextDb);
                setIdentNama(nextDb.ident.nama);
                setIdentSub(nextDb.ident.sub);
                setIdentLogo(nextDb.ident.logo);
                sheetSync.applyRestoredSyncState(nextDb.sheetSync);
                onDbUpdated(nextDb.ident);
                void refreshExtra(true);
              }}
            />
          )}
        </main>
      </div>

      {/* MODAL: Add/Edit User */}
      {userModal.open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-[#131E2D]">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {userModal.editingUsername ? 'Edit Pengguna' : 'Tambah Pengguna'}
              </h2>
              <button
                type="button"
                onClick={() => setUserModal({ open: false })}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                  <label className="block text-xs font-semibold">Username</label>
                  <input
                    type="text"
                    disabled={Boolean(userModal.editingUsername)}
                    value={uForm.u}
                    onChange={(e) => {
                      setUserFormError('');
                      setUForm({ ...uForm, u: e.target.value });
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold">
                    Kata Sandi{' '}
                    {userModal.editingUsername ? '(kosongkan jika tidak mengubah)' : ''}
                  </label>
                  <input
                    type="text"
                    value={uForm.p}
                    onChange={(e) => {
                      setUserFormError('');
                      setUForm({ ...uForm, p: e.target.value });
                    }}
                    placeholder={userModal.editingUsername ? 'Biarkan kosong jika tetap' : 'Wajib diisi'}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold">Nama Lengkap</label>
                  <input
                    type="text"
                    value={uForm.n}
                    onChange={(e) => {
                      setUserFormError('');
                      setUForm({ ...uForm, n: e.target.value });
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold">Kelas</label>
                    <input
                      type="text"
                      value={uForm.k}
                      onChange={(e) => setUForm({ ...uForm, k: e.target.value })}
                      placeholder="IX-A"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold">Jenis Kelamin</label>
                    <select
                      value={uForm.g}
                      onChange={(e) => setUForm({ ...uForm, g: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                    >
                      <option value="">-</option>
                      <option value="Laki-Laki">Laki-Laki</option>
                      <option value="Perempuan">Perempuan</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold">Peran</label>
                  <select
                    value={uForm.role}
                    onChange={(e) =>
                      setUForm({ ...uForm, role: e.target.value === 'admin' ? 'admin' : 'siswa' })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="siswa">Siswa</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                {userFormError && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                    {userFormError}
                  </p>
                )}
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUserModal({ open: false })}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold dark:border-slate-700"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const username = uForm.u.trim();
                    const name = uForm.n.trim();
                    if (!username || !name) {
                      setUserFormError('Username dan nama lengkap wajib diisi.');
                      return;
                    }
                    if (!userModal.editingUsername && !uForm.p) {
                      setUserFormError('Kata sandi wajib diisi untuk pengguna baru.');
                      return;
                    }
                    const hasDuplicate = db.users.some(
                      (x) =>
                        x.u.trim().toLowerCase() === username.toLowerCase() &&
                        x.u !== userModal.editingUsername,
                    );
                    if (hasDuplicate) {
                      setUserFormError('Username sudah digunakan. Tidak boleh ada username yang sama.');
                      return;
                    }

                    const idx = db.users.findIndex(
                      (x) => x.u === (userModal.editingUsername || username),
                    );
                    const entry: UserAccount = {
                      u: username,
                      n: name,
                      k: uForm.k.trim(),
                      g: uForm.g,
                      role: uForm.role,
                      ...(uForm.p ? { p: uForm.p } : {}),
                    };
                    const nextUsers =
                      idx >= 0
                        ? db.users.map((x, i) => (i === idx ? { ...x, ...entry } : x))
                        : [...db.users, entry];
                    await persist({ ...db, users: nextUsers });
                    setUserModal({ open: false });
                  }}
                  className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white"
                >
                  Simpan
                </button>
              </div>
            </div>
          </div>
        )}

      {/* MODAL: Create Sample Students */}
      {sampleStudentModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-[#131E2D]">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Buat 2 Akun Siswa Latihan
            </h2>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              Akan membuat akun <span className="font-mono-num font-semibold">12345</span> (PESERTA
              SATU) dan <span className="font-mono-num font-semibold">12346</span> (PESERTA DUA).
              Tentukan kata sandi awal untuk kedua akun tersebut:
            </p>
            <input
              type="text"
              value={sampleStudentPw}
              onChange={(e) => setSampleStudentPw(e.target.value)}
              placeholder="Masukkan kata sandi siswa (min. 4 karakter)"
              className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSampleStudentModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold dark:border-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={sampleStudentPw.trim().length < 4}
                onClick={async () => {
                  const pw = sampleStudentPw.trim();
                  const demo: UserAccount[] = [
                    { u: '12345', p: pw, n: 'PESERTA TKA', k: 'IX-A', g: 'Laki-Laki', role: 'siswa' },
                    { u: '12346', p: pw, n: 'PESERTA DUA', k: 'IX-A', g: 'Perempuan', role: 'siswa' },
                  ];
                  const existingIds = new Set(db.users.map((x) => x.u.trim().toLowerCase()));
                  const added = demo.filter((d) => !existingIds.has(d.u.toLowerCase()));
                  if (added.length > 0) {
                    await persist({ ...db, users: [...db.users, ...added] });
                  }
                  setSampleStudentModal(false);
                }}
                className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                Buat Akun
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Import Users */}
      {importUserModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-[#131E2D]">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Impor Siswa</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Satu baris per siswa: <span className="font-mono-num">username, sandi, nama, kelas</span>{' '}
              (dipisah koma, titik koma, atau tab).
            </p>
            <div className="mt-4 space-y-3">
              <input
                type="file"
                accept=".csv,.txt,.docx"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setImportUserError('');
                    setImportUserText(await extractTextFromFile(f));
                  }
                }}
                className="text-xs"
              />
              <textarea
                rows={8}
                value={importUserText}
                onChange={(e) => {
                  setImportUserError('');
                  setImportUserText(e.target.value);
                }}
                placeholder="12345, sandi123, Budi Santoso, IX-A"
                className="font-mono-num w-full rounded-lg border border-slate-300 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
              <p className="text-xs text-slate-500">
                Terdeteksi <span className="font-mono-num font-bold">{parseImportedUsers(importUserText).length}</span>{' '}
                baris valid.
              </p>
              {importUserError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                  {importUserError}
                </p>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImportUserModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold dark:border-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  const parsed = parseImportedUsers(importUserText);
                  if (parsed.length === 0) {
                    setImportUserError('Tidak ada baris pengguna yang valid untuk diimpor.');
                    return;
                  }
                  const existingLower = new Set(db.users.map((u) => u.u.trim().toLowerCase()));
                  const seenImport = new Set<string>();
                  const duplicates: string[] = [];
                  for (const row of parsed) {
                    const lower = row.u.trim().toLowerCase();
                    if (existingLower.has(lower) || seenImport.has(lower)) {
                      duplicates.push(row.u.trim());
                    }
                    seenImport.add(lower);
                  }
                  if (duplicates.length > 0) {
                    const uniqueDups = Array.from(new Set(duplicates));
                    setImportUserError(
                      `Terdapat username yang sama (${uniqueDups.slice(0, 5).join(', ')}${
                        uniqueDups.length > 5 ? ', ...' : ''
                      }). Tidak boleh ada username yang sama.`,
                    );
                    return;
                  }
                  const nextUsers: UserAccount[] = [
                    ...db.users,
                    ...parsed.map((row) => ({
                      u: row.u.trim(),
                      p: row.p,
                      n: row.n,
                      k: row.k,
                      g: row.g || '',
                      role: 'siswa' as const,
                    })),
                  ];
                  await persist({ ...db, users: nextUsers });
                  setImportUserModal(false);
                }}
                className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white"
              >
                Impor &amp; Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add/Edit Question */}
      {soalModal.open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-[#131E2D]">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {soalModal.editingId ? 'Edit Soal' : 'Buat Soal'}
              </h2>
              <button
                type="button"
                onClick={() => setSoalModal({ open: false })}
                className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold">Mata Pelajaran</label>
                  <input
                    list="dl-mapel"
                    value={sForm.mapel}
                    onChange={(e) => setSForm({ ...sForm, mapel: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                  />
                  <datalist id="dl-mapel">
                    {subjectOptions.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-semibold">Topik</label>
                  <input
                    value={sForm.topik}
                    onChange={(e) => setSForm({ ...sForm, topik: e.target.value })}
                    placeholder="Membaca / Aljabar"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold">Paket</label>
                  <select
                    value={sForm.paket}
                    onChange={(e) => setSForm({ ...sForm, paket: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                  >
                    {[1, 2, 3, 4].map((p) => (
                      <option key={p} value={p}>
                        Paket {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold">Teks Bacaan / Stimulus (opsional)</label>
                <textarea
                  rows={3}
                  value={sForm.s}
                  onChange={(e) => setSForm({ ...sForm, s: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold">Pertanyaan</label>
                <textarea
                  rows={3}
                  value={sForm.t}
                  onChange={(e) => setSForm({ ...sForm, t: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {(['A', 'B', 'C', 'D'] as const).map((letter, idx) => (
                  <div key={letter}>
                    <label className="block text-xs font-semibold">Opsi {letter}</label>
                    <input
                      value={sForm.o[idx]}
                      onChange={(e) => {
                        const nextOpts = [...sForm.o] as [string, string, string, string];
                        nextOpts[idx] = e.target.value;
                        setSForm({ ...sForm, o: nextOpts });
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold">Kunci Jawaban</label>
                <select
                  value={sForm.a}
                  onChange={(e) => setSForm({ ...sForm, a: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                >
                  {['A', 'B', 'C', 'D'].map((L, i) => (
                    <option key={L} value={i}>
                      {L}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSoalModal({ open: false })}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold dark:border-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!sForm.mapel.trim() || !sForm.t.trim() || sForm.o.some((x) => !x.trim())) {
                    return;
                  }
                  const item: QuestionItem = {
                    id: soalModal.editingId || uid(),
                    mapel: sForm.mapel.trim(),
                    topik: sForm.topik.trim() || '-',
                    paket: sForm.paket,
                    s: sForm.s.trim(),
                    t: sForm.t.trim(),
                    o: sForm.o.map((x) => x.trim()) as [string, string, string, string],
                    a: sForm.a,
                  };
                  const nextSoal = soalModal.editingId
                    ? db.soal.map((q) => (q.id === soalModal.editingId ? item : q))
                    : [...db.soal, item];
                  await persist({ ...db, soal: nextSoal });
                  setSoalModal({ open: false });
                }}
                className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white"
              >
                Simpan Soal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Import Soal */}
      {importSoalModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-[#131E2D]">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Impor Soal</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Format: nomor soal (`1. ...`), opsi `A.` sampai `D.`, lalu baris `Kunci: B`. Unggah
              berkas `.docx` atau `.txt`, atau tempel langsung.
            </p>
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold">Mata Pelajaran</label>
                  <input
                    list="dl-mapel-imp"
                    value={importSoalMeta.mapel}
                    onChange={(e) =>
                      setImportSoalMeta({ ...importSoalMeta, mapel: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                  />
                  <datalist id="dl-mapel-imp">
                    {subjectOptions.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-semibold">Topik</label>
                  <input
                    value={importSoalMeta.topik}
                    onChange={(e) =>
                      setImportSoalMeta({ ...importSoalMeta, topik: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold">Paket</label>
                  <select
                    value={importSoalMeta.paket}
                    onChange={(e) =>
                      setImportSoalMeta({ ...importSoalMeta, paket: Number(e.target.value) })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                  >
                    {[1, 2, 3, 4].map((p) => (
                      <option key={p} value={p}>
                        Paket {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <input
                type="file"
                accept=".docx,.txt"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const txt = await extractTextFromFile(f);
                    setImportSoalText(txt);
                    setImportSoalMsg('');
                  } catch {
                    setImportSoalMsg('Berkas gagal dibaca. Salin teks soal secara manual.');
                  }
                }}
                className="text-xs"
              />

              <textarea
                rows={8}
                value={importSoalText}
                onChange={(e) => setImportSoalText(e.target.value)}
                placeholder={'1. Ibu kota Indonesia adalah ...\nA. Bandung\nB. Jakarta\nC. Surabaya\nD. Medan\nKunci: B'}
                className="font-mono-num w-full rounded-lg border border-slate-300 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-900"
              />

              <p className="text-xs text-slate-600 dark:text-slate-300">
                Terdeteksi{' '}
                <span className="font-mono-num font-bold">
                  {parseImportedQuestions(importSoalText).length}
                </span>{' '}
                soal siap diimpor.
              </p>
              {importSoalMsg && (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  {importSoalMsg}
                </p>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImportSoalModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold dark:border-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!importSoalMeta.mapel.trim()) {
                    setImportSoalMsg('Isi mata pelajaran terlebih dahulu.');
                    return;
                  }
                  const parsed = parseImportedQuestions(importSoalText);
                  if (parsed.length === 0) {
                    setImportSoalMsg('Tidak ada soal yang terbaca. Periksa format.');
                    return;
                  }
                  const added: QuestionItem[] = parsed.map((q) => ({
                    id: uid(),
                    mapel: importSoalMeta.mapel.trim(),
                    topik: importSoalMeta.topik.trim() || '-',
                    paket: importSoalMeta.paket,
                    s: '',
                    t: q.t,
                    o: q.o,
                    a: q.a,
                  }));
                  await persist({ ...db, soal: [...db.soal, ...added] });
                  setImportSoalModal(false);
                }}
                className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white"
              >
                Impor &amp; Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Import Soal from Google Forms */}
      {importGoogleFormModal && (
        <GoogleFormsImportModal
          subjectOptions={subjectOptions}
          defaultMapel={filterMapel}
          defaultPaket={Number(filterPaket) || 1}
          onClose={() => setImportGoogleFormModal(false)}
          onImportQuestions={async (added) => {
            await persist({ ...db, soal: [...db.soal, ...added] });
          }}
        />
      )}

      {/* MODAL: Add Exam */}
      {examModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-[#131E2D]">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Tambah Ujian</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold">Mata Pelajaran</label>
                <input
                  list="dl-exam-mapel"
                  value={eForm.mapel}
                  onChange={(e) => setEForm({ ...eForm, mapel: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
                <datalist id="dl-exam-mapel">
                  {subjectOptions.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-semibold">Paket</label>
                <select
                  value={eForm.paket}
                  onChange={(e) => setEForm({ ...eForm, paket: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  {[1, 2, 3, 4].map((p) => (
                    <option key={p} value={p}>
                      Paket {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold">Durasi (menit)</label>
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={eForm.menit}
                  onChange={(e) => setEForm({ ...eForm, menit: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExamModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold dark:border-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!eForm.mapel.trim()) return;
                  const nextEx: ExamConfig = {
                    id: uid(),
                    mapel: eForm.mapel.trim(),
                    paket: eForm.paket,
                    aktif: false,
                    acak: true,
                    token: '',
                    menit: eForm.menit || 75,
                  };
                  await persist({ ...db, ujian: [...db.ujian, nextEx] });
                  setExamModal(false);
                }}
                className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Create Session */}
      {sesiModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-[#131E2D]">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Buat Sesi Ujian</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold">Nama Sesi</label>
                <input
                  value={zForm.nm}
                  onChange={(e) => setZForm({ ...zForm, nm: e.target.value })}
                  placeholder="Sesi 1 - Ruang A"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold">Ujian</label>
                <select
                  value={zForm.e}
                  onChange={(e) => setZForm({ ...zForm, e: e.target.value, ps: [] })}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                >
                  {db.ujian.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.mapel} – Paket {ex.paket}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold">Tanggal</label>
                  <input
                    type="date"
                    value={zForm.tgl}
                    onChange={(e) => setZForm({ ...zForm, tgl: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold">Jam Mulai</label>
                  <input
                    type="time"
                    value={zForm.jam}
                    onChange={(e) => setZForm({ ...zForm, jam: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold">
                  Batas Masuk (menit setelah jam mulai, 0 = tanpa batas)
                </label>
                <input
                  type="number"
                  min={0}
                  value={zForm.bm}
                  onChange={(e) => setZForm({ ...zForm, bm: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div>
                {(() => {
                  const taken = new Set(
                    db.sesi.filter((s) => s.e === zForm.e).flatMap((s) => s.ps),
                  );
                  const available = studentUsers.filter((u) => !taken.has(u.u));
                  const allSelected =
                    available.length > 0 && available.every((u) => zForm.ps.includes(u.u));
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold">Peserta</label>
                        {available.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setZForm({
                                ...zForm,
                                ps: allSelected ? [] : available.map((u) => u.u),
                              })
                            }
                            className="text-xs font-semibold text-blue-700 dark:text-blue-400"
                          >
                            {allSelected ? 'Batal pilih semua' : 'Pilih semua'}
                          </button>
                        )}
                      </div>
                      <div className="mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-slate-200 p-2.5 space-y-1.5 dark:border-slate-700">
                        {available.length === 0 ? (
                          <p className="text-xs text-slate-500">
                            Semua siswa sudah masuk sesi untuk ujian ini.
                          </p>
                        ) : (
                          available.map((u) => (
                            <label
                              key={u.u}
                              className="flex items-center gap-2 text-xs cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={zForm.ps.includes(u.u)}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setZForm({
                                    ...zForm,
                                    ps: checked
                                      ? [...zForm.ps, u.u]
                                      : zForm.ps.filter((x) => x !== u.u),
                                  });
                                }}
                              />
                              <span className="font-mono-num font-semibold">{u.u}</span>
                              <span>· {u.n}</span>
                              <span className="text-slate-400">({u.k || '-'})</span>
                            </label>
                          ))
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSesiModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold dark:border-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!zForm.nm.trim() || !zForm.e || !zForm.tgl || !zForm.jam || zForm.ps.length === 0) {
                    return;
                  }
                  const nextSesi: ExamSession = {
                    id: uid(),
                    nm: zForm.nm.trim(),
                    e: zForm.e,
                    tgl: zForm.tgl,
                    jam: zForm.jam,
                    bm: zForm.bm || 0,
                    ps: zForm.ps,
                    tzOffset: new Date().getTimezoneOffset(),
                  };
                  await persist({ ...db, sesi: [...db.sesi, nextSesi] });
                  setSesiModal(false);
                }}
                className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white"
              >
                Simpan Sesi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Confirmation */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-[#131E2D]">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {confirmAction.title}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {confirmAction.message}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold dark:border-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void confirmAction.onConfirm()}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
              >
                Ya, Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL: Confirm Enabling Auto-Sync to Sheet TKA 2027 */}
      {sheetSync.autoSyncPromptOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-[#131E2D]">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Simpan Otomatis ke Sheet {TKA_SPREADSHEET_TITLE}?
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Jika diaktifkan, setiap penyimpanan perubahan pada semua menu (Data Pengguna, Master
              Soal, Ujian, Token, Sesi, Monitor, dan Identitas) akan langsung memperbarui isi
              Google Sheet <strong>{TKA_SPREADSHEET_TITLE}</strong> dengan data berikut:
            </p>
            <ul className="mt-3 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono-num text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
              <li>Pengguna: {db.users.length}</li>
              <li>Soal: {db.soal.length}</li>
              <li>Ujian: {db.ujian.length}</li>
              <li>Sesi: {db.sesi.length}</li>
              <li>Hasil Ujian: {hasil.length}</li>
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={sheetSync.syncing}
                onClick={() => sheetSync.dismissAutoSyncPrompt()}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold dark:border-slate-700"
              >
                Mode Manual Saja
              </button>
              <button
                type="button"
                disabled={sheetSync.syncing}
                onClick={() => void sheetSync.confirmEnableAutoSync()}
                className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E40AF] disabled:opacity-50"
              >
                {sheetSync.syncing
                  ? 'Menyinkronkan...'
                  : `Ya, Simpan Otomatis ke ${TKA_SPREADSHEET_TITLE}`}
              </button>
              </div>
            </div>
          </div>
        )}
      {/* MODAL: Restore Existing Sheet TKA 2027 on Fresh/Empty Server */}
      {sheetSync.pendingSheetRestore && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-[#131E2D]">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Data Tersimpan Ditemukan di Sheet {TKA_SPREADSHEET_TITLE}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Server aplikasi saat ini masih kosong, sedangkan Google Sheet{' '}
              <strong>{sheetSync.pendingSheetRestore.fileMeta.name}</strong> sudah menyimpan data
              berikut. Pulihkan data dari Google Sheet agar isi Sheet tidak tertimpa data kosong?
            </p>
            <ul className="mt-3 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono-num text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
              <li>Pengguna: {sheetSync.pendingSheetRestore.snapshot.users.length}</li>
              <li>Soal: {sheetSync.pendingSheetRestore.snapshot.soal.length}</li>
              <li>Ujian: {sheetSync.pendingSheetRestore.snapshot.ujian.length}</li>
              <li>Sesi: {sheetSync.pendingSheetRestore.snapshot.sesi.length}</li>
              <li>
                Hasil Ujian:{' '}
                {Array.isArray(sheetSync.pendingSheetRestore.snapshot.hasil)
                  ? sheetSync.pendingSheetRestore.snapshot.hasil.length
                  : 0}
              </li>
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={restoringSheetModal}
                onClick={() => sheetSync.dismissPendingSheetRestore()}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold dark:border-slate-700"
              >
                Nanti Saja
              </button>
              <button
                type="button"
                disabled={restoringSheetModal}
                onClick={async () => {
                  const pending = sheetSync.pendingSheetRestore;
                  if (!pending) return;
                  setRestoringSheetModal(true);
                  try {
                    const res = await restoreAdminBackup(pending.snapshot);
                    await sheetSync.markSheetConnectedMeta(
                      pending.fileMeta,
                      res.data.sheetSync?.autoSync,
                    );
                    setDb(res.data);
                    setIdentNama(res.data.ident.nama);
                    setIdentSub(res.data.ident.sub);
                    setIdentLogo(res.data.ident.logo);
                    sheetSync.applyRestoredSyncState(res.data.sheetSync);
                    onDbUpdated(res.data.ident);
                    void refreshExtra(true);
                    setSaveState(`Data berhasil dipulihkan dari ${TKA_SPREADSHEET_TITLE}`);
                    window.setTimeout(() => setSaveState(''), 3500);
                  } catch (err) {
                    setSaveState(
                      err instanceof Error ? `Gagal memulihkan: ${err.message}` : 'Gagal memulihkan data.',
                    );
                  } finally {
                    setRestoringSheetModal(false);
                  }
                }}
                className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E40AF] disabled:opacity-50"
              >
                {restoringSheetModal ? 'Memulihkan...' : `Pulihkan dari ${TKA_SPREADSHEET_TITLE}`}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL: Bulk Delete Questions by Subject & Packet */}
      {bulkDeleteSoalModal && (() => {
        const matchingSoal = db.soal.filter((q) => {
          if (bulkDeleteMapel && q.mapel !== bulkDeleteMapel) return false;
          if (bulkDeletePaket && String(q.paket) !== bulkDeletePaket) return false;
          return true;
        });
        const mapelChoices = Array.from(
          new Set([...subjectOptions, ...db.soal.map((q) => q.mapel).filter(Boolean)]),
        );
        return (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-[#131E2D]">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Hapus Soal Secara Menyeluruh
                </h2>
                <button
                  type="button"
                  onClick={() => setBulkDeleteSoalModal(false)}
                  className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Pilih filter mata pelajaran dan paket soal yang ingin dihapus sekaligus dari bank soal.
              </p>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Mata Pelajaran
                  </label>
                  <select
                    value={bulkDeleteMapel}
                    onChange={(e) => setBulkDeleteMapel(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">Semua Mata Pelajaran</option>
                    {mapelChoices.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Paket Soal
                  </label>
                  <select
                    value={bulkDeletePaket}
                    onChange={(e) => setBulkDeletePaket(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">Semua Paket (1–4)</option>
                    {[1, 2, 3, 4].map((p) => (
                      <option key={p} value={String(p)}>
                        Paket {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div
                  className={`rounded-lg border p-3 text-xs ${
                    matchingSoal.length > 0
                      ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300'
                      : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400'
                  }`}
                >
                  {matchingSoal.length > 0 ? (
                    <>
                      Ditemukan <strong className="font-mono-num">{matchingSoal.length}</strong> butir
                      soal untuk{' '}
                      <strong>{bulkDeleteMapel || 'Semua Mata Pelajaran'}</strong> ·{' '}
                      <strong>{bulkDeletePaket ? `Paket ${bulkDeletePaket}` : 'Semua Paket'}</strong>{' '}
                      yang akan dihapus permanen.
                    </>
                  ) : (
                    'Tidak ada butir soal yang cocok dengan filter tersebut.'
                  )}
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBulkDeleteSoalModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold dark:border-slate-700"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={matchingSoal.length === 0}
                  onClick={async () => {
                    const nextSoal = db.soal.filter((q) => {
                      const matchesMapel = !bulkDeleteMapel || q.mapel === bulkDeleteMapel;
                      const matchesPaket = !bulkDeletePaket || String(q.paket) === bulkDeletePaket;
                      return !(matchesMapel && matchesPaket);
                    });
                    await persist({ ...db, soal: nextSoal });
                    setBulkDeleteSoalModal(false);
                  }}
                  className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40"
                >
                  Ya, Hapus {matchingSoal.length} Soal
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>

      {/* MODAL: Pratinjau & Cetak Hasil Ujian */}
      {printHasilModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 p-4 print:static print:bg-white print:p-0">
          <div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white shadow-xl print:max-w-none print:border-0 print:shadow-none dark:border-slate-700 dark:bg-[#131E2D]">
            <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Pratinjau &amp; Cetak Hasil Ujian
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cetak langsung atau unduh dokumen HTML siap cetak jika preview browser membatasi dialog cetak.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    downloadPrintableResultsHtml(
                      filteredHasil,
                      db.ident,
                      filterHasilMapel,
                      filterHasilTopik,
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Download className="h-3.5 w-3.5" />
                  Unduh Dokumen Siap Cetak (.html)
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E40AF]"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Cetak / Simpan PDF
                </button>
                <button
                  type="button"
                  onClick={() => setPrintHasilModal(false)}
                  className="rounded-lg border border-slate-300 p-2 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  aria-label="Tutup"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="print-report-sheet p-6 sm:p-8 text-slate-900 dark:text-slate-100">
              <div className="flex items-center justify-between gap-4 border-b-2 border-slate-900 pb-4 dark:border-slate-600">
                <div className="flex items-center gap-3">
                  <BrandMark logo={db.ident.logo} size="md" />
                  <div>
                    <h3 className="text-lg font-bold tracking-tight">
                      {db.ident.nama || 'TRY OUT'}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {db.ident.sub || 'Laporan Hasil Ujian'}
                    </p>
                  </div>
                </div>
                <div className="text-right text-xs text-slate-600 dark:text-slate-400">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    LAPORAN HASIL UJIAN
                  </p>
                  <p>{new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}</p>
                </div>
              </div>

              <div className="my-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                <span>
                  Filter:{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {filterHasilMapel || 'Semua Mata Pelajaran'}
                  </strong>
                  {filterHasilTopik ? ` · Topik ${filterHasilTopik}` : ''}
                </span>
                <span className="font-mono-num">
                  Peserta: <strong>{filteredHasil.length}</strong> · Rata-rata:{' '}
                  <strong>
                    {filteredHasil.length
                      ? (
                          filteredHasil.reduce((acc, r) => acc + r.nl, 0) / filteredHasil.length
                        ).toFixed(1)
                      : '0'}
                  </strong>
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-y border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      <th className="px-3 py-2.5 font-semibold">#</th>
                      <th className="px-3 py-2.5 font-semibold">Username</th>
                      <th className="px-3 py-2.5 font-semibold">Nama</th>
                      <th className="px-3 py-2.5 font-semibold">Kelas</th>
                      <th className="px-3 py-2.5 font-semibold">Mapel</th>
                      <th className="px-3 py-2.5 font-semibold">Paket</th>
                      <th className="px-3 py-2.5 font-semibold">Benar</th>
                      <th className="px-3 py-2.5 font-semibold">Salah</th>
                      <th className="px-3 py-2.5 font-semibold">Nilai</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredHasil.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                          Belum ada hasil ujian.
                        </td>
                      </tr>
                    ) : (
                      filteredHasil.map((r, i) => (
                        <tr key={r.id || `${r.u}-${r.w}`}>
                          <td className="font-mono-num px-3 py-2">{i + 1}</td>
                          <td className="font-mono-num px-3 py-2 font-semibold">{r.u}</td>
                          <td className="px-3 py-2">{r.n}</td>
                          <td className="px-3 py-2">{r.k || '-'}</td>
                          <td className="px-3 py-2">{r.m}</td>
                          <td className="font-mono-num px-3 py-2">{r.p}</td>
                          <td className="font-mono-num px-3 py-2">{r.bb}</td>
                          <td className="font-mono-num px-3 py-2">{r.tt - r.bb}</td>
                          <td className="font-mono-num px-3 py-2 font-bold text-blue-700 dark:text-blue-400">
                            {r.nl}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
