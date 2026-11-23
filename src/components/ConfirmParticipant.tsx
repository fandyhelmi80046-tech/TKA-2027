import { useState, type FormEvent } from 'react';
import type { AppIdent, StartExamResponse } from '../types';
import { startExamRequest } from '../api';
import { BrandMark } from './BrandMark';

interface ConfirmParticipantProps {
  ident: AppIdent;
  user: { u: string; n: string; g?: string; k?: string };
  mataUjianLabel: string;
  onSuccess: (payload: StartExamResponse) => void;
  onLogout: () => void;
}

const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export function ConfirmParticipant({
  ident,
  user,
  mataUjianLabel,
  onSuccess,
  onLogout,
}: ConfirmParticipantProps) {
  const [confirmName, setConfirmName] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!confirmName.trim() || !day || !month || !year) {
      setError('Nama peserta dan tanggal lahir wajib diisi.');
      return;
    }
    if (!token.trim()) {
      setError('Token ujian wajib diisi.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = await startExamRequest(token.trim());
      onSuccess(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memeriksa token.');
    } finally {
      setSubmitting(false);
    }
  }

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
          <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
            <span className="font-medium">
              {user.u} · {user.n}
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              Keluar
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 items-center px-6 py-10">
        <div className="grid w-full gap-6 md:grid-cols-12 items-start">
          <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#131E2D] md:col-span-5">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Data Terdaftar</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Pastikan data peserta berikut sesuai dengan kartu ujian Anda.
            </p>
            <dl className="mt-5 space-y-3 text-sm border-t border-slate-200 pt-4 dark:border-slate-800">
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Username</dt>
                <dd className="font-mono-num font-semibold text-slate-900 dark:text-white">{user.u}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Nama Peserta</dt>
                <dd className="font-semibold text-slate-900 dark:text-white">{user.n}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Kelas</dt>
                <dd className="font-medium text-slate-800 dark:text-slate-200">{user.k || '-'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Jenis Kelamin</dt>
                <dd className="font-medium text-slate-800 dark:text-slate-200">{user.g || '-'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Mata Ujian</dt>
                <dd className="font-semibold text-blue-700 dark:text-blue-400">{mataUjianLabel}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#131E2D] md:col-span-7">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Konfirmasi Data Peserta</h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Lengkapi konfirmasi identitas dan masukkan token ujian dari proktor.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="confirm-name"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Ketikkan Nama Peserta
                </label>
                <input
                  id="confirm-name"
                  type="text"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder="Ketikkan Nama Peserta"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Tanggal Lahir
                </label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  <select
                    aria-label="Hari"
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">Hari</option>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={String(d)}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Bulan"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">Bulan</option>
                    {MONTHS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Tahun"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">Tahun</option>
                    {Array.from({ length: 20 }, (_, i) => 2016 - i).map((y) => (
                      <option key={y} value={String(y)}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="exam-token"
                  className="block text-xs font-semibold text-blue-700 dark:text-blue-400"
                >
                  Token Ujian
                </label>
                <input
                  id="exam-token"
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value.toUpperCase())}
                  autoComplete="off"
                  placeholder="Ketikkan token di sini"
                  className="font-mono-num mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm tracking-widest uppercase text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              {error && (
                <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-[#1D4ED8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1E40AF] disabled:opacity-60 transition-colors"
              >
                {submitting ? 'Memverifikasi Token...' : 'Submit'}
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
