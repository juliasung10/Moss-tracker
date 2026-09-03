/**
 * Wipe every post, snapshot and milestone, leaving an empty database.
 *
 *   npm run db:reset
 *
 * The schema and your settings survive; only the data goes. Run `npm run db:seed`
 * afterwards if you want the samples back.
 */

import { openDb, wipe, DB_PATH } from "../src/lib/db.ts";

const db = openDb(DB_PATH);
wipe(db);
db.close();
console.log(`Wiped all posts, snapshots and milestones from ${DB_PATH}`);
console.log("Your baseline window and starting point are kept. Set or edit them in Settings.");
