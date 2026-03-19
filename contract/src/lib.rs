#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, String, Vec, token,
};

// Organiser creates an event and sets ticket price.
// Buyers mint a ticket NFT by paying XLM.
// Each ticket has a unique serial number and an owner.
// Tickets can be transferred (resold) by the holder.
// At the door: organiser calls validate() — ticket marked as used.
// Used tickets cannot be transferred or validated again.

const MAX_TITLE:   u32 = 80;
const MAX_DESC:    u32 = 200;
const MAX_TICKETS: u32 = 10_000;

#[contracttype]
#[derive(Clone, PartialEq)]
pub enum TicketStatus {
    Valid,
    Used,
    Cancelled,
}

#[contracttype]
#[derive(Clone)]
pub struct Ticket {
    pub id:         u64,
    pub event_id:   u32,
    pub owner:      Address,
    pub minted_by:  Address,
    pub status:     TicketStatus,
    pub minted_at:  u32,
    pub used_at:    u32,   // 0 if not used
}

#[contracttype]
#[derive(Clone)]
pub struct Event {
    pub id:             u32,
    pub organiser:      Address,
    pub title:          String,
    pub description:    String,
    pub ticket_price:   i128,
    pub max_tickets:    u32,
    pub tickets_sold:   u32,
    pub event_ledger:   u32,   // when the event takes place
    pub active:         bool,
}

#[contracttype]
pub enum DataKey {
    Event(u32),
    EventCount,
    Ticket(u64),
    TicketCount,
    OwnedTickets(Address),   // Vec<u64> ticket IDs owned by this address
}

#[contract]
pub struct NFTicketContract;

#[contractimpl]
impl NFTicketContract {
    /// Organiser creates an event
    pub fn create_event(
        env: Env,
        organiser: Address,
        title: String,
        description: String,
        ticket_price: i128,
        max_tickets: u32,
        event_ledger: u32,
    ) -> u32 {
        organiser.require_auth();
        assert!(title.len() > 0 && title.len() <= MAX_TITLE);
        assert!(description.len() <= MAX_DESC);
        assert!(ticket_price > 0);
        assert!(max_tickets > 0 && max_tickets <= MAX_TICKETS);
        assert!(event_ledger > env.ledger().sequence());

        let count: u32 = env.storage().instance()
            .get(&DataKey::EventCount).unwrap_or(0u32);
        let id = count + 1;

        let event = Event {
            id,
            organiser: organiser.clone(),
            title,
            description,
            ticket_price,
            max_tickets,
            tickets_sold: 0,
            event_ledger,
            active: true,
        };

        env.storage().persistent().set(&DataKey::Event(id), &event);
        env.storage().instance().set(&DataKey::EventCount, &id);
        env.events().publish((symbol_short!("event"),), (id, organiser, ticket_price));
        id
    }

    /// Buyer mints a ticket — pays XLM to organiser directly
    pub fn mint_ticket(
        env: Env,
        buyer: Address,
        event_id: u32,
        xlm_token: Address,
    ) -> u64 {
        buyer.require_auth();

        let mut event: Event = env.storage().persistent()
            .get(&DataKey::Event(event_id)).expect("Event not found");

        assert!(event.active);
        assert!(event.tickets_sold < event.max_tickets);
        assert!(env.ledger().sequence() < event.event_ledger);

        // Pay organiser directly
        let token_client = token::Client::new(&env, &xlm_token);
        token_client.transfer(&buyer, &event.organiser, &event.ticket_price);

        let ticket_count: u64 = env.storage().instance()
            .get(&DataKey::TicketCount).unwrap_or(0u64);
        let ticket_id = ticket_count + 1;

        let ticket = Ticket {
            id: ticket_id,
            event_id,
            owner: buyer.clone(),
            minted_by: buyer.clone(),
            status: TicketStatus::Valid,
            minted_at: env.ledger().sequence(),
            used_at: 0,
        };

        env.storage().persistent().set(&DataKey::Ticket(ticket_id), &ticket);
        env.storage().instance().set(&DataKey::TicketCount, &ticket_id);

        // Track owned tickets
        let mut owned: Vec<u64> = env.storage().persistent()
            .get(&DataKey::OwnedTickets(buyer.clone()))
            .unwrap_or(Vec::new(&env));
        owned.push_back(ticket_id);
        env.storage().persistent().set(&DataKey::OwnedTickets(buyer.clone()), &owned);

        event.tickets_sold += 1;
        env.storage().persistent().set(&DataKey::Event(event_id), &event);

        env.events().publish((symbol_short!("minted"),), (ticket_id, buyer, event_id));
        ticket_id
    }

