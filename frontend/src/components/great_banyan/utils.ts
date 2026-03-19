import { PublicKey } from '@solana/web3.js';

import { getProgramId } from '../../config/programIds';

export const PROGRAM_ID = getProgramId('banyan');

export const findGameManagerPda = (): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync(
        [new TextEncoder().encode('manager_v4')],
        PROGRAM_ID
    );
};

export const findTreePda = (epoch: bigint): [PublicKey, number] => {
    // epoch is u64, need 8 bytes le
    const epochBuffer = new Uint8Array(8);
    const view = new DataView(epochBuffer.buffer);
    view.setBigUint64(0, epoch, true);

    return PublicKey.findProgramAddressSync(
        [new TextEncoder().encode('tree_v4'), epochBuffer],
        PROGRAM_ID
    );
};

export const findBudPda = (treePda: PublicKey, path: 'root' | 'left' | 'right' | string): [PublicKey, number] => {
    // If path is a specific string (like previous bud address), we might need different logic
    // For now assuming the structure from lib.rs:
    // root: [b"bud", tree_state.key(), b"root"]
    // child: [b"bud", parent_bud.key(), b"left" | b"right"]

    if (path === 'root') {
        return PublicKey.findProgramAddressSync(
            [new TextEncoder().encode('bud'), treePda.toBuffer(), new TextEncoder().encode('root')],
            PROGRAM_ID
        );
    }

    // For children, we need the parent public key. 
    // This helper might need to adjust signature to take parent + direction
    // Returning default for now to satisfy type, but logic regarding 'string' path is still a bit loose
    // In Game.tsx and TreeVisualizer.tsx we mostly use `findChildBudPda` for recursion.
    // usage of findBudPda is mainly for root.
    return [PublicKey.default, 0];
};

export const findChildBudPda = (parentBud: PublicKey, direction: 'left' | 'right'): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync(
        [new TextEncoder().encode('bud'), parentBud.toBuffer(), new TextEncoder().encode(direction)],
        PROGRAM_ID
    );
}






