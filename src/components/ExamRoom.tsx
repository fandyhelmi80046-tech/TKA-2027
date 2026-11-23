import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Grid,
  Info,
  Maximize2,
  ShieldAlert,
  X,
} from 'lucide-react';
import type { AppIdent, FinishExamResponse, StudentQuestion } from '../types';
import { finishExamRequest, saveExamProgress } from '../api';
import { BrandMark } from './BrandMark';

interface ExamRoomProps {
  ident: AppIdent;
  user: { u: string; n: string };
  mataUjianLabel: string;
  questions: StudentQuestion[];
  initialSeconds: number;
  initialAns?: number[];
  initialFlg?: boolean[];
  initialCur?: number;
  fullscreenSupported: boolean;
  onFinished: (res: FinishExamResponse) => void;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

function formatHMS(sec: number): string {
  const s = Math.max(0, sec);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${z(Math.floor(s / 3600))}:${z(Math.floor((s % 3600) / 60))}:${z(s % 60)}`;
}

export function ExamRoom({
  ident,
  user,
  mataUjianLabel,
  questions,
  initialSeconds,
  initialAns,
  initialFlg,
  initialCur,
  fullscreenSupported,
  onFinished,
}: ExamRoomProps) {
  const [cur, setCur] = useState(initialCur ?? 0);
  const [ans, setAns] = useState<number[]>(
    () => initialAns ?? Array.from({ length: questions.length }, () => -1),
  );
  const [flg, setFlg] = useState<boolean[]>(
    () => initialFlg ?? Array.from({ length: questions.length }, () => false),
  );
  const [left, setLeft] = useState(initialSeconds);
  const [fontSize, setFontSize] = useState<14 | 16 | 18>(16);
  const [showGridModal, setShowGridModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showConfirmFinish, setShowConfirmFinish] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const [lockReason, setLockReason] = useState<'fullscreen' | 'tab' | null>(() =>
    fullscreenSupported && !document.fullscreenElement ? 'fullscreen' : null,
  );
  const [leaveCount, setLeaveCount] = useState(0);

  const stateRef = useRef({ ans, flg, cur, left });
  stateRef.current = { ans, flg, cur, left };
  const finishedRef = useRef(false);
  const lastSyncRef = useRef(0);
  const hadFullscreenRef = useRef(Boolean(document.fullscreenElement));
  const lockReasonRef = useRef(lockReason);
  lockReasonRef.current = lockReason;

  async function doSync(force = false, st: 'Mengerjakan' | 'Selesai' = 'Mengerjakan') {
    const now = Date.now();
    if (!force && now - lastSyncRef.current < 8000) return;
    lastSyncRef.current = now;
    const snap = stateRef.current;
    try {
      await saveExamProgress({
        ans: snap.ans,
        flg: snap.flg,
        cur: snap.cur,
        left: snap.left,
        st,
      });
    } catch {
      // Non-fatal periodic sync failure; next sync or finish will retry
    }
  }

  async function handleFinish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await finishExamRequest(stateRef.current.ans);
      onFinished(res);
    } catch (err) {
      finishedRef.current = false;
      setSubmitting(false);
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Gagal mengirim jawaban. Periksa koneksi lalu coba lagi.',
      );
    }
  }

  // Countdown timer
  useEffect(() => {
    const id = window.setInterval(() => {
      setLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          void handleFinish();
          return 0;
        }
        if (prev % 8 === 0) {
          void doSync(false);
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync on question navigation / answer selection (throttled)
  useEffect(() => {
    void doSync(false);
  }, [cur, ans, flg]);

  // Fullscreen & anti-leave exam enforcement
  useEffect(() => {
    const triggerLock = (reason: 'fullscreen' | 'tab') => {
      if (finishedRef.current) return;
      if (!lockReasonRef.current) {
        setLeaveCount((c) => c + 1);
      }
      setLockReason(reason);
    };

    const onFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      if (active) {
        hadFullscreenRef.current = true;
        setLockReason((prev) => (prev === 'fullscreen' ? null : prev));
      } else if (fullscreenSupported || hadFullscreenRef.current) {
        triggerLock('fullscreen');
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        triggerLock('tab');
      }
    };

    const onBlur = () => {
      triggerLock('tab');
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!finishedRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onClipboard = (e: ClipboardEvent) => {
      e.preventDefault();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (
        e.key === 'F12' ||
        ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'u', 's', 'p'].includes(key)) ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c'].includes(key))
      ) {
        e.preventDefault();
      }
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('copy', onClipboard);
    document.addEventListener('cut', onClipboard);
    document.addEventListener('paste', onClipboard);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('copy', onClipboard);
      document.removeEventListener('cut', onClipboard);
      document.removeEventListener('paste', onClipboard);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [fullscreenSupported]);

  async function handleResumeFullscreen() {
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
        hadFullscreenRef.current = true;
        setIsFullscreen(true);
        setLockReason(null);
        return;
      } catch {
        if (!fullscreenSupported && !hadFullscreenRef.current) {
          setLockReason(null);
        }
        return;
      }
    }
    setLockReason(null);
  }

  const q = questions[cur];
  const answeredCount = ans.filter((a) => a >= 0).length;
  const flaggedCount = flg.filter(Boolean).length;
  const unansweredCount = questions.length - answeredCount;
  const isLast = cur === questions.length - 1;
  const isTimeLow = left <= 300;

  if (!q) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-[#131E2D]">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Soal belum tersedia untuk paket ujian ini.
          </p>
        </div>
      </div>
    );
  }

  function selectOption(optIdx: number) {
    setAns((prev) => {
      const next = prev.slice();
      next[cur] = optIdx;
      return next;
    });
  }

  function toggleFlag() {
    setFlg((prev) => {
      const next = prev.slice();
      next[cur] = !next[cur];
      return next;
    });
  }

  return (
    <div className="min-h-screen flex flex-col select-none">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-[#131E2D]">
        <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-6 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <BrandMark logo={ident.logo} size="sm" />
            <span className="text-sm font-bold text-slate-900 dark:text-white whitespace-nowrap shrink-0">
              {ident.nama || 'TRY OUT'}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 truncate">
            <span>{mataUjianLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num">
              {answeredCount}/{questions.length} terjawab
            </span>
          </div>

          <div className="text-right text-xs text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0">
            <span className="font-semibold">{user.n}</span>
            <span className="mx-1.5 text-slate-400" aria-hidden="true">
              ·
            </span>
            <span className="font-mono-num text-slate-500 dark:text-slate-400">{user.u}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1360px] flex-1 flex-col px-4 py-5 sm:px-6">
        {/* Toolbar row */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-[#131E2D]">
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-base font-bold text-slate-900 dark:text-white whitespace-nowrap">
              Soal nomor <span className="font-mono-num">{cur + 1}</span>
              <span className="ml-1.5 text-xs font-normal text-slate-500 dark:text-slate-400">
                dari {questions.length}
              </span>
            </h1>

            <div className="flex items-center gap-1 border-l border-slate-200 pl-4 dark:border-slate-700">
              <span className="mr-1 text-xs text-slate-500 dark:text-slate-400">Teks:</span>
              {([
                [14, 'Kecil'],
                [16, 'Normal'],
                [18, 'Besar'],
              ] as const).map(([sz, label]) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setFontSize(sz)}
                  className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                    fontSize === sz
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowInfoModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Info className="h-3.5 w-3.5" />
              Informasi Soal
            </button>

            <div
              role="timer"
              aria-live="off"
              className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0 ${
                isTimeLow
                  ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
                  : 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100'
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>Sisa Waktu</span>
              <span className="font-mono-num text-sm font-bold">{formatHMS(left)}</span>
            </div>

            {!isFullscreen && document.fullscreenEnabled && (
              <button
                type="button"
                onClick={() => void handleResumeFullscreen()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300 whitespace-nowrap shrink-0"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Layar Penuh
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowGridModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1E40AF] whitespace-nowrap shrink-0 lg:hidden"
            >
              <Grid className="h-3.5 w-3.5" />
              Daftar Soal
            </button>
          </div>
        </div>

        {/* Main 2-Zone Stage */}
        <div className="mt-4 grid flex-1 items-start gap-5 lg:grid-cols-12">
          {/* Left / Main Question Stage */}
          <section className="flex flex-col rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#131E2D] lg:col-span-9">
            <div
              style={{ fontSize: `${fontSize}px` }}
              className={`grid flex-1 gap-6 p-6 ${q.s ? 'md:grid-cols-2' : 'grid-cols-1'}`}
            >
              {q.s ? (
                <div className="max-h-[460px] overflow-y-auto border-b border-slate-200 pb-5 md:border-b-0 md:border-r md:pb-0 md:pr-6 dark:border-slate-800">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Teks Bacaan / Stimulus
                  </h2>
                  <div className="mt-3 space-y-3 leading-relaxed text-slate-800 dark:text-slate-200">
                    {q.s
                      .split('\n')
                      .filter(Boolean)
                      .map((para, idx) => (
                        <p key={idx}>{para}</p>
                      ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col">
                <p className="max-w-[70ch] leading-relaxed font-medium text-slate-900 dark:text-slate-100">
                  {q.t}
                </p>

                <div className="mt-5 space-y-2.5" role="radiogroup" aria-label={`Pilihan soal ${cur + 1}`}>
                  {q.o.map((optText, idx) => {
                    const selected = ans[cur] === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => selectOption(idx)}
                        className={`flex w-full items-start gap-3.5 rounded-lg border px-4 py-3 text-left transition-colors ${
                          selected
                            ? 'border-blue-600 bg-blue-50/80 text-slate-900 dark:border-blue-500 dark:bg-blue-950/40 dark:text-white'
                            : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <span
                          className={`font-mono-num mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-bold ${
                            selected
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {OPTION_LETTERS[idx]}
                        </span>
                        <span className="leading-relaxed">{optText}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
              <button
                type="button"
                disabled={cur === 0}
                onClick={() => setCur((c) => Math.max(0, c - 1))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
              >
                <ChevronLeft className="h-4 w-4" />
                Soal Sebelumnya
              </button>

              <button
                type="button"
                onClick={toggleFlag}
                aria-pressed={flg[cur]}
                className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  flg[cur]
                    ? 'border-amber-500 bg-amber-400 text-slate-950'
                    : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200'
                }`}
              >
                <Flag className="h-3.5 w-3.5" />
                {flg[cur] ? 'Ditandai Ragu-ragu' : 'Ragu-ragu'}
              </button>

              {isLast ? (
                <button
                  type="button"
                  onClick={() => setShowConfirmFinish(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Selesai Tes
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCur((c) => Math.min(questions.length - 1, c + 1))}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#1E40AF] whitespace-nowrap shrink-0"
                >
                  Soal Berikutnya
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </section>

          {/* Right Deck: Question Navigator (desktop) */}
          <aside className="hidden lg:flex flex-col rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#131E2D] lg:col-span-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Daftar Soal</h2>
              <span className="font-mono-num text-xs text-slate-500 dark:text-slate-400">
                {answeredCount}/{questions.length}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-5 gap-2">
              {questions.map((_, idx) => {
                const isCur = idx === cur;
                const isFlagged = flg[idx];
                const isAnswered = ans[idx] >= 0;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCur(idx)}
                    aria-label={`Soal ${idx + 1}`}
                    className={`font-mono-num aspect-square rounded-lg border text-xs font-bold transition-colors ${
                      isFlagged
                        ? 'border-amber-500 bg-amber-400 text-slate-950'
                        : isAnswered
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    } ${isCur ? 'ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-[#131E2D]' : ''}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 space-y-2 border-t border-slate-200 pt-4 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded bg-blue-600" /> Terjawab
                </span>
                <span className="font-mono-num font-semibold">{answeredCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded bg-amber-400" /> Ragu-ragu
                </span>
                <span className="font-mono-num font-semibold">{flaggedCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded border border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800" />{' '}
                  Belum dijawab
                </span>
                <span className="font-mono-num font-semibold">{unansweredCount}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowConfirmFinish(true)}
              className="mt-5 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
            >
              Selesai Ujian
            </button>
          </aside>
        </div>
      </main>

      {/* Mobile Question Grid Modal */}
      {showGridModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-[#131E2D]">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Daftar Soal</h2>
              <button
                type="button"
                onClick={() => setShowGridModal(false)}
                aria-label="Tutup daftar soal"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-5 gap-2">
              {questions.map((_, idx) => {
                const isCur = idx === cur;
                const isFlagged = flg[idx];
                const isAnswered = ans[idx] >= 0;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setCur(idx);
                      setShowGridModal(false);
                    }}
                    className={`font-mono-num aspect-square rounded-lg border text-xs font-bold ${
                      isFlagged
                        ? 'border-amber-500 bg-amber-400 text-slate-950'
                        : isAnswered
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    } ${isCur ? 'ring-2 ring-slate-900 ring-offset-2 dark:ring-white' : ''}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowGridModal(false);
                  setShowConfirmFinish(true);
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white"
              >
                Selesai Tes
              </button>
              <button
                type="button"
                onClick={() => setShowGridModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-[#131E2D]">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Informasi Soal</h2>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Jumlah soal</dt>
                <dd className="font-mono-num font-bold">{questions.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Terjawab</dt>
                <dd className="font-mono-num font-bold text-blue-600 dark:text-blue-400">{answeredCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Belum dijawab</dt>
                <dd className="font-mono-num font-bold">{unansweredCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500 dark:text-slate-400">Ragu-ragu</dt>
                <dd className="font-mono-num font-bold text-amber-600 dark:text-amber-400">{flaggedCount}</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => setShowInfoModal(false)}
              className="mt-5 w-full rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Confirm Finish Modal */}
      {showConfirmFinish && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-[#131E2D]">
            <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Konfirmasi Tes</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {unansweredCount > 0
                ? `Masih ada ${unansweredCount} soal yang belum dijawab. `
                : 'Semua soal telah dijawab. '}
              {flaggedCount > 0 ? `Terdapat ${flaggedCount} soal masih ditandai ragu-ragu. ` : ''}
              Setelah menekan <strong>Selesai Tes</strong>, jawaban akan dikumpulkan dan tidak dapat diubah lagi.
            </p>
            {submitError && (
              <p role="alert" className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">
                {submitError}
              </p>
            )}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowConfirmFinish(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Kembali ke Tes
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleFinish()}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {submitting ? 'Mengirim Jawaban...' : 'Selesai Tes'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Fullscreen & Anti-Leave Lock Overlay */}
      {lockReason && !submitting && (
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
              {lockReason === 'fullscreen'
                ? 'Mode Layar Penuh Wajib Aktif'
                : 'Terdeteksi Meninggalkan Layar Ujian'}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Selama simulasi berlangsung, peserta tidak diperkenankan keluar dari mode layar penuh
              atau berpindah ke tab maupun aplikasi lain.
            </p>
            <p className="mt-3 font-mono-num text-xs font-semibold text-red-600 dark:text-red-400">
              Catatan keluar layar: {leaveCount} kali
            </p>
            <button
              type="button"
              onClick={() => void handleResumeFullscreen()}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1E40AF] transition-colors"
            >
              <Maximize2 className="h-4 w-4" />
              Aktifkan Layar Penuh &amp; Lanjutkan Tes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
