// src/components/GameLiveDesk/PDF-Protocol/templates/DefaultProtocol.jsx
import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font } from '@react-pdf/renderer';

// Регистрируем более стабильные версии шрифта Roboto для корректной отрисовки "й" и "ё"
Font.register({
  family: 'Roboto',
  fonts: [
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf', fontWeight: 400 },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf', fontWeight: 700 }
  ]
});

// Если "й" всё еще будет капризничать, можно попробовать использовать локальные .ttf файлы или 
// стандартные ссылки Google Fonts, но пока оставим эти, просто зафиксируем структуру.

const styles = StyleSheet.create({
  page: { 
    padding: 60, 
    fontFamily: 'Roboto', 
    fontSize: 19, 
    backgroundColor: '#fff',
    flexDirection: 'column'
  },
  headerContainer: {
    textAlign: 'center',
    marginBottom: 2,
  },
  mainTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  subTitle: {
    fontSize: 9,
    color: '#919191',
    marginTop: 20,
  },

  // --- ТАБЛИЦА ПАРАМЕТРОВ ---
  metaTable: {
    width: '100%',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: '#858585', 
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    height: 14, 
  },
  metaCol: {
    width: '33.33%', 
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#858585', 
    paddingHorizontal: 5,
    justifyContent: 'center',
  },
  metaSplitCol: {
    width: '33.34%',
    flexDirection: 'row',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#858585',
  },
  metaVerticalDivider: {
    width: 1,
    height: '100%',
    backgroundColor: '#858585',
  },

  // --- ОСНОВНАЯ СЕТКА ПРОТОКОЛА ---
  protocolGrid: {
    width: '100%',
    borderLeftWidth: 1,
    borderColor: '#858585',
    // marginBottom убран, чтобы таблицы прилегали друг к другу
  },
  gridRow: {
    flexDirection: 'row',
    height: 12,
  },
  gridCell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#858585',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
  },

  // Стили текста
  label: {
    fontWeight: 'bold',
  },
  valueText: {
    fontSize: 8,
  },
  sectionTitle: {
    fontSize: 7.5,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  columnTitle: {
    fontSize: 6.5,
    fontWeight: 'normal',
  },
  dataText: {
    fontSize: 7,
  },
  footerLabel: {
    fontSize: 6,
    fontWeight: 'normal',
    textAlign: 'left',
    width: '100%',
    paddingLeft: 4,
  }
});

