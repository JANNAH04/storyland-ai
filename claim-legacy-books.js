
import Database from 'better-sqlite3';

const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error(
    'Penggunaan: node claim-legacy-books.js email@anda.com'
  );
  process.exit(1);
}

const db = new Database('./data/books.sqlite');

const user = db.prepare(`
  SELECT id, email
  FROM users
  WHERE email = ?
`).get(email);

if (!user) {
  console.error('Akaun tidak dijumpai.');
  process.exit(1);
}

const result = db.prepare(`
  UPDATE books
  SET owner_id = ?
  WHERE owner_id IS NULL
`).run(user.id);

console.log(
  `${result.changes} buku lama dipindahkan kepada ${user.email}`
);

db.close();
