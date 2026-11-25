type Ss = GoogleAppsScript.Spreadsheet.Spreadsheet;
type Sheet = GoogleAppsScript.Spreadsheet.Sheet;

/**
 * Миграция структуры таблицы. Каждый шаг идемпотентный: проверяет, сделан ли он, и только тогда меняет.
 * dry = true: ничего не пишет, возвращает, что изменилось бы. Сначала копия, потом рабочая.
 * Формулы пишем с «;»: таблица в русской локали.
 */

export const DAY_START_HOUR = 5;
const P = "'Обработанные данные'!";

export interface StepResult {
  step: string;
  changed: boolean;
  detail: string;
}

type Step = { name: string; run(ss: Ss, dry: boolean): string | null };

function setFormula(sh: Sheet, a1: string, formula: string, dry: boolean): string | null {
  const cell = sh.getRange(a1);
  const before = cell.getFormula();
  if (before.replace(/\s/g, '') === formula.replace(/\s/g, '')) return null;
  if (!dry) cell.setFormula(formula);
  return `${sh.getName()}!${a1}: ${before || '(пусто)'}  ->  ${formula}`;
}

function sheetOrCreate(
  ss: Ss,
  name: string,
  headers: string[],
  dry: boolean,
): { sheet: Sheet | null; created: boolean } {
  const existing = ss.getSheetByName(name);
  if (existing) return { sheet: existing, created: false };
  if (dry) return { sheet: null, created: true };
  const sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return { sheet: sh, created: true };
}

/** Дата операции: «Дата операции» из формы, иначе отметка времени со сдвигом дня на 05:00. */
export const PROCESSED_DATE_FORMULA = `=ARRAYFORMULA(IF(ISBLANK('Форма'!A2:A);;IF(ISBLANK('Форма'!I2:I);INT('Форма'!A2:A-${DAY_START_HOUR}/24);'Форма'!I2:I)))`;

/** Категория: из формы, иначе из «Справочника» по подкатегории, иначе «Повседневные». Перевод отдельно. */
export const PROCESSED_CATEGORY_FORMULA =
  "=ARRAYFORMULA(IF(ISBLANK(A2:A);;IF('Форма'!C2:C=\"Перевод\";\"Перевод\";IF('Форма'!E2:E<>\"\";'Форма'!E2:E;IFERROR(VLOOKUP('Форма'!F2:F;'Справочник'!A:B;2;0);\"Повседневные\")))))";

export const BUDGET_TODAY_FORMULA = `=INT(NOW()-${DAY_START_HOUR}/24)`;

