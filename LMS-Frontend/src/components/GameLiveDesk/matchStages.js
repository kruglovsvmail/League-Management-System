// src/components/GameLiveDesk/matchStages.js
// Карусель этапов матча в панели секретаря. Портировано 1:1 из
// LMS-Backend/utils/matchStages.js — менять оба файла вместе; подписи есть только здесь.
//
// Ключи: 'WU' — разминка, '1'…'N' — периоды, 'B1'…'BN' — перерыв после периода с этим
// номером, 'OT' — овертайм, 'SO' — буллиты. Периоды, овертайм и буллиты живут в period,
// как и раньше; разминка и перерывы — в stage, со своими часами (игровое время стоит).

export const isPauseStage = (key) => key === 'WU' || /^B\d+$/.test(String(key));

export const stageRank = (key) => {
  const k = String(key);
  if (k === 'WU') return 0;
  if (k === 'OT') return 10000;
  if (k === 'SO') return 10001;
  if (/^B\d+$/.test(k)) return Number(k.slice(1)) * 2 + 1;
  const n = parseInt(k, 10);
  return Number.isNaN(n) ? -1 : n * 2;
};

export const buildMatchStages = ({ periodsCount, otLength, soLength, warmupLength, breakLength }) => {
  const count = parseInt(periodsCount, 10) || 3;
  const hasOt = (parseInt(otLength, 10) || 0) > 0;
  const hasSo = (parseInt(soLength, 10) || 0) > 0;
  const hasBreaks = (parseInt(breakLength, 10) || 0) > 0;

  const stages = [];
  if ((parseInt(warmupLength, 10) || 0) > 0) stages.push('WU');
  for (let p = 1; p <= count; p++) {
    stages.push(String(p));
    if (hasBreaks && (p < count || hasOt)) stages.push(`B${p}`);
  }
  if (hasOt) stages.push('OT');
  if (hasSo) stages.push('SO');
  return stages;
};

// Соседи ищутся по месту в матче, а не по индексу — так стрелки работают, даже если
// текущего этапа в карусели уже нет (перерывы выключили, пока шёл перерыв).
export const prevStageKey = (stages, key) => [...stages].reverse().find((s) => stageRank(s) < stageRank(key)) ?? null;
export const nextStageKey = (stages, key) => stages.find((s) => stageRank(s) > stageRank(key)) ?? null;

export const pauseStageSeconds = (key, { warmupLength, breakLength }) => {
  const minutes = key === 'WU' ? warmupLength : breakLength;
  return Math.max(0, parseInt(minutes, 10) || 0) * 60;
};

export const stageLabel = (key) => {
  const k = String(key);
  if (k === 'WU') return 'Разминка';
  if (k === 'OT') return 'Овертайм';
  if (k === 'SO') return 'Буллиты';
  if (/^B\d+$/.test(k)) return `Перерыв ${k.slice(1)}`;
  return `${k}-й период`;
};