export const DefaultProtocol = ({ data }) => {
  const info = data?.info || {
    league: "ТЮМЕНСКОГО ГОРОДСКОГО ЧЕМПИОНАТА",
    season: "2025-26",
    competitionType: "ХОККЕЙ С ШАЙБОЙ",
    division: "ТЛХЛ",
    date: "15.04.2026",
    gameNum: "124",
    arena: "СК «Партиком»",
    start: "19:30",
    attendance: "150",
    homeTeam: "ГАЗОВИК",
    awayTeam: "ЛЕГИОН"
  };

  const rows = Array.from({ length: 22 });

  // Функция для отрисовки таблицы команды
  const renderTeamGrid = (teamLetter, teamName, isFirst = false) => (
    <View style={[
      styles.protocolGrid, 
      { borderTopWidth: isFirst ? 1 : 0 } // Линия сверху только у первой таблицы
    ]}>
      {/* Уровень 1: Основные разделы */}
      <View style={[styles.gridRow, { backgroundColor: '#f0f0f0' }]}>
        <View style={[styles.gridCell, { width: '35%' }]}>
          <Text style={styles.sectionTitle} numberOfLines={1}>Команда «{teamLetter}» {teamName}</Text>
        </View>
        <View style={[styles.gridCell, { width: '30%' }]}>
          <Text style={styles.sectionTitle} numberOfLines={1}>Взятие ворот</Text>
        </View>
        <View style={[styles.gridCell, { width: '35%' }]}>
          <Text style={styles.sectionTitle} numberOfLines={1}>Удаление</Text>
        </View>
      </View>

      {/* Уровень 2: Подзаголовки столбцов */}
      <View style={[styles.gridRow, { height: 12 }]}>
        <View style={[styles.gridCell, { width: '4%' }]}><Text style={styles.columnTitle}>№</Text></View>
        <View style={[styles.gridCell, { width: '21%' }]}><Text style={styles.columnTitle}>Фамилия</Text></View>
        <View style={[styles.gridCell, { width: '6%' }]}><Text style={styles.columnTitle}>Поз.</Text></View>
        <View style={[styles.gridCell, { width: '4%' }]}><Text style={styles.columnTitle}>Иг</Text></View>
        <View style={[styles.gridCell, { width: '3%' }]}><Text style={styles.columnTitle}>№</Text></View>
        <View style={[styles.gridCell, { width: '8%' }]}><Text style={styles.columnTitle}>Время</Text></View>
        <View style={[styles.gridCell, { width: '5%' }]}><Text style={styles.columnTitle}>Г.</Text></View>
        <View style={[styles.gridCell, { width: '5%' }]}><Text style={styles.columnTitle}>П1.</Text></View>
        <View style={[styles.gridCell, { width: '5%' }]}><Text style={styles.columnTitle}>П2.</Text></View>
        <View style={[styles.gridCell, { width: '4%' }]}><Text style={styles.columnTitle}>ИС.</Text></View>
        <View style={[styles.gridCell, { width: '4%' }]}><Text style={styles.columnTitle}>№</Text></View>
        <View style={[styles.gridCell, { width: '4%' }]}><Text style={styles.columnTitle}>Шт.</Text></View>
        <View style={[styles.gridCell, { width: '11%' }]}><Text style={styles.columnTitle}>Причина</Text></View>
        <View style={[styles.gridCell, { width: '8%' }]}><Text style={styles.columnTitle}>Начало</Text></View>
        <View style={[styles.gridCell, { width: '8%' }]}><Text style={styles.columnTitle}>Окончание</Text></View>
      </View>

      {/* Данные (22 строки) */}
      {rows.map((_, index) => (
        <View key={index} style={styles.gridRow}>
          <View style={[styles.gridCell, { width: '4%' }]}><Text style={styles.dataText}></Text></View>
          <View style={[styles.gridCell, { width: '21%', alignItems: 'flex-start', paddingLeft: 4 }]}><Text style={styles.dataText}></Text></View>
          <View style={[styles.gridCell, { width: '6%' }]}><Text style={styles.dataText}>{index < 2 ? 'Вр' : ''}</Text></View>
          <View style={[styles.gridCell, { width: '4%' }]}><Text style={styles.dataText}></Text></View>
          <View style={[styles.gridCell, { width: '3%' }]}><Text style={styles.dataText}></Text></View>
          <View style={[styles.gridCell, { width: '8%' }]}><Text style={styles.dataText}></Text></View>
          <View style={[styles.gridCell, { width: '5%' }]}><Text style={styles.dataText}></Text></View>
          <View style={[styles.gridCell, { width: '5%' }]}><Text style={styles.dataText}></Text></View>
          <View style={[styles.gridCell, { width: '5%' }]}><Text style={styles.dataText}></Text></View>
          <View style={[styles.gridCell, { width: '4%' }]}><Text style={styles.dataText}></Text></View>
          <View style={[styles.gridCell, { width: '4%' }]}><Text style={styles.dataText}></Text></View>
          <View style={[styles.gridCell, { width: '4%' }]}><Text style={styles.dataText}></Text></View>
          <View style={[styles.gridCell, { width: '11%' }]}><Text style={styles.dataText}></Text></View>
          <View style={[styles.gridCell, { width: '8%' }]}><Text style={styles.dataText}></Text></View>
          <View style={[styles.gridCell, { width: '8%' }]}><Text style={styles.dataText}></Text></View>
        </View>
      ))}

      {/* Подписи */}
      <View style={[styles.gridRow, { height: 12 }]}>
        <View style={[styles.gridCell, { width: '35%', alignItems: 'flex-start' }]}>
          <Text style={styles.footerLabel}>Тренер:</Text>
        </View>
        <View style={[styles.gridCell, { width: '30%', alignItems: 'flex-start' }]}>
          <Text style={styles.footerLabel}>Офиц. лицо 1:</Text>
        </View>
        <View style={[styles.gridCell, { width: '35%', alignItems: 'flex-start' }]}>
          <Text style={styles.footerLabel}>Офиц. лицо 2:</Text>
        </View>
      </View>
    </View>
  );

  return (
    <Document title="Протокол матча">
      <Page size="A4" orientation="portrait" style={styles.page}>
        
        <View style={styles.headerContainer}>
          <Text style={styles.mainTitle} numberOfLines={1}>
            ОФИЦИАЛЬНЫЙ ПРОТОКОЛ МАТЧА {info.league}
          </Text>
          <Text style={styles.subTitle} numberOfLines={1}>
            среди любительских команд, старше восемнадцати лет, сезона {info.season}
          </Text>
        </View>

        <View style={styles.metaTable}>
          <View style={styles.metaRow}>
            <View style={styles.metaCol}>
              <Text style={styles.valueText} numberOfLines={1}>
                <Text style={styles.label}>Вид соревнования: </Text>{info.competitionType}
              </Text>
            </View>
            <View style={styles.metaCol}>
              <Text style={styles.valueText} numberOfLines={1}>
                <Text style={styles.label}>Дивизион: </Text>{info.division}
              </Text>
            </View>
            <View style={styles.metaSplitCol}>
              <View style={[styles.metaCol, { width: '50%', borderRightWidth: 0, borderBottomWidth: 0 }]}>
                <Text style={styles.valueText} numberOfLines={1}>
                  <Text style={styles.label}>Дата: </Text>{info.date}
                </Text>
              </View>
              <View style={styles.metaVerticalDivider} />
              <View style={[styles.metaCol, { width: '50%', borderRightWidth: 0, borderBottomWidth: 0 }]}>
                <Text style={styles.valueText} numberOfLines={1}>
                  <Text style={styles.label}>№ игры: </Text>{info.gameNum}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaCol}>
              <Text style={styles.valueText} numberOfLines={1}>
                <Text style={styles.label}>Место проведения: </Text>{info.arena}
              </Text>
            </View>
            <View style={styles.metaCol}>
              <Text style={styles.valueText} numberOfLines={1}>
                <Text style={styles.label}>Начало: </Text>{info.start}
              </Text>
            </View>
            <View style={styles.metaCol}>
              <Text style={styles.valueText} numberOfLines={1}>
                <Text style={styles.label}>Количество зрителей: </Text>{info.attendance}
              </Text>
            </View>
          </View>
        </View>

        {/* Сетка Команды «А» (isFirst=true, чтобы была верхняя граница) */}
        {renderTeamGrid("А", info.homeTeam, true)}

        {/* Сетка Команды «Б» (isFirst=false, чтобы использовать нижнюю границу «А» как верхнюю) */}
        {renderTeamGrid("Б", info.awayTeam, false)}

      </Page>
    </Document>
  );
};