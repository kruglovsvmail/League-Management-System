import React from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { getImageUrl } from '../../../utils/helpers';
import { ShardCorners, ShardField, Halftone, Bar } from './Shards';
import { Split, Big, Cap, Kicker, Tag } from './Type';
import { S, SHARD_PALETTE, drop } from './theme';

// Каркасы оверлея лиги 2.
//
// Stage — полноэкранная плашка: графитовое поле, россыпи осколков в углах,
// заголовок в левом верхнем углу разноцветными словами, данные по центру,
// внизу строка места и даты. Рамок и залитых реек нет — композицию держат
// воздух, жёлтые отбивки и осколки.
//
// Card — плашка поверх живой картинки: графитовая панель с жёлтой кромкой.
// Светлая поверхность здесь не используется: поверх белого льда она теряет
// контраст, светлые панели остаются привилегией полноэкранных плашек.

export const HEADER_H = 214;
export const FOOTER_H = 96;
export const FIELD_H = 1080 - HEADER_H - FOOTER_H; // 770

export function stageText(game) {
  if (!game) return '';
  const isPlayoff = game.stage_type === 'playoff';
  const stage = game.stage_label ? String(game.stage_label).toUpperCase() : (isPlayoff ? 'ПЛЕЙ-ОФФ' : 'РЕГУЛЯРНЫЙ ЧЕМПИОНАТ');
  const num = isPlayoff ? `МАТЧ ${game.series_number || 1}` : `ТУР ${game.series_number || 1}`;
  return `${stage} · ${num}`;
}

export function Brand({ game, size = 54, onPaper = false }) {
  const logo = getSafeUrl(game?.league_logo);
  const name = game?.league_name;
  if (!logo && !name) return null;

  return (
    <div className="flex items-center gap-4 min-w-0">
      {logo && (
        <img src={logo} alt="" style={{ width: size, height: size }} className="object-contain shrink-0"
             onError={(e) => { e.target.style.display = 'none'; }} />
      )}
      {name && (
        <span
          className="font-black uppercase leading-[1.2] max-w-[400px]"
          style={{ color: onPaper ? S.paperMute : S.ash, fontSize: 12, letterSpacing: '0.12em' }}
        >
          {name}
        </span>
      )}
    </div>
  );
}

export function Stage({ game, title, kicker, children, showFooter = true, shards = true }) {
  const dateObj = game?.game_date ? new Date(game.game_date) : null;
  const dateStr = dateObj
    ? dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase()
    : 'ДАТА НЕ УКАЗАНА';
  const city = game?.arena_city ? game.arena_city.toUpperCase() : 'ГОРОД НЕ УКАЗАН';
  const arena = (game?.arena_name || game?.location_text || 'ЛЕДОВАЯ АРЕНА').toUpperCase();
  const division = game?.division_name || game?.division_short_name;

  return (
    <div
      className="w-[1920px] h-[1080px] relative overflow-hidden"
      style={{ background: `linear-gradient(146deg, ${S.coalSoft} 0%, ${S.coal} 42%, ${S.coalDeep} 100%)` }}
    >
      <Halftone color="rgba(255,255,255,0.05)" cell={11} dot={1.5} fade="to bottom right" opacity={0.7} />
      {shards && <ShardCorners palette={SHARD_PALETTE.onCoal} seedBase={2} />}

      {/* ---- ШАПКА ---- */}
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between px-20 pt-12 z-30" style={{ height: HEADER_H }}>
        <div className="min-w-0">
          {kicker && <Kicker size={13} className="mb-5">{kicker}</Kicker>}
          <Split text={title} size={68} colors={[S.white, S.yellow]} className="max-w-[1100px]" />
        </div>

        <div className="flex flex-col items-end gap-4 shrink-0 pt-1">
          <Brand game={game} />
          <div className="flex items-center gap-4">
            <Cap size={12} color={S.ash} tracking="0.24em">{stageText(game)}</Cap>
            {division && <Tag bg={S.yellow} color={S.coalDeep} size={12}>{division}</Tag>}
          </div>
        </div>
      </div>

      {/* ---- ПОЛЕ ---- */}
      <div className="absolute left-0 right-0 z-20 overflow-hidden" style={{ top: HEADER_H, bottom: showFooter ? FOOTER_H : 0 }}>
        {children}
      </div>

      {/* ---- ПОДВАЛ ---- */}
      {showFooter && (
        <div className="absolute left-0 right-0 bottom-0 flex items-center justify-between px-20 z-30" style={{ height: FOOTER_H }}>
          <div className="flex items-center gap-5">
            <Bar w={40} h={9} color={S.yellow} />
            <Big size={26} color={dateObj ? S.white : S.line} tracking="0.02em">{dateStr}</Big>
          </div>
          <Big size={26} color={game?.arena_city ? S.yellow : S.line} tracking="0.02em">{city}</Big>
          <Big size={26} color={(game?.arena_name || game?.location_text) ? S.white : S.line} tracking="0.02em">{arena}</Big>
        </div>
      )}
    </div>
  );
}

