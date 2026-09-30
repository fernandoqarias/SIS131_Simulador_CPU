/**
 * Memoria.gs — RAM de 256 x 8 bits mapeada en la cuadrícula F5:U20.
 * Operaciones primitivas: Read(address) y Write(address, value).
 */
function hex2_(n) { return ('0' + (n & 255).toString(16).toUpperCase()).slice(-2); }
function bin8_(n) { return ('00000000' + (n & 255).toString(2)).slice(-8); }
function getSheet_() { return SpreadsheetApp.getActive().getSheetByName(SHEET_NAME); }
function cell_(addr) { return getSheet_().getRange(GRID_ROW + (addr >> 4), GRID_COL + (addr & 15)); }

function Read(address) {
  var v = parseInt(String(cell_(address & 255).getValue()), 16);
  return isNaN(v) ? 0 : v;
}

function Write(address, value) {
  cell_(address & 255).setValue(hex2_(value));
}

function readAll_() {
  var v = getSheet_().getRange(GRID_ROW, GRID_COL, 16, 16).getValues(), mem = [];
  for (var r = 0; r < 16; r++) for (var c = 0; c < 16; c++) {
    var n = parseInt(String(v[r][c]), 16); mem.push(isNaN(n) ? 0 : n);
  }
  return mem;
}

/** Carga código desde 00h y datos en sus direcciones; el resto queda en 00. */
function loadImage_(code, data) {
  var mem = [], i;
  for (i = 0; i < 256; i++) mem.push(0);
  code.forEach(function (b, k) { mem[k] = b; });
  for (var a in data) mem[Number(a)] = data[a];
  var g = [];
  for (var r = 0; r < 16; r++) {
    var row = [];
    for (var c = 0; c < 16; c++) row.push(hex2_(mem[r * 16 + c]));
    g.push(row);
  }
  var rng = getSheet_().getRange(GRID_ROW, GRID_COL, 16, 16);
  rng.setNumberFormat('@'); rng.setValues(g);
}

function fmtOp_(t, val) {
  if (t === 'imm' || t === 'dir') return '0x' + hex2_(val);
  if (t === '[dir]') return '[0x' + hex2_(val) + ']';
  return t;
}
function opText_(op, val) {
  var t = op.m;
  if (op.a) t += ' ' + fmtOp_(op.a, val);
  if (op.b) t += ', ' + fmtOp_(op.b, val);
  return t;
}

/** Desensamblado del segmento de código en la columna Y. */
function listing_() {
  var mem = readAll_(), last = -1, out = [], a = 0, sh = getSheet_();
  for (var i = 0; i <= CODE_END; i++) if (mem[i]) last = i;
  while (a <= last) {
    var op = OPS[mem[a]], nxt = mem[(a + 1) & 255];
    if (!op) { out.push([hex2_(a) + 'h:  ' + hex2_(mem[a]) + '      DB 0x' + hex2_(mem[a])]); a++; continue; }
    out.push([hex2_(a) + 'h:  ' + hex2_(mem[a]) + (op.len > 1 ? ' ' + hex2_(nxt) : '   ') + '   ' + opText_(op, nxt)]);
    a += op.len;
  }
  sh.getRange(5, DIS_COL, 60, 1).clearContent();
  if (out.length) sh.getRange(5, DIS_COL, out.length, 1).setValues(out);
}
