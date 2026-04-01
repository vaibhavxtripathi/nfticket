import { useState, useEffect } from 'react'
import {
  connectWallet, createEvent, mintTicket, transferTicket, validateTicket,
  getEvent, getTicket, getOwnedTickets, getEventCount, getTicketCount,
  xlm, short, CONTRACT_ID,
} from './lib/stellar'

// ── QR-style ticket stub pattern ───────────────────────────────────────────
function TicketStub({ ticket, event, wallet, onAction }) {
  const [showTransfer, setShowTransfer] = useState(false)
  const [toAddr,       setToAddr]       = useState('')
  const [busy,         setBusy]         = useState(false)

  const isOwner     = wallet && ticket.owner?.toString() === wallet
  const isOrganiser = wallet && event?.organiser?.toString() === wallet
  const isValid     = ticket.status === 'Valid'
  const isUsed      = ticket.status === 'Used'

  const handle = async (fn, msg) => {
    setBusy(true)
    try {
      const hash = await fn()
      onAction({ ok: true, msg, hash, refresh: true })
      setShowTransfer(false); setToAddr('')
    } catch (e) { onAction({ ok: false, msg: e.message }) }
    finally { setBusy(false) }
  }

  return (
    <div className={`ticket-stub ${isUsed ? 'ts-used' : ''} ${isValid ? 'ts-valid' : ''}`}>
      {/* Perforated top edge */}
      <div className="ts-perf ts-perf-top" />

      <div className="ts-body">
        {/* Left: event info */}
        <div className="ts-left">
          <div className="ts-event-name">{event?.title || `Event #${ticket.event_id}`}</div>
          <div className="ts-serial">TICKET #{String(ticket.id).padStart(6,'0')}</div>
          <div className="ts-owner">{short(ticket.owner)}</div>
          {ticket.used_at > 0 && (
            <div className="ts-used-ledger">Used @ ledger {ticket.used_at?.toString()}</div>
          )}
        </div>

        {/* Right: QR stand-in + status */}
        <div className="ts-right">
          <div className="ts-qr">
            {/* Fake QR pattern using ticket ID bits */}
            <div className="qr-grid">
              {Array.from({ length: 25 }, (_, i) => {
                const n = Number(ticket.id) * 7 + i * 13
                const fill = [0,1,5,6,18,19,23,24].includes(i) || (n % 3 === 0)
                return <div key={i} className={`qr-cell ${fill ? 'qr-on' : 'qr-off'}`} />
              })}
            </div>
          </div>
          <div className={`ts-status-badge ${isUsed ? 'tsb-used' : 'tsb-valid'}`}>
            {isUsed ? '✗ USED' : '✓ VALID'}
          </div>
        </div>
      </div>

      {/* Perforated bottom edge */}
      <div className="ts-perf ts-perf-bot" />

      {/* Actions */}
      {wallet && (
        <div className="ts-actions">
          {isOwner && isValid && (
            <button className="btn-ts-transfer"
              onClick={() => setShowTransfer(t => !t)} disabled={busy}>
              {showTransfer ? 'Cancel' : '↗ Transfer'}
            </button>
          )}
          {isOrganiser && isValid && (
            <button className="btn-ts-validate" disabled={busy}
              onClick={() => handle(() => validateTicket(wallet, ticket.id), `Ticket #${ticket.id} validated ✓`)}>
              {busy ? '…' : '✓ Validate'}
            </button>
          )}
        </div>
      )}

      {showTransfer && (
        <div className="ts-transfer-panel">
          <input value={toAddr} onChange={e => setToAddr(e.target.value)}
            placeholder="G… — recipient address" disabled={busy} />
          <button className="btn-ts-send" disabled={busy || !toAddr}
            onClick={() => handle(() => transferTicket(wallet, toAddr.trim(), ticket.id), 'Ticket transferred!')}>
            {busy ? 'Signing…' : 'Send Ticket'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Event card ─────────────────────────────────────────────────────────────
function EventCard({ event, wallet, currentLedger, onMinted }) {
  const [busy, setBusy] = useState(false)

  const ledgersLeft = Math.max(0, Number(event.event_ledger) - currentLedger)
  const daysLeft    = Math.floor((ledgersLeft * 5) / 86400)
  const soldOut     = Number(event.tickets_sold) >= Number(event.max_tickets)
  const pct         = Number(event.max_tickets) > 0
    ? Math.min(100, Math.round((Number(event.tickets_sold) / Number(event.max_tickets)) * 100))
    : 0

  const handleMint = async () => {
    if (!wallet) return
    setBusy(true)
    try {
      const hash = await mintTicket(wallet, event.id, Number(event.ticket_price) / 10_000_000)
      onMinted(hash, event)
    } catch (e) { onMinted(null, null, e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="event-card">
      <div className="ec-header">
        <div className="ec-id">EVENT #{String(event.id).padStart(3,'0')}</div>
        {event.active
          ? <span className="ec-badge ec-live">● ON SALE</span>
          : <span className="ec-badge ec-closed">CLOSED</span>
        }
      </div>

      <h3 className="ec-title">{event.title}</h3>
      {event.description && <p className="ec-desc">{event.description}</p>}

      <div className="ec-details">
        <div className="ec-detail">
          <span className="ecd-label">PRICE</span>
          <span className="ecd-val">{xlm(event.ticket_price)} XLM</span>
        </div>
        <div className="ec-detail">
          <span className="ecd-label">CAPACITY</span>
          <span className="ecd-val">{event.max_tickets?.toString()}</span>
        </div>
        <div className="ec-detail">
          <span className="ecd-label">EVENT IN</span>
          <span className="ecd-val">{daysLeft > 0 ? `${daysLeft}d` : 'Soon'}</span>
        </div>
        <div className="ec-detail">
          <span className="ecd-label">ORGANISER</span>
          <span className="ecd-val">{short(event.organiser)}</span>
        </div>
      </div>

      {/* Availability bar */}
      <div className="ec-avail">
        <div className="ec-avail-bar">
          <div className="ec-avail-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="ec-avail-labels">
          <span>{event.tickets_sold?.toString()} sold</span>
          <span>{(Number(event.max_tickets) - Number(event.tickets_sold))} remaining</span>
        </div>
      </div>

      {wallet && event.active && !soldOut && (
        <button className="btn-mint-ticket" disabled={busy} onClick={handleMint}>
          {busy ? 'Signing…' : `🎟 Mint Ticket · ${xlm(event.ticket_price)} XLM`}
        </button>
      )}
      {soldOut && <div className="ec-soldout">SOLD OUT</div>}
    </div>
  )
}

// ── Create event form (organiser only) ────────────────────────────────────
function CreateEventForm({ wallet, currentLedger, onCreated }) {
  const [title,    setTitle]    = useState('')
  const [desc,     setDesc]     = useState('')
  const [price,    setPrice]    = useState('0.5')
  const [capacity, setCapacity] = useState('500')
  const [days,     setDays]     = useState('30')
  const [busy,     setBusy]     = useState(false)
  const [err,      setErr]      = useState('')

  const eventLedger = currentLedger + Math.round(parseFloat(days || 1) * 17_280)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const hash = await createEvent(
        wallet,
        title,
        desc,
        parseFloat(price),
        parseInt(capacity),
        eventLedger
      )
      onCreated(hash)
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <form className="create-form" onSubmit={handleSubmit}>
      <div className="cf-title">CREATE EVENT</div>
      <div className="cf-field">
        <label>EVENT TITLE</label>
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Concert, conference, meetup…" maxLength={80} required disabled={busy} />
      </div>
      <div className="cf-field">
        <label>DESCRIPTION</label>
        <textarea value={desc} onChange={e => setDesc(e.target.value)}
          placeholder="What's the event about?" maxLength={200} rows={3} disabled={busy} />
      </div>
      <div className="cf-row">
        <div className="cf-field">
          <label>TICKET PRICE (XLM)</label>
          <input type="number" min="0.01" step="0.01"
            value={price} onChange={e => setPrice(e.target.value)} required disabled={busy} />
        </div>
        <div className="cf-field">
          <label>CAPACITY</label>
          <input type="number" min="1" max="10000" step="1"
            value={capacity} onChange={e => setCapacity(e.target.value)} required disabled={busy} />
        </div>
      </div>
      <div className="cf-field">
        <label>DAYS UNTIL EVENT</label>
        <div className="dur-row">
          {['7','14','30','60','90'].map(d => (
            <button key={d} type="button"
              className={`dur-btn ${days === d ? 'dur-active' : ''}`}
              onClick={() => setDays(d)}>{d}d</button>
          ))}
        </div>
        <span className="cf-hint">Event ledger ≈ {eventLedger.toLocaleString()}</span>
      </div>
      {err && <p className="cf-err">{err}</p>}
      <button type="submit" className="btn-create-event"
        disabled={busy || !title}>
        {busy ? 'Deploying…' : 'Create Event'}
      </button>
    </form>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function App() {
  const [wallet,        setWallet]        = useState(null)
  const [events,        setEvents]        = useState([])
  const [myTickets,     setMyTickets]     = useState([])
  const [ticketDetails, setTicketDetails] = useState({})  // id → {ticket, event}
  const [eventCount,    setEventCount]    = useState(0)
  const [ticketCount,   setTicketCount]   = useState(0)
  const [currentLedger, setCurrentLedger] = useState(0)
  const [loading,       setLoading]       = useState(true)
  const [tab,           setTab]           = useState('events')
  const [toast,         setToast]         = useState(null)
  const [lookupId,      setLookupId]      = useState('')
  const [lookupTicket,  setLookupTicket]  = useState(null)
  const [lookupEvent,   setLookupEvent]   = useState(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const [ec, tc] = await Promise.all([getEventCount(), getTicketCount()])
      setEventCount(ec); setTicketCount(tc)
      const eIds = []
      for (let i = ec; i >= Math.max(1, ec - 5); i--) eIds.push(i)
      const evts = await Promise.allSettled(eIds.map(id => getEvent(id)))
      setEvents(evts.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value))
      // current ledger
      try {
        const resp = await fetch(
          (import.meta.env.VITE_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org').trim(),
          { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({jsonrpc:'2.0',id:1,method:'getLedgers',params:{limit:1}}) }
        ).then(r => r.json())
        if (resp.result?.ledgers?.[0]?.sequence) setCurrentLedger(resp.result.ledgers[0].sequence)
      } catch {}
    } catch {}
    setLoading(false)
  }

  const loadMyTickets = async (addr) => {
    const ids = await getOwnedTickets(addr)
    setMyTickets(ids)
    const details = {}
    await Promise.allSettled(ids.map(async id => {
      const [t, ] = await Promise.all([getTicket(id)])
      if (t) {
        const ev = await getEvent(Number(t.event_id))
        details[id] = { ticket: t, event: ev }
      }
    }))
    setTicketDetails(details)
  }

  useEffect(() => { loadData() }, [])
  useEffect(() => { if (wallet) loadMyTickets(wallet) }, [wallet])

  const handleConnect = async () => {
    try { setWallet(await connectWallet()) }
    catch (e) { showToast(false, e.message) }
  }

  const showToast = (ok, msg, hash) => {
    setToast({ ok, msg, hash })
    setTimeout(() => setToast(null), 6000)
  }

  const handleMinted = (hash, event, errMsg) => {
    if (!hash) { showToast(false, errMsg); return }
    showToast(true, `Ticket minted for ${event?.title}! 🎟`, hash)
    loadData()
    if (wallet) loadMyTickets(wallet)
    setTab('mytickets')
  }

  const handleAction = ({ ok, msg, hash, refresh }) => {
    showToast(ok, msg, hash)
    if (ok && refresh && wallet) loadMyTickets(wallet)
  }

  const handleLookup = async (e) => {
    e.preventDefault()
    try {
      const t = await getTicket(parseInt(lookupId))
      const ev = t ? await getEvent(Number(t.event_id)) : null
      setLookupTicket(t); setLookupEvent(ev)
    } catch { showToast(false, 'Ticket not found') }
  }

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="brand">
          <div className="brand-icon">🎟</div>
          <div>
            <div className="brand-name">NFTicket</div>
            <div className="brand-sub">on-chain event tickets · stellar</div>
          </div>
        </div>

        <div className="header-stats">
          <div className="hs"><span className="hs-n">{eventCount}</span><span className="hs-l">EVENTS</span></div>
          <div className="hs-div"/>
          <div className="hs"><span className="hs-n">{ticketCount}</span><span className="hs-l">MINTED</span></div>
        </div>

        <div className="header-right">
          {wallet
            ? <div className="wallet-pill"><span className="wdot"/>{short(wallet)}</div>
            : <button className="btn-connect" onClick={handleConnect}>Connect</button>
          }
        </div>
      </header>

      {/* ── Tab bar ── */}
      <div className="tab-bar">
        {[
          { id:'events',    label:'Events'     },
          { id:'mytickets', label:'My Tickets' },
          { id:'lookup',    label:'Verify'     },
          ...(wallet ? [{ id:'create', label:'+ Event' }] : []),
        ].map(t => (
          <button key={t.id}
            className={`tab-btn ${tab === t.id ? 'tab-active' : ''}`}
            onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
        <button className="tab-refresh" onClick={loadData}>↻</button>
        <a className="tab-contract"
          href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
          target="_blank" rel="noreferrer">Contract ↗</a>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className={`toast ${toast.ok ? 'toast-ok' : 'toast-err'}`}>
          <span>{toast.msg}</span>
          {toast.hash && (
            <a href={`https://stellar.expert/explorer/testnet/tx/${toast.hash}`}
              target="_blank" rel="noreferrer" className="toast-link">TX ↗</a>
          )}
        </div>
      )}

      <main className="main">
        {/* ── Events ── */}
        {tab === 'events' && (
          loading ? (
            <div className="skeleton-grid">
              {[1,2].map(i => <div key={i} className="event-skeleton"/>)}
            </div>
          ) : events.length === 0 ? (
            <div className="empty-state">
              <div className="es-icon">🎟</div>
              <div className="es-title">No events yet.</div>
            </div>
          ) : (
            <div className="events-grid">
              {events.map(ev => (
                <EventCard key={ev.id?.toString()} event={ev}
                  wallet={wallet} currentLedger={currentLedger}
                  onMinted={handleMinted} />
              ))}
            </div>
          )
        )}

        {/* ── My tickets ── */}
        {tab === 'mytickets' && (
          !wallet ? (
            <div className="gate-prompt">
              <div className="gp-icon">🎟</div>
              <p>Connect your wallet to view your tickets.</p>
              <button className="btn-connect-lg" onClick={handleConnect}>Connect Freighter</button>
            </div>
          ) : myTickets.length === 0 ? (
            <div className="empty-state">
              <div className="es-icon">🎟</div>
              <div className="es-title">No tickets yet.</div>
              <button className="btn-first" onClick={() => setTab('events')}>Browse Events</button>
            </div>
          ) : (
            <div className="tickets-grid">
              {myTickets.map(id => {
                const d = ticketDetails[id]
                if (!d) return null
                return (
                  <TicketStub key={id} ticket={d.ticket} event={d.event}
                    wallet={wallet} onAction={handleAction} />
                )
              })}
            </div>
          )
        )}

        {/* ── Verify ── */}
        {tab === 'lookup' && (
          <div className="page-wrap">
            <h2 className="lookup-title">Verify Ticket</h2>
            <p className="lookup-sub">Look up any ticket by serial number to check its validity.</p>
            <form className="lookup-form" onSubmit={handleLookup}>
              <input type="number" min="1"
                value={lookupId} onChange={e => setLookupId(e.target.value)}
                placeholder="Ticket serial number" className="lookup-input" required />
              <button type="submit" className="btn-lookup">Verify</button>
            </form>
            {lookupTicket && (
              <TicketStub ticket={lookupTicket} event={lookupEvent}
                wallet={wallet} onAction={handleAction} />
            )}
          </div>
        )}

        {/* ── Create event ── */}
        {tab === 'create' && (
          <div className="page-wrap">
            {!wallet ? (
              <div className="gate-prompt">
                <div className="gp-icon">🎟</div>
                <p>Connect your wallet to create an event.</p>
                <button className="btn-connect-lg" onClick={handleConnect}>Connect Freighter</button>
              </div>
            ) : (
              <CreateEventForm
                wallet={wallet}
                currentLedger={currentLedger}
                onCreated={(hash) => {
                  showToast(true, 'Event created!', hash)
                  setTab('events')
                  loadData()
                }}
              />
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        <span>NFTicket · Stellar Testnet · Soroban</span>
        <a href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
          target="_blank" rel="noreferrer">Contract ↗</a>
      </footer>
    </div>
  )
}
