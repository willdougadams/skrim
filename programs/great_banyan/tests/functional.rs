// #![cfg(feature = "test-bpf")]

use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    system_program,
    // sysvar::{clock::Clock, rent::Rent},
};
use solana_program_test::*;
use solana_sdk::{
    signature::{Keypair, Signer},
    transaction::Transaction,
    keccak,
};

// Re-define structs/enums since we might not be able to import easily from cdylib or if types mismatch
// Actually, if we use the crate, we get the [u8; 32] version.
use great_banyan::{BanyanInstruction, TreeState, Bud, GameManager};

#[tokio::test]
async fn test_initialize_tree() {
    let program_id = Pubkey::new_unique();
    let mut program_test = ProgramTest::new(
        "great_banyan",
        program_id,
        processor!(great_banyan::process_instruction_test),
    );
    
    let authority = Keypair::new();
    program_test.add_account(
        authority.pubkey(),
        solana_sdk::account::Account {
            lamports: 1_000_000_000,
            ..solana_sdk::account::Account::default()
        },
    );

    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // 1. Initialize Game Manager
    let (manager_pda, _) = Pubkey::find_program_address(&[b"manager"], &program_id);
    
    let init_game_ix = BanyanInstruction::InitializeGame;
    let init_game_instruction = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(manager_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: borsh::to_vec(&init_game_ix).unwrap(),
    };
    
    let mut transaction = Transaction::new_with_payer(
        &[init_game_instruction],
        Some(&payer.pubkey()),
    );
    transaction.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(transaction).await.unwrap();
    
    // Verify Manager
    let manager_account = banks_client.get_account(manager_pda).await.unwrap().unwrap();
    let manager_state = GameManager::try_from_slice(&manager_account.data).unwrap();
    assert_eq!(manager_state.current_epoch, 0);

    // 2. Initialize Tree (Epoch 0)
    let epoch_bytes = 0u64.to_le_bytes();
    let (tree_pda, _) = Pubkey::find_program_address(&[b"tree", &epoch_bytes], &program_id);
    let (root_bud_pda, _) = Pubkey::find_program_address(&[b"bud", tree_pda.as_ref(), b"root"], &program_id);

    // Instruction Data
    let root_hash = [1u8; 32]; // Dummy root
    let max_depth = 5;
    let vitality_required = 100;

    let init_ix = BanyanInstruction::InitializeTree {
        root: root_hash,
        max_depth,
        vitality_required_base: vitality_required,
    };

    let instruction = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(manager_pda, false), // Manager needed for epoch check
            AccountMeta::new(tree_pda, false),
            AccountMeta::new(root_bud_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: borsh::to_vec(&init_ix).unwrap(),
    };

    let mut transaction = Transaction::new_with_payer(
        &[instruction],
        Some(&payer.pubkey()),
    );
    transaction.sign(&[&payer], recent_blockhash);

    banks_client.process_transaction(transaction).await.unwrap();

    // Verify State
    let tree_account = banks_client.get_account(tree_pda).await.unwrap().unwrap();
    // Use deserialize to be safe against padding or extra bytes
    let mut tree_data_slice = &tree_account.data[..];
    let tree_state = TreeState::deserialize(&mut tree_data_slice).unwrap();
    assert_eq!(tree_state.root, root_hash);
    assert_eq!(tree_state.authority, payer.pubkey().to_bytes());

    let bud_account = banks_client.get_account(root_bud_pda).await.unwrap().unwrap();
    let mut bud_data_slice = &bud_account.data[..];
    let bud_state = Bud::deserialize(&mut bud_data_slice).unwrap();
    assert_eq!(bud_state.vitality_required, vitality_required);
    assert_eq!(bud_state.depth, 0);
}

#[tokio::test]
async fn test_nurture_bud() {
    let program_id = Pubkey::new_unique();
    let mut program_test = ProgramTest::new(
        "great_banyan",
        program_id,
        processor!(great_banyan::process_instruction_test),
    );
     // Start
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // 1. Initialize Game
    let (manager_pda, _) = Pubkey::find_program_address(&[b"manager"], &program_id);
    let init_game_ix = BanyanInstruction::InitializeGame;
    let init_game_instruction = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(manager_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: borsh::to_vec(&init_game_ix).unwrap(),
    };
    let mut tx = Transaction::new_with_payer(&[init_game_instruction], Some(&payer.pubkey()));
    tx.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(tx).await.unwrap();

    // 2. Initialize Tree
    let epoch_bytes = 0u64.to_le_bytes();
    let (tree_pda, _) = Pubkey::find_program_address(&[b"tree", &epoch_bytes], &program_id);
    let (root_bud_pda, _) = Pubkey::find_program_address(&[b"bud", tree_pda.as_ref(), b"root"], &program_id);

    let init_ix = BanyanInstruction::InitializeTree {
        root: [0u8; 32],
        max_depth: 5,
        vitality_required_base: 100,
    };
     let init_instruction = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(manager_pda, false),
            AccountMeta::new(tree_pda, false),
            AccountMeta::new(root_bud_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: borsh::to_vec(&init_ix).unwrap(),
    };
    
    let mut tx = Transaction::new_with_payer(&[init_instruction], Some(&payer.pubkey()));
    tx.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(tx).await.unwrap();

    // 3. Nurture
    let nurture_ix = BanyanInstruction::NurtureBud {
        essence: "AGTC".to_string(),
    };
    let nurture_instruction = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(manager_pda, false), // Update Manager prize pool
            AccountMeta::new(root_bud_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: borsh::to_vec(&nurture_ix).unwrap(),
    };
    
    let mut tx = Transaction::new_with_payer(&[nurture_instruction], Some(&payer.pubkey()));
    tx.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(tx).await.unwrap();

    // Verify
    let manager_account = banks_client.get_account(manager_pda).await.unwrap().unwrap();
    let manager_state = GameManager::try_from_slice(&manager_account.data).unwrap();
    assert_eq!(manager_state.prize_pool, 600_000); // 0.0006 SOL

    let bud_account = banks_client.get_account(root_bud_pda).await.unwrap().unwrap();
    let mut bud_data_slice = &bud_account.data[..];
    let bud_state = Bud::deserialize(&mut bud_data_slice).unwrap();
    assert!(bud_state.vitality_current > 0);
    assert_eq!(bud_state.nurturers.len(), 1);
    assert_eq!(bud_state.nurturers[0], payer.pubkey().to_bytes());
}

