/**
 * CPU.gs — Unidad de control, ALU y ciclo Fetch/Decode/Execute/Store.
 * El estado de los registros se guarda en DocumentProperties; la RAM vive en la hoja.
 * Micro-operaciones (s.ph): F1 MAR<-PC | F2 MDR<-RAM[MAR] | F3 IR<-MDR, PC++ |
 *                           D decode | E execute | S store.
 * Si la instrucción tiene operando, F1-F3 se repiten para leerlo (s.oper = true).
 */
function newState_() {
  return {PC:0, IR:0, MAR:0, MDR:0, AX:0, BX:0, ZF:0, CF:0, SF:0,
          ph:'F1', phase:'', alu:'', opnd:0, res:0, wb:null, oper:false,
          n:0, inst:0, halted:false, log:[]};
}
function getState_() {
  var p = PropertiesService.getDocumentProperties().getProperty('cpu');
  return p ? JSON.parse(p) : newState_();
}
function saveState_(s) {
  PropertiesService.getDocumentProperties().setProperty('cpu', JSON.stringify(s));
}
function log_(s, phase, msg) {
  s.phase = phase;
  s.log.push('[Paso ' + ('00' + s.n).slice(-3) + '] ' + phase + ': ' + msg);
  if (s.log.length > LOG_LINES) s.log.shift();
}
function setFlags_(s) { s.ZF = s.res === 0 ? 1 : 0; s.SF = (s.res >> 7) & 1; }
function h_(n) { return '0x' + hex2_(n); }

/** Ejecuta UNA micro-operación y devuelve qué componentes resaltar. */
function micro_(s) {
  var hl = {regs: [], mem: null, written: false}, op = OPS[s.IR], msg;
  s.n++;
  switch (s.ph) {
    case 'F1':
      s.MAR = s.PC; hl.regs = ['PC', 'MAR'];
      log_(s, 'FETCH', 'MAR ← PC = ' + h_(s.PC) + (s.oper ? ' (operando)' : ''));
      s.ph = 'F2'; break;
    case 'F2':
      s.MDR = Read(s.MAR); hl.regs = ['MAR', 'MDR']; hl.mem = s.MAR;
      log_(s, 'FETCH', 'MDR ← RAM[' + h_(s.MAR) + '] = ' + h_(s.MDR));
      s.ph = 'F3'; break;
    case 'F3':
      s.PC = (s.PC + 1) & 255;
      if (!s.oper) {
        s.IR = s.MDR; op = OPS[s.IR]; hl.regs = ['MDR', 'IR', 'PC'];
        if (!op) { s.halted = true; log_(s, 'FETCH', 'Opcode inválido ' + h_(s.IR) + ' → CPU detenida'); break; }
        log_(s, 'FETCH', 'IR ← MDR = ' + h_(s.IR) + '; PC ← PC+1 = ' + h_(s.PC));
        if (op.len > 1) { s.oper = true; s.ph = 'F1'; } else s.ph = 'D';
      } else {
        s.opnd = s.MDR; s.oper = false; hl.regs = ['MDR', 'PC'];
        log_(s, 'FETCH', 'operando ← MDR = ' + h_(s.opnd) + '; PC ← PC+1 = ' + h_(s.PC));
        s.ph = 'D';
      }
      break;
    case 'D':
      var modo = op.b === 'imm' ? 'inmediato' : (op.a === '[dir]' || op.b === '[dir]') ? 'directo'
               : op.a === 'dir' ? 'salto absoluto' : op.b ? 'registro' : 'implícito';
      hl.regs = ['IR'];
      log_(s, 'DECODE', 'Opcode ' + h_(s.IR) + ' → ' + opText_(op, s.opnd) + ' | modo ' + modo);
      s.ph = 'E'; break;
    case 'E':
      execute_(s, op, hl);
      s.ph = s.halted ? 'E' : 'S'; break;
    case 'S':
      if (s.wb && s.wb.r) {
        s[s.wb.r] = s.res; hl.regs = [s.wb.r]; msg = s.wb.r + ' ← ' + h_(s.res);
      } else if (s.wb && s.wb.mem) {
        Write(s.MAR, s.MDR); hl.regs = ['MAR', 'MDR']; hl.mem = s.MAR; hl.written = true;
        msg = 'RAM[' + h_(s.MAR) + '] ← MDR = ' + h_(s.MDR);
      } else msg = 'Sin escritura (CMP / salto)';
      log_(s, 'STORE', msg);
      s.inst++; s.wb = null; s.ph = 'F1'; break;
  }
  return hl;
}

