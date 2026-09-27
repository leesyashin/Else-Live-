// Kennzahlen für die Statistik – reine Berechnungen aus dem Zustand.

import { startOfDay } from './lib/html.js';
import { jointCost, jointThcMg } from './store.js';

const DAY = 86400000;

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null;
  for (const [value, n] of counts) if (!best || n > best.n) best = { value, n };
  return best;
}

/** days: 7, 30 oder null (= alles) */
export function computeStats(joints, days) {
  const since = days ? startOfDay().getTime() - (days - 1) * DAY : 0;
  const list = joints.filter((j) => Date.parse(j.createdAt) >= since);
  const count = list.length;
  const grams = list.reduce((sum, j) => sum + j.grams, 0);

  const rollers = new Map();
  const strains = new Map();
  let thc = 0;
  let cost = 0;
  let priced = 0;
  for (const j of list) {
    const r = rollers.get(j.rolledBy) ?? { id: j.rolledBy, count: 0, grams: 0 };
    r.count += 1;
    r.grams += j.grams;
    rollers.set(j.rolledBy, r);
    for (const c of j.components) strains.set(c.strainId, (strains.get(c.strainId) ?? 0) + c.grams);
    thc += jointThcMg(j);
    const jc = jointCost(j);
    if (jc != null) {
      cost += jc;
      priced += 1;
    }
  }

  const hour = mostCommon(list.map((j) => new Date(j.createdAt).getHours()));

  return {
    count,
    grams,
    avg: count ? grams / count : 0,
    thcMg: thc,
    cost: priced ? cost : null,
    rollers: [...rollers.values()].sort((a, b) => b.count - a.count || b.grams - a.grams),
    strains: [...strains].map(([id, g]) => ({ id, grams: g })).sort((a, b) => b.grams - a.grams),
    withTobacco: list.filter((j) => j.tobacco).length,
    withFilter: list.filter((j) => j.carbonFilter).length,
    topTobacco: mostCommon(list.map((j) => j.tobacco).filter(Boolean))?.value ?? null,
    topFilter: mostCommon(list.map((j) => j.filterBrand).filter(Boolean))?.value ?? null,
    peakHour: hour ? hour.value : null,
    avgRotation: count ? list.reduce((sum, j) => sum + j.rotation.length, 0) / count : 0,
  };
}
