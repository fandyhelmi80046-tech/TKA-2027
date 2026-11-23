import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  CloudUpload,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  HardDriveDownload,
  Loader2,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { getAdminBackup, restoreAdminBackup } from '../api';
import type { TkaSheetSyncState } from '../hooks/useTkaSheetSync';
import type { AdminDatabase, DriveFileMeta, FullBackupSnapshot } from '../types';
import {
  findTka2027Spreadsheet,
  readTka2027Spreadsheet,
  TKA_SPREADSHEET_TITLE,
} from '../utils/googleSheets';

interface GoogleDrivePanelProps {
  currentCounts: {
    users: number;
    soal: number;
    ujian: number;
    sesi: number;
    hasil: number;
  };
  sheetSync: TkaSheetSyncState;
  onRestored: (nextDb: AdminDatabase) => void;
}

function formatIsoTime(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function GoogleDrivePanel({
  currentCounts,
  sheetSync,
  onRestored,
}: GoogleDrivePanelProps) {
  const {
    googleUser,
    needsAuth,
    signingIn,
    checking,
    syncing,
    sheetFile,
    setSheetFile,
    autoSyncEnabled,
    syncMessage,
    syncError,
    driveDirty,
    checkSheetFile,
    signIn,
    signOut,
    requestEnableAutoSync,
    disableAutoSync,
    syncNowToSheet,
    clearMessages,
  } = sheetSync;

  const [working, setWorking] = useState(false);
  const [localMsg, setLocalMsg] = useState('');
  const [localError, setLocalError] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const [confirmUpload, setConfirmUpload] = useState<{
    snapshot: FullBackupSnapshot;
    existingFile: DriveFileMeta;
  } | null>(null);

  const [confirmRestore, setConfirmRestore] = useState<{
    snapshot: FullBackupSnapshot;
    fileMeta: DriveFileMeta;
  } | null>(null);

  const busy = working || syncing;
  const activeError = localError || syncError;
  const activeMsg = localMsg || syncMessage;

  async function handlePrepareUpload() {
    setLocalError('');
    setLocalMsg('');
    clearMessages();
    setWorking(true);
    try {
      const [snapshot, latestMeta] = await Promise.all([
        getAdminBackup(),
        findTka2027Spreadsheet(),
      ]);
      setSheetFile(latestMeta);

      if (latestMeta) {
        setConfirmUpload({ snapshot, existingFile: latestMeta });
      } else {
        const created = await syncNowToSheet();
        if (created) {
          setLocalMsg(
            `Spreadsheet baru "${TKA_SPREADSHEET_TITLE}" berhasil dibuat dan seluruh data sudah disimpan.`,
          );
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan ke Google Sheets.';
      setLocalError(msg);
    } finally {
      setWorking(false);
    }
  }

  async function executeConfirmedUpload() {
    if (!confirmUpload) return;
    setWorking(true);
    setLocalError('');
    try {
      const updated = await syncNowToSheet(confirmUpload.existingFile.id, { forceOverwrite: true });
      setConfirmUpload(null);
      if (updated) {
        setLocalMsg(
          `Seluruh data berhasil disinkronkan ke Google Sheet "${TKA_SPREADSHEET_TITLE}" (${formatIsoTime(updated.modifiedTime)}).`,
        );
      }
    } catch (err) {
      setConfirmUpload(null);
      setLocalError(err instanceof Error ? err.message : 'Gagal memperbarui Google Sheet.');
    } finally {
      setWorking(false);
    }
  }

  async function handlePrepareRestore() {
    if (!sheetFile) return;
    setLocalError('');
    setLocalMsg('');
    clearMessages();
    setWorking(true);
    try {
      const snapshot = await readTka2027Spreadsheet(sheetFile.id);
      setConfirmRestore({ snapshot, fileMeta: sheetFile });
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Gagal membaca Google Sheet TKA 2027.',
      );
    } finally {
      setWorking(false);
    }
  }

  async function executeConfirmedRestore() {
    if (!confirmRestore) return;
    setWorking(true);
    setLocalError('');
    try {
      const res = await restoreAdminBackup(confirmRestore.snapshot);
      await sheetSync.markSheetConnectedMeta(confirmRestore.fileMeta);
      onRestored(res.data);
      setConfirmRestore(null);
      setLocalMsg(
        `Seluruh data aplikasi berhasil dipulihkan dari Google Sheet "${TKA_SPREADSHEET_TITLE}".`,
      );
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Gagal memulihkan data.');
    } finally {
      setWorking(false);
    }
  }

  async function handleDownloadLocalJson() {
    setLocalError('');
    setWorking(true);
    try {
      const snapshot = await getAdminBackup();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
        type: 'application/json;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tka-2027-backup.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Gagal mengunduh salinan cadangan.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#131E2D]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Penyimpanan Google Sheet: {TKA_SPREADSHEET_TITLE}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Aplikasi hanya membuat dan memakai spreadsheet baru bernama{' '}
                <strong className="text-slate-800 dark:text-slate-200">{TKA_SPREADSHEET_TITLE}</strong>{' '}
                (berisi tab <em>identitas, pengguna, soal, ujian, sesi, hasil</em>) serta tidak
                menyentuh spreadsheet lain di Google Drive Anda.
              </p>
            </div>
          </div>
        </div>

        {/* Google Sign-In Status */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
          {needsAuth ? (
            <>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Masuk dengan akun Google Anda untuk mengaktifkan penyimpanan langsung ke Sheet{' '}
                <strong>{TKA_SPREADSHEET_TITLE}</strong> di setiap menu.
              </p>
              <button
                type="button"
                disabled={signingIn}
                onClick={() => void signIn(true)}
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
                <span className="text-slate-500 dark:text-slate-400">Terhubung dengan </span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {googleUser?.email || googleUser?.displayName || 'Akun Google'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={checking}
                  onClick={() => void checkSheetFile()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
                  Periksa Sheet
                </button>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Ganti Akun
                </button>
              </div>
            </>
          )}
        </div>

        {/* Auto-sync toggle bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <p className="text-xs font-bold text-slate-900 dark:text-white">
              Simpan Otomatis Permanen Setiap Perubahan Menu
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {autoSyncEnabled
                ? needsAuth
                  ? `Aktif Permanen (tetap aktif saat admin logout). Masuk Google untuk melanjutkan pengiriman perubahan ke Sheet ${TKA_SPREADSHEET_TITLE}.`
                  : `Aktif Permanen: setiap penyimpanan di semua menu (dan hasil ujian baru saat admin masuk) langsung memperbarui Sheet ${TKA_SPREADSHEET_TITLE}.`
                : `Nonaktif: perubahan hanya tersimpan di server hingga Anda mengaktifkan simpan otomatis atau menyimpan manual.`}
            </p>
          </div>
          {autoSyncEnabled ? (
            <button
              type="button"
              onClick={() => void disableAutoSync()}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 whitespace-nowrap"
            >
              Nonaktifkan Sinkronisasi
            </button>
          ) : (
            <button
              type="button"
              disabled={signingIn}
              onClick={() => void requestEnableAutoSync()}
              className="rounded-lg bg-[#1D4ED8] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1E40AF] disabled:opacity-50 whitespace-nowrap"
            >
              {signingIn ? 'Menghubungkan...' : 'Aktifkan Sinkronisasi'}
            </button>
          )}
        </div>

        {/* Summary of Current Server Data */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ['Pengguna', currentCounts.users],
            ['Bank Soal', currentCounts.soal],
            ['Ujian', currentCounts.ujian],
            ['Sesi', currentCounts.sesi],
            ['Hasil Ujian', currentCounts.hasil],
          ].map(([label, val]) => (
            <div
              key={String(label)}
              className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
            >
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
              <p className="font-mono-num mt-1 text-lg font-bold text-slate-900 dark:text-white">
                {val}
              </p>
            </div>
          ))}
        </div>

        {driveDirty && !needsAuth && !syncing && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
            Ada perubahan terbaru di server yang belum disinkronkan ke Sheet{' '}
            <strong>{TKA_SPREADSHEET_TITLE}</strong>.
          </p>
        )}

        {/* Sheet Status Box */}
        {!needsAuth && (
          <div className="mt-5 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Status Google Sheet
            </h3>
            {checking ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Mencari spreadsheet {TKA_SPREADSHEET_TITLE}...
              </div>
            ) : sheetFile ? (
              <div className="mt-2 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {sheetFile.name}
                    </p>
                    <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                      Diperbarui: {formatIsoTime(sheetFile.modifiedTime)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      Terhubung
                    </span>
                  </div>
                </div>
                {sheetFile.webViewLink && /^https:\/\/docs\.google\.com\//i.test(sheetFile.webViewLink) && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-900/60">
                    <input
                      type="text"
                      readOnly
                      value={sheetFile.webViewLink}
                      onFocus={(e) => e.currentTarget.select()}
                      aria-label="Link Google Sheet TKA 2027"
                      className="min-w-0 flex-1 bg-transparent font-mono text-[11px] text-slate-700 outline-none dark:text-slate-300"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!sheetFile.webViewLink) return;
                        void navigator.clipboard.writeText(sheetFile.webViewLink).then(() => {
                          setCopiedLink(true);
                          setTimeout(() => setCopiedLink(false), 1800);
                        });
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      {copiedLink ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      {copiedLink ? 'Tersalin' : 'Salin Link'}
                    </button>
                    <a
                      href={sheetFile.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Buka Sheet
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Spreadsheet baru <strong>{TKA_SPREADSHEET_TITLE}</strong> belum dibuat di Google
                Drive Anda. Klik tombol di bawah untuk membuat dan mengisi datanya secara otomatis.
              </p>
            )}
          </div>
        )}

        {activeError && (
          <p role="alert" className="mt-4 text-xs font-medium text-red-600 dark:text-red-400">
            {activeError}
          </p>
        )}

        {activeMsg && (
          <p className="mt-4 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {activeMsg}
          </p>
        )}

        {/* Primary Action Buttons */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={needsAuth || busy || checking}
            onClick={() => void handlePrepareUpload()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#1E40AF] disabled:opacity-50 whitespace-nowrap"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CloudUpload className="h-4 w-4" />
            )}
            {sheetFile ? `Simpan ke Sheet ${TKA_SPREADSHEET_TITLE}` : `Buat & Simpan Sheet ${TKA_SPREADSHEET_TITLE}`}
          </button>

          <button
            type="button"
            disabled={needsAuth || !sheetFile || busy || checking}
            onClick={() => void handlePrepareRestore()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 whitespace-nowrap"
          >
            <HardDriveDownload className="h-4 w-4" />
            Pulihkan dari Sheet {TKA_SPREADSHEET_TITLE}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleDownloadLocalJson()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            Unduh Salinan JSON
          </button>
        </div>
      </section>

      {/* MODAL: Confirm Overwriting Existing Sheet TKA 2027 */}
      {confirmUpload && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-[#131E2D]">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Perbarui Sheet {TKA_SPREADSHEET_TITLE}?
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Isi pada Google Sheet{' '}
              <span className="font-semibold">{confirmUpload.existingFile.name}</span>{' '}
              (terakhir diubah {formatIsoTime(confirmUpload.existingFile.modifiedTime)}) akan
              diperbarui dengan data terbaru berikut:
            </p>
            <ul className="mt-3 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono-num text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
              <li>Pengguna: {confirmUpload.snapshot.users.length}</li>
              <li>Soal: {confirmUpload.snapshot.soal.length}</li>
              <li>Ujian: {confirmUpload.snapshot.ujian.length}</li>
              <li>Sesi: {confirmUpload.snapshot.sesi.length}</li>
              <li>Hasil Ujian: {confirmUpload.snapshot.hasil.length}</li>
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmUpload(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold dark:border-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void executeConfirmedUpload()}
                className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E40AF] disabled:opacity-50"
              >
                {busy ? 'Menyimpan...' : `Ya, Perbarui ${TKA_SPREADSHEET_TITLE}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Confirm Restoring Data from Sheet TKA 2027 */}
      {confirmRestore && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-[#131E2D]">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Pulihkan Data dari Sheet {TKA_SPREADSHEET_TITLE}?
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Data aplikasi saat ini di server akan diganti dengan isi Google Sheet{' '}
              <span className="font-semibold">{confirmRestore.fileMeta.name}</span>:
            </p>
            <ul className="mt-3 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono-num text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
              <li>Pengguna: {confirmRestore.snapshot.users.length}</li>
              <li>Soal: {confirmRestore.snapshot.soal.length}</li>
              <li>Ujian: {confirmRestore.snapshot.ujian.length}</li>
              <li>Sesi: {confirmRestore.snapshot.sesi.length}</li>
              <li>
                Hasil Ujian:{' '}
                {Array.isArray(confirmRestore.snapshot.hasil)
                  ? confirmRestore.snapshot.hasil.length
                  : 0}
              </li>
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmRestore(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold dark:border-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void executeConfirmedRestore()}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? 'Memulihkan...' : 'Ya, Pulihkan Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
