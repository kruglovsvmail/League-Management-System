// src/components/WebGraphics/Graphics_2/BumperOverlay.jsx
//
// Заставка лиги 2. Логика воспроизведения (переход → ролик → переход, подхват
// после перезагрузки, прогрев) — та же, что у дефолтной графики, и живёт в
// defaultGraphics/BumperOverlay.jsx: копировать её сюда незачем, разница только
// в рисунке перехода. Рисунок свой (./bumperFrame.js), а с ним и тайминги —
// их и передаём, иначе ролик впускался бы по отметкам дефолтного перехода.
//
// Файл перехода собирается в панели трансляции. После смены рисунка его нужно
// пересобрать там же — старый файл нарисован дефолтным сценарием.
import React from 'react';
import DefaultBumperOverlay from '../defaultGraphics/BumperOverlay';
import { SWEEP_MS, COVER_MS } from './bumperFrame';

const TIMING = { sweepMs: SWEEP_MS, coverMs: COVER_MS };

export default function BumperOverlay(props) {
  return <DefaultBumperOverlay {...props} timing={TIMING} />;
}
