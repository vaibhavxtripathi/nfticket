# NFTicket

On-chain event tickets on Stellar. Organisers create events with a ticket price and capacity. Buyers mint tickets as NFTs — payment goes directly to the organiser. Tickets can be transferred (resold) by their holder. At the door, the organiser calls `validate_ticket()` to mark it used — preventing re-entry or resale after scanning.

## Live Links

| | |
|---|---|
| **Frontend** | `https://nfticket.vercel.app` |
| **GitHub** | `https://github.com/YOUR_USERNAME/nfticket` |
| **Contract** | `https://stellar.expert/explorer/testnet/contract/CONTRACT_ID` |
| **Proof TX** | `https://stellar.expert/explorer/testnet/tx/TX_HASH` |

## How It Works

1. **Organiser** calls `create_event()` — sets title, price, capacity, event ledger
2. **Buyer** calls `mint_ticket()` — XLM paid directly to organiser, ticket NFT issued
3. **Holder** can call `transfer_ticket(from, to, id)` to resell before the event
4. **At the door** organiser calls `validate_ticket(id)` — status flips to `Used`
5. Used tickets cannot be transferred or validated again

## Contract Functions

```rust
create_event(organiser, title, description, ticket_price, max_tickets, event_ledger) -> u32
mint_ticket(buyer, event_id, xlm_token) -> u64
transfer_ticket(from, to, ticket_id)
validate_ticket(organiser, ticket_id)    // organiser only, marks Used
get_event(event_id) -> Event
get_ticket(ticket_id) -> Ticket
get_owned_tickets(owner) -> Vec<u64>
event_count() -> u32
ticket_count() -> u64
```

## Stack

| Layer | Tech |
|---|---|
| Contract | Rust + Soroban SDK v22 |
| Network | Stellar Testnet |
| Frontend | React 18 + Vite |
| Wallet | Freighter API 6.0.1 |
| Stellar SDK | 14.6.1 |
| Hosting | Vercel |

## Run Locally

```bash
chmod +x scripts/deploy.sh && ./scripts/deploy.sh
cd frontend && npm install && npm run dev
```