    /// Ticket holder transfers their ticket to another address
    pub fn transfer_ticket(
        env: Env,
        from: Address,
        to: Address,
        ticket_id: u64,
    ) {
        from.require_auth();

        let mut ticket: Ticket = env.storage().persistent()
            .get(&DataKey::Ticket(ticket_id)).expect("Ticket not found");

        assert!(ticket.owner == from);
        assert!(ticket.status == TicketStatus::Valid);

        // Remove from sender's list
        let mut from_owned: Vec<u64> = env.storage().persistent()
            .get(&DataKey::OwnedTickets(from.clone()))
            .unwrap_or(Vec::new(&env));
        let mut i = 0u32;
        while i < from_owned.len() {
            if from_owned.get(i).unwrap() == ticket_id {
                from_owned.remove(i); break;
            } else { i += 1; }
        }
        env.storage().persistent().set(&DataKey::OwnedTickets(from.clone()), &from_owned);

        // Add to recipient's list
        let mut to_owned: Vec<u64> = env.storage().persistent()
            .get(&DataKey::OwnedTickets(to.clone()))
            .unwrap_or(Vec::new(&env));
        to_owned.push_back(ticket_id);
        env.storage().persistent().set(&DataKey::OwnedTickets(to.clone()), &to_owned);

        ticket.owner = to.clone();
        env.storage().persistent().set(&DataKey::Ticket(ticket_id), &ticket);
        env.events().publish((symbol_short!("transfer"),), (ticket_id, from, to));
    }

    /// Organiser validates (scans) a ticket at the door — marks it used
    pub fn validate_ticket(
        env: Env,
        organiser: Address,
        ticket_id: u64,
    ) {
        organiser.require_auth();

        let mut ticket: Ticket = env.storage().persistent()
            .get(&DataKey::Ticket(ticket_id)).expect("Ticket not found");

        let event: Event = env.storage().persistent()
            .get(&DataKey::Event(ticket.event_id)).expect("Event not found");

        assert!(event.organiser == organiser);
        assert!(ticket.status == TicketStatus::Valid);

        ticket.status  = TicketStatus::Used;
        ticket.used_at = env.ledger().sequence();

        env.storage().persistent().set(&DataKey::Ticket(ticket_id), &ticket);
        env.events().publish((symbol_short!("used"),), (ticket_id, ticket.owner));
    }

    // ── Reads ──────────────────────────────────────────────────────────────
    pub fn get_event(env: Env, event_id: u32) -> Event {
        env.storage().persistent().get(&DataKey::Event(event_id)).expect("Not found")
    }

    pub fn get_ticket(env: Env, ticket_id: u64) -> Ticket {
        env.storage().persistent().get(&DataKey::Ticket(ticket_id)).expect("Not found")
    }

    pub fn get_owned_tickets(env: Env, owner: Address) -> Vec<u64> {
        env.storage().persistent()
            .get(&DataKey::OwnedTickets(owner))
            .unwrap_or(Vec::new(&env))
    }

    pub fn event_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::EventCount).unwrap_or(0)
    }

    pub fn ticket_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::TicketCount).unwrap_or(0)
    }
}
