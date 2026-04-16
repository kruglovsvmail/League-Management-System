// src/components/GameLiveDesk/PDF-Protocol/templates/DefaultProtocol.jsx
import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font } from '@react-pdf/renderer';

Font.register({
  family: 'Roboto',
  fonts: [
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf', fontWeight: 400 },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Bold.ttf', fontWeight: 700 }
  ]
});

const styles = StyleSheet.create({
  page: { padding: 10, fontFamily: 'Roboto', fontSize: 9, backgroundColor: '#fff', flexDirection: 'column' },
  headerContainer: { textAlign: 'center', marginBottom: 2 },
  mainTitle: { fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase' },
  subTitle: { fontSize: 9, color: '#919191', marginTop: 0 },
  
  metaTable: { width: '100%', borderTopWidth: 1, borderLeftWidth: 1, borderColor: '#858585', marginBottom: 4 },
  metaRow: { flexDirection: 'row', height: 14 },
  metaCol: { width: '33.33%', borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#858585', paddingHorizontal: 5, justifyContent: 'center' },
  metaSplitCol: { width: '33.34%', flexDirection: 'row', borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#858585' },
  metaVerticalDivider: { width: 1, height: '100%', backgroundColor: '#858585' },
  
  gridRow: { flexDirection: 'row', height: 12 },
  gridCell: { borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#858585', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 2 },
  
  label: { fontWeight: 'bold' },
  valueText: { fontSize: 8 },
  sectionTitle: { fontSize: 7.5, fontWeight: 'bold', textTransform: 'uppercase' },
  columnTitle: { fontSize: 6.5, fontWeight: 'normal' },
  dataText: { fontSize: 7 },

  /* --- ПОДВАЛ ОБЩИЕ СТИЛИ --- */
  footerMainContainer: { width: '100%', marginTop: 5, flexDirection: 'row' },
  
  /* ИДЕАЛЬНОЕ ПРИЛЕГАНИЕ БЛОКОВ (Без отступов) */
  footerColumnLeft: { width: '22%' },
  footerColumnMiddle: { width: '44%' },
  footerColumnRight: { width: '34%' },

  f0f0f0: { backgroundColor: '#f0f0f0' },

  /* ВНУТРЕННЯЯ СЕТКА ПОДВАЛА (Тонкая 1px) */
  rowShort: { flexDirection: 'row', height: 12 },
  rowTall: { flexDirection: 'row', height: 24 },
  cellCenter: { borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#858585', justifyContent: 'center', alignItems: 'center' },

  /* СТИЛЬ ЖИРНОЙ РАМКИ (Насыщенная 1.5px, цвет #222222) */
  thickBorder: { borderWidth: 1.5, borderColor: '#222222', position: 'absolute' }
});

const formatTime = (totalSeconds) => {
  if (totalSeconds === undefined || totalSeconds === null) return '';
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const GOAL_STRENGTH_MAP = { "equal": "РС", "pp": "+1", "pp1": "+1", "pp2": "+2", "sh": "-1", "sh1": "-1", "sh2": "-2", "en": "ПВ", "ps": "ШБ" };
const PENALTY_REASON_MAP = { "Агрессор в драке": "Агрессор в драке", "Атака в голову или шею": "Атака в голову/шею", "Блокировка": "Блокировка", "Бросок клюшки и снаряжения": "Бросок клюшки/экип.", "Выброс шайбы": "Выброс шайбы", "Грубость": "Грубость", "Дисциплинарный до конца матча штраф": "Дисц. до конца матча", "Дисциплинарный штраф": "Дисциплинарный штраф", "Драка": "Драка", "Задержка игры": "Задержка игры", "Задержка клюшки соперника": "Задерж. клюшки соп.", "Задержка клюшкой": "Задержка клюшкой", "Задержка соперника": "Задержка соперника", "Задержка шайбы руками": "Задерж. шайбы руками", "Зачинщик драки": "Зачинщик драки", "Игра высоко поднятой клюшкой": "Игра высок. клюшкой", "Игра со сломанной клюшкой": "Игра со слом. клюшк.", "Колющий удар": "Колющий удар", "Малый скамеечный штраф": "Малый скамееч. штраф", "Нарушение численного состава": "Наруш. числ. состава", "Неправильная атака": "Неправильная атака", "Нестандартное снаряжение": "Нестандарт. снаряж.", "Опасное снаряжение": "Опасное снаряжение", "Опасные действия": "Опасные действия", "Оскорбление судей и неспортивное поведение": "Оскорбление/неспорт.", "Отказ начать игру": "Отказ начать игру", "Отсечение": "Отсечение", "Подножка": "Подножка", "Покид. скамейки штрафников во время конфл.": "Покид. скам. штраф.", "Покид. скамейки запасных во время конфл.": "Покид. скам. запас.", "Сдвиг ворот": "Сдвиг ворот", "Симуляция": "Симуляция", "Толчок клюшкой": "Толчок клюшкой", "Толчок на борт": "Толчок на борт", "Удар головой": "Удар головой", "Удар клюшкой": "Удар клюшкой", "Удар коленом": "Удар коленом", "Удар концом клюшки": "Удар концом клюшки", "Удар локтем": "Удар локтем", "Удар ногой": "Удар ногой", "Физический контакт со зрителем": "Контакт со зрителем", "Штр. вр: игра за красной линией": "Штр.вр: за кр.линией", "Штр. вр: покидание площади ворот в конфликте": "Штр.вр: уход из вор.", "Штр. вр: помещающий шайбу на сетку ворот": "Штр.вр: шайба-сетка", "Штр. вр: отправился к скамейке в остановке": "Штр.вр: ушел к скам." };

export const DefaultProtocol = ({ data }) => {
  const info = data?.info || {};
  const home = data?.home || { goalies: [], fieldPlayers: [], goals: [], penalties: [], coachSig: "", off1Sig: "", off2Sig: "" };
  const away = data?.away || { goalies: [], fieldPlayers: [], goals: [], penalties: [], coachSig: "", off1Sig: "", off2Sig: "" };
  const officials = data?.officials || { hasHead2: false, head1: "", head2: "", scorekeeper: "", linesman1: "", linesman2: "" };

  const docTitle = `Протокол_${info.season || ''}_${info.division || ''}_${info.gameNum || ''}`;

  const rawGoalieLog = data?.goalieLog || [];
  const goalieRows = Array.from({ length: 10 }, (_, i) => {
    return rawGoalieLog[i] || { time_seconds: null, home_jersey: '', away_jersey: '' };
  });

  const periods = data?.periods || ['1', '2', '3'];
  const stats = data?.stats || {};
  const periodsAndTotal = [...periods, 'Общ.'];

  const renderMiddleDataSection = (title, homeKey, awayKey) => (
    <View style={{ flexDirection: 'row', height: 24 }}>
      <View style={[styles.cellCenter, { width: '28%' }]}>
        <Text style={[styles.dataText, { textAlign: 'center' }]}>{title}</Text>
      </View>
      <View style={{ width: '12%', flexDirection: 'column' }}>
         <View style={[styles.cellCenter, { height: 12 }]}><Text style={styles.dataText}>«А»</Text></View>
         <View style={[styles.cellCenter, { height: 12 }]}><Text style={styles.dataText}>«Б»</Text></View>
      </View>
      <View style={{ width: '60%', flexDirection: 'column' }}>
         <View style={{ height: 12, flexDirection: 'row' }}>
           {periodsAndTotal.map((p, i) => {
              const val = stats[p]?.[homeKey] > 0 ? stats[p][homeKey] : '';
              return (
                <View key={`home-${i}`} style={[styles.cellCenter, { flex: 1 }]}>
                  <Text style={styles.dataText}>{val}</Text>
                </View>
              );
           })}
         </View>
         <View style={{ height: 12, flexDirection: 'row' }}>
           {periodsAndTotal.map((p, i) => {
              const val = stats[p]?.[awayKey] > 0 ? stats[p][awayKey] : '';
              return (
                <View key={`away-${i}`} style={[styles.cellCenter, { flex: 1 }]}>
                  <Text style={styles.dataText}>{val}</Text>
                </View>
              );
           })}
         </View>
      </View>
    </View>
  );

  const renderTeamGrid = (teamLetter, teamData, isFirst = false) => {
    const rows = Array.from({ length: 22 });
    return (
      <View style={{ width: '100%', marginTop: 0 }}>
        
        <View style={{ width: '100%', position: 'relative' }}>
          <View style={[styles.gridRow, { backgroundColor: '#f0f0f0' }]}>
            <View style={[styles.gridCell, { width: '32%' }]}><Text style={styles.sectionTitle} numberOfLines={1}>Команда «{teamLetter}» {teamData.name}</Text></View>
            <View style={[styles.gridCell, { width: '28%' }]}><Text style={styles.sectionTitle} numberOfLines={1}>Взятие ворот</Text></View>
            <View style={[styles.gridCell, { width: '40%' }]}><Text style={styles.sectionTitle} numberOfLines={1}>Удаление</Text></View>
          </View>

          <View style={[styles.gridRow, { height: 12, backgroundColor: '#f0f0f0' }]}>
            <View style={[styles.gridCell, { width: '4%' }]}><Text style={styles.columnTitle}>№</Text></View>
            <View style={[styles.gridCell, { width: '18%' }]}><Text style={styles.columnTitle}>Фамилия Имя</Text></View>
            <View style={[styles.gridCell, { width: '6%' }]}><Text style={styles.columnTitle}>Поз.</Text></View>
            <View style={[styles.gridCell, { width: '4%' }]}><Text style={styles.columnTitle}>Иг</Text></View>
            <View style={[styles.gridCell, { width: '3%' }]}><Text style={styles.columnTitle}>№</Text></View>
            <View style={[styles.gridCell, { width: '6%' }]}><Text style={styles.columnTitle}>Время</Text></View>
            <View style={[styles.gridCell, { width: '5%' }]}><Text style={styles.columnTitle}>Г.</Text></View>
            <View style={[styles.gridCell, { width: '5%' }]}><Text style={styles.columnTitle}>П1.</Text></View>
            <View style={[styles.gridCell, { width: '5%' }]}><Text style={styles.columnTitle}>П2.</Text></View>
            <View style={[styles.gridCell, { width: '4%' }]}><Text style={styles.columnTitle}>ИС.</Text></View>
            <View style={[styles.gridCell, { width: '4%' }]}><Text style={styles.columnTitle}>№</Text></View>
            <View style={[styles.gridCell, { width: '4%' }]}><Text style={styles.columnTitle}>Шт.</Text></View>
            <View style={[styles.gridCell, { width: '20%' }]}><Text style={styles.columnTitle}>Причина</Text></View>
            <View style={[styles.gridCell, { width: '6%' }]}><Text style={styles.columnTitle}>Начало</Text></View>
            <View style={[styles.gridCell, { width: '6%' }]}><Text style={styles.columnTitle}>Окончан.</Text></View>
          </View>

          {rows.map((_, index) => {
            let player = index < 2 ? teamData.goalies[index] : teamData.fieldPlayers[index - 2];
            let positionLabel = index < 2 ? 'Вр' : (player?.translated_position || '');
            const goal = teamData.goals[index];
            const penalty = teamData.penalties[index];

            return (
              <View key={index} style={styles.gridRow}>
                <View style={[styles.gridCell, { width: '4%' }]}><Text style={styles.dataText}>{player?.jersey_number || ''}</Text></View>
                <View style={[styles.gridCell, { width: '18%', alignItems: 'flex-start', paddingLeft: 4 }]}><Text style={styles.dataText}>{player ? `${player.last_name} ${player.first_name || ''}`.trim() : ''}</Text></View>
                <View style={[styles.gridCell, { width: '6%' }]}><Text style={styles.dataText}>{positionLabel}</Text></View>
                <View style={[styles.gridCell, { width: '4%' }]}><Text style={styles.dataText}>{player ? 'Да' : ''}</Text></View>
                <View style={[styles.gridCell, { width: '3%' }]}><Text style={styles.dataText}>{goal ? (index + 1) : ''}</Text></View>
                <View style={[styles.gridCell, { width: '6%' }]}><Text style={styles.dataText}>{formatTime(goal?.time_seconds)}</Text></View>
                <View style={[styles.gridCell, { width: '5%' }]}><Text style={styles.dataText}>{goal?.scorer_number || ''}</Text></View>
                <View style={[styles.gridCell, { width: '5%' }]}><Text style={styles.dataText}>{goal?.a1_number || ''}</Text></View>
                <View style={[styles.gridCell, { width: '5%' }]}><Text style={styles.dataText}>{goal?.a2_number || ''}</Text></View>
                <View style={[styles.gridCell, { width: '4%' }]}><Text style={styles.dataText}>{goal ? (GOAL_STRENGTH_MAP[goal.goal_strength] || goal.goal_strength || '') : ''}</Text></View>
                <View style={[styles.gridCell, { width: '4%' }]}><Text style={styles.dataText}>{penalty?.scorer_number || ''}</Text></View>
                <View style={[styles.gridCell, { width: '4%' }]}><Text style={styles.dataText}>{penalty?.penalty_minutes || ''}</Text></View>
                <View style={[styles.gridCell, { width: '20%' }]}><Text style={styles.dataText}>{penalty ? (PENALTY_REASON_MAP[penalty.penalty_violation] || penalty.penalty_violation || '') : ''}</Text></View>
                <View style={[styles.gridCell, { width: '6%' }]}><Text style={styles.dataText}>{formatTime(penalty?.time_seconds)}</Text></View>
                <View style={[styles.gridCell, { width: '6%' }]}><Text style={styles.dataText}>{formatTime(penalty?.penalty_end_time)}</Text></View>
              </View>
            );
          })}

          <View style={[styles.thickBorder, { top: 0, left: 0, width: '32%', height: '100%', borderTopWidth: isFirst ? 1.5 : 0 }]} pointerEvents="none" />
          <View style={[styles.thickBorder, { top: 0, left: '32%', width: '28%', height: '100%', borderLeftWidth: 0, borderTopWidth: isFirst ? 1.5 : 0 }]} pointerEvents="none" />
          <View style={[styles.thickBorder, { top: 0, left: '60%', width: '40%', height: '100%', borderLeftWidth: 0, borderTopWidth: isFirst ? 1.5 : 0 }]} pointerEvents="none" />
        </View>

        <View style={[styles.gridRow, { height: 12, borderWidth: 1.5, borderTopWidth: 0, borderColor: '#222222', flexDirection: 'row' }]}>
          <View style={{ flex: 1, borderRightWidth: 1, borderColor: '#858585', justifyContent: 'center', paddingLeft: 4 }}>
            <Text style={{ fontSize: 6, fontWeight: 'normal', color: '#000' }}>Тренер:  <Text style={{ fontSize: 7, color: teamData.coachSig ? '#000' : '#d1d1d1' }}>{teamData.coachSig || '—'}</Text></Text>
          </View>
          <View style={{ flex: 1, borderRightWidth: 1, borderColor: '#858585', justifyContent: 'center', paddingLeft: 4 }}>
            <Text style={{ fontSize: 6, fontWeight: 'normal', color: '#000' }}>Офиц. лицо 1:  <Text style={{ fontSize: 7, color: teamData.off1Sig ? '#000' : '#d1d1d1' }}>{teamData.off1Sig || '—'}</Text></Text>
          </View>
          <View style={{ flex: 1, justifyContent: 'center', paddingLeft: 4 }}>
            <Text style={{ fontSize: 6, fontWeight: 'normal', color: '#000' }}>Офиц. лицо 2:  <Text style={{ fontSize: 7, color: teamData.off2Sig ? '#000' : '#d1d1d1' }}>{teamData.off2Sig || '—'}</Text></Text>
          </View>
        </View>

      </View>
    );
  };

  return (
    <Document title={docTitle}>
      <Page size="A4" orientation="portrait" style={styles.page}>
        <View style={styles.headerContainer}>
          <Text style={styles.mainTitle} numberOfLines={1}>ОФИЦИАЛЬНЫЙ ПРОТОКОЛ МАТЧА ТЮМЕНСКОГО ГОРОДСКОГО ЧЕМПИОНАТА</Text>
          <Text style={styles.subTitle} numberOfLines={1}>среди любительских команд, старше восемнадцати лет, сезона {info.season}</Text>
        </View>

        <View style={styles.metaTable}>
          <View style={styles.metaRow}>
            <View style={styles.metaCol}><Text style={styles.valueText}><Text style={styles.label}>Вид соревнования: </Text>Хоккей с шайбой</Text></View>
            <View style={styles.metaCol}><Text style={styles.valueText}><Text style={styles.label}>Дивизион: </Text>{info.division}</Text></View>
            <View style={styles.metaSplitCol}>
              <View style={[styles.metaCol, { width: '50%', borderRightWidth: 0, borderBottomWidth: 0 }]}><Text style={styles.valueText}><Text style={styles.label}>Дата: </Text>{info.date}</Text></View>
              <View style={styles.metaVerticalDivider} />
              <View style={[styles.metaCol, { width: '50%', borderRightWidth: 0, borderBottomWidth: 0 }]}><Text style={styles.valueText}><Text style={styles.label}>№ игры: </Text>{info.gameNum}</Text></View>
            </View>
          </View>
          <View style={styles.metaRow}>
            <View style={styles.metaCol}><Text style={styles.valueText}><Text style={styles.label}>Место проведения: </Text>{info.arena}</Text></View>
            <View style={styles.metaCol}><Text style={styles.valueText}><Text style={styles.label}>Начало: </Text>{info.start}</Text></View>
            <View style={styles.metaCol}><Text style={styles.valueText}><Text style={styles.label}>Количество зрителей: </Text>{info.spectators}</Text></View>
          </View>
        </View>

        {renderTeamGrid("А", home, true)}
        {renderTeamGrid("Б", away, false)}

        <View style={styles.footerMainContainer}>
          
          <View style={[styles.footerColumnLeft, { position: 'relative' }]}>
            <View style={[styles.rowShort, styles.f0f0f0]}>
              <View style={[styles.cellCenter, { width: '40%' }]}><Text style={styles.columnTitle}>Время</Text></View>
              <View style={[styles.cellCenter, { width: '30%' }]}><Text style={styles.columnTitle}>«А»</Text></View>
              <View style={[styles.cellCenter, { width: '30%' }]}><Text style={styles.columnTitle}>«Б»</Text></View>
            </View>
            {goalieRows.map((row, index) => (
              <View key={`goalie-row-${index}`} style={styles.rowShort}>
                <View style={[styles.cellCenter, { width: '40%' }]}><Text style={styles.dataText}>{formatTime(row.time_seconds)}</Text></View>
                <View style={[styles.cellCenter, { width: '30%' }]}><Text style={styles.dataText}>{row.home_jersey}</Text></View>
                <View style={[styles.cellCenter, { width: '30%' }]}><Text style={styles.dataText}>{row.away_jersey}</Text></View>
              </View>
            ))}
            <View style={[styles.thickBorder, { top: 0, left: 0, width: '100%', height: '100%' }]} pointerEvents="none" />
          </View>

          <View style={[styles.footerColumnMiddle, { position: 'relative' }]}>
             <View style={{ flexDirection: 'row', height: 24 }}>
                <View style={[styles.cellCenter, { width: '40%' }]}><Text style={styles.dataText}>ВРЕМЯ ИГРЫ</Text></View>
                <View style={{ width: '60%', flexDirection: 'column' }}>
                   <View style={{ flexDirection: 'row', height: 12 }}>
                      <View style={[styles.cellCenter, { flex: 1 }]}><Text style={styles.dataText}>Начало</Text></View>
                      <View style={[styles.cellCenter, { flex: 1 }]}><Text style={styles.dataText}>Окончание</Text></View>
                   </View>
                   {/* ВСТАВКА ФАКТИЧЕСКОГО ВРЕМЕНИ ИГРЫ */}
                   <View style={{ flexDirection: 'row', height: 12 }}>
                      <View style={[styles.cellCenter, { flex: 1 }]}><Text style={styles.dataText}>{info.actualStart}</Text></View>
                      <View style={[styles.cellCenter, { flex: 1 }]}><Text style={styles.dataText}>{info.actualEnd}</Text></View>
                   </View>
                </View>
             </View>

             <View style={[styles.rowShort, styles.f0f0f0]}>
                <View style={[styles.cellCenter, { width: '40%' }]}><Text style={styles.dataText}>Результат по периодам</Text></View>
                <View style={{ width: '60%', flexDirection: 'row' }}>
                   {periodsAndTotal.map((p, i) => (
                      <View key={i} style={[styles.cellCenter, { flex: 1 }]}><Text style={styles.dataText}>{p}</Text></View>
                   ))}
                </View>
             </View>

             {renderMiddleDataSection("Взятие ворот", 'gHome', 'gAway')}
             {renderMiddleDataSection("Штрафное время", 'pHome', 'pAway')}
             {renderMiddleDataSection("Броски", 'sHome', 'sAway')}

             <View style={styles.rowShort}>
                <View style={[styles.cellCenter, { width: '40%', alignItems: 'flex-start', paddingLeft: 4 }]}><Text style={styles.dataText}>Тайм-аут «А»</Text></View>
                <View style={[styles.cellCenter, { width: '60%' }]}><Text style={styles.dataText}>{formatTime(data?.home?.timeout)}</Text></View>
             </View>
             <View style={styles.rowShort}>
                <View style={[styles.cellCenter, { width: '40%', alignItems: 'flex-start', paddingLeft: 4 }]}><Text style={styles.dataText}>Тайм-аут «Б»</Text></View>
                <View style={[styles.cellCenter, { width: '60%' }]}><Text style={styles.dataText}>{formatTime(data?.away?.timeout)}</Text></View>
             </View>

             <View style={[styles.thickBorder, { top: 0, left: 0, width: '100%', height: 24, borderLeftWidth: 0 }]} pointerEvents="none" />
             <View style={[styles.thickBorder, { top: 24, left: 0, width: '100%', height: 36, borderLeftWidth: 0, borderTopWidth: 0 }]} pointerEvents="none" />
             <View style={[styles.thickBorder, { top: 60, left: 0, width: '100%', height: 24, borderLeftWidth: 0, borderTopWidth: 0 }]} pointerEvents="none" />
             <View style={[styles.thickBorder, { top: 84, left: 0, width: '100%', height: 24, borderLeftWidth: 0, borderTopWidth: 0 }]} pointerEvents="none" />
             <View style={[styles.thickBorder, { top: 108, left: 0, width: '100%', height: 24, borderLeftWidth: 0, borderTopWidth: 0 }]} pointerEvents="none" />
          </View>

          <View style={[styles.footerColumnRight, { position: 'relative' }]}>
            
            <View style={styles.rowShort}>
              <View style={[styles.cellCenter, { width: '40%' }]}><Text style={styles.columnTitle}>Судья времени</Text></View>
              <View style={[styles.cellCenter, { width: '60%' }]}></View>
            </View>
            <View style={styles.rowShort}>
              <View style={[styles.cellCenter, { width: '40%' }]}><Text style={styles.columnTitle}>Информ., статист</Text></View>
              <View style={[styles.cellCenter, { width: '60%' }]}></View>
            </View>
            
            <View style={styles.rowShort}>
              <View style={[styles.cellCenter, { width: '40%' }]}><Text style={styles.columnTitle}>Линейный судья</Text></View>
              <View style={[styles.cellCenter, { width: '60%' }]}>
                 <Text style={styles.dataText}>{officials.linesman1 || ''}</Text>
              </View>
            </View>
            <View style={styles.rowShort}>
              <View style={[styles.cellCenter, { width: '40%' }]}><Text style={styles.columnTitle}>Линейный судья</Text></View>
              <View style={[styles.cellCenter, { width: '60%' }]}>
                 <Text style={styles.dataText}>{officials.linesman2 || ''}</Text>
              </View>
            </View>
            
            <View style={styles.rowShort}>
              <View style={[styles.cellCenter, { width: '40%' }]}><Text style={styles.columnTitle}>Замечание</Text></View>
              <View style={[styles.cellCenter, { width: '15%' }]}><Text style={styles.columnTitle}>да</Text></View>
              <View style={[styles.cellCenter, { width: '15%' }]}><Text style={styles.columnTitle}>нет</Text></View>
              <View style={[styles.cellCenter, { width: '30%' }]}><Text style={styles.columnTitle}>на обороте</Text></View>
            </View>
            
            <View style={styles.rowTall}>
              <View style={[styles.cellCenter, { width: '40%' }]}><Text style={styles.columnTitle}>Секретарь игры</Text></View>
              <View style={[styles.cellCenter, { width: '60%' }]}>
                 <Text style={styles.dataText}>{officials.scorekeeper || ''}</Text>
              </View>
            </View>
            
            <View style={styles.rowTall}>
              <View style={[styles.cellCenter, { width: '40%' }]}><Text style={styles.columnTitle}>Главный судья</Text></View>
              <View style={[styles.cellCenter, { width: '60%' }]}>
                 <Text style={styles.dataText}>{officials.head1 || ''}</Text>
              </View>
            </View>
            <View style={styles.rowTall}>
              <View style={[styles.cellCenter, { width: '40%' }]}><Text style={styles.columnTitle}>Главный судья</Text></View>
              <View style={[styles.cellCenter, { width: '60%' }]}>
                 <Text style={styles.dataText}>{officials.head2 || ''}</Text>
              </View>
            </View>

            <View style={[styles.thickBorder, { top: 0, left: 0, width: '100%', height: 24, borderLeftWidth: 0 }]} pointerEvents="none" />
            <View style={[styles.thickBorder, { top: 24, left: 0, width: '100%', height: 24, borderLeftWidth: 0, borderTopWidth: 0 }]} pointerEvents="none" />
            <View style={[styles.thickBorder, { top: 48, left: 0, width: '100%', height: 12, borderLeftWidth: 0, borderTopWidth: 0 }]} pointerEvents="none" />
            <View style={[styles.thickBorder, { top: 60, left: 0, width: '100%', height: 24, borderLeftWidth: 0, borderTopWidth: 0 }]} pointerEvents="none" />
            <View style={[styles.thickBorder, { top: 84, left: 0, width: '100%', height: 48, borderLeftWidth: 0, borderTopWidth: 0 }]} pointerEvents="none" />
          </View>
          
        </View>

      </Page>
    </Document>
  );
};