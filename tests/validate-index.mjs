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

