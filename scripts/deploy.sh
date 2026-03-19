#!/usr/bin/env bash
set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}NFTICKET — DEPLOY${NC}"

stellar keys generate --global organiser --network testnet 2>/dev/null || true
stellar keys generate --global buyer     --network testnet 2>/dev/null || true
stellar keys fund organiser --network testnet
stellar keys fund buyer     --network testnet
ORGANISER=$(stellar keys address organiser)
BUYER=$(stellar keys address buyer)
XLM_TOKEN=$(stellar contract id asset --asset native --network testnet)
echo -e "${GREEN}✓ Organiser: ${ORGANISER}${NC}"
echo -e "${GREEN}✓ Buyer    : ${BUYER}${NC}"

cd contract
cargo build --target wasm32-unknown-unknown --release
WASM="target/wasm32-unknown-unknown/release/nfticket.wasm"
cd ..

WASM_HASH=$(stellar contract upload --network testnet --source organiser --wasm contract/${WASM})
CONTRACT_ID=$(stellar contract deploy --network testnet --source organiser --wasm-hash ${WASM_HASH})
echo -e "${GREEN}✓ CONTRACT_ID: ${CONTRACT_ID}${NC}"

# Get current ledger to set event in future
CURRENT_LEDGER=$(curl -s https://soroban-testnet.stellar.org \
  -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getLatestLedger"}' \
  | grep -oP '"sequence":\K\d+')
EVENT_LEDGER=$((CURRENT_LEDGER + 518400))  # ~30 days out

stellar contract invoke --network testnet --source organiser --id ${CONTRACT_ID} \
  -- create_event \
  --organiser ${ORGANISER} \
  --title '"Stellar Summit 2025 - On-Chain"' \
  --description '"The premier Stellar ecosystem conference. Your ticket is an NFT on the Stellar blockchain."' \
  --ticket_price 5000000 \
  --max_tickets 1000 \
  --event_ledger ${EVENT_LEDGER} 2>&1 || true

# Buyer mints proof ticket
stellar contract invoke --network testnet --source buyer --id ${XLM_TOKEN} \
  -- approve --from ${BUYER} --spender ${CONTRACT_ID} \
  --amount 10000000 --expiration_ledger 3110400 2>&1 || true

TX_RESULT=$(stellar contract invoke \
  --network testnet --source buyer --id ${CONTRACT_ID} \
  -- mint_ticket \
  --buyer ${BUYER} \
  --event_id 1 \
  --xlm_token ${XLM_TOKEN} 2>&1)

TX_HASH=$(echo "$TX_RESULT" | grep -oP '[0-9a-f]{64}' | head -1)
echo -e "${GREEN}✓ Proof TX: ${TX_HASH}${NC}"

cat > frontend/.env << EOF
VITE_CONTRACT_ID=${CONTRACT_ID}
VITE_XLM_TOKEN=${XLM_TOKEN}
VITE_ORGANISER_ADDRESS=${ORGANISER}
VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
EOF

echo ""
echo -e "${CYAN}CONTRACT : ${CONTRACT_ID}${NC}"
echo -e "${CYAN}PROOF TX : ${TX_HASH}${NC}"
echo -e "${CYAN}EXPLORER : https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}${NC}"
echo "Next: cd frontend && npm install && npm run dev"
