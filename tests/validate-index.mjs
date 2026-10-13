import { readFile } from 'node:fs/promises';
import { parse } from '@babel/parser';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const scriptMatch = html.match(/<script[^>]*type=["']text\/babel["'][^>]*>([\s\S]*?)<\/script>/i);

if (!scriptMatch) {
  throw new Error('index.html içinde text/babel uygulama kodu bulunamadı.');
}

const ast = parse(scriptMatch[1], {
  sourceType: 'script',
  plugins: ['jsx'],
  errorRecovery: false
});

const requiredMarkers = [
  'hideEkOdemeGonderildi',
  "sortField === 'plan_ornegi'",
  'chartFilteredWarningData',
  'WarningTable'
];

for (const marker of requiredMarkers) {
  if (!html.includes(marker)) {
    throw new Error(`Beklenen özellik bulunamadı: ${marker}`);
  }
}

console.log('index.html sözdizimi ve temel dashboard özellikleri doğrulandı.');

// Run the date/explanation helper directly from the application, without DOM dependencies.
const helper = ast.program.body.find(node => node.type === 'VariableDeclaration' && node.declarations.some(declaration => declaration.id.name === 'getClosedApplicationInfo'));
assert(helper, 'Tescil/iptal açıklama işleyicisi bulunamadı.');
const closedInfo = runInNewContext(scriptMatch[1].slice(helper.start, helper.end) + '\ngetClosedApplicationInfo;');
const today = new Date('2026-10-12T18:00:00Z');
const registered = '181 Ada 2\nBaşvuru 9.10.2026 15:17:10 tarih ve 19930 yevmiye ile tescil edildi';
const cancelled = 'İptal Açıklama :Başvuru İptal Bilgileri (İptalZamanı-KullanıcıSicil-Açıklama):09/06/2026 16:09:32 - tk35208 - GİB sorgusu 2025 yılına ait olduğundan';

assert.equal(closedInfo(registered, 'tescile_giden', today).shortExplanation, '9.10.2026 · 19930 yevmiye ile tescil edildi');
assert.equal(closedInfo(registered, 'tescile_giden', today).elapsedDays, 3);
assert.equal(closedInfo(cancelled, 'iptal_edilen', today).shortExplanation, '9.6.2026 · GİB sorgusu 2025 yılına ait olduğundan');
assert.equal(closedInfo(cancelled, 'iptal_edilen', today).elapsedDays, 125);
assert.equal(closedInfo(cancelled, 'iptal_edilen', today).eventDate, '9.6.2026');
assert.equal(closedInfo('Başvuru 12.10.2026 23:59:59 tarih ve 12 yevmiye ile tescil edildi', 'tescile_giden', today).elapsedDays, 0);
assert.equal(closedInfo(registered, 'tescile_giden', new Date('2026-10-12T21:30:00Z')).elapsedDays, 4, 'Gün sınırı Türkiye saatine göre olmalı.');
assert.equal(closedInfo('Başvuru 31.02.2026 15:00:00 tarih ve 12 yevmiye ile tescil edildi', 'tescile_giden', today).elapsedDays, null);
assert.equal(closedInfo('Başvuru 13.10.2026 15:00:00 tarih ve 12 yevmiye ile tescil edildi', 'tescile_giden', today).elapsedDays, null);
assert.equal(closedInfo('İptal Açıklama : GİB sorgusu 09/06/2026 tarihine ait olduğundan iptal edildi', 'iptal_edilen', today).elapsedDays, null, 'Gerekçedeki başka bir tarih iptal tarihi sayılmamalı.');
assert.equal(closedInfo('Tescil edildi', 'tescile_giden', today).elapsedDays, null);
assert.equal(closedInfo('', 'iptal_edilen', today).shortExplanation, '—');
assert.equal(closedInfo(registered.replace('9.10.2026', '29.02.2025'), 'tescile_giden', today).eventDate, '');
assert(closedInfo(registered.replace('9.10.2026', '29.02.2024'), 'tescile_giden', today).elapsedDays > 0);
assert.equal(closedInfo(registered + '\nBaşvuru 10/10/2026 tarih ve 19931 yevmiye ile tescil edildi', 'tescile_giden', today).elapsedDays, 2);
const newerCancellation = cancelled + '\nİptal Açıklama :Başvuru İptal Bilgileri (İptalZamanı-KullanıcıSicil-Açıklama):10/10/2026 12:00:00 - tk35208 - Yeni gerekçe';
assert.equal(closedInfo(newerCancellation, 'iptal_edilen', today).shortExplanation, '10.10.2026 · Yeni gerekçe');
assert.equal(closedInfo(newerCancellation, 'iptal_edilen', today).elapsedDays, 2);
const longReason = cancelled + ' ayrıntılı gerekçe'.repeat(30);
assert.equal(closedInfo(longReason, 'iptal_edilen', today).shortExplanation.length, 160);
assert(closedInfo(longReason, 'iptal_edilen', today).shortExplanation.endsWith('…'));
console.log('Tescil/iptal açıklamaları, tarih doğrulama ve Türkiye takvim günü hesapları doğrulandı.');

const sourceOf = name => {
  const node = ast.program.body.find(item => item.type === 'VariableDeclaration' && item.declarations.some(d => d.id.name === name));
  assert(node, `${name} bulunamadı.`);
  return scriptMatch[1].slice(node.start, node.end);
};
const classificationSource = ['normalizeHeader', 'matchesClosedApplication'].map(sourceOf).join('\n');
const requestInfo = runInNewContext(sourceOf('getTescilRequestInfo') + '\ngetTescilRequestInfo;', {
  XLSX: { SSF: { parse_date_code: serial => serial === 46303 ? { y: 2026, m: 10, d: 8 } : null } }
});
for (const value of ['8.10.2026 15:17:10 / 1234', '08/10/2026 / 1234', '08-10-2026', '2026-10-08T12:00:00', 'Tescil talep tarihi: 8.10.2026', 46303]) {
  assert.equal(requestInfo(value, today).requestDate, '8.10.2026');
  assert.equal(requestInfo(value, today).elapsedDays, 4);
}
assert.equal(requestInfo('12.10.2026 23:59:59', today).elapsedDays, 0);
assert.equal(requestInfo('8.10.2026', new Date('2026-10-12T21:30:00Z')).elapsedDays, 5);
for (const value of ['', null, undefined, 'Talep bilgisi yok', '31.02.2026', '29.02.2025', '130.04.2026', 0, -1]) {
  assert.equal(requestInfo(value, today).elapsedDays, null);
  assert.equal(requestInfo(value, today).requestDate, '');
}
assert.equal(requestInfo('13.10.2026', today).elapsedDays, null);
assert(requestInfo('29.02.2024', today).elapsedDays > 0);
console.log('Tescil talep tarihleri, geçersiz/eksik tarihler ve Türkiye takvim günü hesabı doğrulandı.');
const matchesClosed = runInNewContext(classificationSource + '\nmatchesClosedApplication;');
const sent = { 'başvuru durumu': 'Tescile Gönderildi' };
const cases = [
  { ...sent, id: 'registered', 'tescil durum': 'Başvuru Tamamlandı', 'başvuru açıklama': '' },
  { ...sent, id: 'cancelled', 'tescil durum': 'Başvuru Red Edildi', 'başvuru açıklama': registered },
  { ...sent, id: 'contradictory', 'tescil durum': 'Başvuru Tamamlandı', 'başvuru açıklama': cancelled },
  { ...sent, id: 'pending', 'tescil durum': 'Başvuru Devam Ediyor', 'başvuru açıklama': registered + cancelled },
  { ...sent, id: 'missing', 'başvuru açıklama': registered + cancelled },
  { id: 'returned', 'başvuru durumu': 'Tescilden Geldi', 'tescil durum': 'Başvuru Tamamlandı' },
  { id: 'returned-cancelled', 'başvuru durumu': 'Eksiklikten İade Edildi', 'tescil durum': 'Başvuru Red Edildi' }
];
assert.deepEqual(cases.filter(row => matchesClosed(row, 'tescile_giden')).map(row => row.id), ['registered', 'contradictory']);
assert.deepEqual(cases.filter(row => matchesClosed(row, 'iptal_edilen')).map(row => row.id), ['cancelled']);
assert(matchesClosed({ ...sent, 'tescil durumu': '  BAŞVURU   TAMAMLANDI  ' }, 'tescile_giden'));
assert(matchesClosed({ ...sent, 'tescil durum': 'başvuru red edildi' }, 'iptal_edilen'));
assert(!matchesClosed({ ...sent, 'tescil durum': 'Başvuru Tamamlandı değil' }, 'tescile_giden'));

// Exercise the real importer: the two status columns must stay distinct.
let grid;
const importerSource = ['PROVINCES', 'ALLOWED_COLS', 'HEADER_KEYWORDS', 'normalizeHeader', 'formatDate', 'formatFenKayitNo', 'detectProvinceAndDistrict', 'readExcelPromise'].map(sourceOf).join('\n');
const importExcel = runInNewContext(importerSource + '\nreadExcelPromise;', {
  FileReader: class {
    readAsArrayBuffer() { this.onload({ target: { result: new ArrayBuffer(0) } }); }
  },
  XLSX: {
    read: () => ({ SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } }),
    utils: { sheet_to_json: () => grid }
  }
});
for (const header of ['Tescil Durum', 'Tescil Durumu', ' TESCİL\nDURUM ']) {
  grid = [
    ['Başvuru No', header, 'Başvuru Durumu', 'Başvuru Açıklama', 'Tescil Talep Bilgisi'],
    [1, 'Başvuru Tamamlandı', 'Tescile Gönderildi', '', 'Talep bilgisi'],
    [2, 'Başvuru Red Edildi', 'Tescile Gönderildi', registered, 'Talep bilgisi']
  ];
  const { rows } = await importExcel({ name: 'status.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  assert.equal(rows[0]['tescil durum'], 'Başvuru Tamamlandı');
  assert.equal(rows[0]['başvuru durumu'], 'Tescile Gönderildi');
  assert.equal(rows[0]['tescil talep bilgisi'], 'Talep bilgisi');
  assert(matchesClosed(rows[0], 'tescile_giden'));
  assert(matchesClosed(rows[1], 'iptal_edilen'));
}
grid = [['Başvuru Durumu', 'Başvuru Açıklama'], ['Tescile Gönderildi', registered + cancelled]];
const missingColumn = await importExcel({ name: 'missing.xlsx', type: '' });
assert(!matchesClosed(missingColumn.rows[0], 'tescile_giden'));
assert(!matchesClosed(missingColumn.rows[0], 'iptal_edilen'));

const metrics = runInNewContext(classificationSource + '\n' + sourceOf('parseTescilDate') + '\n' + sourceOf('calcMetrics') + '\ncalcMetrics;')(cases);
assert.equal(metrics.tescilEdilen, 2);
assert.equal(metrics.iptal, 1);

// Exercise the same memo callback used by the application's filters.
const findNode = (node, predicate) => {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
  }
  return null;
};
const appNode = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'App');
const filteredDataNode = findNode(appNode, node => node.type === 'VariableDeclarator' && node.id.name === 'filteredData');
const filterCallback = filteredDataNode.init.arguments[0];
for (const [sortField, expected] of [['tescile_giden', ['registered', 'contradictory']], ['iptal_edilen', ['cancelled']]]) {
  const rows = runInNewContext(classificationSource + '\n(' + scriptMatch[1].slice(filterCallback.start, filterCallback.end) + ')();', {
    data: cases, sortField, startDate: '', endDate: '', selectedIl: [], selectedIlce: [], selectedPersonel: [], selectedIslem: []
  });
  assert.deepEqual(Array.from(rows, row => row.id), expected);
}
console.log('Excel Tescil Durum sütunu, açıklamadan bağımsız sınıflandırma, sayaçlar ve liste filtreleri doğrulandı.');

const warningTableNode = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'WarningTable');
const warningEffect = findNode(warningTableNode, node => node.type === 'CallExpression' && node.callee.name === 'useEffect' &&
  scriptMatch[1].slice(node.arguments[0].start, node.arguments[0].end).includes('setWarningRows(finalRows)'));
