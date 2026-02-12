use pinocchio::{
    account_info::AccountInfo,
    entrypoint,
    instruction::{AccountMeta, Instruction},
    program_error::ProgramError,
    pubkey::Pubkey, // [u8; 32]
    sysvars::{clock::Clock, rent::Rent, Sysvar},
};
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::keccak;
use solana_program::pubkey::Pubkey as SolPubkey;

// Use standard Result for ProgramResult
pub type ProgramResult = Result<(), ProgramError>;

// --- State Definitions ---

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct GameManager {
    pub current_epoch: u64,
    pub prize_pool: u64,
    pub authority: [u8; 32],
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct TreeState {
    pub root: [u8; 32],
    pub max_depth: u8,
    // total_pot moved to GameManager
    pub authority: [u8; 32],
    pub vitality_required_base: u64,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct Bud {
    pub parent: [u8; 32],
    pub depth: u8,
    pub vitality_current: u64,
    pub vitality_required: u64,
    pub is_bloomed: bool,
    pub is_fruit: bool,
    pub nurturers: Vec<[u8; 32]>,
}

// Fixed size for Bud to avoid realloc complexity in Pinocchio
const BUD_SIZE: usize = 1024; 

// --- Instruction Definition ---

#[derive(BorshSerialize, BorshDeserialize)]
pub enum BanyanInstruction {
    InitializeGame, // New: Create the singleton GameManager
    InitializeTree {
        root: [u8; 32],
        max_depth: u8,
        vitality_required_base: u64,
    },
    NurtureBud {
        nonce: u64,
        mined_slot: u64,
        essence: String,
    },
    BloomBud {
        proof: Vec<[u8; 32]>,
    },
}

// --- Logic ---

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = BanyanInstruction::try_from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    let account_iter = &mut accounts.iter();

    match instruction {
        BanyanInstruction::InitializeGame => {
            let payer = next_account_info(account_iter)?;
            let manager_info = next_account_info(account_iter)?;
            let system_program = next_account_info(account_iter)?;

            if !payer.is_signer() {
                return Err(ProgramError::MissingRequiredSignature);
            }

            let seeds: &[&[u8]] = &[b"manager"];
            let (manager_pda, manager_bump) = find_pda(seeds, program_id);
            if manager_pda != *manager_info.key() {
                return Err(ProgramError::InvalidSeeds);
            }

            let manager = GameManager {
                current_epoch: 0,
                prize_pool: 0,
                authority: *payer.key(),
            };
            let data = borsh::to_vec(&manager).map_err(|_| ProgramError::InvalidInstructionData)?;

            create_account(
                payer,
                manager_info,
                system_program,
                program_id,
                &data,
                &[b"manager", &[manager_bump]],
            )?;

            Ok(())
        }

        BanyanInstruction::InitializeTree {
            root,
            max_depth,
            vitality_required_base,
        } => {
            let payer = next_account_info(account_iter)?;
            let manager_info = next_account_info(account_iter)?;
            let tree_state_info = next_account_info(account_iter)?;
            let root_bud_info = next_account_info(account_iter)?;
            let system_program = next_account_info(account_iter)?;

            if !payer.is_signer() {
                return Err(ProgramError::MissingRequiredSignature);
            }

            // Verify Manager and get epoch
            if *manager_info.owner() != *program_id {
                 return Err(ProgramError::InvalidAccountData);
            }
            let manager = GameManager::try_from_slice(&manager_info.try_borrow_data()?)
                .map_err(|_| ProgramError::InvalidAccountData)?;
            
            // Create TreeState using epoch
            let epoch_bytes = manager.current_epoch.to_le_bytes();
            let tree_seeds: &[&[u8]] = &[b"tree", &epoch_bytes];
            let (tree_pda, tree_bump) = find_pda(tree_seeds, program_id);

            if tree_pda != *tree_state_info.key() {
                return Err(ProgramError::InvalidSeeds);
            }

            let tree_state = TreeState {
                root,
                max_depth,
                authority: *payer.key(),
                vitality_required_base,
            };
            let tree_data = borsh::to_vec(&tree_state).map_err(|_| ProgramError::InvalidInstructionData)?;
            
            create_account(
                payer,
                tree_state_info,
                system_program,
                program_id,
                &tree_data,
                &[b"tree", &epoch_bytes, &[tree_bump]],
            )?;

            // Create Root Bud
            let bud_seeds: &[&[u8]] = &[b"bud", tree_state_info.key(), b"root"];
            let (bud_pda, bud_bump) = find_pda(bud_seeds, program_id);
             if bud_pda != *root_bud_info.key() {
                return Err(ProgramError::InvalidSeeds);
            }

            let root_bud_key_hash = keccak::hash(root_bud_info.key().as_ref());
            let root_vitality_req = (root_bud_key_hash.0[0] % 5) as u64 + 1;

            let root_bud = Bud {
                parent: [0u8; 32],
                depth: 0,
                vitality_current: 0,
                vitality_required: root_vitality_req,
                is_bloomed: false,
                is_fruit: false,
                nurturers: Vec::new(),
            };
            let bud_data = borsh::to_vec(&root_bud).map_err(|_| ProgramError::InvalidInstructionData)?;

            create_account_with_space(
                payer,
                root_bud_info,
                system_program,
                program_id,
                &bud_data,
                BUD_SIZE,
                &[b"bud", tree_state_info.key(), b"root", &[bud_bump]],
            )?;
            
            Ok(())
        }

        BanyanInstruction::NurtureBud { nonce, mined_slot, essence } => {
            let nurturer = next_account_info(account_iter)?;
            let manager_info = next_account_info(account_iter)?; // Send funds here
            let bud_info = next_account_info(account_iter)?;
            let system_program = next_account_info(account_iter)?;

             if !nurturer.is_signer() {
                return Err(ProgramError::MissingRequiredSignature);
            }

            // 1. Transfer to Manager
            let transfer_amount = 600_000;
            invoke_transfer(
                nurturer,
                manager_info,
                system_program,
                transfer_amount,
            )?;

            // Update Manager Prize Pool
            let mut manager = GameManager::try_from_slice(&manager_info.try_borrow_data()?).map_err(|_| ProgramError::InvalidAccountData)?;
            manager.prize_pool += transfer_amount;
            
            let serialized_manager = borsh::to_vec(&manager).map_err(|_| ProgramError::InvalidInstructionData)?;
            manager_info.try_borrow_mut_data()?[..serialized_manager.len()].copy_from_slice(&serialized_manager);

            // 2. PoW / Vitality Logic
            let clock = Clock::get()?;
            let current_slot = clock.slot;

            // Freshness Check (prevent long-range mining)
            // Allow mining within last 150 slots (~60 seconds)
            if mined_slot > current_slot || current_slot - mined_slot > 150 {
                 // For now, fail loud. Later could verify but give 0 reward.
                 return Err(ProgramError::InvalidArgument);
            }
             
            let mut input = Vec::new();
            input.extend_from_slice(essence.as_bytes());
            input.extend_from_slice(bud_info.key());
            input.extend_from_slice(nurturer.key());
            input.extend_from_slice(&mined_slot.to_le_bytes()); // Use MINED slot for hash stability
            input.extend_from_slice(&nonce.to_le_bytes());

            let hash_result = keccak::hash(&input);
            let h = hash_result.0;
            
            // Calculate Gain based on Difficulty
            // Triangle Distribution 1..5
            // h[0]%3 gives 0,1,2.
            // (h[0]%3) + (h[1]%3) + 1 range is 1..5.
            // 5 is (2+2+1) -> 1/9 chance * 1/9 chance? No. 33% * 33% = 11%.
            
            let term1 = (h[0] % 3) as u64;
            let term2 = (h[1] % 3) as u64;
            let vitality_gain = term1 + term2 + 1;
            
            // Update Bud
            let mut bud = Bud::deserialize(&mut &bud_info.try_borrow_data()?[..]).map_err(|_| ProgramError::InvalidAccountData)?;
            bud.vitality_current += vitality_gain;
            bud.nurturers.push(*nurturer.key());
            
            let new_data = borsh::to_vec(&bud).map_err(|_| ProgramError::InvalidInstructionData)?;
            if new_data.len() > bud_info.data_len() {
                 return Err(ProgramError::AccountDataTooSmall); 
            }
             
            bud_info.try_borrow_mut_data()?[..new_data.len()].copy_from_slice(&new_data);

            Ok(())
        }

        BanyanInstruction::BloomBud { proof } => {
            let payer = next_account_info(account_iter)?;
            let manager_info = next_account_info(account_iter)?;
            let tree_state_info = next_account_info(account_iter)?;
            let bud_info = next_account_info(account_iter)?;
            
            // Checking if we are winning or just creating children
            // For now, let's load children accounts optimistically 
            // In a real optimized program we might check if they are needed first, but we need next_account_info to advance iterator
            let left_child_info = next_account_info(account_iter)?;
            let right_child_info = next_account_info(account_iter)?;
            let system_program = next_account_info(account_iter)?;
            
            let mut manager = GameManager::try_from_slice(&manager_info.try_borrow_data()?).map_err(|_| ProgramError::InvalidAccountData)?;
            let tree_state = TreeState::try_from_slice(&tree_state_info.try_borrow_data()?).map_err(|_| ProgramError::InvalidAccountData)?;
            let mut bud = Bud::deserialize(&mut &bud_info.try_borrow_data()?[..]).map_err(|_| ProgramError::InvalidAccountData)?;
            
             if bud.vitality_current < bud.vitality_required {
                return Err(ProgramError::Custom(0));
            }
            if bud.is_bloomed {
                 return Err(ProgramError::AccountAlreadyInitialized);
            }
            if bud.depth >= tree_state.max_depth {
                 return Err(ProgramError::Custom(1));
            }
            
            // Merkle Verification
            let leaf = keccak::hash(bud_info.key());
            if verify_merkle_proof(&proof, tree_state.root, leaf.0) {
                 bud.is_fruit = true;
            }
            bud.is_bloomed = true;
            
            if bud.is_fruit {
                // WIN CONDITION
                // 1. Transfer prize pool to payer (winner)
                let prize = manager.prize_pool;
                if prize > 0 {
                    // Manager needs to sign to transfer? No, we own the account, so we can modify lamports directly.
                    // SystemProgram::Transfer requires the source to be owned by SystemProgram.
                    // Since Manager is a PDA owned by this program, we MUST modify lamports directly.
                    
                    *manager_info.try_borrow_mut_lamports()? -= prize;
                    *payer.try_borrow_mut_lamports()? += prize;
                }
                
                // 2. Increment Epoch
                manager.current_epoch += 1;
                manager.prize_pool = 0;
                
                // Save Manager
                let serialized_manager = borsh::to_vec(&manager).map_err(|_| ProgramError::InvalidInstructionData)?;
                manager_info.try_borrow_mut_data()?[..serialized_manager.len()].copy_from_slice(&serialized_manager);

            } else {
                // Initialize Children (Only if NOT fruit/win)
                let child_depth = bud.depth + 1;
                
                // Left Child
                let left_seeds: &[&[u8]] = &[b"bud", bud_info.key(), b"left"];
                let (left_pda, left_bump) = find_pda(left_seeds, program_id);
                if left_pda != *left_child_info.key() {
                        return Err(ProgramError::InvalidSeeds);
                }

                // Random req for left
                let left_hash = keccak::hash(left_child_info.key().as_ref());
                let left_req = (left_hash.0[0] % 5) as u64 + 1;
                
                let left_child = Bud {
                    parent: *bud_info.key(),
                    depth: child_depth,
                    vitality_current: 0,
                    vitality_required: left_req,
                    is_bloomed: false,
                    is_fruit: false,
                    nurturers: Vec::new(),
                };
                
                create_account_with_space(
                    payer,
                    left_child_info,
                    system_program,
                    program_id,
                    &borsh::to_vec(&left_child).unwrap(),
                    BUD_SIZE,
                    &[b"bud", bud_info.key(), b"left", &[left_bump]],
                )?;

                // Right Child
                let right_seeds: &[&[u8]] = &[b"bud", bud_info.key(), b"right"];
                let (right_pda, right_bump) = find_pda(right_seeds, program_id);
                if right_pda != *right_child_info.key() {
                        return Err(ProgramError::InvalidSeeds);
                }

                // Random req for right
                let right_hash = keccak::hash(right_child_info.key().as_ref());
                let right_req = (right_hash.0[0] % 5) as u64 + 1;
                
                let right_child = Bud {
                    parent: *bud_info.key(),
                    depth: child_depth,
                    vitality_current: 0,
                    vitality_required: right_req,
                    is_bloomed: false,
                    is_fruit: false,
                    nurturers: Vec::new(),
                };
                
                create_account_with_space(
                    payer,
                    right_child_info,
                    system_program,
                    program_id,
                    &borsh::to_vec(&right_child).unwrap(),
                    BUD_SIZE,
                    &[b"bud", bud_info.key(), b"right", &[right_bump]],
                )?;
            }
            
            // Save Bud
            let new_bud_data = borsh::to_vec(&bud).map_err(|_| ProgramError::InvalidInstructionData)?;
            bud_info.try_borrow_mut_data()?[..new_bud_data.len()].copy_from_slice(&new_bud_data);
            
            Ok(())
        }
    }
}

// --- Helpers ---

fn next_account_info<'a, I>(iter: &mut I) -> Result<&'a AccountInfo, ProgramError>
where
    I: Iterator<Item = &'a AccountInfo>,
{
    iter.next().ok_or(ProgramError::NotEnoughAccountKeys)
}

fn find_pda(seeds: &[&[u8]], program_id: &Pubkey) -> ([u8; 32], u8) {
    let sol_program_id = SolPubkey::new_from_array(*program_id);
    let (pda, bump) = SolPubkey::find_program_address(seeds, &sol_program_id);
    (pda.to_bytes(), bump)
}

fn create_account(
    payer: &AccountInfo,
    new_account: &AccountInfo,
    system_program: &AccountInfo,
    program_id: &Pubkey,
    data: &[u8],
    seeds: &[&[u8]],
) -> ProgramResult {
    create_account_with_space(payer, new_account, system_program, program_id, data, data.len(), seeds)
}

fn create_account_with_space(
    payer: &AccountInfo,
    new_account: &AccountInfo,
    system_program: &AccountInfo,
    program_id: &Pubkey,
    init_data: &[u8],
    space: usize,
    seeds: &[&[u8]],
) -> ProgramResult {
    let rent = Rent::get()?;
    let required_lamports = rent.minimum_balance(space);

    let metas = [
        AccountMeta { pubkey: payer.key(), is_signer: true, is_writable: true },
        AccountMeta { pubkey: new_account.key(), is_signer: true, is_writable: true },
    ];

    let mut buf = Vec::with_capacity(4 + 8 + 8 + 32);
    buf.extend_from_slice(&0u32.to_le_bytes()); // CreateAccount
    buf.extend_from_slice(&required_lamports.to_le_bytes());
    buf.extend_from_slice(&(space as u64).to_le_bytes());
    buf.extend_from_slice(program_id);

    let ix = Instruction {
        program_id: system_program.key(),
        accounts: &metas,
        data: &buf,
    };
    
    // Use native pinocchio invoke_signed
    let seeds_vec: Vec<pinocchio::instruction::Seed> = seeds
        .iter()
        .map(|s| pinocchio::instruction::Seed::from(*s))
        .collect();
    let signer = pinocchio::instruction::Signer::from(&seeds_vec[..]);

    pinocchio::program::invoke_signed(
        &ix,
        &[payer, new_account],
        &[signer],
    )?;
    
    let mut account_data = new_account.try_borrow_mut_data()?;
    account_data[..init_data.len()].copy_from_slice(init_data);
    
    Ok(())
}

fn invoke_transfer(
    from: &AccountInfo,
    to: &AccountInfo,
    system_program: &AccountInfo,
    lamports: u64,
) -> ProgramResult {
     let metas = [
        AccountMeta { pubkey: from.key(), is_signer: true, is_writable: true },
        AccountMeta { pubkey: to.key(), is_signer: false, is_writable: true },
    ];

    let mut buf = Vec::with_capacity(4 + 8);
    buf.extend_from_slice(&2u32.to_le_bytes()); 
    buf.extend_from_slice(&lamports.to_le_bytes());

     let ix = Instruction {
        program_id: system_program.key(),
        accounts: &metas,
        data: &buf,
    };
    
    pinocchio::program::invoke(
        &ix,
        &[from, to],
    )
}

fn verify_merkle_proof(proof: &Vec<[u8; 32]>, root: [u8; 32], leaf: [u8; 32]) -> bool {
    let mut current_hash = leaf;
    for hash in proof {
        let data = if current_hash <= *hash {
            [current_hash, *hash].concat()
        } else {
            [*hash, current_hash].concat()
        };
        current_hash = keccak::hash(&data).0;
    }
    current_hash == root
}

pinocchio::entrypoint!(process_instruction);


#[cfg(not(target_os = "solana"))]
#[no_mangle]
pub unsafe extern "C" fn sol_memset_(s: *mut u8, c: u8, n: usize) {
    std::ptr::write_bytes(s, c, n);
}

#[cfg(not(target_os = "solana"))]
#[no_mangle]
pub unsafe extern "C" fn sol_memcpy_(dst: *mut u8, src: *const u8, n: usize) {
    std::ptr::copy_nonoverlapping(src, dst, n);
}

#[cfg(not(target_os = "solana"))]
#[no_mangle]
pub unsafe extern "C" fn sol_memmove_(dst: *mut u8, src: *const u8, n: usize) {
    std::ptr::copy(src, dst, n);
}

#[cfg(not(target_os = "solana"))]
#[no_mangle]
pub unsafe extern "C" fn sol_memcmp_(s1: *const u8, s2: *const u8, n: usize, result: *mut i32) {
    let s1 = std::slice::from_raw_parts(s1, n);
    let s2 = std::slice::from_raw_parts(s2, n);
    let cmp = s1.cmp(s2);
    *result = match cmp {
        std::cmp::Ordering::Less => -1,
        std::cmp::Ordering::Equal => 0,
        std::cmp::Ordering::Greater => 1,
    };
}



#[cfg(not(target_os = "solana"))]
pub fn process_instruction_test(
    program_id: &SolPubkey,
    accounts: &[solana_program::account_info::AccountInfo],
    instruction_data: &[u8],
) -> solana_program::entrypoint::ProgramResult {
    // Safety: SolPubkey is repr(transparent) over [u8; 32]
    // AccountInfo layout is compatible between Pinocchio and Solana Program (mostly)
    let program_id_bytes: &[u8; 32] = unsafe { std::mem::transmute(program_id) };
    let accounts_pinocchio: &[AccountInfo] = unsafe { std::mem::transmute(accounts) };
    
    match process_instruction(program_id_bytes, accounts_pinocchio, instruction_data) {
        Ok(()) => Ok(()),
        Err(e) => {
             // Pinocchio ProgramError -> u64. Solana Custom -> u32.
             let code: u64 = e.into();
             Err(solana_program::program_error::ProgramError::Custom(code as u32))
        },
    }
}