const STEPS: Step[] = [
  {
    name: 'Дата операции: день начинается в 05:00',
    run: (ss, dry) =>
      setFormula(ss.getSheetByName('Обработанные данные')!, 'A2', PROCESSED_DATE_FORMULA, dry),
  },
  {
    name: 'Категория по «Справочнику»',
    run: (ss, dry) =>
      setFormula(ss.getSheetByName('Обработанные данные')!, 'E2', PROCESSED_CATEGORY_FORMULA, dry),
  },
  {
    name: '«Сегодня» в лимитах с 05:00',
    run: (ss, dry) => setFormula(ss.getSheetByName('Лимиты на месяц')!, 'B2', BUDGET_TODAY_FORMULA, dry),
  },
  {
    name: 'Подкатегория «Проценты и комиссии»',
    run: (ss, dry) => {
      const sh = ss.getSheetByName('Справочник')!;
      const names = sh
        .getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1)
        .getValues()
        .map((r) => String(r[0]));
      if (names.includes('Проценты и комиссии')) return null;
      // Только в конец: от порядка зависят галочки «Дэшборда».
      if (!dry)
        sh.getRange(sh.getLastRow() + 1, 1, 1, 2).setValues([['Проценты и комиссии', 'Обязательные']]);
      return 'Справочник: + «Проценты и комиссии» (Обязательные) в конец';
    },
  },
  {
    name: 'Лист «Снимки балансов»',
    run: (ss, dry) => {
      const r = sheetOrCreate(
        ss,
        'Снимки балансов',
        ['Дата', 'Счёт', 'Остаток', 'Долг', 'Источник', 'Комментарий'],
        dry,
      );
      if (r.sheet && r.created) r.sheet.getRange('A:A').setNumberFormat('dd.mm.yyyy hh:mm');
      if (r.sheet && r.created) r.sheet.getRange('C:D').setNumberFormat('#,##0.00" ₽"');
      return r.created
        ? 'Создан лист «Снимки балансов»: история остатков (вручную, из пушей, конец месяца)'
        : null;
    },
  },
  {
    name: 'Лист «Правила»',
    run: (ss, dry) => {
      const r = sheetOrCreate(ss, 'Правила', ['Шаблон мерчанта', 'Подкатегория', 'Автор', 'Создано'], dry);
      return r.created ? 'Создан лист «Правила»: мерчант -> подкатегория, общие для двух телефонов' : null;
    },
  },
  {
    name: 'Лист «Счета» (настройки счетов)',
    run: (ss, dry) => accountsSheet(ss, dry),
  },
  {
    name: '«Балансы»: только просмотр и сверка',
    run: (ss, dry) => balancesView(ss, dry),
  },
  {
    name: 'Снимки балансов: без точных повторов',
    run: (ss, dry) => {
      const sh = ss.getSheetByName('Снимки балансов');
      if (!sh || sh.getLastRow() < 3) return null;
      const values = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
      const seen = new Set<string>();
      const dupRows: number[] = [];
      values.forEach((r, i) => {
        const key = JSON.stringify(r.map((v) => (v instanceof Date ? v.getTime() : v)));
        if (seen.has(key)) dupRows.push(i + 2);
        seen.add(key);
      });
      if (!dupRows.length) return null;
      if (!dry) dupRows.reverse().forEach((r) => sh.deleteRow(r));
      return `Удалено повторов: ${dupRows.length}`;
    },
  },
  {
    name: 'Снимки балансов: без пустых и по порядку',
    run: (ss, dry) => {
      const sh = ss.getSheetByName('Снимки балансов');
      if (!sh || sh.getLastRow() < 2) return null;
      const last = sh.getLastRow();
      const cols = sh.getLastColumn();
      const values = sh.getRange(2, 1, last - 1, cols).getValues();
      const keep = values.filter((r) => String(r[2] ?? '') !== '' || String(r[3] ?? '') !== '');
      const removed = values.length - keep.length;
      const times = keep.map((r) => (r[0] instanceof Date ? r[0].getTime() : 0));
      const sorted = times.every((t, i) => i === 0 || (times[i - 1] ?? 0) <= t);
      if (!removed && sorted) return null;
      if (!dry) {
        for (let row = last; row >= 2; row--) {
          const r = sh.getRange(row, 1, 1, cols).getValues()[0]!;
          if (String(r[2] ?? '') === '' && String(r[3] ?? '') === '') sh.deleteRow(row);
        }
        if (!sorted && keep.length > 1)
          sh.getRange(2, 1, keep.length, cols).sort([{ column: 1, ascending: true }]);
      }
      const parts: string[] = [];
      if (removed) parts.push(`убрано пустых снимков: ${removed}`);
      if (!sorted) parts.push('отсортировано по дате');
      return parts.join(', ');
    },
  },
  {
    name: 'Снимки балансов: починка кодировки',
    run: (ss, dry) => {
      const sh = ss.getSheetByName('Снимки балансов');
      if (!sh || sh.getLastRow() < 2) return null;
      const range = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn());
      const values = range.getValues();
      let fixed = 0;
      const out = values.map((r) =>
        r.map((v) => {
          if (typeof v !== 'string' || !looksMojibake(v)) return v;
          fixed++;
          return fromLatin1Mojibake(v);
        }),
      );
      if (!fixed) return null;
      if (!dry) range.setValues(out);
      return `Исправлено ячеек: ${fixed}`;
    },
  },
  {
    name: '«Балансы»: последний снимок из банка',
    run: (ss, dry) => {
      const sh = ss.getSheetByName('Балансы')!;
      const a = setFormula(sh, 'D12', SNAP_FACT_FORMULA, dry);
      const b = setFormula(sh, 'E12', SNAP_AT_FORMULA, dry);
      return a || b ? 'Колонки «В банке» и «Снимок от» берут последний снимок счёта' : null;
    },
  },
  {
    name: '«Балансы»: расхождение на момент снимка',
    run: (ss, dry) => {
      const sh = ss.getSheetByName('Балансы')!;
      const form = ss.getSheetByName('Форма')!;
      const head = form.getRange(1, 1, 1, form.getLastColumn()).getValues()[0]!.map(String);
      const f = diffAtSnapshotFormula(head);
      if (!f) return null;
      const a = setFormula(sh, 'F12', f, dry);
      const h = String(sh.getRange('F11').getValue()) === 'Расхождение на снимок';
      if (!h && !dry) sh.getRange('F11').setValue('Расхождение на снимок');
      return a || !h ? '«Расхождение» сравнивает снимок с расчётом на тот же момент, а не на сегодня' : null;
    },
  },
  {
    name: 'Лист «Счета по месяцам»',
    run: (ss, dry) => monthlyAccounts(ss, dry),
  },
  {
    name: 'Лист «Чистые деньги по месяцам»',
    run: (ss, dry) => netWorth(ss, dry),
  },
  {
    name: 'Формулы, ссылавшиеся на старые «Балансы»',
    run: (ss, dry) => dependents(ss, dry),
  },
  {
    name: 'Порядок листов',
    run: (ss, dry) => {
      const order = [
        'Аналитика',
        'Дэшборд',
        'Сводка',
        'Лимиты на месяц',
        'Балансы',
        'Счета',
        'Снимки балансов',
        'Счета по месяцам',
        'Чистые деньги по месяцам',
        'Форма',
        'Справочник',
        'Правила',
        'Обработанные данные',
        'Дэшборд_данные',
        'Аналитика_данные',
      ];
      const current = ss.getSheets().map((sh) => sh.getName());
      const wanted = [
        ...order.filter((n) => current.includes(n)),
        ...current.filter((n) => !order.includes(n)),
      ];
      if (current.join('|') === wanted.join('|')) return null;
      if (!dry) {
        const active = ss.getActiveSheet();
        wanted.forEach((n, i) => {
          ss.setActiveSheet(ss.getSheetByName(n)!);
          ss.moveActiveSheet(i + 1);
        });
        ss.setActiveSheet(active);
      }
      return `Листы: ${wanted.join(', ')}`;
    },
  },
];