const effectCallback = warningEffect.arguments[0];
for (const [sortField, registrationStatus, explanation] of [['tescile_giden', 'Başvuru Tamamlandı', registered], ['iptal_edilen', 'Başvuru Red Edildi', cancelled]]) {
  for (const [requestValue, expectedDate, expectedDays] of [['8.10.2026 / 1234', '8.10.2026', 4], ['', '', null], ['31.02.2026', '', null]]) {
    let rows;
    runInNewContext(classificationSource + '\n' + sourceOf('getClosedApplicationInfo') + '\n' + sourceOf('getTescilRequestInfo') +
      '\n(' + scriptMatch[1].slice(effectCallback.start, effectCallback.end) + ')();', {
      Date: class extends Date { constructor(...args) { super(...(args.length ? args : [today])); } },
      sortField, warningEligibleData: [{ ...sent, 'tescil durum': registrationStatus, 'tescil talep bilgisi': requestValue, 'başvuru açıklama': explanation }],
      warningThreshold: 0, personnelFilterType: 'all', setWarningRows: value => { rows = value; }
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].beklemeSuresi, expectedDays);
    assert.equal(rows[0].tescilTalepTarihi, expectedDate);
    assert.equal(rows[0].kisaBasvuruAciklama, closedInfo(explanation, sortField, today).shortExplanation);
  }
}
console.log('Tescil ve iptal uyarı tablolarının süresi yalnızca Tescil Talep Bilgisi tarihine dayanıyor.');

