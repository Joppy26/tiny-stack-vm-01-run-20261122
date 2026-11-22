// Tiny stack VM for make.fun's tiny-stack-vm-01 ISA (kit ISA.md): 32-bit
// wrapping ints, 256-value stack, 64-deep call stack, 256 words of memory,
// byte I/O, ten traps with their own exit codes. Answers every instance
// under /input/<id>/ with /output/<id>/stdout.bin and exit.txt.
//   mkdir -p out && MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Per opcode: [immediate bytes, values popped, values pushed].
const META = new Map<number, [number, number, number]>([
  [0x00, [0, 0, 0]], [0x01, [1, 0, 1]], [0x02, [4, 0, 1]],
  [0x03, [0, 1, 0]], [0x04, [0, 1, 2]], [0x05, [0, 2, 2]],
  [0x06, [0, 2, 3]], [0x07, [0, 3, 3]],
  [0x10, [0, 2, 1]], [0x11, [0, 2, 1]], [0x12, [0, 2, 1]],
  [0x13, [0, 2, 1]], [0x14, [0, 2, 1]], [0x15, [0, 2, 1]],
  [0x16, [0, 2, 1]], [0x17, [0, 1, 1]], [0x18, [0, 2, 1]],
  [0x19, [0, 2, 1]], [0x1a, [0, 2, 1]], [0x1b, [0, 1, 1]],
  [0x1c, [0, 2, 1]], [0x1d, [0, 2, 1]], [0x1e, [0, 2, 1]],
  [0x20, [0, 2, 1]], [0x21, [0, 2, 1]], [0x22, [0, 2, 1]],
  [0x30, [2, 0, 0]], [0x31, [2, 1, 0]], [0x32, [2, 1, 0]],
  [0x33, [2, 0, 0]], [0x34, [0, 0, 0]],
  [0x40, [0, 1, 1]], [0x41, [0, 2, 0]],
  [0x50, [0, 1, 0]], [0x51, [0, 1, 0]], [0x52, [0, 0, 1]],
  [0x53, [0, 1, 0]],
]);

function run(prog: Buffer, inp: Buffer): [Buffer, number] {
  const st = new Int32Array(256);
  let sp = 0;
  const cs = new Int32Array(64);
  let cp = 0;
  const mem = new Int32Array(256);
  const out = Buffer.alloc(65536);
  let ol = 0, ip = 0, pc = 0, steps = 0;
  const n = prog.length;
  const end = (code: number): [Buffer, number] => [out.subarray(0, ol), code];
  for (;;) {
    if (steps === 1000000) return end(10);
    if (pc < 0 || pc >= n) return end(9);
    const op = prog[pc];
    const meta = META.get(op);
    if (meta === undefined) return end(5);
    const [imm, pops, pushes] = meta;
    if (pc + imm >= n) return end(9);
    steps++;
    const nx = pc + 1 + imm;
    if (sp < pops) return end(2);
    if (sp - pops + pushes > 256) return end(3);
    pc = nx;
    switch (op) {
      case 0x00: return end(0);
      case 0x01: st[sp++] = (prog[nx - 1] << 24) >> 24; break;
      case 0x02: st[sp++] = prog[nx - 4] | (prog[nx - 3] << 8) | (prog[nx - 2] << 16) | (prog[nx - 1] << 24); break;
      case 0x03: sp--; break;
      case 0x04: st[sp] = st[sp - 1]; sp++; break;
      case 0x05: { const t = st[sp - 1]; st[sp - 1] = st[sp - 2]; st[sp - 2] = t; break; }
      case 0x06: st[sp] = st[sp - 2]; sp++; break;
      case 0x07: { const a = st[sp - 3]; st[sp - 3] = st[sp - 2]; st[sp - 2] = st[sp - 1]; st[sp - 1] = a; break; }
      case 0x17: st[sp - 1] = (-st[sp - 1]) | 0; break;
      case 0x1b: st[sp - 1] = ~st[sp - 1]; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22: {
        const b = st[sp - 1], a = st[sp - 2];
        let r: number;
        switch (op) {
          case 0x10: r = (a + b) | 0; break;
          case 0x11: r = (a - b) | 0; break;
          case 0x12: r = Math.imul(a, b); break;
          case 0x13: if (b === 0) return end(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; break;
          case 0x14: if (b === 0) return end(4); r = b === -1 ? 0 : (a % b) | 0; break;
          case 0x15: if (b === 0) return end(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; break;
          case 0x16: if (b === 0) return end(4); r = ((a >>> 0) % (b >>> 0)) | 0; break;
          case 0x18: r = a & b; break;
          case 0x19: r = a | b; break;
          case 0x1a: r = a ^ b; break;
          case 0x1c: r = a << (b & 31); break;
          case 0x1d: r = a >> (b & 31); break;
          case 0x1e: r = (a >>> (b & 31)) | 0; break;
          case 0x20: r = a === b ? 1 : 0; break;
          case 0x21: r = a < b ? 1 : 0; break;
          default: r = (a >>> 0) < (b >>> 0) ? 1 : 0; break;
        }
        sp -= 2; st[sp++] = r; break;
      }
      case 0x30: case 0x31: case 0x32: {
        const rel = ((prog[nx - 2] | (prog[nx - 1] << 8)) << 16) >> 16;
        let take = true;
        if (op !== 0x30) { const v = st[--sp]; take = op === 0x31 ? v === 0 : v !== 0; }
        if (take) pc = nx + rel;
        break;
      }
      case 0x33:
        if (cp === 64) return end(7);
        cs[cp++] = nx; pc = prog[nx - 2] | (prog[nx - 1] << 8);
        break;
      case 0x34:
        if (cp === 0) return end(8);
        pc = cs[--cp];
        break;
      case 0x40: {
        const addr = st[sp - 1];
        if (addr < 0 || addr >= 256) return end(6);
        st[sp - 1] = mem[addr];
        break;
      }
      case 0x41: {
        const addr = st[sp - 1], v = st[sp - 2];
        if (addr < 0 || addr >= 256) return end(6);
        sp -= 2; mem[addr] = v;
        break;
      }
      case 0x50: {
        const s = String(st[sp - 1]);
        if (ol + s.length > 65536) return end(11);
        sp--; out.write(s, ol, 'ascii'); ol += s.length;
        break;
      }
      case 0x51:
        if (ol + 1 > 65536) return end(11);
        out[ol++] = st[--sp] & 255;
        break;
      case 0x52: st[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 0x53: return end(st[--sp] & 255);
    }
  }
}

const IND = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTD = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(IND).sort()) {
  const prog = readFileSync(join(IND, id, 'program.bin'));
  const inp = readFileSync(join(IND, id, 'input.bin'));
  const [o, e] = run(prog, inp);
  mkdirSync(join(OUTD, id), { recursive: true });
  writeFileSync(join(OUTD, id, 'stdout.bin'), o);
  writeFileSync(join(OUTD, id, 'exit.txt'), String(e) + '\n');
}
