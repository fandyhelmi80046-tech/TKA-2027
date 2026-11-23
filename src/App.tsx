import { useCallback, useEffect, useState } from 'react';
import { Maximize2, ShieldAlert } from 'lucide-react';
import { getAdminData, getPublicConfig, clearAuthToken, setAuthToken } from './api';
import { AdminDashboard } from './components/AdminDashboard';
import { ConfirmExam } from './components/ConfirmExam';
import { ConfirmParticipant } from './components/ConfirmParticipant';
import { ExamResult } from './components/ExamResult';
import { ExamRoom } from './components/ExamRoom';
import { LoginView } from './components/LoginView';
import { StartPortal } from './components/StartPortal';
import { appendStudentResultToTka2027 } from './utils/googleSheets';
import { getGoogleWorkspaceToken } from './utils/googleWorkspace';
import type {
  AdminDatabase,
  AppIdent,
  FinishExamResponse,
  LoginResponse,
  StartExamResponse,
} from './types';

type AppView =
  | 'start'
  | 'login'
  | 'confirm-participant'
  | 'confirm-exam'
  | 'exam'
  | 'result'
  | 'admin';

const DEFAULT_IDENT: AppIdent = {
  nama: 'TRY OUT',
  sub: 'Aplikasi Simulasi TKA',
  logo: '',
};

function enterFullscreen(): Promise<boolean> {
  const el = document.documentElement;
  if (!el.requestFullscreen) return Promise.resolve(false);
  return el
    .requestFullscreen()
    .then(() => true)
    .catch(() => false);
}

function exitFullscreen(): void {
  if (document.fullscreenElement && document.exitFullscreen) {
    void document.exitFullscreen().catch(() => {});
  }
}

