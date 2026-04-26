// HockeyEco-server/src/protocols/protocol-default.js

const formatTime = (totalSeconds) => {
    if (totalSeconds === undefined || totalSeconds === null) return '';
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const GOAL_STRENGTH_MAP = { "equal": "РС", "pp": "+1", "pp1": "+1", "pp2": "+2", "sh": "-1", "sh1": "-1", "sh2": "-2", "en": "ПВ", "ps": "ШБ" };
const PENALTY_REASON_MAP = { 
    "Агрессор в драке": "Агрессор в драке", "Атака в голову или шею": "Атака в голову/шею", 
    "Блокировка": "Блокировка", "Бросок клюшки и снаряжения": "Бросок клюшки/экип.", 
    "Выброс шайбы": "Выброс шайбы", "Грубость": "Грубость", 
    "Дисциплинарный до конца матча штраф": "Дисц. до конца матча", 
    "Дисциплинарный штраф": "Дисциплинарный штраф", "Драка": "Драка", 
    "Задержка игры": "Задержка игры", "Задержка клюшки соперника": "Задерж. клюшки соп.", 
    "Задержка клюшкой": "Задержка клюшкой", "Задержка соперника": "Задержка соперника", 
    "Задержка шайбы руками": "Задерж. шайбы руками", "Зачинщик драки": "Зачинщик драки", 
    "Игра высоко поднятой клюшкой": "Игра высок. клюшкой", "Игра со сломанной клюшкой": "Игра со слом. клюшк.", 
    "Колющий удар": "Колющий удар", "Малый скамеечный штраф": "Малый скамееч. штраф", 
    "Нарушение численного состава": "Наруш. числ. состава", "Неправильная атака": "Неправильная атака", 
    "Нестандартное снаряжение": "Нестандарт. снаряж.", "Опасное снаряжение": "Опасное снаряжение", 
    "Опасные действия": "Опасные действия", "Оскорбление судей и неспортивное поведение": "Оскорбление/неспорт.", 
    "Отказ начать игру": "Отказ начать игру", "Отсечение": "Отсечение", "Подножка": "Подножка", 
    "Покид. скамейки штрафников во время конфл.": "Покид. скам. штраф.", 
    "Покид. скамейки запасных во время конфл.": "Покид. скам. запас.", 
    "Сдвиг ворот": "Сдвиг ворот", "Симуляция": "Симуляция", "Толчок клюшкой": "Толчок клюшкой", 
    "Толчок на борт": "Толчок на борт", "Удар головой": "Удар головой", "Удар клюшкой": "Удар клюшкой", 
    "Удар коленом": "Удар коленом", "Удар концом клюшки": "Удар концом клюшки", 
    "Удар локтем": "Удар локтем", "Удар ногой": "Удар ногой", 
    "Физический контакт со зрителем": "Контакт со зрителем", "Штр. вр: игра за красной линией": "Штр.вр: за кр.линией", 
    "Штр. вр: покидание площади ворот в конфликте": "Штр.вр: уход из вор.", 
    "Штр. вр: помещающий шайбу на сетку ворот": "Штр.вр: шайба-сетка", 
    "Штр. вр: отправился к скамейке в остановке": "Штр.вр: ушел к скам." 
};

export const getHtml = (data) => {
    const info = data.info || {};
    const home = data.home || {};
    const away = data.away || {};
    const officials = data.officials || {};
    const goalieRows = Array.from({ length: 10 }, (_, i) => data.goalieLog[i] || { time_seconds: null, home_jersey: '', away_jersey: '' });
    const periodsAndTotal = [...(data.periods || []), 'Общ.'];

    const t = (str) => {
        if (str === null || str === undefined) return '';
        return String(str).normalize('NFC');
    };

    const renderMiddleDataSection = (title, homeKey, awayKey) => `
        <div style="flex-direction: row; height: 24pt;">
          <div class="cellCenter" style="width: 28%;"><span class="dataText text-center">${t(title)}</span></div>
          <div style="width: 12%; flex-direction: column;">
             <div class="cellCenter" style="height: 12pt;"><span class="dataText">«А»</span></div>
             <div class="cellCenter" style="height: 12pt;"><span class="dataText">«Б»</span></div>
          </div>
          <div style="width: 60%; flex-direction: column;">
             <div style="height: 12pt; flex-direction: row;">
               ${periodsAndTotal.map(p => `
                  <div class="cellCenter" style="flex: 1;">
                    <span class="dataText">${data.stats[p]?.[homeKey] > 0 ? data.stats[p][homeKey] : ''}</span>
                  </div>
               `).join('')}
             </div>
             <div style="height: 12pt; flex-direction: row;">
               ${periodsAndTotal.map(p => `
                  <div class="cellCenter" style="flex: 1;">
                    <span class="dataText">${data.stats[p]?.[awayKey] > 0 ? data.stats[p][awayKey] : ''}</span>
                  </div>
               `).join('')}
             </div>
          </div>
        </div>
    `;

    const renderTeamGrid = (teamLetter, teamData, isFirst = false) => {
        const rowsHtml = [];
        for(let index = 0; index < 22; index++) {
            let player = index < 2 ? teamData.goalies[index] : teamData.fieldPlayers[index - 2];
            let positionLabel = index < 2 ? 'Вр' : (player?.translated_position || '');
            const goal = teamData.goals[index];
            const penalty = teamData.penalties[index];
            
            const fullName = player ? `${player.last_name} ${player.first_name || ''}`.trim() : '';
            const penaltyReason = penalty ? (PENALTY_REASON_MAP[penalty.penalty_violation] || penalty.penalty_violation || '') : '';
            const goalStrength = goal ? (GOAL_STRENGTH_MAP[goal.goal_strength] || goal.goal_strength || '') : '';

            rowsHtml.push(`
              <div class="gridRow">
                <div class="gridCell" style="width: 4%;"><span class="dataText">${player?.jersey_number || ''}</span></div>
                <div class="gridCell" style="width: 18%; align-items: flex-start; padding-left: 4pt;"><span class="dataText">${t(fullName)}</span></div>
                <div class="gridCell" style="width: 6%;"><span class="dataText">${t(positionLabel)}</span></div>
                <div class="gridCell" style="width: 4%;"><span class="dataText">${player ? 'Да' : ''}</span></div>
                <div class="gridCell" style="width: 3%;"><span class="dataText">${goal ? (index + 1) : ''}</span></div>
                <div class="gridCell" style="width: 6%;"><span class="dataText">${formatTime(goal?.time_seconds)}</span></div>
                <div class="gridCell" style="width: 5%;"><span class="dataText">${goal?.scorer_number || ''}</span></div>
                <div class="gridCell" style="width: 5%;"><span class="dataText">${goal?.a1_number || ''}</span></div>
                <div class="gridCell" style="width: 5%;"><span class="dataText">${goal?.a2_number || ''}</span></div>
                <div class="gridCell" style="width: 4%;"><span class="dataText">${t(goalStrength)}</span></div>
                <div class="gridCell" style="width: 4%;"><span class="dataText">${penalty?.scorer_number || ''}</span></div>
                <div class="gridCell" style="width: 4%;"><span class="dataText">${penalty?.penalty_minutes || ''}</span></div>
                <div class="gridCell" style="width: 20%;"><span class="dataText">${t(penaltyReason)}</span></div>
                <div class="gridCell" style="width: 6%;"><span class="dataText">${formatTime(penalty?.time_seconds)}</span></div>
                <div class="gridCell" style="width: 6%;"><span class="dataText">${formatTime(penalty?.penalty_end_time)}</span></div>
              </div>
            `);
        }

        return `
        <div style="width: 100%; margin-top: 0;">
          <div style="width: 100%; position: relative;">
            <div class="gridRow f0f0f0">
              <div class="gridCell" style="width: 32%;"><span class="sectionTitle">Команда «${teamLetter}» ${t(teamData.name)}</span></div>
              <div class="gridCell" style="width: 28%;"><span class="sectionTitle">Взятие ворот</span></div>
              <div class="gridCell" style="width: 40%;"><span class="sectionTitle">Удаление</span></div>
            </div>
            <div class="gridRow f0f0f0">
              <div class="gridCell" style="width: 4%;"><span class="columnTitle">№</span></div>
              <div class="gridCell" style="width: 18%;"><span class="columnTitle">Фамилия Имя</span></div>
              <div class="gridCell" style="width: 6%;"><span class="columnTitle">Поз.</span></div>
              <div class="gridCell" style="width: 4%;"><span class="columnTitle">Иг</span></div>
              <div class="gridCell" style="width: 3%;"><span class="columnTitle">№</span></div>
              <div class="gridCell" style="width: 6%;"><span class="columnTitle">Время</span></div>
              <div class="gridCell" style="width: 5%;"><span class="columnTitle">Г.</span></div>
              <div class="gridCell" style="width: 5%;"><span class="columnTitle">П1.</span></div>
              <div class="gridCell" style="width: 5%;"><span class="columnTitle">П2.</span></div>
              <div class="gridCell" style="width: 4%;"><span class="columnTitle">ИС.</span></div>
              <div class="gridCell" style="width: 4%;"><span class="columnTitle">№</span></div>
              <div class="gridCell" style="width: 4%;"><span class="columnTitle">Шт.</span></div>
              <div class="gridCell" style="width: 20%;"><span class="columnTitle">Причина</span></div>
              <div class="gridCell" style="width: 6%;"><span class="columnTitle">Начало</span></div>
              <div class="gridCell" style="width: 6%;"><span class="columnTitle">Окончан.</span></div>
            </div>
            ${rowsHtml.join('')}

            <div class="thickBorder" style="top: 0; left: 0; width: 32%; height: 100%; border-top-width: ${isFirst ? '1.5pt' : '0'};"></div>
            <div class="thickBorder" style="top: 0; left: 32%; width: 28%; height: 100%; border-left-width: 0; border-top-width: ${isFirst ? '1.5pt' : '0'};"></div>
            <div class="thickBorder" style="top: 0; left: 60%; width: 40%; height: 100%; border-left-width: 0; border-top-width: ${isFirst ? '1.5pt' : '0'};"></div>
          </div>

          <div class="gridRow" style="border-width: 1.5pt; border-style: solid; border-color: #222222; border-top-width: 0; flex-direction: row;">
            <div style="flex: 1; border-right: 1pt solid #858585; justify-content: center; padding-left: 4pt;">
              <span style="font-size: 6pt; font-weight: normal; color: #000;">Тренер: <span style="font-size: 7pt; color: ${teamData.coachSig ? '#000' : '#d1d1d1'};">${t(teamData.coachSig) || '—'}</span></span>
            </div>
            <div style="flex: 1; border-right: 1pt solid #858585; justify-content: center; padding-left: 4pt;">
              <span style="font-size: 6pt; font-weight: normal; color: #000;">Офиц. лицо 1: <span style="font-size: 7pt; color: ${teamData.off1Sig ? '#000' : '#d1d1d1'};">${t(teamData.off1Sig) || '—'}</span></span>
            </div>
            <div style="flex: 1; justify-content: center; padding-left: 4pt;">
              <span style="font-size: 6pt; font-weight: normal; color: #000;">Офиц. лицо 2: <span style="font-size: 7pt; color: ${teamData.off2Sig ? '#000' : '#d1d1d1'};">${t(teamData.off2Sig) || '—'}</span></span>
            </div>
          </div>
        </div>
        `;
    };

    return `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap');
            * { box-sizing: border-box; }
            div { display: flex; flex-direction: column; }
            span { display: inline; }
            body { 
                margin: 0; 
                width: 210mm; min-height: 297mm; 
                font-family: 'Roboto', Arial, sans-serif; 
                background-color: #fff;
                padding: 50pt;
                font-size: 9pt;
            }
            .headerContainer { text-align: center; margin-bottom: 2pt; align-items: center; }
            .mainTitle { font-size: 11pt; font-weight: bold; text-transform: uppercase; }
            .subTitle { font-size: 9pt; color: #919191; margin-top: 0; }
            .metaTable { width: 100%; border-top: 1pt solid #858585; border-left: 1pt solid #858585; margin-bottom: 4pt; }
            .metaRow { flex-direction: row; height: 14pt; }
            .metaCol { width: 33.33%; border-right: 1pt solid #858585; border-bottom: 1pt solid #858585; padding: 0 5pt; justify-content: center; }
            .metaSplitCol { width: 33.34%; flex-direction: row; border-right: 1pt solid #858585; border-bottom: 1pt solid #858585; }
            .metaVerticalDivider { width: 1pt; height: 100%; background-color: #858585; }
            .gridRow { flex-direction: row; height: 12pt; }
            .gridCell { border-right: 1pt solid #858585; border-bottom: 1pt solid #858585; justify-content: center; align-items: center; padding: 0 2pt; }
            .label { font-weight: bold; }
            .valueText { font-size: 8pt; display: inline; }
            .sectionTitle { font-size: 7.5pt; font-weight: bold; text-transform: uppercase; }
            .columnTitle { font-size: 6.5pt; font-weight: normal; }
            .dataText { font-size: 7pt; }
            .footerMainContainer { width: 100%; margin-top: 5pt; flex-direction: row; }
            .footerColumnLeft { width: 22%; position: relative; }
            .footerColumnMiddle { width: 44%; position: relative; }
            .footerColumnRight { width: 34%; position: relative; }
            .f0f0f0 { background-color: #f0f0f0; }
            .rowShort { flex-direction: row; height: 12pt; }
            .rowTall { flex-direction: row; height: 24pt; }
            .cellCenter { border-right: 1pt solid #858585; border-bottom: 1pt solid #858585; justify-content: center; align-items: center; }
            .thickBorder { border: 1.5pt solid #222222; position: absolute; pointer-events: none; }
            .text-center { text-align: center; }
        </style>
    </head>
    <body>
        <div class="headerContainer">
          <span class="mainTitle">ОФИЦИАЛЬНЫЙ ПРОТОКОЛ МАТЧА ТЮМЕНСКОГО ГОРОДСКОГО ЧЕМПИОНАТА</span>
          <span class="subTitle">среди любительских команд, старше восемнадцати лет, сезона ${t(info.season)}</span>
        </div>
        <div class="metaTable">
          <div class="metaRow">
            <div class="metaCol">
               <div style="flex-direction: row; align-items: center;"><span class="label valueText">Вид соревнования:&nbsp;</span><span class="valueText">Хоккей с шайбой</span></div>
            </div>
            <div class="metaCol">
               <div style="flex-direction: row; align-items: center;"><span class="label valueText">Дивизион:&nbsp;</span><span class="valueText">${t(info.division)}</span></div>
            </div>
            <div class="metaSplitCol">
              <div class="metaCol" style="width: 50%; border-right: 0; border-bottom: 0;">
                <div style="flex-direction: row; align-items: center;"><span class="label valueText">Дата:&nbsp;</span><span class="valueText">${t(info.date)}</span></div>
              </div>
              <div class="metaVerticalDivider"></div>
              <div class="metaCol" style="width: 50%; border-right: 0; border-bottom: 0;">
                <div style="flex-direction: row; align-items: center;"><span class="label valueText">№ игры:&nbsp;</span><span class="valueText">${t(info.gameNum)}</span></div>
              </div>
            </div>
          </div>
          <div class="metaRow">
            <div class="metaCol">
               <div style="flex-direction: row; align-items: center;"><span class="label valueText">Место проведения:&nbsp;</span><span class="valueText">${t(info.arena)}</span></div>
            </div>
            <div class="metaCol">
               <div style="flex-direction: row; align-items: center;"><span class="label valueText">Начало:&nbsp;</span><span class="valueText">${t(info.start)}</span></div>
            </div>
            <div class="metaCol">
               <div style="flex-direction: row; align-items: center;"><span class="label valueText">Количество зрителей:&nbsp;</span><span class="valueText">${t(info.spectators)}</span></div>
            </div>
          </div>
        </div>
        ${renderTeamGrid("А", home, true)}
        ${renderTeamGrid("Б", away, false)}
        <div class="footerMainContainer">
          <div class="footerColumnLeft">
            <div class="rowShort f0f0f0">
              <div class="cellCenter" style="width: 40%;"><span class="columnTitle">Время</span></div>
              <div class="cellCenter" style="width: 30%;"><span class="columnTitle">«А»</span></div>
              <div class="cellCenter" style="width: 30%;"><span class="columnTitle">«Б»</span></div>
            </div>
            ${goalieRows.map(row => `
              <div class="rowShort">
                <div class="cellCenter" style="width: 40%;"><span class="dataText">${formatTime(row.time_seconds)}</span></div>
                <div class="cellCenter" style="width: 30%;"><span class="dataText">${row.home_jersey}</span></div>
                <div class="cellCenter" style="width: 30%;"><span class="dataText">${row.away_jersey}</span></div>
              </div>
            `).join('')}
            <div class="thickBorder" style="top: 0; left: 0; width: 100%; height: 100%;"></div>
          </div>
          <div class="footerColumnMiddle">
             <div style="flex-direction: row; height: 24pt;">
                <div class="cellCenter" style="width: 40%;"><span class="dataText">ВРЕМЯ ИГРЫ</span></div>
                <div style="width: 60%; flex-direction: column;">
                   <div style="flex-direction: row; height: 12pt;">
                      <div class="cellCenter" style="flex: 1;"><span class="dataText">Начало</span></div>
                      <div class="cellCenter" style="flex: 1;"><span class="dataText">Окончание</span></div>
                   </div>
                   <div style="flex-direction: row; height: 12pt;">
                      <div class="cellCenter" style="flex: 1;"><span class="dataText">${t(info.actualStart)}</span></div>
                      <div class="cellCenter" style="flex: 1;"><span class="dataText">${t(info.actualEnd)}</span></div>
                   </div>
                </div>
             </div>
             <div class="rowShort f0f0f0">
                <div class="cellCenter" style="width: 40%;"><span class="dataText">Результат по периодам</span></div>
                <div style="width: 60%; flex-direction: row;">
                   ${periodsAndTotal.map(p => `<div class="cellCenter" style="flex: 1;"><span class="dataText">${t(p)}</span></div>`).join('')}
                </div>
             </div>
             ${renderMiddleDataSection("Взятие ворот", 'gHome', 'gAway')}
             ${renderMiddleDataSection("Штрафное время", 'pHome', 'pAway')}
             ${renderMiddleDataSection("Броски", 'sHome', 'sAway')}
             <div class="rowShort">
                <div class="cellCenter" style="width: 40%; align-items: flex-start; padding-left: 4pt;"><span class="dataText">Тайм-аут «А»</span></div>
                <div class="cellCenter" style="width: 60%;"><span class="dataText">${formatTime(home?.timeout)}</span></div>
             </div>
             <div class="rowShort">
                <div class="cellCenter" style="width: 40%; align-items: flex-start; padding-left: 4pt;"><span class="dataText">Тайм-аут «Б»</span></div>
                <div class="cellCenter" style="width: 60%;"><span class="dataText">${formatTime(away?.timeout)}</span></div>
             </div>
             <div class="thickBorder" style="top: 0; left: 0; width: 100%; height: 24pt; border-left-width: 0;"></div>
             <div class="thickBorder" style="top: 24pt; left: 0; width: 100%; height: 36pt; border-left-width: 0; border-top-width: 0;"></div>
             <div class="thickBorder" style="top: 60pt; left: 0; width: 100%; height: 24pt; border-left-width: 0; border-top-width: 0;"></div>
             <div class="thickBorder" style="top: 84pt; left: 0; width: 100%; height: 24pt; border-left-width: 0; border-top-width: 0;"></div>
             <div class="thickBorder" style="top: 108pt; left: 0; width: 100%; height: 24pt; border-left-width: 0; border-top-width: 0;"></div>
          </div>
          <div class="footerColumnRight">
            <div class="rowShort">
              <div class="cellCenter" style="width: 40%;"><span class="columnTitle">Судья времени</span></div>
              <div class="cellCenter" style="width: 60%;"></div>
            </div>
            <div class="rowShort">
              <div class="cellCenter" style="width: 40%;"><span class="columnTitle">Информ., статист</span></div>
              <div class="cellCenter" style="width: 60%;"></div>
            </div>
            <div class="rowShort">
              <div class="cellCenter" style="width: 40%;"><span class="columnTitle">Линейный судья</span></div>
              <div class="cellCenter" style="width: 60%;"><span class="dataText">${t(officials.linesman1) || ''}</span></div>
            </div>
            <div class="rowShort">
              <div class="cellCenter" style="width: 40%;"><span class="columnTitle">Линейный судья</span></div>
              <div class="cellCenter" style="width: 60%;"><span class="dataText">${t(officials.linesman2) || ''}</span></div>
            </div>
            <div class="rowShort">
              <div class="cellCenter" style="width: 40%;"><span class="columnTitle">Замечание</span></div>
              <div class="cellCenter" style="width: 15%;"><span class="columnTitle">да</span></div>
              <div class="cellCenter" style="width: 15%;"><span class="columnTitle">нет</span></div>
              <div class="cellCenter" style="width: 30%;"><span class="columnTitle">на обороте</span></div>
            </div>
            <div class="rowTall">
              <div class="cellCenter" style="width: 40%;"><span class="columnTitle">Секретарь игры</span></div>
              <div class="cellCenter" style="width: 60%;"><span class="dataText">${t(officials.scorekeeper) || ''}</span></div>
            </div>
            <div class="rowTall">
              <div class="cellCenter" style="width: 40%;"><span class="columnTitle">Главный судья</span></div>
              <div class="cellCenter" style="width: 60%;"><span class="dataText">${t(officials.head1) || ''}</span></div>
            </div>
            <div class="rowTall">
              <div class="cellCenter" style="width: 40%;"><span class="columnTitle">Главный судья</span></div>
              <div class="cellCenter" style="width: 60%;"><span class="dataText">${t(officials.head2) || ''}</span></div>
            </div>
            <div class="thickBorder" style="top: 0; left: 0; width: 100%; height: 24pt; border-left-width: 0;"></div>
            <div class="thickBorder" style="top: 24pt; left: 0; width: 100%; height: 24pt; border-left-width: 0; border-top-width: 0;"></div>
            <div class="thickBorder" style="top: 48pt; left: 0; width: 100%; height: 12pt; border-left-width: 0; border-top-width: 0;"></div>
            <div class="thickBorder" style="top: 60pt; left: 0; width: 100%; height: 24pt; border-left-width: 0; border-top-width: 0;"></div>
            <div class="thickBorder" style="top: 84pt; left: 0; width: 100%; height: 48pt; border-left-width: 0; border-top-width: 0;"></div>
          </div>
        </div>
    </body>
    </html>
    `;
};