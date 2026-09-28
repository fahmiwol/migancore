// Node 20+, no dependencies. Reads only the source and translation beside this file.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const glosses = {
  "LULUS": "PASS",
  "GAGAL": "FAIL",
  "SEBAGIAN": "PARTIAL",
  "LULUS SEBAGIAN": "PARTIAL PASS",
  "TIDAK MENANG": "NOT A WIN",
  "MENANG": "WIN",
  "TIDAK MENENTUKAN": "INCONCLUSIVE",
  "DITERIMA": "ACCEPTED",
  "TERPASANG": "INSTALLED",
  "SELESAI": "COMPLETED",
  "DIHENTIKAN": "STOPPED, not a verdict",
  "DITUNDA": "POSTPONED",
  "BELUM DIJALANKAN": "NOT RUN",
  "BELUM DIVONIS": "NOT YET JUDGED",
  "TIDAK PERNAH DIJALANKAN": "NEVER RUN",
  "TIDAK BISA DIVONIS": "CANNOT BE JUDGED",
  "GUGUR": "VOID",
  "BERLAKU": "SERVED",
  "PASANG_ON": "INSTALL_ON: turn the gate on",
  "PASANG_BATAS": "INSTALL_BOUNDARY: install the boundary paragraph",
  "TIDAK_SAH_MENGELAK": "INVALID_EVASION: invalid as an honesty claim because the anti-evasion guard failed",
  "INSTRUMEN_TIDAK_SAH": "INSTRUMENT_INVALID",
  "TETAP_Q3": "KEEP_Q3: keep the Qwen3-4B-Instruct-2507 base",
  "KRITERIA TIDAK BISA DIPENUHI": "CRITERIA UNSATISFIABLE",
  "ROUTING MENANGGUNG": "ROUTING CARRIES IT",
  "KLAIM GEMINI TIDAK TERBUKTI": "GEMINI'S CLAIM NOT SUPPORTED",
  "P1 DERAU": "P1 NOISE",
  "Q_JUJUR": "Q_HONEST",
  "Q_LATENSI": "Q_LATENCY",
  "Q_MODEL": "Q_MODEL",
  "Q_PRODUK": "Q_PRODUCT"
};
const language = 'English translation of migancore-public.id.json (machine-assisted, human-reviewed).';
const codes = Object.keys(glosses).sort((a, b) => b.length - a.length);
const codePattern = new RegExp('(?<![A-Za-z0-9_])(' + codes.join('|') + ')(?![A-Za-z0-9_])', 'g');
function stripGlosses(text) {
  for (const gloss of Object.values(glosses)) text = text.split(' (' + gloss + ')').join('');
  return text;
}

// ISO dates/timestamps are identifiers, not locale-formatted measurements.
const isoPattern = /\b\d{4}-\d{2}-\d{2}(?:T\d{2}(?:[:-]\d{2}){1,2}(?:\.\d+)?Z?)?/g;
const numberPattern = /(?:\d+(?:[.,]\d+)*|\.\d+)(?:[eE][+-]?\d+)?/g;
function canonical(raw, locale) {
  let [mantissa, exponent] = raw.toLowerCase().split('e');
  if (locale === 'id') {
    if (mantissa.includes(',')) mantissa = mantissa.replaceAll('.', '').replace(',', '.');
    // The source also contains English decimals. Nonzero, grouped triplets are
    // Indonesian thousands; 0.xxx and dot decimals of other widths stay decimals.
    else if (/^[1-9]\d{0,2}(?:\.\d{3})+$/.test(mantissa)) mantissa = mantissa.replaceAll('.', '');
  } else {
    if (mantissa.includes(',') && !/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(mantissa)) {
      throw new Error('Invalid English number format: ' + raw);
    }
    mantissa = mantissa.replaceAll(',', '');
  }
  let [whole, fraction = ''] = mantissa.split('.');
  whole = whole.replace(/^0+(?=\d)/, '') || '0';
  fraction = fraction.replace(/0+$/, '');
  return whole + (fraction ? '.' + fraction : '') + (exponent === undefined ? '' : 'e' + Number(exponent));
}
function numbers(text, locale) {
  const result = [];
  text = text.replace(isoPattern, match => {
    result.push('date:' + match);
    return ' '.repeat(match.length);
  });
  for (const match of text.matchAll(numberPattern)) {
    const before = text.slice(0, match.index);
    // A hyphen in an identifier/range is not a unary minus.
    const sign = /(?:^|[^A-Za-z0-9_])[−-]$/.test(before) ? '-' : '';
    result.push(sign + canonical(match[0], locale));
  }
  return result.sort();
}
function numericEqual(id, en) {
  // An unchanged string has an identical multiset regardless of its original locale.
  if (id === en) return true;
  return JSON.stringify(numbers(id, 'id')) === JSON.stringify(numbers(stripGlosses(en), 'en'));
}

// Parser checks cover ambiguous formats relevant to this task.
assert(numericEqual('28,9 %; 0,20–0,35; 3.087.466.808 B; 2.381,6 MB',
  '28.9%; 0.20–0.35; 3,087,466,808 B; 2,381.6 MB'));
assert(numericEqual('t(4)=2,776; −0,026; 12.224; 0.14; 2.16; .94',
  't(4)=2.776; −0.026; 12,224; 0.14; 2.16; .94'));
assert(numericEqual('8, 9, 7, 8, 10; 2026-09-28T08:38:56.895Z',
  '8, 9, 7, 8, 10; 2026-09-28T08:38:56.895Z'));
