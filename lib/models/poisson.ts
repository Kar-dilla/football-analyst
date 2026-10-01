export function poissonPmf(k: number, lambda: number): number {
  if (!Number.isInteger(k) || k < 0 || !(lambda >= 0)) return 0;
  if (lambda === 0) return k === 0 ? 1 : 0;
  let logFact = 0;
  for (let i = 2; i <= k; i++) logFact += Math.log(i);
  return Math.exp(-lambda + k * Math.log(lambda) - logFact);
}

export function poissonOver(lambda: number, line: number): number {
  const kMax = Math.floor(line);
  if (kMax < 0) return 1;
  let cdf = 0;
  for (let k = 0; k <= kMax; k++) cdf += poissonPmf(k, lambda);
  return Math.min(1, Math.max(0, 1 - cdf));
}

export function scoreGrid(lambdaHome: number, lambdaAway: number, maxGoals = 10): number[][] {
  const ph: number[] = [];
  const pa: number[] = [];
  for (let k = 0; k <= maxGoals; k++) {
    ph.push(poissonPmf(k, lambdaHome));
    pa.push(poissonPmf(k, lambdaAway));
  }
  return ph.map((p) => pa.map((q) => p * q));
}
