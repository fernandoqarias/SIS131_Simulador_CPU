/**
 * Config.gs — Constantes globales, tabla ISA y programas demostrativos.
 * Memoria: 00h-7Fh = segmento de CÓDIGO, 80h-FFh = segmento de DATOS.
 */
var SHEET_NAME = 'Simulador';
var GRID_ROW = 5, GRID_COL = 6;                 // F5 = dirección 00h
var CODE_END = 0x7F;
var LOG_COL = 23, LOG_ROW = 5, LOG_LINES = 40;  // columna W
var DIS_COL = 25;                               // columna Y
var DELAY_CELL = 'B25';
var REG_ROW = {PC:4, IR:5, MAR:6, MDR:7, AX:8, BX:9, ZF:10, CF:11, SF:12,
               ALU:13, FASE:14, MICRO:15, INSTR:16};
var PHASE_COLOR = {FETCH:'#90caf9', DECODE:'#ce93d8', EXECUTE:'#ffcc80', STORE:'#a5d6a7'};

// [opcode, mnemónico, operando A, operando B]
// Tipos: AX | BX | imm (1 byte) | [dir] (1 byte) | dir (1 byte)
var ISA = [
  [0x01,'MOV','AX','imm'],[0x02,'MOV','BX','imm'],[0x03,'MOV','AX','BX'],[0x04,'MOV','BX','AX'],
  [0x05,'LOAD','AX','[dir]'],[0x06,'LOAD','BX','[dir]'],
  [0x07,'STORE','[dir]','AX'],[0x08,'STORE','[dir]','BX'],
  [0x10,'ADD','AX','imm'],[0x11,'ADD','AX','BX'],[0x12,'ADD','BX','imm'],[0x13,'ADD','BX','AX'],
  [0x20,'SUB','AX','imm'],[0x21,'SUB','AX','BX'],[0x22,'SUB','BX','imm'],[0x23,'SUB','BX','AX'],
  [0x30,'INC','AX'],[0x31,'INC','BX'],[0x32,'DEC','AX'],[0x33,'DEC','BX'],
  [0x40,'CMP','AX','imm'],[0x41,'CMP','AX','BX'],[0x42,'CMP','BX','imm'],[0x43,'CMP','BX','AX'],
  [0x50,'AND','AX','BX'],[0x51,'OR','AX','BX'],[0x52,'XOR','AX','BX'],[0x53,'NOT','AX'],
  [0x60,'JMP','dir'],[0x61,'JZ','dir'],[0x62,'JNZ','dir'],[0x63,'JC','dir'],[0x64,'JNC','dir'],
  [0xFF,'HLT']
];

var OPS = {};
ISA.forEach(function (r) {
  var len = 1;
  [r[2], r[3]].forEach(function (t) { if (t === 'imm' || t === '[dir]' || t === 'dir') len++; });
  OPS[r[0]] = {code: r[0], m: r[1], a: r[2], b: r[3], len: len};
});

var PROGRAMS = {
  // 6 x 5 por sumas sucesivas. [80h]=A, [81h]=B (contador), [82h]=resultado
  mult: {
    code: [0x05,0x81, 0x40,0x00, 0x61,0x18, 0x01,0x00, 0x07,0x82,
           0x05,0x82, 0x06,0x80, 0x11, 0x07,0x82, 0x05,0x81, 0x32,
           0x07,0x81, 0x62,0x0A, 0xFF],
    data: {0x80: 6, 0x81: 5, 0x82: 0}
  },
  // Fibonacci hasta desbordar 8 bits. Resultado final [80h]=E9h (233)
  fib: {
    code: [0x01,0x00, 0x02,0x01, 0x07,0x80, 0x11, 0x63,0x10, 0x07,0x81,
           0x03, 0x06,0x81, 0x60,0x04, 0x08,0x80, 0xFF],
    data: {}
  }
};
