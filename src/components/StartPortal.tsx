import { ArrowRight, Lock, Moon, Sun } from 'lucide-react';
import type { AppIdent } from '../types';
import { BrandMark } from './BrandMark';

interface StartPortalProps {
  ident: AppIdent;
  subjects: string[];
  jenjang: string;
  jenisMapel: string;
  selectedMapel: string;
  error: string;
  loading: boolean;
  dark: boolean;
  onToggleDark: () => void;
  onChangeJenjang: (v: string) => void;
  onChangeJenisMapel: (v: string) => void;
  onChangeMapel: (v: string) => void;
  onStartStudent: () => void;
  onStartAdmin: () => void;
}

export function StartPortal({
  ident,
  subjects,
  jenjang,
  jenisMapel,
  selectedMapel,
  error,
  loading,
  dark,
  onToggleDark,
  onChangeJenjang,
  onChangeJenisMapel,
  onChangeMapel,
  onStartStudent,
  onStartAdmin,
}: StartPortalProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-[#131E2D]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <BrandMark logo={ident.logo} size="sm" />
            <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
              {ident.nama || 'TRY OUT'}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onToggleDark}
              aria-label={dark ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
              className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onStartAdmin}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 whitespace-nowrap shrink-0 transition-colors"
            >
              <Lock className="h-3.5 w-3.5" />
              Masuk Admin
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 items-center px-6 py-10">
        <section className="flex w-full flex-col justify-center rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-[#131E2D]">
          <div className="flex items-center gap-3 pb-5 border-b border-slate-200 dark:border-slate-800">
            <BrandMark logo={ident.logo} size="md" />
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">Mulai Simulasi</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {ident.sub || 'Pilih jenjang dan mata pelajaran peserta'}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="jenjang-select"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Jenjang Pendidikan
              </label>
              <select
                id="jenjang-select"
                value={jenjang}
                onChange={(e) => onChangeJenjang(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option>SMP/MTs/Sederajat</option>
                <option>SMA/MA/SMK/MAK/Sederajat</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="jenis-select"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Jenis Mata Pelajaran
              </label>
              <select
                id="jenis-select"
                value={jenisMapel}
                onChange={(e) => onChangeJenisMapel(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option>Mata Pelajaran Wajib</option>
                <option>Mata Pelajaran Pilihan</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="mapel-select"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Mata Pelajaran
              </label>
              <select
                id="mapel-select"
                value={selectedMapel}
                onChange={(e) => onChangeMapel(e.target.value)}
                disabled={loading}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">
                  {loading ? 'Memuat mata pelajaran...' : 'Pilih mata pelajaran...'}
                </option>
                {subjects.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {error ? (
              <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
                {error}
              </p>
            ) : subjects.length === 0 && !loading ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Belum ada ujian aktif. Masuk sebagai admin untuk mengaktifkan ujian dan menambah peserta.
              </p>
            ) : null}

            <button
              type="button"
              onClick={onStartStudent}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1E40AF] transition-colors whitespace-nowrap shrink-0"
            >
              Mulai Simulasi
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-[#131E2D] dark:text-slate-400">
        Simulasi internal sekolah · Bukan aplikasi resmi Kemendikdasmen
      </footer>
    </div>
  );
}