/** Fase EXECUTE: ALU, cálculo de saltos y actualización de banderas. */
function execute_(s, op, hl) {
  var m = op.m, a = op.a, b = op.b, x, y, r, msg = '';
  var v = function (k) { return k === 'AX' ? s.AX : k === 'BX' ? s.BX : s.opnd; };
  var fl = function () { return ' | ZF=' + s.ZF + ' CF=' + s.CF + ' SF=' + s.SF; };
  s.wb = null; hl.regs = ['ALU'];
  switch (m) {
    case 'MOV':
      s.res = v(b); s.wb = {r: a}; s.alu = 'MOV'; hl.regs = [b === 'imm' ? 'IR' : b];
      msg = 'Transferencia: ' + a + ' ← ' + h_(s.res); break;
    case 'LOAD':
      s.MAR = s.opnd; s.MDR = Read(s.MAR); s.res = s.MDR; s.wb = {r: a};
      hl.regs = ['MAR', 'MDR']; hl.mem = s.MAR;
      msg = 'MAR ← ' + h_(s.MAR) + '; MDR ← RAM[MAR] = ' + h_(s.MDR); break;
    case 'STORE':
      s.MAR = s.opnd; s.MDR = v(b); s.res = s.MDR; s.wb = {mem: true};
      hl.regs = ['MAR', 'MDR', b];
      msg = 'MAR ← ' + h_(s.MAR) + '; MDR ← ' + b + ' = ' + h_(s.MDR); break;
    case 'ADD': case 'SUB': case 'CMP':
      x = v(a); y = v(b); r = (m === 'ADD') ? x + y : x - y;
      s.CF = (r > 255 || r < 0) ? 1 : 0; s.res = r & 255; setFlags_(s);
      s.alu = m + ' ' + hex2_(x) + (m === 'ADD' ? '+' : '−') + hex2_(y) + '=' + hex2_(s.res);
      if (m !== 'CMP') s.wb = {r: a};
      hl.regs = ['ALU', 'ZF', 'CF', 'SF']; msg = s.alu + fl(); break;
    case 'INC': case 'DEC':   // como en x86, INC/DEC no modifican CF
      x = v(a); s.res = (x + (m === 'INC' ? 1 : -1)) & 255; setFlags_(s);
      s.wb = {r: a}; s.alu = m + ' ' + hex2_(x) + '=' + hex2_(s.res);
      hl.regs = ['ALU', 'ZF', 'SF']; msg = s.alu + fl(); break;
    case 'AND': case 'OR': case 'XOR':
      x = v(a); y = v(b);
      s.res = (m === 'AND' ? x & y : m === 'OR' ? x | y : x ^ y) & 255;
      s.CF = 0; setFlags_(s); s.wb = {r: a};
      s.alu = m + ' ' + hex2_(x) + ',' + hex2_(y) + '=' + hex2_(s.res);
      hl.regs = ['ALU', 'ZF', 'CF', 'SF']; msg = s.alu + fl(); break;
    case 'NOT':
      x = v(a); s.res = (~x) & 255; s.CF = 0; setFlags_(s); s.wb = {r: a};
      s.alu = 'NOT ' + hex2_(x) + '=' + hex2_(s.res);
      hl.regs = ['ALU', 'ZF', 'CF', 'SF']; msg = s.alu + fl(); break;
    case 'JMP': case 'JZ': case 'JNZ': case 'JC': case 'JNC':
      var taken = m === 'JMP' || (m === 'JZ' && s.ZF) || (m === 'JNZ' && !s.ZF) ||
                  (m === 'JC' && s.CF) || (m === 'JNC' && !s.CF);
      if (taken) s.PC = s.opnd;
      hl.regs = ['PC']; s.alu = m + (taken ? ' tomado' : ' no tomado');
      msg = m + ' ' + h_(s.opnd) + ': ' + (taken ? 'salto → PC = ' + h_(s.PC) : 'no salta') + fl(); break;
    case 'HLT':
      s.halted = true; hl.regs = ['PC']; msg = 'HLT: reloj detenido en PC = ' + h_(s.PC); break;
  }
  log_(s, 'EXECUTE', msg);
}

// ---------- Controles (asignables a botones / menú) ----------
function STEP() {
  var s = getState_();
  if (s.halted) return SpreadsheetApp.getActive().toast('CPU detenida. Use RESET.');
  var hl = micro_(s); saveState_(s); render_(s, hl);
}

function STEP_INSTR() {
  var s = getState_(), hl;
  if (s.halted) return SpreadsheetApp.getActive().toast('CPU detenida. Use RESET.');
  do { hl = micro_(s); } while (!s.halted && s.ph !== 'F1');
  saveState_(s); render_(s, hl);
}

function RUN() {
  var cache = CacheService.getDocumentCache(), t0 = Date.now();
  cache.remove('pause');
  while (Date.now() - t0 < 5 * 60 * 1000) {
    if (cache.get('pause')) break;
    var s = getState_(); if (s.halted) break;
    var hl = micro_(s); saveState_(s); render_(s, hl); SpreadsheetApp.flush();
    Utilities.sleep(Math.max(0, Number(getSheet_().getRange(DELAY_CELL).getValue()) || 0));
  }
}

function PAUSE() { CacheService.getDocumentCache().put('pause', '1', 120); }

function RESET() {
  PAUSE();
  var s = newState_(); saveState_(s); render_(s, {regs: [], mem: null});
}

function loadProgram_(p) {
  PAUSE();
  loadImage_(p.code, p.data); listing_();
  var s = newState_(); saveState_(s); render_(s, {regs: [], mem: null});
}
function LOAD_PROGRAM() { loadProgram_(PROGRAMS.mult); }
function LOAD_FIBONACCI() { loadProgram_(PROGRAMS.fib); }
