// src/components/WebGraphics/defaultGraphics/DivisionNominationsOverlay.jsx
//
// Номинации дивизиона, топ-5: колонка на номинацию — лидер крупно (фото,
// значение синим), под ним места 2–5. Ширина колонок и кегли подстраиваются
// под число выбранных номинаций.
//
// Одна-две номинации в узкие колонки не ложатся — пустеют по краям. Для них
// своя раскладка: карточка в ширину, лидер слева крупно, места 2–5 справа.
import React from 'react';
import { Photo, Crest, FitText, Page } from './kit';
import { Stage, StageEmpty, BODY_H, STAGE } from './Stage';
import { selectedNominations } from '../broadcastConfig';
import { C, ACCENT_FILL } from './theme';

const value = (p, n) => (p.value == null ? '—'
  : n.metric_format === 'percent'
    ? `${(Number(p.value) * 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`
    : p.value);

// Широкая карточка — для 1–2 номинаций.
function WideCard({ n, delay, single }) {
  const w = n.players[0];
  const photo = single ? 300 : 230;
  return (
    <section className="g2-rise" style={{ '--d': `${delay}ms`, flex: single ? '0 1 1240px' : 1, minWidth: 0, display: 'flex', flexDirection: 'column',
                                           padding: single ? '26px 34px 30px' : '22px 26px 26px', borderRadius: 28, background: 'rgba(0,0,0,.26)', boxShadow: `inset 0 0 0 1px ${C.rim}` }}>
      <div style={{ textAlign: 'center', fontSize: single ? 26 : 22, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text, paddingBottom: 18,
                    borderBottom: `1px solid ${C.divider}` }}>
        {n.name}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: single ? 46 : 28, alignItems: 'center', paddingTop: 20 }}>
        {/* Лидер */}
        <div style={{ width: photo + 30, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ position: 'relative', width: photo, height: photo, marginBottom: 20 }}>
            <Photo url={w.avatar_url} style={{ width: '100%', height: '100%', borderRadius: '22%', boxShadow: `inset 0 0 0 1px ${C.rimHi}` }} />
            <span style={{ position: 'absolute', top: -10, left: -10, width: 44, height: 44, borderRadius: 12, background: ACCENT_FILL, display: 'flex', alignItems: 'center',
                           justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#fff', boxShadow: '0 8px 18px -6px rgba(23,148,221,.8)' }}>1</span>
            <Crest url={w.team_logo_url} size={Math.round(photo * 0.38)} style={{ position: 'absolute', right: -18, bottom: -18 }} />
          </div>
          <FitText align="center" min={0.6} style={{ width: '100%', fontSize: single ? 38 : 32, fontWeight: 800, textTransform: 'uppercase', color: C.text, lineHeight: 1.1 }}>{w.last_name}</FitText>
          <div style={{ fontSize: single ? 21 : 18, fontWeight: 600, color: C.main, marginTop: 6 }}>{w.first_name}</div>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.08em', color: C.subtle, marginTop: 6, textTransform: 'uppercase' }}>{w.team_name}</div>
          <div className="g2-num" style={{ marginTop: 16, fontSize: single ? 72 : 60, fontWeight: 800, lineHeight: 1, color: C.accentSoft }}>{value(w, n)}</div>
          <div style={{ marginTop: 8, fontSize: 16, fontWeight: 800, letterSpacing: '0.14em', color: C.muted, textTransform: 'uppercase' }}>{n.metric_label}</div>
        </div>
        {/* Места 2–5 */}
        <div style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: single ? 16 : 12 }}>
          {n.players.slice(1, 5).map((p, i) => (
            <div key={`${p.team_id}:${p.player_id}`} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: single ? '14px 18px' : '12px 14px', borderRadius: 18,
                                                             background: 'rgba(255,255,255,.03)', boxShadow: `inset 0 0 0 1px ${C.rim}` }}>
              <span className="g2-num" style={{ width: 24, textAlign: 'center', fontSize: 20, fontWeight: 800, color: C.subtle, flexShrink: 0 }}>{i + 2}</span>
              <Photo url={p.avatar_url} style={{ width: single ? 64 : 56, height: single ? 64 : 56, borderRadius: 14, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: single ? 24 : 21, fontWeight: 800, textTransform: 'uppercase', color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.last_name}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.muted, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {[p.first_name, p.team_name].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span className="g2-num" style={{ fontSize: single ? 34 : 30, fontWeight: 800, color: C.text, flexShrink: 0 }}>{value(p, n)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function DivisionNominationsOverlay({ game, overlay, broadcast }) {
  const visible = overlay.visible && overlay.type === 'division_nominations';
  const list = selectedNominations(broadcast?.data, overlay.data?.nominationIds);
  const count = list.length;
  const inner = STAGE.width - 80;
  const gap = 14;
  const colW = (inner - Math.max(0, count - 1) * gap) / Math.max(1, count);
  const photo = Math.min(200, Math.max(56, colW - 70));
  const nameSize = count > 7 ? 15 : count > 4 ? 22 : 28;
  const valueSize = count > 7 ? 30 : count > 4 ? 44 : 54;
  const small = count > 6;

  return (
    <Stage game={game} visible={visible} title="Номинации дивизиона" kicker="Топ-5">
      {!count ? <StageEmpty loading={broadcast?.loading} error={broadcast?.error} /> : (
        count <= 2 ? (
          <Page pageKey={list.map(n => n.id).join(',')} style={{ height: BODY_H, display: 'flex', justifyContent: 'center', gap: 24, padding: '30px 40px 34px' }}>
            {list.map((n, ci) => <WideCard key={n.id} n={n} delay={260 + ci * 90} single={count === 1} />)}
          </Page>
        ) : (
        <Page pageKey={list.map(n => n.id).join(',')} style={{ height: BODY_H, display: 'flex', gap, padding: '26px 40px 30px' }}>
          {list.map((n, ci) => {
            const w = n.players[0];
            return (
              <section key={n.id} className="g2-rise" style={{ '--d': `${260 + ci * 70}ms`, flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: small ? 12 : 18,
                                                              borderRadius: 26, background: 'rgba(0,0,0,.26)', boxShadow: `inset 0 0 0 1px ${C.rim}` }}>
                <div style={{ height: small ? 50 : 58, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                              fontSize: small ? 16 : 20, fontWeight: 800, letterSpacing: '0.06em', lineHeight: 1.15, textTransform: 'uppercase', color: C.text }}>
                  {n.name}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingBottom: 16, borderBottom: `1px solid ${C.divider}` }}>
                  <div style={{ position: 'relative', width: photo, height: photo, marginTop: 6, marginBottom: 16 }}>
                    <Photo url={w.avatar_url} style={{ width: '100%', height: '100%', borderRadius: '24%', boxShadow: `inset 0 0 0 1px ${C.rimHi}` }} />
                    <span style={{ position: 'absolute', top: -8, left: -8, width: 34, height: 34, borderRadius: 10, background: ACCENT_FILL, display: 'flex', alignItems: 'center',
                                   justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#fff', boxShadow: '0 6px 14px -4px rgba(23,148,221,.8)' }}>1</span>
                    <Crest url={w.team_logo_url} size={Math.round(Math.max(42, photo * 0.38))} style={{ position: 'absolute', right: -12, bottom: -12 }} />
                  </div>
                  <FitText align="center" min={0.6} style={{ width: '100%', fontSize: nameSize, fontWeight: 800, textTransform: 'uppercase', color: C.text, lineHeight: 1.1 }}>{w.last_name}</FitText>
                  <div style={{ fontSize: small ? 15 : 17, fontWeight: 600, color: C.muted, marginTop: 4, maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.first_name}</div>
                  <div style={{ fontSize: small ? 13 : 15, fontWeight: 700, letterSpacing: '0.06em', color: C.subtle, marginTop: 4, textTransform: 'uppercase', maxWidth: '100%',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.team_name}</div>
                  <div className="g2-num" style={{ marginTop: 12, fontSize: valueSize, fontWeight: 800, lineHeight: 1, color: C.accentSoft }}>{value(w, n)}</div>
                  <div style={{ marginTop: 6, fontSize: small ? 13 : 15, fontWeight: 800, letterSpacing: '0.1em', color: C.muted, textTransform: 'uppercase' }}>{n.metric_label}</div>
                </div>

                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', paddingTop: 8 }}>
                  {n.players.slice(1, 5).map((p, i) => (
                    <div key={`${p.team_id}:${p.player_id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span className="g2-num" style={{ width: 18, textAlign: 'center', fontSize: 17, fontWeight: 800, color: C.subtle, flexShrink: 0 }}>{i + 2}</span>
                      <Photo url={p.avatar_url} style={{ width: small ? 30 : 42, height: small ? 30 : 42, borderRadius: 10, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: small ? 15 : 18, fontWeight: 800, textTransform: 'uppercase', color: C.main, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.last_name}{p.first_name ? ` ${p.first_name[0]}.` : ''}
                        </div>
                        <div style={{ fontSize: small ? 12 : 14, fontWeight: 600, color: C.subtle, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.team_name}</div>
                      </div>
                      <span className="g2-num" style={{ fontSize: small ? 18 : 23, fontWeight: 800, color: C.text, flexShrink: 0 }}>{value(p, n)}</span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </Page>
        )
      )}
    </Stage>
  );
}