export function migrate(ss: Ss, dry: boolean): StepResult[] {
  return STEPS.map((s) => {
    const detail = s.run(ss, dry);
    return { step: s.name, changed: Boolean(detail), detail: detail ?? 'уже сделано' };
  });
}

// ---------- счета ----------

const A = "'Счета'!";
const S = "'Снимки балансов'!";
const SNAP_FILLED = `(${S}$C$2:$C<>"")+(${S}$D$2:$D<>"")`;
/**
 * Последний снимок счёта по времени, а не по строке: телефоны дописывают снимки не по порядку
 * (журнал 17.10), а пустые строки (только «Доступно») не в счёт. Для кредитки долг со знаком минус.
 */
export const SNAP_AT_FORMULA = `=MAP(A12:A;LAMBDA(acc;IF(acc="";;IFERROR(MAX(FILTER(${S}$A$2:$A;${S}$B$2:$B=acc;${SNAP_FILLED}));""))))`;
export const SNAP_FACT_FORMULA = `=MAP(A12:A;E12:E;LAMBDA(acc;snapAt;IF(OR(acc="";snapAt="");;IFERROR(LET(v;FILTER(ARRAYFORMULA(IF(${S}$D$2:$D<>"";-${S}$D$2:$D;${S}$C$2:$C));${S}$B$2:$B=acc;${S}$A$2:$A=snapAt;${SNAP_FILLED});INDEX(v;ROWS(v);1));""))))`;

