#!/bin/bash

# Build the Idiot Chess program
echo "🏗️ Building Idiot Chess program..."

export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

cd programs/idiot_chess
cargo build-sbf

# Copy to target directory if needed
mkdir -p ../../target/deploy
cp target/deploy/idiot_chess.so ../../target/deploy/

echo "✅ Idiot Chess program built successfully!"
