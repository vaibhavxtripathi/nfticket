#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
gh repo create nfticket --public \
  --description "NFTicket — On-chain event tickets as NFTs. Mint, transfer, validate. Stellar Soroban." \
  --source "${ROOT}" --remote origin --push
ENV="${ROOT}/frontend/.env"
CONTRACT_ID=$(grep VITE_CONTRACT_ID "$ENV" | cut -d= -f2 | tr -d '[:space:]')
XLM_TOKEN=$(grep VITE_XLM_TOKEN "$ENV" | cut -d= -f2 | tr -d '[:space:]')
ORGANISER=$(grep VITE_ORGANISER_ADDRESS "$ENV" | cut -d= -f2 | tr -d '[:space:]')
USER=$(gh api user -q .login)
gh secret set VITE_CONTRACT_ID       --body "$CONTRACT_ID" --repo "$USER/nfticket"
gh secret set VITE_XLM_TOKEN         --body "$XLM_TOKEN"   --repo "$USER/nfticket"
gh secret set VITE_ORGANISER_ADDRESS --body "$ORGANISER"   --repo "$USER/nfticket"
cd "${ROOT}/frontend" && vercel --prod --yes
echo "✓ NFTicket published!"