/** Буква колонки по номеру (1 -> A, 27 -> AA). */
const letter = (n: number): string =>
  (n > 26 ? letter(Math.floor((n - 1) / 26)) : '') + String.fromCharCode(65 + ((n - 1) % 26));

/**
 * Расхождение на момент снимка: банк минус (расчёт сейчас минус движение по счёту после снимка).
 * Раньше сравнивали сегодняшний расчёт со старым снимком, и любая трата после снимка была «разницей»
 * (Наличные 17.10: снимок 0 от 12.10, переводы 14.10). Движение считается по «Форме», как movementAfter.
 */
export function diffAtSnapshotFormula(head: string[]): string | null {
  const col = (name: string) => {
    const i = head.indexOf(name);
    return i < 0 ? null : `'Форма'!$${letter(i + 1)}$2:$${letter(i + 1)}`;
  };
  const ts = col('Отметка времени');
  const sum = col('Сумма');
  const kind = col('Это доход или расход?');
  const from = col('Карта/счёт');
  const to = col('Куда перевели');
  const od = col('Дата операции (если не сегодня)');
  if (!ts || !sum || !kind || !from || !to || !od) return null;
  const move = `(${kind}="Доход")*(${from}=acc)-(${kind}="Расход")*(${from}=acc)+(${kind}="Перевод")*(${to}=acc)-(${kind}="Перевод")*(${from}=acc)`;
  return `=MAP(A12:A;C12:C;D12:D;E12:E;LAMBDA(acc;calc;fact;snapAt;IF(OR(acc="";fact="");"";fact-(calc-SUMPRODUCT((${ts}>snapAt)*(((${od}="")+(${od}>=INT(snapAt-5/24)))>0)*IFERROR(VALUE(${sum});0)*(${move}))))))`;
}

const SNAP = "'Снимки балансов'!";
export const ACCOUNT_TYPES = ['Дебет', 'Наличные', 'Кредит', 'Займ'];

interface OldAcc {
  name: string;
  type: string;
  start: number;
  limit: unknown;
}

/** Строки старых «Балансов» (до миграции): со строки после заголовка «Счёт» до пустой. */
function oldAccounts(ss: Ss): { accounts: OldAcc[]; startDate: Date } {
  const sh = ss.getSheetByName('Балансы')!;
  const v = sh.getRange(1, 1, sh.getLastRow(), 10).getValues();
  const head = v.findIndex((r) => String(r[0]).trim() === 'Счёт');
  const accounts: OldAcc[] = [];
  for (let i = head + 1; i < v.length; i++) {
    const name = String(v[i]![0]).trim();
    if (!name) break;
    accounts.push({ name, type: String(v[i]![1]).trim(), start: Number(v[i]![2]) || 0, limit: v[i]![8] });
  }
  return { accounts, startDate: v[1]![2] as Date };
}

function accountsSheet(ss: Ss, dry: boolean): string | null {
  if (ss.getSheetByName('Счета')) return null;
  const { accounts, startDate } = oldAccounts(ss);
  if (dry) return `Создан лист «Счета»: ${accounts.map((a) => a.name).join(', ')}`;
  const sh = ss.insertSheet('Счета');
  const head = [
    'Счёт',
    'Тип',
    'Остаток на старт',
    'Долг на старт',
    'Дата старта',
    'Кредитный лимит',
    'Банк',
    'Маски карт',
    'Комментарий',
  ];
  const rows = accounts.map((a) => {
    const type = a.name.toLowerCase() === 'наличные' ? 'Наличные' : a.type;
    const credit = type === 'Кредит';
    return [
      a.name,
      type,
      credit ? '' : a.start,
      credit ? -a.start : '',
      startDate,
      credit ? a.limit : '',
      a.name.startsWith('Т-Банк') ? 'Т-Банк' : '',
      '',
      '',
    ];
  });
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  sh.getRange(2, 1, rows.length, head.length).setValues(rows);
  sh.setFrozenRows(1);
  sh.getRange('C:D').setNumberFormat('#,##0" ₽"');
  sh.getRange('F:F').setNumberFormat('#,##0" ₽"');
  sh.getRange('E:E').setNumberFormat('dd.mm.yyyy');
  sh.getRange('A2:I200').setBackground('#FFF8D6');
  sh.getRange('B2:B200').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(ACCOUNT_TYPES, true).build(),
  );
  sh.getRange('A1').setNote('Настройки счетов. Новый счёт: новая строка, в «Балансах» он появится сам.');
  sh.getRange('C1').setNote('Для карт и наличных: сколько было на конец дня «Даты старта».');
  sh.getRange('D1').setNote('Для кредиток: долг на конец дня «Даты старта», положительным числом.');
  sh.getRange('E1').setNote('С какого дня считаем движения по счёту (траты после этой даты).');
  sh.getRange('H1').setNote(
    'Последние цифры карт через запятую: *2202, *1234. По ним приложение узнаёт счёт в уведомлении.',
  );
  return `Создан лист «Счета»: ${rows.length} счетов перенесено из «Балансов»`;
}

