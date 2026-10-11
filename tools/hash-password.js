// Usage: node tools/hash-password.js "your trainer password"  -> prints the value for TRAINER_PASSWORD_HASH
const c = require('node:crypto'); const pw = process.argv[2];
if (!pw || pw.length < 10) { console.error('Provide a password of at least 10 characters.'); process.exit(1); }
const salt = c.randomBytes(16).toString('hex'); console.log(`scrypt$${salt}$${c.scryptSync(pw, salt, 32).toString('hex')}`);