assert(!numericEqual('8,4 8,4', '8.4'));
assert(!numericEqual('−39,08', '39.08'));
assert(!numericEqual('2.381,6 MB', '2,381.7 MB'));
assert(numericEqual('TETAP_Q3', 'TETAP_Q3 (' + glosses.TETAP_Q3 + ')'));

const root = new URL('../', import.meta.url);
const idPath = new URL('data/migancore-public.id.json', root);
const enPath = new URL('data/migancore-public.en.json', root);
const id = JSON.parse(readFileSync(idPath, 'utf8'));
const en = JSON.parse(readFileSync(enPath, 'utf8'));
const failures = [];
const stats = { arrays: 0, objects: 0, strings: 0, translatedStrings: 0, nonTextValues: 0 };
function fail(path, message) { failures.push(path + ': ' + message); }
function isTranslatable(path) {
  return path.startsWith('$.meta.') ||
    /_id(?:\.|$)/.test(path) && !path.endsWith('.source') ||
    /^\$\.fabricationLadder\[\d+\]\.model$/.test(path) ||
    /^\$\.lineage\[\d+\]\.name$/.test(path) ||
    path === '$.birth.legacyA4.system.configuration';
}
function quotedCanonical(text, locale) {
  return text.replace(numberPattern, raw => canonical(raw, locale));
}
function visit(a, b, path = '$') {
  if (Array.isArray(a)) {
    stats.arrays++;
    if (!Array.isArray(b)) return fail(path, 'expected an array');
    if (a.length !== b.length) fail(path, 'array length changed: ' + a.length + ' → ' + b.length);
    a.forEach((value, i) => visit(value, b[i], path + '[' + i + ']'));
    return;
  }
  if (a !== null && typeof a === 'object') {
    stats.objects++;
    if (b === null || typeof b !== 'object' || Array.isArray(b)) return fail(path, 'expected an object');
    const expected = Object.keys(a).map(key => key.endsWith('_id') ? key.slice(0, -3) : key);
    if (new Set(expected).size !== expected.length) fail(path, 'source key rename collision');
    if (JSON.stringify(expected) !== JSON.stringify(Object.keys(b))) fail(path, 'keys/order differ from exact suffix-renamed source');
    for (const [key, value] of Object.entries(a)) {
      visit(value, b[key.endsWith('_id') ? key.slice(0, -3) : key], path + '.' + key);
    }
    return;
  }
  if (typeof a !== 'string') {
    stats.nonTextValues++;
    if (!Object.is(a, b)) fail(path, 'non-text value changed');
    return;
  }
  stats.strings++;
  if (typeof b !== 'string') return fail(path, 'expected a string');
  if (!isTranslatable(path) && a !== b) fail(path, 'immutable string changed');
  if (a !== b) stats.translatedStrings++;
  try {
    if (!numericEqual(a, b)) fail(path, 'numeric multiset differs\n  ID ' + JSON.stringify(numbers(a, 'id')) + '\n  EN ' + JSON.stringify(numbers(stripGlosses(b), 'en')));
  } catch (error) { fail(path, error.message); }

  const bare = stripGlosses(b);
  // Preserve backtick contents except numeric localization and the required gloss.
  const quotedA = [...a.matchAll(/\x60([^\x60]+)\x60/g)].map(m => quotedCanonical(m[1], 'id')).sort();
  const quotedB = [...bare.matchAll(/\x60([^\x60]+)\x60/g)].map(m => quotedCanonical(m[1], 'en')).sort();
  if (JSON.stringify(quotedA) !== JSON.stringify(quotedB)) fail(path, 'backtick content changed');
  if ((a.match(/\*\*/g) || []).length !== (b.match(/\*\*/g) || []).length) fail(path, 'Markdown emphasis changed');

  // Check literal model tags and filesystem references within translated prose.
  const protectedPattern = /(?:\b(?:migancore|qwen\d+(?:\.\d+)?|kimi|codex|openai|local):[A-Za-z0-9_.:-]+|\b(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:json|mjs|md)(?:#[A-Za-z0-9_]+)?)/g;
  const protectedA = (a.match(protectedPattern) || []).sort();
  const protectedB = (bare.match(protectedPattern) || []).sort();
  // meta.language intentionally replaces the explanation and its EN filename.
  if (path !== '$.meta.language' && JSON.stringify(protectedA) !== JSON.stringify(protectedB)) fail(path, 'model tags or file references changed');
  if (path.endsWith('.verdict_id') || path.endsWith('.reason_id') ||
      /^\$\.highlights_id\.[^.]+\.text$/.test(path)) {
    const sourceCodes = [...a.matchAll(codePattern)].map(m => m[0]);
    const targetCodes = [...bare.matchAll(codePattern)].map(m => m[0]);
    if (JSON.stringify(sourceCodes) !== JSON.stringify(targetCodes)) fail(path, 'verdict codes/order changed');
    if (sourceCodes.length && !b.includes(sourceCodes[0] + ' (' + glosses[sourceCodes[0]] + ')')) {
      fail(path, 'missing required gloss after first verdict code');
    }
  }
}
visit(id, en);
if (en.meta?.language !== language) fail('$.meta.language', 'required language label differs');
if (failures.length) {
  console.error(failures.join('\n'));
  console.error('FAIL: ' + failures.length + ' issue(s)');
  process.exitCode = 1;
} else {
  console.log('PASS: structure, array order/length, immutable strings, non-text values, numeric multisets, identifiers, emphasis, and verdict glosses.');
  console.log(JSON.stringify(stats));
  console.log('Checked ' + fileURLToPath(enPath));
}