/** Остаток счёта сейчас: старт + движения после даты старта. acc: ссылка на ячейку или имя в LAMBDA. */
function currentBalance(acc: string): string {
  const sum = (type: string, col: 'J' | 'K') =>
    `SUMIFS(${P}$B:$B;${P}$C:$C;"${type}";${P}$${col}:$${col};${acc};${P}$A:$A;">"&sd)`;
  return `LET(r;MATCH(${acc};${A}$A:$A;0);sd;IF(INDEX(${A}$E:$E;r)="";DATE(2000;1;1);INDEX(${A}$E:$E;r));N(INDEX(${A}$C:$C;r))-N(INDEX(${A}$D:$D;r))+${sum('Доход', 'J')}+${sum('Перевод', 'K')}-${sum('Расход', 'J')}-${sum('Перевод', 'J')})`;
}

function balancesView(ss: Ss, dry: boolean): string | null {
  const sh = ss.getSheetByName('Балансы')!;
  if (String(sh.getRange('A1').getValue()) === 'Балансы на сегодня') return null;
  if (dry)
    return '«Балансы» пересобраны: итоги сверху, по счетам «сейчас / в банке / статус», только просмотр';
  sh.clear();
  sh.clearNotes();
  const lastSnap = (col: string) => `IFERROR(LOOKUP(2;1/(${SNAP}$B$2:$B=acc);${col});"")`;
  const cells: [string, string | number][] = [
    ['A1', 'Балансы на сегодня'],
    [
      'A2',
      'Только просмотр. Счета и остатки на старт: лист «Счета». Остаток из банка: строка в «Снимки балансов» (приложение добавляет само из уведомлений).',
    ],
    ['A4', 'Деньги (карты и наличные)'],
    ['B4', 'Нам должны'],
    ['C4', 'Долг по кредиткам'],
    ['D4', 'Чистые деньги'],
    ['A5', '=SUMIFS(C12:C;B12:B;"Дебет")+SUMIFS(C12:C;B12:B;"Наличные")'],
    ['B5', '=SUMIFS(C12:C;B12:B;"Займ")'],
    ['C5', '=-SUMIFS(C12:C;B12:B;"Кредит")'],
    ['D5', '=A5+B5-C5'],
    ['A7', 'Как сверить счёт'],
    ['A8', '1. Открой приложение банка и посмотри остаток (для кредитки: сколько должен).'],
    [
      'A9',
      '2. Добавь строку в «Снимки балансов»: дата, счёт, остаток или долг. Колонка «Статус» ниже покажет, сходится ли.',
    ],
    [
      'A10',
      '3. Если не сходится: в «Счета по месяцам» видно, в каком месяце разошлось, значит, там не внесена трата или не указан счёт.',
    ],
    ['A11', 'Счёт'],
    ['B11', 'Тип'],
    ['C11', 'Сейчас (расчёт)'],
    ['D11', 'В банке'],
    ['E11', 'Снимок от'],
    ['F11', 'Расхождение'],
    ['G11', 'Статус'],
    ['A12', `=FILTER(${A}A2:A;${A}A2:A<>"")`],
    ['B12', `=MAP(A12:A;LAMBDA(acc;IF(acc="";;VLOOKUP(acc;${A}A:B;2;0))))`],
    ['C12', `=MAP(A12:A;LAMBDA(acc;IF(acc="";;${currentBalance('acc')})))`],
    [
      'D12',
      `=MAP(A12:A;LAMBDA(acc;IF(acc="";;${lastSnap(`IF(${SNAP}$D$2:$D<>"";-${SNAP}$D$2:$D;${SNAP}$C$2:$C)`)})))`,
    ],
    ['E12', `=MAP(A12:A;LAMBDA(acc;IF(acc="";;${lastSnap(`${SNAP}$A$2:$A`)})))`],
    ['F12', '=ARRAYFORMULA(IF(A12:A="";;IF(D12:D="";"";D12:D-C12:C)))'],
    [
      'G12',
      '=ARRAYFORMULA(IF(A12:A="";;IF(D12:D="";"нет сверки";IF(ABS(F12:F)<1;"✓ сходится";"⚠ разница "&TEXT(F12:F;"#,##0")&" ₽"))))',
    ],
  ];
  for (const [a1, v] of cells) {
    const r = sh.getRange(a1);
    if (typeof v === 'string' && v.startsWith('=')) r.setFormula(v);
    else r.setValue(v);
  }
  sh.getRange('A1').setFontSize(14).setFontWeight('bold');
  sh.getRange('A2').setFontColor('#5B6370');
  sh.getRange('A4:D4').setFontColor('#5B6370');
  sh.getRange('A5:D5').setFontWeight('bold').setFontSize(13).setNumberFormat('#,##0" ₽"');
  sh.getRange('A7').setFontWeight('bold');
  sh.getRange('A8:A10').setFontColor('#5B6370');
  sh.getRange('A11:G11').setFontWeight('bold').setBackground('#EEF0EA');
  sh.getRange('C12:D200').setNumberFormat('#,##0" ₽"');
  sh.getRange('F12:F200').setNumberFormat('#,##0" ₽"');
  sh.getRange('E12:E200').setNumberFormat('dd.mm.yyyy hh:mm');
  sh.setColumnWidth(1, 200);
  sh.setFrozenRows(0);
  sh.protect()
    .setWarningOnly(true)
    .setDescription('Балансы считаются сами: правь «Счета» и «Снимки балансов»');
  return '«Балансы» пересобраны: итоги, таблица по счетам со статусом сверки, подсказка «как сверить»';
}