#[tokio::test]
async fn test_bloom_bud_win() {
    let program_id = Pubkey::new_unique();
    let mut program_test = ProgramTest::new(
        "great_banyan",
        program_id,
        processor!(great_banyan::process_instruction_test),
    );
     // Start
    let (mut banks_client, payer, recent_blockhash) = program_test.start().await;

    // 1. Initialize Game
    let (manager_pda, _) = Pubkey::find_program_address(&[b"manager"], &program_id);
    let init_game_ix = BanyanInstruction::InitializeGame;
    let init_game_instruction = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(manager_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: borsh::to_vec(&init_game_ix).unwrap(),
    };
    let mut tx = Transaction::new_with_payer(&[init_game_instruction], Some(&payer.pubkey()));
    tx.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(tx).await.unwrap();

    // 2. Initialize Tree
    let epoch_bytes = 0u64.to_le_bytes();
    let (tree_pda, _) = Pubkey::find_program_address(&[b"tree", &epoch_bytes], &program_id);
    let (root_bud_pda, _) = Pubkey::find_program_address(&[b"bud", tree_pda.as_ref(), b"root"], &program_id);
    
    let leaf = keccak::hash(root_bud_pda.as_ref()).0;
    let sibling = [2u8; 32]; // Arbitrary sibling
    let root = if leaf <= sibling {
        keccak::hash(&[leaf, sibling].concat()).0
    } else {
        keccak::hash(&[sibling, leaf].concat()).0
    };
    
    let init_ix = BanyanInstruction::InitializeTree {
        root,
        max_depth: 5,
        vitality_required_base: 10, // Low req for testing
    };
    let init_instruction = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(manager_pda, false),
            AccountMeta::new(tree_pda, false),
            AccountMeta::new(root_bud_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: borsh::to_vec(&init_ix).unwrap(),
    };
    let mut tx = Transaction::new_with_payer(&[init_instruction], Some(&payer.pubkey()));
    tx.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(tx).await.unwrap();

    // 3. Nurture until vitality met
    for i in 0..10 {
         let nurture_ix = BanyanInstruction::NurtureBud { essence: format!("AGTC-{}", i) };
         let nurture_instruction = Instruction {
            program_id,
            accounts: vec![
                AccountMeta::new(payer.pubkey(), true),
                AccountMeta::new(manager_pda, false),
                AccountMeta::new(root_bud_pda, false),
                AccountMeta::new_readonly(system_program::id(), false),
            ],
            data: borsh::to_vec(&nurture_ix).unwrap(),
        };
        let mut tx = Transaction::new_with_payer(&[nurture_instruction], Some(&payer.pubkey()));
        tx.sign(&[&payer], recent_blockhash);
        banks_client.process_transaction(tx).await.unwrap();
    }
    
    // Check prize pool > 0 and Vitality
    let manager_account = banks_client.get_account(manager_pda).await.unwrap().unwrap();
    let manager_state = GameManager::try_from_slice(&manager_account.data).unwrap();
    assert!(manager_state.prize_pool > 0);

    let bud_account = banks_client.get_account(root_bud_pda).await.unwrap().unwrap();
    let mut bud_data_slice = &bud_account.data[..];
    let bud_state = Bud::deserialize(&mut bud_data_slice).unwrap();
    assert!(bud_state.vitality_current >= bud_state.vitality_required);


    // 4. Bloom (Win)
    let proof = vec![sibling]; 
    let bloom_ix = BanyanInstruction::BloomBud { proof };
    
    // Dummy children PDAs (needed for instruction even if not created on win)
    let (left_child_pda, _) = Pubkey::find_program_address(&[b"bud", root_bud_pda.as_ref(), b"left"], &program_id);
    let (right_child_pda, _) = Pubkey::find_program_address(&[b"bud", root_bud_pda.as_ref(), b"right"], &program_id);

    let bloom_instruction = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(manager_pda, false), // Manager for funds and epoch
            AccountMeta::new_readonly(tree_pda, false),
            AccountMeta::new(root_bud_pda, false),
            AccountMeta::new(left_child_pda, false),
            AccountMeta::new(right_child_pda, false),
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: borsh::to_vec(&bloom_ix).unwrap(),
    };
    
    let mut tx = Transaction::new_with_payer(&[bloom_instruction], Some(&payer.pubkey()));
    tx.sign(&[&payer], recent_blockhash);
    banks_client.process_transaction(tx).await.unwrap();
    
    // Verify
    let bud_account = banks_client.get_account(root_bud_pda).await.unwrap().unwrap();
    let mut bud_data_slice = &bud_account.data[..];
    let bud_state = Bud::deserialize(&mut bud_data_slice).unwrap();
    assert!(bud_state.is_bloomed);
    assert!(bud_state.is_fruit); // Should be fruit
    
    // Verify Manager Reset
    let manager_account = banks_client.get_account(manager_pda).await.unwrap().unwrap();
    let manager_state = GameManager::try_from_slice(&manager_account.data).unwrap();
    assert_eq!(manager_state.current_epoch, 1);
    assert_eq!(manager_state.prize_pool, 0);
}