// Светлая панель под плотные данные: таблицы, протоколы, списки заявки.
export function PaperPanel({ children, className = '', style = {}, shards = true, seed = 4 }) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ backgroundColor: S.paper, ...style }}>
      <Halftone color="rgba(43,43,43,0.09)" cell={10} dot={1.4} fade="to bottom right" opacity={0.8} />
      {shards && (
        <ShardField
          count={12} seed={seed} origin={[104, 8]} dir={140} spread={60} reach={48} size={13}
          palette={SHARD_PALETTE.onPaper} opacity={0.55}
          className="right-0 top-0 w-[34%] h-[70%]"
        />
      )}
      <div className="relative z-10 w-full h-full">{children}</div>
    </div>
  );
}

// Портрет со срезанным углом: тот же скос, что у всех меток системы.
// Фотографий судей и комментаторов дефолтная графика не показывает вообще.
export function PersonTile({ person, role, size = 96, nameSize = 27, onPaper = false }) {
  if (!person) return null;
  const fallback = getImageUrl('default/user_default.webp');
  const photo = getSafeUrl(person.avatar_url) || fallback;
  const cut = Math.round(size * 0.24);

  return (
    <div className="flex items-center gap-5 min-w-0">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        {/* Жёлтая подложка выглядывает срезанным углом */}
        <div
          className="absolute inset-0"
          style={{ backgroundColor: S.yellow, clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, 0 100%)` }}
        />
        <img
          src={photo}
          alt=""
          className="absolute object-cover object-top"
          style={{
            inset: 3,
            width: size - 6, height: size - 6,
            backgroundColor: S.coalSoft,
            clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, 0 100%)`,
          }}
          onError={(e) => { e.target.onerror = null; e.target.src = fallback; }}
        />
      </div>

      <div className="flex flex-col min-w-0">
        <Cap size={10} color={S.yellow} tracking="0.3em" className="mb-2.5">{role}</Cap>
        <Big size={nameSize} color={onPaper ? S.coal : S.white} className="truncate">{person.last_name}</Big>
        <Cap size={Math.round(nameSize * 0.46)} color={onPaper ? S.paperMute : S.ash} tracking="0.16em" className="mt-2">
          {person.first_name}
        </Cap>
      </div>
    </div>
  );
}

// Плашка поверх живой картинки.
export function Card({ children, className = '', style = {}, accent = S.yellow, gleam = true, seed = 6, shards = true }) {
  return (
    <div style={{ filter: drop('xl') }} className={className}>
      <div className="relative overflow-hidden" style={{ backgroundColor: 'rgba(29,29,29,0.94)', ...style }}>
        <Halftone color="rgba(255,255,255,0.055)" cell={9} dot={1.3} fade="to right" opacity={0.8} />
        {shards && (
          <ShardField
            count={14} seed={seed} origin={[104, 100]} dir={-140} spread={70} reach={62} size={22}
            palette={SHARD_PALETTE.onCoal} opacity={0.5}
            className="right-0 bottom-0 w-[42%] h-full"
          />
        )}
        {gleam && <div className="g2-gleam z-30" style={{ left: '-40%' }} />}

        {/* Жёлтая кромка слева со скошенным низом */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[10px] z-20"
          style={{ backgroundColor: accent, clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 18px), 0 100%)' }}
        />

        <div className="relative z-10">{children}</div>
      </div>
    </div>
  );
}