function dependents(ss: Ss, dry: boolean): string | null {
  const out: string[] = [];
  const set = (sheet: string, a1: string, f: string) => {
    const sh = ss.getSheetByName(sheet);
    if (!sh) return;
    const d = setFormula(sh, a1, f, dry);
    if (d) out.push(`${sheet}!${a1}`);
  };
  const M = "'Счета по месяцам'!";
  const byType = (type: string) =>
    `SUMIFS(${M}$G:$G;${M}$A:$A;">="&m;${M}$A:$A;"<"&EOMONTH(m;0)+1;${M}$C:$C;"${type}")`;
  set('Обработанные данные', 'L2', `=ARRAYFORMULA(IF(J2:J="";;IFERROR(VLOOKUP(J2:J;${A}$A:$B;2;0);)))`);
  set('Обработанные данные', 'M2', `=ARRAYFORMULA(IF(K2:K="";;IFERROR(VLOOKUP(K2:K;${A}$A:$B;2;0);)))`);
  set('Лимиты на месяц', 'B14', "='Балансы'!D5");
  set(
    'Аналитика_данные',
    'AB2',
    `=IFERROR(FILTER(A2:A40;A2:A40>=DATE(YEAR(MIN(${A}E2:E));MONTH(MIN(${A}E2:E));1));"")`,
  );
  set(
    'Аналитика_данные',
    'AC2',
    `=MAP(AB2:AB40;LAMBDA(m;IF(m="";;${byType('Дебет')}+${byType('Наличные')})))`,
  );
  set('Аналитика_данные', 'AD2', `=MAP(AB2:AB40;LAMBDA(m;IF(m="";;-${byType('Кредит')})))`);
  set('Аналитика_данные', 'AG12', "='Балансы'!A5");
  set('Аналитика_данные', 'AG13', "='Балансы'!C5");
  set('Аналитика_данные', 'AG14', "='Балансы'!D5");
  return out.length ? `Переписаны: ${out.join(', ')}` : null;
}

