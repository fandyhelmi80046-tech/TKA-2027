/**
 * Code.gs - kerangka Apps Script untuk Try Out TKA
 * Pasang: Apps Script > file Code.gs (ini) + file HTML bernama "index" (isi tryout-tka.html)
 * Deploy: Deploy > New deployment > Web app.
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Try Out TKA')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Dipanggil dari aplikasi: google.script.run.importForm(sesi, url)
 * Formulir harus bertipe kuis, dengan kunci jawaban pada setiap soal pilihan ganda.
 * Hanya soal dengan tepat 4 opsi dan satu kunci yang diambil.
 */
function importForm(ses, url) {
  auth_(ses, 'admin');
  const form = FormApp.openByUrl(url);
  if (!form.isQuiz()) throw new Error('Formulir harus bertipe kuis (ada kunci jawaban).');
  const q = [];
  let skip = 0;
  form.getItems(FormApp.ItemType.MULTIPLE_CHOICE).forEach(function (it) {
    const m = it.asMultipleChoiceItem();
    const ch = m.getChoices();
    let a = -1;
    ch.forEach(function (c, i) { if (c.isCorrectAnswer()) a = i; });
    if (ch.length !== 4 || a < 0) { skip++; return; }
    q.push({ t: m.getTitle(), o: ch.map(function (c) { return c.getValue(); }), a: a });
  });
  return { q: q, skip: skip };
}
