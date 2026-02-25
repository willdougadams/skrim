import { Connection, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

// Load ID from program-id-banyan.json or program-ids.json to be sure
const ID_FILE = path.join(__dirname, '../../scripts/program-ids.json');
const ids = JSON.parse(fs.readFileSync(ID_FILE, 'utf8'));
const localnet = ids.localnet;
const programIdStr = typeof localnet === 'string' ? localnet : localnet.banyan;

console.log(`Testing getProgramAccounts for Program ID: ${programIdStr}`);

const connection = new Connection("http://127.0.0.1:8899", "confirmed");
const programId = new PublicKey(programIdStr);

async function main() {
    try {
        console.log("Checking if program account exists...");
        const programInfo = await connection.getAccountInfo(programId);
        if (programInfo) {
            console.log("✅ Program account exists. Executable:", programInfo.executable);
        } else {
            console.error("❌ Program account NOT found!");
        }

        console.log("Fetching all accounts owned by program...");
        const accounts = await connection.getProgramAccounts(programId, {
            commitment: 'confirmed'
        });
        console.log(`✅ Success! Found ${accounts.length} accounts.`);
        accounts.forEach(acc => {
            console.log(` - ${acc.pubkey.toString()} (Size: ${acc.account.data.length})`);
        });

    } catch (e) {
        console.error("❌ Error:", e);
    }
}

main();