// ---------- помесячные листы ----------

interface Acc {
  name: string;
  type: string;
}

function accounts(ss: Ss): Acc[] {
  const sh = ss.getSheetByName('Счета');
  if (!sh) return oldAccounts(ss).accounts.map((a) => ({ name: a.name, type: a.type }));
  return sh
    .getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 2)
    .getValues()
    .filter((r) => String(r[0]).trim())
    .map((r) => ({ name: String(r[0]).trim(), type: String(r[1]).trim() }));
}

/** Месяцы от самой ранней «Даты старта» до конца следующего года. */
function months(ss: Ss): Date[] {
  const sh = ss.getSheetByName('Счета');
  const dates = sh
    ? sh
        .getRange(2, 5, Math.max(sh.getLastRow() - 1, 1), 1)
        .getValues()
        .map((r) => r[0])
        .filter((d): d is Date => d instanceof Date)
    : [oldAccounts(ss).startDate];
  const start = new Date(Math.min(...dates.map((d) => d.getTime())));
  const first = new Date(start.getFullYear(), start.getMonth(), 1);
  const out: Date[] = [];
  for (
    let d = first;
    d.getFullYear() <= start.getFullYear() + 1;
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  )
    out.push(d);
  return out;
}

/** Движение по счёту за [from, to), только после «Даты старта» счёта. */
function flow(acc: string, from: string, to: string, sign: 'in' | 'out'): string {
  const sd = `INDEX(${A}$E:$E;MATCH("${acc}";${A}$A:$A;0))`;
  const base = (type: string, col: 'J' | 'K') =>
    `SUMIFS(${P}$B:$B;${P}$C:$C;"${type}";${P}$${col}:$${col};"${acc}";${P}$A:$A;">"&${sd};${P}$A:$A;">="&${from};${P}$A:$A;"<"&${to})`;
  return sign === 'in'
    ? `(${base('Доход', 'J')}+${base('Перевод', 'K')})`
    : `(${base('Расход', 'J')}+${base('Перевод', 'J')})`;
}

export function monthlyAccounts(ss: Ss, dry: boolean): string | null {
  const name = 'Счета по месяцам';
  const existing = ss.getSheetByName(name);
  // Лист из первой версии миграции ссылается на старые «Балансы»: пересобираем.
  // Строки там на каждый счёт: новый счёт в «Счетах» (addAccount) требует пересборки.
  const listed = existing
    ? new Set(
        existing
          .getRange(2, 2, Math.max(existing.getLastRow() - 1, 1), 1)
          .getValues()
          .map((r) => String(r[0]).trim()),
      )
    : new Set<string>();
  const outdated =
    existing &&
    (existing.getRange('D2').getFormula().includes("'Балансы'!") ||
      accounts(ss).some((a) => !listed.has(a.name)));
  if (existing && !outdated) return null;
  if (dry) return `${outdated ? 'Пересобран' : 'Создан'} лист «${name}» на основе «Счетов»`;
  const sh = existing ?? ss.insertSheet(name);
  sh.clear();
  const head = [
    'Месяц',
    'Счёт',
    'Тип',
    'На начало',
    'Приход',
    'Уход',
    'На конец (расчёт)',
    'Факт (снимок)',
    'Расхождение',
  ];
  const rows: unknown[][] = [];
  let r = 2;
  for (const m of months(ss)) {
    for (const a of accounts(ss)) {
      const from = `$A${r}`;
      const to = `EOMONTH($A${r};0)+1`;
      const startBal = `(N(INDEX(${A}$C:$C;MATCH("${a.name}";${A}$A:$A;0)))-N(INDEX(${A}$D:$D;MATCH("${a.name}";${A}$A:$A;0))))`;
      rows.push([
        m,
        a.name,
        a.type,
        `=${startBal}+${flow(a.name, 'DATE(2000;1;1)', from, 'in')}-${flow(a.name, 'DATE(2000;1;1)', from, 'out')}`,
        `=${flow(a.name, from, to, 'in')}`,
        `=${flow(a.name, from, to, 'out')}`,
        `=D${r}+E${r}-F${r}`,
        `=IFERROR(ARRAYFORMULA(LOOKUP(2;1/((${SNAP}$B$2:$B="${a.name}")*(${SNAP}$A$2:$A<${to})*(${SNAP}$A$2:$A>=${from}));IF(${SNAP}$D$2:$D<>"";-${SNAP}$D$2:$D;${SNAP}$C$2:$C)));"")`,
        `=IF(H${r}="";"";H${r}-G${r})`,
      ]);
      r++;
    }
  }
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  sh.getRange(2, 1, rows.length, head.length).setValues(rows);
  sh.getRange(2, 1, rows.length, 1).setNumberFormat('mmm yyyy');
  sh.getRange(2, 4, rows.length, 6).setNumberFormat('#,##0" ₽"');
  sh.setFrozenRows(1);
  return `${outdated ? 'Пересобран' : 'Создан'} лист «${name}»: ${rows.length} строк (месяц × счёт)`;
}

