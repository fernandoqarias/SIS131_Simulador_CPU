/**
 * UI.gs — Construcción de la hoja, render de registros/memoria/log y menú.
 * Ejecute SETUP() una vez para crear la interfaz.
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('CPU Simulador')
    .addItem('▶ RUN', 'RUN').addItem('⏸ PAUSE', 'PAUSE')
    .addItem('⏭ STEP (micro-operación)', 'STEP').addItem('⏩ STEP instrucción', 'STEP_INSTR')
    .addItem('⟲ RESET', 'RESET').addSeparator()
    .addItem('LOAD PROGRAM: multiplicación', 'LOAD_PROGRAM')
    .addItem('LOAD PROGRAM: Fibonacci', 'LOAD_FIBONACCI')
    .addItem('Reconstruir hoja (SETUP)', 'SETUP').addToUi();
}

/** Normaliza a 2 dígitos hex cuando el usuario edita una celda de memoria. */
function onEdit(e) {
  var r = e.range;
  if (r.getSheet().getName() !== SHEET_NAME) return;
  if (r.getNumRows() === 1 && r.getNumColumns() === 1 &&
      r.getRow() >= GRID_ROW && r.getRow() < GRID_ROW + 16 &&
      r.getColumn() >= GRID_COL && r.getColumn() < GRID_COL + 16) {
    var v = parseInt(String(e.value), 16);
    r.setValue(isNaN(v) ? '00' : hex2_(v));
    listing_();
  }
}

function SETUP() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  sh.clear(); sh.setHiddenGridlines(true);
  var head = function (rng, txt) {
    sh.getRange(rng).setValue(txt).setFontWeight('bold').setBackground('#1a237e').setFontColor('#ffffff');
  };

  sh.getRange('A1').setValue('SIMULADOR DE CPU 8 BITS · von Neumann / x86 simplificado')
    .setFontSize(16).setFontWeight('bold');

  // Registros
  sh.getRange('A3:C3').setValues([['REGISTRO', 'VALOR', 'DETALLE']])
    .setBackground('#1a237e').setFontColor('#ffffff').setFontWeight('bold');
  var names = ['PC', 'IR', 'MAR', 'MDR', 'AX', 'BX', 'ZF', 'CF', 'SF', 'ALU', 'FASE', 'MICRO-OP #', 'INSTRUCCIONES'];
  sh.getRange(4, 1, 13, 1).setValues(names.map(function (n) { return [n]; })).setFontWeight('bold');
  sh.getRange(4, 2, 13, 2).setNumberFormat('@').setFontFamily('Roboto Mono');
  sh.getRange('A3:C16').setBorder(true, true, true, true, true, true);

  // Inspector de memoria (hex / binario / decimal / con signo)
  sh.getRange('A18').setValue('INSPECTOR DE MEMORIA');
  sh.getRange('A18:C18').setFontWeight('bold').setBackground('#1a237e').setFontColor('#ffffff');
  sh.getRange('A19:A23').setValues([['Dirección (hex)'], ['Hexadecimal'], ['Binario'], ['Decimal'], ['Con signo (C2)']]);
  sh.getRange('B19').setNumberFormat('@').setValue('00').setBackground('#fff59d');
  sh.getRange('B20').setFormula('=INDEX($F$5:$U$20,HEX2DEC(LEFT(B19,1))+1,HEX2DEC(RIGHT(B19,1))+1)');
  sh.getRange('B21').setFormula('=HEX2BIN(B20,8)');
  sh.getRange('B22').setFormula('=HEX2DEC(B20)');
  sh.getRange('B23').setFormula('=IF(B22>127,B22-256,B22)');
  sh.getRange('B19:B23').setFontFamily('Roboto Mono');
  sh.getRange('A25').setValue('Retardo RUN (ms)').setFontWeight('bold');
  sh.getRange(DELAY_CELL).setValue(300).setBackground('#fff59d');

  // Memoria 16x16
  sh.getRange('E3:U3').merge().setValue('MEMORIA RAM · 256 bytes (00h–FFh) · fila = nibble alto, columna = nibble bajo')
    .setFontWeight('bold').setBackground('#1a237e').setFontColor('#ffffff');
  var cols = [], rows = [], i;
  for (i = 0; i < 16; i++) { cols.push(i.toString(16).toUpperCase()); rows.push([i.toString(16).toUpperCase() + '0']); }
  sh.getRange(4, GRID_COL, 1, 16).setNumberFormat('@').setValues([cols]).setFontWeight('bold').setBackground('#eeeeee').setHorizontalAlignment('center');
  sh.getRange(GRID_ROW, GRID_COL - 1, 16, 1).setNumberFormat('@').setValues(rows).setFontWeight('bold').setBackground('#eeeeee').setHorizontalAlignment('center');
  sh.getRange(GRID_ROW, GRID_COL, 16, 16).setNumberFormat('@').setHorizontalAlignment('center')
    .setFontFamily('Roboto Mono').setBorder(true, true, true, true, true, true);
  sh.getRange('E22:U22').merge().setValue('■ Segmento de CÓDIGO 00h–7Fh').setBackground('#e8f0fe');
  sh.getRange('E23:U23').merge().setValue('■ Segmento de DATOS 80h–FFh').setBackground('#e6f4ea');
  sh.getRange('E24:U24').merge().setValue('■ Ámbar = PC · Azul = MAR · Color de fase = celda accedida · Verde fuerte = escritura').setBackground('#ffe082');
  sh.getRange('E26:U26').merge().setValue('Botones: menú "CPU Simulador" o Insertar > Dibujo y asignar script (STEP, STEP_INSTR, RUN, PAUSE, RESET, LOAD_PROGRAM).')
    .setFontStyle('italic');

  // Log y listado
  head('W3', 'LOG DE MICRO-OPERACIONES');
  head('Y3', 'LISTADO DEL PROGRAMA (desensamblado)');
  sh.getRange(LOG_ROW, LOG_COL, LOG_LINES, 1).setFontFamily('Roboto Mono').setFontSize(9);
  sh.getRange(5, DIS_COL, 60, 1).setFontFamily('Roboto Mono').setFontSize(10);

  // Anchos
  sh.setColumnWidth(1, 130); sh.setColumnWidth(2, 90); sh.setColumnWidth(3, 200);
  sh.setColumnWidth(4, 20); sh.setColumnWidth(5, 40); sh.setColumnWidths(GRID_COL, 16, 34);
  sh.setColumnWidth(22, 20); sh.setColumnWidth(23, 560); sh.setColumnWidth(24, 20); sh.setColumnWidth(25, 260);

  LOAD_PROGRAM();
}

