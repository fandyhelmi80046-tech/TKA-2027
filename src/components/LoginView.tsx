import { useState, type FormEvent } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import type { AppIdent, LoginResponse } from '../types';
import { bootstrapAdmin, loginRequest } from '../api';
import { BrandMark } from './BrandMark';

interface LoginViewProps {
  ident: AppIdent;
  targetRole: 'siswa' | 'admin';
  selectedMapel: string;
  adminSetupRequired: boolean;
  adminPasscodeManagedByEnv: boolean;
  onSuccess: (resp: LoginResponse) => void;
  onBack: () => void;
}

export function LoginView({
  ident,
  targetRole,
  selectedMapel,
  adminSetupRequired,
  adminPasscodeManagedByEnv,
  onSuccess,
  onBack,
}: LoginViewProps) {
  const [username, setUsername] = useState(targetRole === 'admin' ? 'admin' : '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [adminName, setAdminName] = useState('Administrator');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isBootstrapMode = targetRole === 'admin' && adminSetupRequired && !adminPasscodeManagedByEnv;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (isBootstrapMode) {
      if (password.length < 6) {
        setError('Kata sandi admin minimal 6 karakter.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Konfirmasi kata sandi tidak sama.');
        return;
      }
      setSubmitting(true);
      try {
        const res = await bootstrapAdmin(password, adminName.trim() || 'Administrator');
        onSuccess(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Gagal mengatur kata sandi admin.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!username.trim() || !password) {
      setError('Username dan kata sandi wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await loginRequest(username.trim(), password, selectedMapel);
      onSuccess(res);
    } catch (err) {
      const e = err as Error & { back?: boolean };
      setError(e.message || 'Gagal masuk.');
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
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Kembali
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 items-center px-6 py-10">
        <div className="w-full rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-[#131E2D]">
          {isBootstrapMode ? (
            <>
              <div className="flex items-center gap-2.5 text-blue-700 dark:text-blue-400">
                <ShieldCheck className="h-5 w-5" />
                <span className="text-xs font-semibold">Pengaturan Awal Admin</span>
              </div>
              <h1 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
                Buat Kata Sandi Admin
              </h1>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Akun administrator (<span className="font-mono-num font-semibold">admin</span>) belum memiliki
                kata sandi. Buat kata sandi pertama Anda untuk mengelola bank soal, sesi, dan peserta.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Nama Administrator
                  </label>
                  <input
                    type="text"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Kata Sandi Baru (min. 6 karakter)
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      placeholder="Masukkan kata sandi admin"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 pr-10 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label="Tampilkan sandi"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Ulangi Kata Sandi
                  </label>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Ketik ulang kata sandi"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1E40AF] disabled:opacity-60 transition-colors"
                >
                  <KeyRound className="h-4 w-4" />
                  {submitting ? 'Menyimpan...' : 'Simpan & Masuk Panel Admin'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                  {targetRole === 'admin' ? 'Panel Pengelola' : `Mata Pelajaran: ${selectedMapel}`}
                </p>
                <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                  {targetRole === 'admin' ? 'Masuk Administrator' : 'Selamat Datang Peserta'}
                </h1>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Silakan login menggunakan username dan kata sandi yang Anda miliki.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label
                    htmlFor="login-username"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Username
                  </label>
                  <input
                    id="login-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    autoFocus
                    placeholder={targetRole === 'admin' ? 'admin' : 'Nomor peserta'}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Password
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      id="login-password"
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      placeholder="Kata sandi"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 pr-10 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label="Tampilkan sandi"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
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
                  {submitting ? 'Memeriksa...' : 'Login'}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
