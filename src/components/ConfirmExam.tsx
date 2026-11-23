import { Play } from 'lucide-react';
import type { AppIdent } from '../types';
import { BrandMark } from './BrandMark';

interface ConfirmExamProps {
  ident: AppIdent;
  user: { u: string; n: string };
  mataUjianLabel: string;
  menit: number;
  questionCount: number;
  resuming?: boolean;
  onStart: () => void;
  onBack: () => void;
}

export function ConfirmExam({
  ident,
  user,
  mataUjianLabel,
  menit,
  questionCount,
  resuming,
  onStart,
  onBack,
}: ConfirmExamProps) {
  const now = new Date();
  const z = (n: number) => String(n).padStart(2, '0');
  const waktuTes = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}, ${z(now.getHours())}.${z(now.getMinutes())}`;

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

      <main className="mx-auto flex w-full max-w-lg flex-1 items-center px-6 py-10">
        <section className="w-full rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-[#131E2D]">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Konfirmasi Tes</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Periksa detail tes sebelum waktu hitung mundur dimulai.
          </p>

          <dl className="mt-6 divide-y divide-slate-200 border-y border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
            <div className="flex items-center justify-between py-3 gap-4">
              <dt className="text-slate-500 dark:text-slate-400">Nama Tes</dt>
              <dd className="text-right font-semibold text-slate-900 dark:text-white">{mataUjianLabel}</dd>
            </div>
            <div className="flex items-center justify-between py-3 gap-4">
              <dt className="text-slate-500 dark:text-slate-400">Status Tes</dt>
              <dd className="font-semibold text-slate-900 dark:text-white">
                {resuming ? 'Melanjutkan Tes' : 'Tes Baru'}
              </dd>
            </div>
            <div className="flex items-center justify-between py-3 gap-4">
              <dt className="text-slate-500 dark:text-slate-400">Jumlah Soal</dt>
              <dd className="font-mono-num font-semibold text-slate-900 dark:text-white">
                {questionCount} soal
              </dd>
            </div>
            <div className="flex items-center justify-between py-3 gap-4">
              <dt className="text-slate-500 dark:text-slate-400">Waktu Tes</dt>
              <dd className="font-mono-num font-medium text-slate-900 dark:text-white">{waktuTes}</dd>
            </div>
            <div className="flex items-center justify-between py-3 gap-4">
              <dt className="text-slate-500 dark:text-slate-400">Alokasi Waktu</dt>
              <dd className="font-mono-num font-semibold text-blue-700 dark:text-blue-400">
                {menit} Menit
              </dd>
            </div>
          </dl>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              Kembali
            </button>
            <button
              type="button"
              onClick={onStart}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1E40AF] transition-colors whitespace-nowrap shrink-0"
            >
              <Play className="h-4 w-4" />
              Mulai Tes
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
