/**
 * Setup.gs - membuat semua sheet Try Out TKA secara otomatis.
 * Aman dijalankan berulang: sheet yang sudah ada tidak dihapus dan datanya tidak diubah.
 *
 * Cara pakai (paling mudah):
 * 1. Buka Google Sheets Anda > Extensions > Apps Script.
 * 2. Tempel isi file ini (dan Code.gs), lalu simpan.
 * 3. Jalankan fungsi setupSheets (izinkan akses saat diminta).
 *    Setelah itu menu "Try Out TKA" juga muncul di Sheets.
 *
 * Jika skrip berdiri sendiri (tidak dibuat dari dalam Sheets):
 * jalankan setSpreadsheet('LINK_SHEETS_ANDA') satu kali, lalu setupSheets().
 */

// Skema: nama sheet -> daftar kolom (baris 1)
const SKEMA = {
  identitas:    ['kunci', 'nilai'],
  pengguna:     ['username', 'sandi_hash', 'nama', 'kelas', 'jk', 'peran', 'sandi_kartu'],
  soal:         ['id', 'mapel', 'topik', 'paket', 'stimulus', 'pertanyaan',
                 'opsi_a', 'opsi_b', 'opsi_c', 'opsi_d', 'kunci'],
  ujian:        ['id', 'mapel', 'paket', 'aktif', 'token', 'menit', 'acak'],
  sesi:         ['id', 'nama', 'ujian_id', 'tanggal', 'jam_mulai', 'batas_masuk'],
  sesi_peserta: ['sesi_id', 'username'],
  jawaban:      ['username', 'ujian_id', 'jawaban_json', 'ragu_json', 'sisa_waktu', 'terakhir_simpan'],
  hasil:        ['id', 'waktu', 'username', 'nama', 'kelas', 'mapel', 'paket', 'benar', 'total', 'nilai'],
  hasil_detail: ['hasil_id', 'nomor', 'topik', 'benar'],
  live:         ['username', 'nama', 'mapel', 'paket', 'soal_ke', 'total',
                 'terjawab', 'ragu', 'sisa_waktu', 'status', 'diperbarui'],
  log:          ['waktu', 'username', 'kejadian', 'detail']
};

// Pilihan dropdown: sheet -> kolom -> daftar nilai
const PILIHAN = {
  pengguna: { peran: ['siswa', 'admin'], jk: ['Laki-Laki', 'Perempuan'] },
  soal:     { paket: ['1', '2', '3', '4'], kunci: ['A', 'B', 'C', 'D'] },
  ujian:    { paket: ['1', '2', '3', '4'], aktif: ['TRUE', 'FALSE'], acak: ['TRUE', 'FALSE'] }
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Try Out TKA')
    .addItem('Buat / lengkapi semua sheet', 'setupSheets')
    .addToUi();
}

/** Simpan link Sheets (hanya perlu jika skrip tidak dibuat dari dalam Sheets). */
function setSpreadsheet(url) {
  PropertiesService.getScriptProperties().setProperty('SS_URL', url);
}

function getSS_() {
  const aktif = SpreadsheetApp.getActiveSpreadsheet();
  if (aktif) return aktif;
  const url = PropertiesService.getScriptProperties().getProperty('SS_URL');
  if (!url) {
    throw new Error('Jalankan setSpreadsheet("LINK_SHEETS") dahulu, ' +
      'atau buat skrip dari menu Extensions > Apps Script di dalam Google Sheets.');
  }
  return SpreadsheetApp.openByUrl(url);
}

/** Hash kata sandi (SHA-256 + garam acak yang tersimpan di Script Properties). */
function hashSandi(plain) {
  const props = PropertiesService.getScriptProperties();
  let garam = props.getProperty('GARAM');
  if (!garam) { garam = Utilities.getUuid(); props.setProperty('GARAM', garam); }
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    garam + plain, Utilities.Charset.UTF_8);
  return b.map(function (x) { return ('0' + (x & 0xff).toString(16)).slice(-2); }).join('');
}

function setupSheets() {
  const ss = getSS_();
  const dibuat = [], dilengkapi = [];

  Object.keys(SKEMA).forEach(function (nama) {
    const kolom = SKEMA[nama];
    let sh = ss.getSheetByName(nama);
    if (!sh) { sh = ss.insertSheet(nama); dibuat.push(nama); }

    // Header: tulis jika kosong; jika sudah ada, tambahkan kolom yang belum ada di ujung kanan.
    const lebar = sh.getLastColumn();
    const ada = lebar ? sh.getRange(1, 1, 1, lebar).getValues()[0].map(String) : [];
    kolom.forEach(function (k) {
      if (ada.indexOf(k) < 0) {
        sh.getRange(1, ada.length + 1).setValue(k);
        ada.push(k);
        if (dibuat.indexOf(nama) < 0 && dilengkapi.indexOf(nama) < 0) dilengkapi.push(nama);
      }
    });

    // Tampilan header
    sh.getRange(1, 1, 1, ada.length)
      .setFontWeight('bold').setBackground('#336699').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, ada.length);

    // Dropdown pada kolom tertentu (baris 2 sampai 2000)
    const pil = PILIHAN[nama] || {};
    Object.keys(pil).forEach(function (k) {
      const c = ada.indexOf(k) + 1;
      if (c < 1) return;
      sh.getRange(2, c, 1999, 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(pil[k], true)
          .setAllowInvalid(false).build());
    });
  });

  isiDataAwal_(ss);
  hapusSheetBawaan_(ss);
  ss.setActiveSheet(ss.getSheetByName('pengguna'));

  const pesan = 'Dibuat: ' + (dibuat.join(', ') || '-') +
    '\nDilengkapi kolomnya: ' + (dilengkapi.join(', ') || '-');
  Logger.log(pesan);
  try { SpreadsheetApp.getUi().alert('Selesai', pesan, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
}

// Data awal: identitas aplikasi dan satu akun admin (hanya jika sheet masih kosong).
function isiDataAwal_(ss) {
  const idn = ss.getSheetByName('identitas');
  if (idn.getLastRow() < 2) {
    idn.getRange(2, 1, 3, 2).setValues([
      ['nama', 'TRY OUT'],
      ['sub', 'Aplikasi Simulasi TKA'],
      ['logo', '']
    ]);
  }
  const pg = ss.getSheetByName('pengguna');
  if (pg.getLastRow() < 2) {
    // Ganti kata sandi ini segera setelah login pertama.
    pg.getRange(2, 1, 1, 6).setValues([
      ['admin', hashSandi('admin123'), 'Administrator', '', '', 'admin']
    ]);
  }
}

function hapusSheetBawaan_(ss) {
  ['Sheet1', 'Sheet 1', 'Lembar1', 'Lembar 1'].forEach(function (n) {
    const sh = ss.getSheetByName(n);
    if (sh && ss.getSheets().length > 1 && sh.getLastRow() === 0 && sh.getLastColumn() === 0) {
      ss.deleteSheet(sh);
    }
  });
}
