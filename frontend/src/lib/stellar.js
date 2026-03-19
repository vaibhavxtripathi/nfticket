import * as StellarSdk from '@stellar/stellar-sdk'
import { isConnected, requestAccess, signTransaction } from '@stellar/freighter-api'

const CONTRACT_ID       = (import.meta.env.VITE_CONTRACT_ID         || '').trim()
const XLM_TOKEN         = (import.meta.env.VITE_XLM_TOKEN           || '').trim()
const ORGANISER_ADDRESS = (import.meta.env.VITE_ORGANISER_ADDRESS   || '').trim()
const NET               = (import.meta.env.VITE_NETWORK_PASSPHRASE  || 'Test SDF Network ; September 2015').trim()
const RPC_URL           = (import.meta.env.VITE_SOROBAN_RPC_URL     || 'https://soroban-testnet.stellar.org').trim()
const DUMMY             = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'

export const rpc = new StellarSdk.rpc.Server(RPC_URL)

export async function connectWallet() {
  const { isConnected: connected } = await isConnected()
  if (!connected) throw new Error('Freighter not installed.')
  const { address, error } = await requestAccess()
  if (error) throw new Error(error)
  return address
}

async function sendTx(publicKey, op) {
  const account = await rpc.getAccount(publicKey)
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE, networkPassphrase: NET,
  }).addOperation(op).setTimeout(60).build()
  const sim = await rpc.simulateTransaction(tx)
  if (StellarSdk.rpc.Api.isSimulationError(sim)) throw new Error(sim.error)
  const prepared = StellarSdk.rpc.assembleTransaction(tx, sim).build()
  const result = await signTransaction(prepared.toXDR(), { networkPassphrase: NET })
  if (result.error) throw new Error(result.error)
  const signed = StellarSdk.TransactionBuilder.fromXDR(result.signedTxXdr, NET)
  const sent = await rpc.sendTransaction(signed)
  return pollTx(sent.hash)
}

async function pollTx(hash) {
  for (let i = 0; i < 30; i++) {
    const r = await rpc.getTransaction(hash)
    if (r.status === 'SUCCESS') return hash
    if (r.status === 'FAILED')  throw new Error('Transaction failed on-chain')
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error('Transaction timed out')
}

async function readContract(op) {
  const dummy = new StellarSdk.Account(DUMMY, '0')
  const tx = new StellarSdk.TransactionBuilder(dummy, {
    fee: StellarSdk.BASE_FEE, networkPassphrase: NET,
  }).addOperation(op).setTimeout(30).build()
  const sim = await rpc.simulateTransaction(tx)
  return StellarSdk.scValToNative(sim.result.retval)
}

const tc = () => new StellarSdk.Contract(CONTRACT_ID)

export async function mintTicket(buyer, eventId, priceXlm) {
  const stroops = Math.ceil(priceXlm * 10_000_000)
  await sendTx(buyer, new StellarSdk.Contract(XLM_TOKEN).call(
    'approve',
    StellarSdk.Address.fromString(buyer).toScVal(),
    StellarSdk.Address.fromString(CONTRACT_ID).toScVal(),
    new StellarSdk.XdrLargeInt('i128', BigInt(stroops)).toI128(),
    StellarSdk.xdr.ScVal.scvU32(3_110_400),
  ))
  return sendTx(buyer, tc().call(
    'mint_ticket',
    StellarSdk.Address.fromString(buyer).toScVal(),
    StellarSdk.xdr.ScVal.scvU32(eventId),
    StellarSdk.Address.fromString(XLM_TOKEN).toScVal(),
  ))
}

export async function transferTicket(from, to, ticketId) {
  return sendTx(from, tc().call(
    'transfer_ticket',
    StellarSdk.Address.fromString(from).toScVal(),
    StellarSdk.Address.fromString(to).toScVal(),
    StellarSdk.xdr.ScVal.scvU64(new StellarSdk.xdr.Uint64(BigInt(ticketId))),
  ))
}

export async function validateTicket(organiser, ticketId) {
  return sendTx(organiser, tc().call(
    'validate_ticket',
    StellarSdk.Address.fromString(organiser).toScVal(),
    StellarSdk.xdr.ScVal.scvU64(new StellarSdk.xdr.Uint64(BigInt(ticketId))),
  ))
}

export async function getEvent(eventId) {
  try {
    return await readContract(tc().call(
      'get_event',
      StellarSdk.xdr.ScVal.scvU32(eventId),
    ))
  } catch { return null }
}

export async function getTicket(ticketId) {
  try {
    return await readContract(tc().call(
      'get_ticket',
      StellarSdk.xdr.ScVal.scvU64(new StellarSdk.xdr.Uint64(BigInt(ticketId))),
    ))
  } catch { return null }
}

export async function getOwnedTickets(owner) {
  try {
    const ids = await readContract(tc().call(
      'get_owned_tickets',
      StellarSdk.Address.fromString(owner).toScVal(),
    ))
    return Array.isArray(ids) ? ids.map(Number) : []
  } catch { return [] }
}

export async function getEventCount() {
  try { return Number(await readContract(tc().call('event_count'))) }
  catch { return 0 }
}

export async function getTicketCount() {
  try { return Number(await readContract(tc().call('ticket_count'))) }
  catch { return 0 }
}

export const xlm   = s => (Number(s) / 10_000_000).toFixed(2)
export const short = a => a ? `${a.toString().slice(0,5)}…${a.toString().slice(-4)}` : '—'
export { CONTRACT_ID, ORGANISER_ADDRESS }
