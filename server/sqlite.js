// Thin better-sqlite3-style wrapper over Node's built-in `node:sqlite`.
// Why: no native compilation (node-gyp / Visual Studio build tools) is needed,
// so `npm install` works on any laptop with Node >= 22.13.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// node:sqlite can't bind booleans/undefined, so normalise parameters first.
const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

export function openDatabase(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

  let depth = 0;

  return {
    exec: (sql) => raw.exec(sql),
    pragma: (sql) => raw.exec(`PRAGMA ${sql}`),
    prepare(sql) {
      const stmt = raw.prepare(sql);
      return {
        run: (...p) => stmt.run(...p.map(norm)),
        get: (...p) => stmt.get(...p.map(norm)),
        all: (...p) => stmt.all(...p.map(norm)),
      };
    },
    // db.transaction(fn) -> function; supports nesting through savepoints.
    transaction(fn) {
      return (...args) => {
        const name = `sp_${depth}`;
        raw.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${name}`);
        depth++;
        try {
          const out = fn(...args);
          depth--;
          raw.exec(depth === 0 ? 'COMMIT' : `RELEASE ${name}`);
          return out;
        } catch (err) {
          depth--;
          raw.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`);
          throw err;
        }
      };
    },
    close: () => raw.close(),
  };
}
