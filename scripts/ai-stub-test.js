// Stubbed test for lib/ai.ts (no network). Run from the repo root: node scripts/ai-stub-test.js
const fs = require('fs'), path = require('path');
const ts = require(path.join(process.cwd(), 'node_modules', 'typescript'));
const dir = '/tmp/aitest';
fs.mkdirSync(dir, { recursive: true });
const raw = fs.readFileSync('lib/ai.ts', 'utf8');
if (!raw.includes("'@/lib/llm'")) throw new Error('llm import not found');
const js = ts.transpileModule(raw.replace("'@/lib/llm'", "'./llm-stub'"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
fs.writeFileSync(path.join(dir, 'ai.js'), js);
fs.writeFileSync(path.join(dir, 'llm-stub.js'),
  "exports.callJSON = async () => { if (globalThis.__THROW) throw new Error('stub down'); return globalThis.__RESP; };");
const { adjust, extractFacts } = require(path.join(dir, 'ai.js'));

const team = (n) => ({ name: n, games: 10, gf: 1.8, ga: 1.0, fhGf: 0.8, fhGa: 0.4, cornersFor: 5.8,
  cornersAgainst: 4.4, cardsFor: 1.8, shotsFor: 14, foulsFor: 11, htZeroZeroRate: 0.3, goalMinutes: [12, 34, 55, 78] });
const mk = (cap) => ({
  query: { home: 'Home FC', away: 'Away FC', market: 'corners_ou', side: 'over', line: 9.5, raw: 'x' },
  competition: { id: 't', name: 'Test League', tier: 'A', type: 'club', confidenceCap: cap },
  home: team('Home FC'), away: team('Away FC'),
  leagueAvg: { goals: 2.7, fhGoals: 1.2, corners: 10.2, cards: 3.8 },
  referee: null, fixtureDates: { home: [], away: [] }, news: [], missing: ['referee'],
});
const base = (n) => ({ market: 'corners_ou', probability: 0.7, method: 'test', sampleSize: n });
const flags = [{ key: 'inj', label: 'Key attacker doubtful', impact: 'down', source: 'user' }];
// A response WITH one grounded driver (5.8 is in the context), so its probability is honoured.
const okResp = { probability: 0.7, confidence: 'high', drivers: ['Home FC cornersFor 5.8'], tailRisks: [], evidence: [], gaps: [] };
// A response WITHOUT any driver.
const noDrv = { confidence: 'high', drivers: [], tailRisks: [], evidence: [], gaps: [] };

let fail = 0;
const t = (name, cond) => { console.log(cond ? 'PASS' : 'FAIL', name); if (!cond) fail++; };
const near = (a, b) => Math.abs(a - b) < 1e-9;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const has = (arr, re) => arr.some((s) => re.test(s));

(async () => {
  globalThis.__THROW = false;

  // --- grounded driver: delta honoured, ungrounded 11.6 dropped, gaps deduped ---
  globalThis.__RESP = { probability: 0.66, probLow: 0.6, probHigh: 0.72, confidence: 'high',
    drivers: ['Combined expected corners 11.6 > line 9.5', 'Home FC cornersFor 5.8 vs league average 10.2'],
    tailRisks: ['Base probability 70% could be too high'],
    evidence: ['Away FC cornersAgainst 4.4'],
    gaps: ['referee information missing', 'referee assignment missing', 'weather unknown'] };
  const a = await adjust(mk('high'), base(20), flags);
  t('drops ungrounded 11.6 driver', !a.drivers.join('|').includes('11.6'));
  t('keeps grounded driver', a.drivers.length === 1 && a.drivers[0].includes('5.8'));
  t('grounded driver -> model probability kept', near(a.probability, 0.66));
  t('keeps percent form (70%)', a.tailRisks.length === 1);
  t('keeps grounded evidence', has(a.evidence, /4\.4/));
  t('reports the drop', has(a.evidence, /Removed 1 AI statement/));
  t('no discard note when a driver survives', !has(a.evidence, /discarded/));
  t('gaps deduped', eq(a.gaps, ['referee', 'weather unknown']));
  t('confidence high (cap high, n=20)', a.confidence === 'high');

  // --- clamps (with a grounded driver so the delta is not discarded) ---
  globalThis.__RESP = { ...okResp, probability: 0.99 };
  const b = await adjust(mk('high'), base(20), flags);
  t('clamped to base+0.08', near(b.probability, 0.78));
  t('band >= +-0.05 at n=20', b.probLow <= 0.73 + 1e-9 && b.probHigh >= 0.83 - 1e-9);
  globalThis.__RESP = { ...okResp, probability: -1 };
  t('clamped to base-0.08', near((await adjust(mk('high'), base(20), flags)).probability, 0.62));

  // --- confidence caps ---
  globalThis.__RESP = okResp;
  t('tier cap medium wins', (await adjust(mk('medium'), base(20), flags)).confidence === 'medium');
  t('sample cap n=5 -> low', (await adjust(mk('high'), base(5), flags)).confidence === 'low');
  t('sample cap n=12 -> medium', (await adjust(mk('high'), base(12), flags)).confidence === 'medium');
  globalThis.__RESP = { ...okResp, confidence: 'extreme' };
  t('invalid model confidence -> low', (await adjust(mk('high'), base(20), flags)).confidence === 'low');

  // --- NEW: unexplained delta is discarded ---
  globalThis.__RESP = { ...noDrv, probability: 0.65, probLow: 0.57, probHigh: 0.73, evidence: ['Away FC cornersAgainst 4.4'] };
  const c = await adjust(mk('high'), base(20), flags);
  t('no driver -> probability = base', c.probability === 0.7);
  t('no driver -> symmetric band at n=20', near(c.probLow, 0.65) && near(c.probHigh, 0.75));
  t('no driver -> discard note', has(c.evidence, /discarded/));
  t('no driver -> grounded evidence kept', has(c.evidence, /4\.4/));
  t('no driver -> confidence still capped', c.confidence === 'high');

  globalThis.__RESP = { ...noDrv, probability: 0.66, drivers: ['Combined expected corners 11.6'] };
  const d = await adjust(mk('high'), base(20), flags);
  t('all drivers filtered -> probability = base', d.probability === 0.7 && d.drivers.length === 0);
  t('all drivers filtered -> both notes', has(d.evidence, /Removed 1 AI statement/) && has(d.evidence, /discarded/));

  globalThis.__RESP = { ...noDrv, probability: 0.99 };
  t('no driver + huge delta -> base, not base+0.08', (await adjust(mk('high'), base(20), flags)).probability === 0.7);

  globalThis.__RESP = { ...noDrv, probability: 0.7, probLow: 0.5, probHigh: 0.9 };
  const e = await adjust(mk('high'), base(20), flags);
  t('no driver + zero delta -> no discard note', !has(e.evidence, /discarded/));
  t('no driver + zero delta -> wider model band kept', near(e.probLow, 0.5) && near(e.probHigh, 0.9) && e.probability === 0.7);

  globalThis.__RESP = { ...noDrv, probability: 0.65, evidence: [
    'Home FC cornersFor 5.8', 'Away FC cornersFor 5.8', 'Away FC cornersAgainst 4.4', 'League average corners 10.2', 'Line 9.5'] };
  const f5 = await adjust(mk('high'), base(20), flags);
  t('evidence stays <= 5 with discard note', f5.evidence.length === 5 && /discarded/.test(f5.evidence[4]));

  globalThis.__RESP = { ...okResp, probability: 'abc' };
  const nn = await adjust(mk('high'), base(20), flags);
  t('non-numeric probability -> fallback', /unavailable/.test(nn.evidence[0]) && nn.probability === 0.7);

  // --- fallback when the model call fails ---
  globalThis.__THROW = true;
  const f = await adjust(mk('high'), base(5), flags);
  t('fallback evidence text', /unavailable/.test(f.evidence[0]));
  t('fallback probability unchanged', f.probability === 0.7);
  t('fallback band +-0.12 at n=5', near(f.probLow, 0.58) && near(f.probHigh, 0.82));
  t('fallback confidence low at n=5', f.confidence === 'low');

  // --- extractFacts ---
  let threw = false;
  try { await extractFacts('   '); } catch (err) { threw = err.message === 'EMPTY_INPUT'; }
  t('empty input throws EMPTY_INPUT', threw);
  const x = await extractFacts('striker out; Saka doubtful; rain expected');
  t('fallback splits injuries/lateNews', eq(x.injuries, ['striker out', 'Saka doubtful']) && eq(x.lateNews, ['rain expected']));
  globalThis.__THROW = false;
  globalThis.__RESP = { injuries: ['a', 5, null], lateNews: 'x' };
  t('drops non-string items', eq((await extractFacts('anything')).injuries, ['a']));
  globalThis.__RESP = {};
  t('empty model JSON -> rules', eq((await extractFacts('striker out')).injuries, ['striker out']));

  console.log(fail ? 'FAILED: ' + fail : 'ALL PASS');
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