/** Pinta registros, banderas, memoria y log según el estado y los resaltados. */
function render_(s, hl) {
  var sh = getSheet_(), op = OPS[s.IR];
  var col = PHASE_COLOR[s.phase] || '#fff59d';
  var reg = function (n) { return ['0x' + hex2_(n), bin8_(n) + ' | ' + n]; };
  var vals = [
    ['0x' + hex2_(s.PC), 'dec ' + s.PC],
    ['0x' + hex2_(s.IR), op ? opText_(op, s.opnd) : '—'],
    reg(s.MAR), reg(s.MDR), reg(s.AX), reg(s.BX),
    [s.ZF, '1 = resultado cero'], [s.CF, '1 = acarreo / préstamo'], [s.SF, '1 = MSB (negativo C2)'],
    [s.alu || '', 'última operación ALU'],
    [s.phase || '—', s.halted ? 'CPU DETENIDA' : 'siguiente: ' + s.ph],
    [s.n, 'micro-operaciones'], [s.inst, 'instrucciones completadas']
  ];
  sh.getRange(4, 2, 13, 2).setValues(vals);

  var bg = [], r, c;
  for (r = 0; r < 13; r++) bg.push(['#ffffff', '#ffffff', '#ffffff']);
  (hl.regs || []).forEach(function (k) {
    var i = REG_ROW[k] - 4; if (bg[i]) bg[i] = [col, col, col];
  });
  var f = REG_ROW.FASE - 4; bg[f] = s.halted ? ['#ef9a9a', '#ef9a9a', '#ef9a9a'] : [col, col, col];
  sh.getRange(4, 1, 13, 3).setBackgrounds(bg);

  var g = [];
  for (r = 0; r < 16; r++) {
    var row = [];
    for (c = 0; c < 16; c++) row.push((r * 16 + c) <= CODE_END ? '#e8f0fe' : '#e6f4ea');
    g.push(row);
  }
  var paint = function (a, color) { g[a >> 4][a & 15] = color; };
  paint(s.PC, '#ffe082'); paint(s.MAR, '#90caf9');
  if (hl.mem !== null && hl.mem !== undefined) paint(hl.mem, hl.written ? '#43a047' : col);
  sh.getRange(GRID_ROW, GRID_COL, 16, 16).setBackgrounds(g);

  var L = [];
  for (var i = 0; i < LOG_LINES; i++) L.push([s.log[i] || '']);
  sh.getRange(LOG_ROW, LOG_COL, LOG_LINES, 1).setValues(L);
}
