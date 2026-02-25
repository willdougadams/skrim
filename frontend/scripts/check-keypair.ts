import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const KEYPAIR_PATH = path.join(__dirname, '../../programs/great_banyan/target/deploy/great_banyan-keypair.json');
const ID_FILE = path.join(__dirname, '../../scripts/program-ids.json');

try {
    const secretKey = new Uint8Array(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8')));
    const keypair = Keypair.fromSecretKey(secretKey);
    const pubkey = keypair.publicKey.toString();

    console.log(`Deployed Keypair Pubkey: ${pubkey}`);

    const ids = JSON.parse(fs.readFileSync(ID_FILE, 'utf8'));
    console.log(`Configured Localnet ID:  ${ids.localnet}`);

    if (pubkey === ids.localnet) {
        console.log("✅ MATCH");
    } else {
        console.error("❌ MISMATCH");
    }

} catch (e) {
    console.error("Error:", e);
}
