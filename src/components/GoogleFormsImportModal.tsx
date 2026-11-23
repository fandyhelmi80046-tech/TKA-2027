import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { CheckSquare, ExternalLink, FileText, Loader2, LogOut, X } from 'lucide-react';
import type { QuestionItem } from '../types';
import {
  fetchAndParseGoogleForm,
  getGoogleFormsToken,
  initGoogleFormsAuth,
  signInGoogleForms,
  signOutGoogleForms,
  type GoogleFormImportPreview,
  type ImportedGoogleFormQuestion,
} from '../utils/googleForms';

interface GoogleFormsImportModalProps {
  subjectOptions: string[];
  defaultMapel: string;
  defaultPaket: number;
  onClose: () => void;
  onImportQuestions: (questions: QuestionItem[]) => Promise<void>;
}

const uid = () => Math.random().toString(36).slice(2, 9);

export function GoogleFormsImportModal({
  subjectOptions,
  defaultMapel,
  defaultPaket,
  onClose,
  onImportQuestions,
}: GoogleFormsImportModalProps) {
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState(() => !getGoogleFormsToken());
  const [signingIn, setSigningIn] = useState(false);

  const [formInput, setFormInput] = useState('');
  const [mapel, setMapel] = useState(() =>
    defaultMapel && subjectOptions.includes(defaultMapel) ? defaultMapel : '',
  );
  const [isCustomMapel, setIsCustomMapel] = useState(false);
  const [topik, setTopik] = useState('');
  const [paket, setPaket] = useState(defaultPaket || 1);
  const [includeStimulus, setIncludeStimulus] = useState(true);

  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<GoogleFormImportPreview | null>(null);
  const [items, setItems] = useState<ImportedGoogleFormQuestion[]>([]);

  useEffect(() => {
    const unsub = initGoogleFormsAuth(
      (user, token) => {
        setGoogleUser(user);
        setNeedsAuth(!token);
      },
      () => {
        setGoogleUser(null);
        setNeedsAuth(true);
      },
    );
    return unsub;
  }, []);

  async function handleGoogleSignIn() {
    setError('');
    setSigningIn(true);
    try {
      const res = await signInGoogleForms();
      setGoogleUser(res.user);
      setNeedsAuth(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Gagal masuk dengan akun Google. Pastikan jendela pop-up diizinkan.',
      );
    } finally {
      setSigningIn(false);
    }
  }

  async function handleGoogleSignOut() {
    await signOutGoogleForms();
    setGoogleUser(null);
    setNeedsAuth(true);
    setPreview(null);
    setItems([]);
  }

  async function handleFetchForm() {
    setError('');
    if (!formInput.trim()) {
      setError('Masukkan tautan editor atau ID Google Formulir terlebih dahulu.');
      return;
    }
    setFetching(true);
    try {
      const res = await fetchAndParseGoogleForm(formInput, includeStimulus);
      setPreview(res);
      setItems(res.questions);
      if (!topik.trim() && res.title) {
        setTopik(res.title);
      }
      if (res.questions.length === 0) {
        setError(
          'Tidak ditemukan soal pilihan ganda 4 opsi (A–D) yang valid pada formulir tersebut.',
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengambil data Google Formulir.';
      if (msg === 'AUTH_REQUIRED') {
        setNeedsAuth(true);
        setError('Sesi Google berakhir. Silakan hubungkan kembali akun Google Anda.');
      } else {
        setError(msg);
      }
    } finally {
      setFetching(false);
    }
  }

  const selectedItems = items.filter((it) => it.selected);
  const missingKeysCount = selectedItems.filter((it) => it.a < 0 || it.a > 3).length;

  async function handleSaveImported() {
    setError('');
    if (!mapel.trim()) {
      setError('Mata pelajaran wajib diisi sebelum menyimpan.');
      return;
    }
    if (selectedItems.length === 0) {
      setError('Pilih minimal 1 soal untuk diimpor.');
      return;
    }
    if (missingKeysCount > 0) {
      setError(
        `Masih ada ${missingKeysCount} soal terpilih yang belum memiliki kunci jawaban (A/B/C/D).`,
      );
      return;
    }

    setSaving(true);
    try {
      const toAdd: QuestionItem[] = selectedItems.map((q) => ({
        id: uid(),
        mapel: mapel.trim(),
        topik: topik.trim() || preview?.title || '-',
        paket,
        s: q.s,
        t: q.t,
        o: q.o,
        a: q.a,
      }));
      await onImportQuestions(toAdd);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan soal impor.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 overflow-y-auto">
      <div className="my-6 w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-[#131E2D]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Impor Soal dari Google Formulir
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Ambil soal pilihan ganda 4 opsi beserta kunci jawaban kuis langsung dari Google Forms.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal impor Google Formulir"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Google Account Sign-In / Connected State */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
          {needsAuth ? (
            <>
              <div className="text-xs text-slate-600 dark:text-slate-300">
                Hubungkan akun Google Anda untuk membaca soal dari Google Formulir yang Anda miliki
                atau dibagikan ke Anda.
              </div>
              <button
                type="button"
                disabled={signingIn}
                onClick={() => void handleGoogleSignIn()}
                className="inline-flex items-center gap-2.5 rounded-md border border-[#747775] bg-white px-4 py-2 text-xs font-medium text-[#1F1F1F] shadow-xs hover:bg-[#F8F9FA] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
              >
                <svg
                  className="h-[18px] w-[18px] shrink-0"
                  viewBox="0 0 48 48"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                  <path fill="none" d="M0 0h48v48H0z" />
                </svg>
                <span>{signingIn ? 'Menghubungkan...' : 'Sign in with Google'}</span>
              </button>
            </>
          ) : (
            <>
              <div className="text-xs">
                <span className="text-slate-500 dark:text-slate-400">Terhubung sebagai </span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {googleUser?.email || googleUser?.displayName || 'Akun Google'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleGoogleSignOut()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
              >
                <LogOut className="h-3.5 w-3.5" />
                Ganti Akun
              </button>
            </>
          )}
        </div>

        {/* Form Metadata & URL */}
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label
                htmlFor="gf-mapel-select"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Mata Pelajaran
              </label>
              {!isCustomMapel && subjectOptions.length > 0 ? (
                <select
                  id="gf-mapel-select"
                  value={mapel}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__new__') {
                      setIsCustomMapel(true);
                      setMapel('');
                    } else {
                      setMapel(val);
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="">Pilih mata pelajaran...</option>
                  {subjectOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  <option value="__new__">+ Tambah mata pelajaran baru...</option>
                </select>
              ) : (
                <div className="mt-1 space-y-1">
                  <input
                    id="gf-mapel-select"
                    value={mapel}
                    onChange={(e) => setMapel(e.target.value)}
                    placeholder="Ketik nama mata pelajaran..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  {subjectOptions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomMapel(false);
                        setMapel('');
                      }}
                      className="text-[11px] font-semibold text-blue-700 hover:underline dark:text-blue-400"
                    >
                      Pilih dari daftar mata pelajaran
                    </button>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Topik
              </label>
              <input
                value={topik}
                onChange={(e) => setTopik(e.target.value)}
                placeholder="Otomatis dari judul formulir"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Paket
              </label>
              <select
                value={paket}
                onChange={(e) => setPaket(Number(e.target.value))}
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
            <label
              htmlFor="gf-url-input"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Link Editor atau ID Google Formulir
            </label>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row">
              <input
                id="gf-url-input"
                type="text"
                value={formInput}
                onChange={(e) => setFormInput(e.target.value)}
                placeholder="https://docs.google.com/forms/d/1BxiMVs0XRA5nFMd.../edit"
                className="font-mono-num flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                type="button"
                disabled={needsAuth || fetching}
                onClick={() => void handleFetchForm()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E40AF] disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {fetching ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Mengambil Soal...
                  </>
                ) : (
                  <>
                    <ExternalLink className="h-3.5 w-3.5" />
                    Ambil Soal
                  </>
                )}
              </button>
            </div>
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeStimulus}
                onChange={(e) => setIncludeStimulus(e.target.checked)}
              />
              Gunakan deskripsi bagian/pertanyaan Google Formulir sebagai teks bacaan (stimulus)
            </label>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {/* Parsed Questions Preview */}
        {preview && (
          <div className="mt-5 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs">
                <span className="font-bold text-slate-900 dark:text-white">{preview.title}</span>
                <span className="mx-2 text-slate-400">·</span>
                <span className="font-mono-num font-semibold text-blue-700 dark:text-blue-400">
                  {selectedItems.length}/{items.length} soal dipilih
                </span>
                {preview.skipped.length > 0 && (
                  <span className="ml-2 text-slate-500 dark:text-slate-400">
                    ({preview.skipped.length} item dilewati)
                  </span>
                )}
              </div>

              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const allSelected = items.every((x) => x.selected);
                    setItems((prev) => prev.map((x) => ({ ...x, selected: !allSelected })));
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  {items.every((x) => x.selected) ? 'Batal Pilih Semua' : 'Pilih Semua'}
                </button>
              )}
            </div>

            {items.length > 0 && (
              <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
                {items.map((item, idx) => (
                  <div
                    key={item.sourceId}
                    className={`rounded-lg border p-3 text-xs ${
                      item.selected
                        ? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40'
                        : 'border-slate-200/60 bg-slate-50/70 opacity-60 dark:border-slate-800 dark:bg-slate-900/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <label className="flex items-start gap-2.5 cursor-pointer flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setItems((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, selected: checked } : x)),
                            );
                          }}
                          className="mt-0.5 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900 dark:text-white">
                            <span className="font-mono-num mr-1.5 text-slate-400">{idx + 1}.</span>
                            {item.t}
                          </p>
                          {item.s && (
                            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-blue-700 dark:text-blue-400">
                              <FileText className="h-3 w-3 shrink-0" />
                              Stimulus terbaca ({item.s.length} karakter)
                            </p>
                          )}
                          <div className="mt-2 grid gap-1 sm:grid-cols-2 text-[11px] text-slate-600 dark:text-slate-300">
                            {item.o.map((opt, optIdx) => (
                              <div
                                key={optIdx}
                                className={
                                  item.a === optIdx
                                    ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                                    : ''
                                }
                              >
                                <span className="font-mono-num mr-1">{'ABCD'[optIdx]}.</span>
                                {opt}
                              </div>
                            ))}
                          </div>
                        </div>
                      </label>

                      <div className="shrink-0">
                        <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          Kunci
                        </label>
                        <select
                          aria-label={`Kunci jawaban soal ${idx + 1}`}
                          value={item.a}
                          onChange={(e) => {
                            const nextA = Number(e.target.value);
                            setItems((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, a: nextA } : x)),
                            );
                          }}
                          className={`mt-1 rounded-md border px-2 py-1 text-xs font-semibold ${
                            item.a < 0
                              ? 'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                              : 'border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
                          }`}
                        >
                          <option value={-1}>Pilih...</option>
                          {(['A', 'B', 'C', 'D'] as const).map((L, aIdx) => (
                            <option key={L} value={aIdx}>
                              {L}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {preview.skipped.length > 0 && (
              <details className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/40">
                <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-300">
                  Lihat {preview.skipped.length} item yang dilewati
                </summary>
                <ul className="mt-2 space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                  {preview.skipped.map((sk, i) => (
                    <li key={i}>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {sk.title}:
                      </span>{' '}
                      {sk.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold dark:border-slate-700"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={saving || selectedItems.length === 0}
            onClick={() => void handleSaveImported()}
            className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E40AF] disabled:opacity-50"
          >
            {saving ? 'Menyimpan...' : `Impor & Simpan (${selectedItems.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
