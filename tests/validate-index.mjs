import { readFile } from 'node:fs/promises';
import { parse } from '@babel/parser';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const scriptMatch = html.match(/<script[^>]*type=["']text\/babel["'][^>]*>([\s\S]*?)<\/script>/i);

if (!scriptMatch) {
  throw new Error('index.html içinde text/babel uygulama kodu bulunamadı.');
}

parse(scriptMatch[1], {
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
