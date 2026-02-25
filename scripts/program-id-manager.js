#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PROGRAM_IDS_FILE = path.join(__dirname, 'program-ids.json');

function loadProgramIds() {
    if (!fs.existsSync(PROGRAM_IDS_FILE)) {
        return {
            localnet: "11111111111111111111111111111111",
            devnet: null,
            mainnet: null,
            last_updated: {}
        };
    }
    return JSON.parse(fs.readFileSync(PROGRAM_IDS_FILE, 'utf8'));
}

function saveProgramIds(programIds) {
    fs.writeFileSync(PROGRAM_IDS_FILE, JSON.stringify(programIds, null, 2));
}

function updateProgramId(network, program, programId) {
    const programIds = loadProgramIds();
    if (!programIds[network]) programIds[network] = {};
    if (typeof programIds[network] === 'string') {
        // Migration: if it was a string, move it to 'rps' by default or just overwrite
        programIds[network] = { rps: programIds[network] };
    }
    programIds[network][program] = programId;
    programIds.last_updated = programIds.last_updated || {};
    programIds.last_updated[network] = new Date().toISOString();
    saveProgramIds(programIds);
    console.log(`✅ Updated ${network} ${program} ID: ${programId}`);
}

function getProgramId(network, program) {
    const programIds = loadProgramIds();
    const netData = programIds[network];
    if (!netData) return null;
    if (typeof netData === 'string') return netData; // Legacy support
    return netData[program];
}

// CLI usage
const [, , command, network, program, programId] = process.argv;

switch (command) {
    case 'get':
        if (!network || !program) {
            console.error('Usage: node program-id-manager.js get <network> <program>');
            process.exit(1);
        }
        const id = getProgramId(network, program);
        if (id) {
            console.log(id);
        } else {
            console.error(`No program ID found for ${network} ${program}`);
            process.exit(1);
        }
        break;

    case 'set':
        if (!network || !program || !programId) {
            console.error('Usage: node program-id-manager.js set <network> <program> <program-id>');
            process.exit(1);
        }
        updateProgramId(network, program, programId);
        break;

    case 'list':
        const programIds = loadProgramIds();
        console.log('📋 Current Program IDs:');
        Object.entries(programIds).forEach(([net, id]) => {
            if (net !== 'last_updated') {
                const updated = programIds.last_updated?.[net] || 'Never';
                console.log(`  ${net}: ${id || 'Not deployed'} (${updated})`);
            }
        });
        break;

    default:
        console.log('Usage:');
        console.log('  node program-id-manager.js get <network>');
        console.log('  node program-id-manager.js set <network> <program-id>');
        console.log('  node program-id-manager.js list');
        console.log('');
        console.log('Networks: localnet, devnet, mainnet');
        break;
}

module.exports = { loadProgramIds, getProgramId, updateProgramId };