export default function App() {
  const [view, setView] = useState<AppView>('start');
  const [dark, setDark] = useState(false);
  const [fsSupported, setFsSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));

  // Public portal config
  const [ident, setIdent] = useState<AppIdent>(DEFAULT_IDENT);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [adminSetupRequired, setAdminSetupRequired] = useState(false);
  const [adminPasscodeManagedByEnv, setAdminPasscodeManagedByEnv] = useState(false);
  const [autoSyncSheet, setAutoSyncSheet] = useState(false);
  const [sheetId, setSheetId] = useState('');
  const [publicLoading, setPublicLoading] = useState(true);

  // Start portal selection
  const [jenjang, setJenjang] = useState('SMP/MTs/Sederajat');
  const [jenisMapel, setJenisMapel] = useState('Mata Pelajaran Wajib');
  const [selectedMapel, setSelectedMapel] = useState('');
  const [startError, setStartError] = useState('');

  // Auth / session state
  const [targetRole, setTargetRole] = useState<'siswa' | 'admin'>('siswa');
  const [studentUser, setStudentUser] = useState<{
    u: string;
    n: string;
    g?: string;
    k?: string;
  } | null>(null);
  const [activeExamInfo, setActiveExamInfo] = useState<{
    id: string;
    paket: number;
    menit: number;
    mapel: string;
    resuming?: boolean;
  } | null>(null);
  const [examPayload, setExamPayload] = useState<StartExamResponse | null>(null);
  const [examResult, setExamResult] = useState<FinishExamResponse | null>(null);

  // Admin state
  const [adminUser, setAdminUser] = useState<{ u: string; n: string } | null>(null);
  const [adminDb, setAdminDb] = useState<AdminDatabase | null>(null);
  const [loadingAdmin, setLoadingAdmin] = useState(false);

  const loadPublic = useCallback(async () => {
    setPublicLoading(true);
    try {
      const cfg = await getPublicConfig();
      setIdent(cfg.ident);
      setSubjects(cfg.mapel);
      setAdminSetupRequired(cfg.adminSetupRequired);
      setAdminPasscodeManagedByEnv(cfg.adminPasscodeManagedByEnv);
      setAutoSyncSheet(Boolean(cfg.autoSyncSheet));
      setSheetId(cfg.sheetId || '');
      setSelectedMapel((prev) => (prev && cfg.mapel.includes(prev) ? prev : ''));
    } catch {
      // Keep defaults if initial fetch transiently fails
    } finally {
      setPublicLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPublic();
  }, [loadPublic]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  useEffect(() => {
    const syncFs = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      if (active) setFsSupported(true);
    };
    document.addEventListener('fullscreenchange', syncFs);
    return () => document.removeEventListener('fullscreenchange', syncFs);
  }, []);

  const handleToggleDark = () => setDark((d) => !d);

  const handleStartStudent = () => {
    if (!selectedMapel) {
      setStartError('Silakan pilih mata pelajaran terlebih dahulu.');
      return;
    }
    setStartError('');
    void enterFullscreen().then((ok) => {
      if (ok) {
        setFsSupported(true);
        setIsFullscreen(true);
      }
    });
    setTargetRole('siswa');
    setView('login');
  };

  const handleStartAdmin = () => {
    setStartError('');
    setTargetRole('admin');
    setView('login');
  };

  const handleResetToStart = useCallback(() => {
    exitFullscreen();
    setFsSupported(false);
    clearAuthToken();
    setStudentUser(null);
    setActiveExamInfo(null);
    setExamPayload(null);
    setExamResult(null);
    setAdminUser(null);
    setAdminDb(null);
    setStartError('');
    setView('start');
    void loadPublic();
  }, [loadPublic]);

  const handleLoginSuccess = async (resp: LoginResponse) => {
    setAuthToken(resp.token);

    if (resp.role === 'admin') {
      setLoadingAdmin(true);
      try {
        const db = await getAdminData();
        setAdminUser({ u: resp.user.u, n: resp.user.n });
        setAdminDb(db);
        setIdent(db.ident);
        setAdminSetupRequired(false);
        setView('admin');
      } catch {
        clearAuthToken();
        setStartError('Gagal memuat data panel admin. Silakan coba masuk kembali.');
        setView('start');
      } finally {
        setLoadingAdmin(false);
      }
      return;
    }

    setStudentUser(resp.user);
    setActiveExamInfo(resp.ujian ?? null);
    setView('confirm-participant');
  };

  const mataUjianLabel = activeExamInfo
    ? `${activeExamInfo.mapel} · Paket ${activeExamInfo.paket}`
    : selectedMapel;

  if (loadingAdmin) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#F4F6F9] dark:bg-[#0B1220] p-6">
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-4 text-sm font-medium text-slate-700 dark:border-slate-800 dark:bg-[#131E2D] dark:text-slate-200">
          Memuat panel admin...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9] text-slate-900 dark:bg-[#0B1220] dark:text-slate-100">
      {view === 'start' && (
        <StartPortal
          ident={ident}
          subjects={subjects}
          jenjang={jenjang}
          jenisMapel={jenisMapel}
          selectedMapel={selectedMapel}
          error={startError}
          loading={publicLoading}
          dark={dark}
          onToggleDark={handleToggleDark}
          onChangeJenjang={setJenjang}
          onChangeJenisMapel={setJenisMapel}
          onChangeMapel={(m) => {
            setSelectedMapel(m);
            if (startError) setStartError('');
          }}
          onStartStudent={handleStartStudent}
          onStartAdmin={handleStartAdmin}
        />
      )}

      {view === 'login' && (
        <LoginView
          ident={ident}
          targetRole={targetRole}
          selectedMapel={selectedMapel}
          adminSetupRequired={adminSetupRequired}
          adminPasscodeManagedByEnv={adminPasscodeManagedByEnv}
          onSuccess={(resp) => void handleLoginSuccess(resp)}
          onBack={() => {
            exitFullscreen();
            setFsSupported(false);
            setView('start');
          }}
        />
      )}

      {view === 'confirm-participant' && studentUser && (
        <ConfirmParticipant
          ident={ident}
          user={studentUser}
          mataUjianLabel={mataUjianLabel}
          onSuccess={(payload) => {
            setExamPayload(payload);
            setView('confirm-exam');
          }}
          onLogout={handleResetToStart}
        />
      )}

      {view === 'confirm-exam' && studentUser && examPayload && activeExamInfo && (
        <ConfirmExam
          ident={ident}
          user={studentUser}
          mataUjianLabel={mataUjianLabel}
          menit={activeExamInfo.menit}
          questionCount={examPayload.qs.length}
          resuming={activeExamInfo.resuming}
          onStart={() => {
            if (!document.fullscreenElement) {
              void enterFullscreen().then((ok) => {
                if (ok) {
                  setFsSupported(true);
                  setIsFullscreen(true);
                }
              });
            }
            setView('exam');
          }}
          onBack={() => setView('confirm-participant')}
        />
      )}

      {view === 'exam' && studentUser && examPayload && activeExamInfo && (
        <ExamRoom
          ident={ident}
          user={studentUser}
          mataUjianLabel={mataUjianLabel}
          questions={examPayload.qs}
          initialSeconds={examPayload.sisa}
          initialAns={examPayload.ans}
          initialFlg={examPayload.flg}
          initialCur={examPayload.cur}
          fullscreenSupported={fsSupported}
          onFinished={(res) => {
            exitFullscreen();
            setFsSupported(false);
            setExamResult(res);
            setView('result');
            if (autoSyncSheet && res.resultRow && getGoogleWorkspaceToken()) {
              void appendStudentResultToTka2027(res.resultRow, sheetId).catch(() => {});
            }
          }}
        />
      )}

      {view === 'result' && studentUser && examResult && activeExamInfo && (
        <ExamResult
          ident={ident}
          user={studentUser}
          mapel={mataUjianLabel}
          result={examResult}
          onResetToStart={handleResetToStart}
        />
      )}

      {view === 'admin' && adminUser && adminDb && (
        <AdminDashboard
          initialDb={adminDb}
          adminUser={adminUser}
          dark={dark}
          onToggleDark={handleToggleDark}
          onDbUpdated={(nextIdent) => setIdent(nextIdent)}
          onLogout={handleResetToStart}
        />
      )}

      {/* Pre-exam student fullscreen lock overlay */}
      {fsSupported &&
        !isFullscreen &&
        ((view === 'login' && targetRole === 'siswa') ||
          view === 'confirm-participant' ||
          view === 'confirm-exam') && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/95 backdrop-blur-md p-6"
          >
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-7 text-center shadow-2xl dark:border-slate-700 dark:bg-[#131E2D]">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">
                Mode Layar Penuh Diperlukan
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Simulasi mewajibkan mode layar penuh aktif selama sesi peserta berlangsung agar
                peserta tidak keluar dari aplikasi ujian.
              </p>
              <div className="mt-5 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => void enterFullscreen()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1E40AF] transition-colors"
                >
                  <Maximize2 className="h-4 w-4" />
                  Aktifkan Layar Penuh
                </button>
                <button
                  type="button"
                  onClick={handleResetToStart}
                  className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 px-5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Batalkan &amp; Kembali ke Halaman Awal
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
