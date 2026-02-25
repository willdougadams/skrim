#!/bin/bash

# Deploy the Idiot Chess program
echo "🚀 Deploying Idiot Chess program..."

# Ensure target exists
if [ ! -f "target/deploy/idiot_chess.so" ]; then
    echo "❌ Program not found. Please run 'make build-chess' first."
    exit 1
fi

solana program deploy target/deploy/idiot_chess.so

echo "✅ Idiot Chess program deployed!"
