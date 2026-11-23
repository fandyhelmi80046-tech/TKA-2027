import { CheckCircle2, RotateCcw } from 'lucide-react';
import type { AppIdent, FinishExamResponse } from '../types';
import { BrandMark } from './BrandMark';

interface ExamResultProps {
  ident: AppIdent;
  user: { u: string; n: string };
  mapel: string;
  result: FinishExamResponse;
  onResetToStart: () => void;
}

export function ExamResult({
  ident,
  user,
  mapel,
  result,
  onResetToStart,
}: ExamResultProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-[#131E2D]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-3">
            <BrandMark logo={ident.logo} size="sm" />
            <span className="text-base font-bold text-slate-900 dark:text-white whitespace-nowrap shrink-0">
              {ident.nama || 'TRY OUT'}
            </span>
          </div>
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {user.u} · {user.n}
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 items-center px-6 py-10">
        <section className="w-full rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-[#131E2D]">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">Tes Selesai</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {mapel} · {user.n}
          </p>

          <div className="my-6 border-y border-slate-200 py-6 dark:border-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Nilai Akhir
            </p>
            <p className="font-mono-num mt-2 text-5xl font-bold text-blue-700 dark:text-blue-400">
              {result.nilai}
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Benar <span className="font-mono-num font-bold">{result.benar}</span> dari{' '}
              <span className="font-mono-num font-bold">{result.tot}</span> soal
            </p>
          </div>

          <button
            type="button"
            onClick={onResetToStart}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1E40AF] transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Kembali ke Halaman Awal
          </button>
        </section>
      </main>
    </div>
  );
}