function netWorth(ss: Ss, dry: boolean): string | null {
  const name = 'Чистые деньги по месяцам';
  const existing = ss.getSheetByName(name);
  const outdated = existing && !existing.getRange('B2').getFormula().includes('Наличные');
  if (existing && !outdated) return null;
  if (dry) return `${outdated ? 'Пересобран' : 'Создан'} лист «${name}»`;
  const sh = existing ?? ss.insertSheet(name);
  sh.clear();
  const head = [
    'Месяц',
    'Деньги (карты и наличные)',
    'Нам должны',
    'Долг',
    'Чистые',
    'Изменение за месяц',
    'Сальдо месяца',
    'Проценты и комиссии',
    'Неучтённое',
  ];
  const M = "'Счета по месяцам'!";
  const rows = months(ss).map((m, i) => {
    const r = i + 2;
    const end = (type: string) => `SUMIFS(${M}$G:$G;${M}$A:$A;$A${r};${M}$C:$C;"${type}")`;
    const period = `${P}$A:$A;">="&$A${r};${P}$A:$A;"<"&EOMONTH($A${r};0)+1`;
    return [
      m,
      `=${end('Дебет')}+${end('Наличные')}`,
      `=${end('Займ')}`,
      `=-${end('Кредит')}`,
      `=B${r}+C${r}-D${r}`,
      i === 0 ? '' : `=E${r}-E${r - 1}`,
      `=SUMIFS(${P}$B:$B;${P}$C:$C;"Доход";${period})-SUMIFS(${P}$B:$B;${P}$C:$C;"Расход";${period})`,
      `=SUMIFS(${P}$B:$B;${P}$F:$F;"Проценты и комиссии";${period})`,
      i === 0 ? '' : `=F${r}-G${r}`,
    ];
  });
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  sh.getRange(2, 1, rows.length, head.length).setValues(rows);
  sh.getRange(2, 1, rows.length, 1).setNumberFormat('mmm yyyy');
  sh.getRange(2, 2, rows.length, 8).setNumberFormat('#,##0" ₽"');
  sh.setFrozenRows(1);
  return `${outdated ? 'Пересобран' : 'Создан'} лист «${name}»: ${rows.length} месяцев`;
}

/** «ÐÐ¸ÐºÐ¸ÑÐ°»: UTF-8 байты, прочитанные как Latin-1. */
export function looksMojibake(v: string): boolean {
  return /[ÐÑ][\u0080-\u00BF]/.test(v);
}

export function fromLatin1Mojibake(v: string): string {
  const bytes = Array.from(v, (ch) => {
    const c = ch.charCodeAt(0);
    return c > 127 ? c - 256 : c;
  });
  return Utilities.newBlob(bytes).getDataAsString('UTF-8');
}
