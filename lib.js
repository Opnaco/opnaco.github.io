// opnaco Invoice — shared client-side engine. No server: invoices live in URLs,
// payment status and Pro licenses are verified directly against public chain RPCs.
"use strict";

const TREASURY = "0x3c11b28f0D16d87B7a7347861a4e66EaaFf8E43D";
const PRO_PRICE = 29; // USDC, one-time
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Free, CORS-enabled RPCs that serve historical logs (probed 2026-10-30; many public RPCs
// refuse old logs as "archive requests"). span = max blocks per eth_getLogs the RPC accepts.
const CHAINS = {
  base:     { id: 8453,  name: "Base",     usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", rpcs: ["https://base-rpc.publicnode.com", "https://mainnet.base.org"], span: 50000, explorer: "https://basescan.org", native: "ETH", free: true },
  arbitrum: { id: 42161, name: "Arbitrum", usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", rpcs: ["https://arb1.arbitrum.io/rpc"], span: 100000, explorer: "https://arbiscan.io", native: "ETH" },
  optimism: { id: 10,    name: "Optimism", usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", rpcs: ["https://mainnet.optimism.io"], span: 10000, explorer: "https://optimistic.etherscan.io", native: "ETH" },
  polygon:  { id: 137,   name: "Polygon",  usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", rpcs: ["https://polygon-bor-rpc.publicnode.com"], span: 10000, explorer: "https://polygonscan.com", native: "POL" },
  ethereum: { id: 1,     name: "Ethereum", usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", rpcs: ["https://gateway.tenderly.co/public/mainnet", "https://rpc.mevblocker.io"], span: 50000, explorer: "https://etherscan.io", native: "ETH" },
};

// ---------- RPC ----------
async function rpc(chainKey, method, params) {
  let lastErr;
  for (const url of CHAINS[chainKey].rpcs) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
const blockNumber = async (c) => parseInt(await rpc(c, "eth_blockNumber", []), 16);
const pad32 = (addr) => "0x" + addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const isAddress = (a) => /^0x[0-9a-fA-F]{40}$/.test(a || "");

// ---------- Amounts (USDC, 6 decimals) ----------
// Each invoice gets a unique tag in the last 4 decimals so its payment is identifiable on-chain.
function toUnits(amount, tag) { return BigInt(Math.round(Number(amount) * 100)) * 10000n + BigInt(tag || 0); }
function fmtUnits(units) {
  const u = BigInt(units), whole = u / 1000000n, frac = (u % 1000000n).toString().padStart(6, "0");
  return whole.toLocaleString("en-US") + "." + frac.replace(/0+$/, "").padEnd(2, "0");
}
const fmtMoney = (n) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- Invoice encoding (deflate + base64url in the URL hash) ----------
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
async function encodeInvoice(inv) { return b64u(await pipe(new TextEncoder().encode(JSON.stringify(inv)), new CompressionStream("deflate-raw"))); }
async function decodeInvoice(s) { return JSON.parse(new TextDecoder().decode(await pipe(unb64u(s), new DecompressionStream("deflate-raw")))); }

function invoiceTotal(inv) { return (inv.items || []).reduce((s, it) => s + Number(it.q || 0) * Number(it.p || 0), 0); }
function invoiceUnits(inv) { return toUnits(invoiceTotal(inv).toFixed(2), inv.tag); }

// ---------- Payment detection ----------
// Scans USDC Transfer logs to the recipient from the block recorded at invoice creation.
// Scans the whole range (no cap), PARALLEL chunks at a time. A failing chunk (timeout,
// too many results, rate limit) is retried as two halves, down to small ranges.
async function findPayment(inv, onProgress) {
  const c = CHAINS[inv.chain], want = invoiceUnits(inv), PARALLEL = 4;
  const latest = await blockNumber(inv.chain);
  const start = inv.block || latest - c.span * 4;
  const chunks = [];
  for (let f = start; f <= latest; f += c.span) chunks.push([f, Math.min(f + c.span - 1, latest)]);
  const scan = async ([from, to]) => {
    const q = [{ fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16), address: c.usdc, topics: [TRANSFER_TOPIC, null, pad32(inv.to)] }];
    try { return (await rpc(inv.chain, "eth_getLogs", q)).find((l) => BigInt(l.data) === want); }
    catch (e) {
      if (to - from < 2000) throw e;
      await new Promise((r) => setTimeout(r, 800));
      const mid = from + Math.floor((to - from) / 2);
      return (await scan([from, mid])) || (await scan([mid + 1, to]));
    }
  };
  for (let i = 0; i < chunks.length; i += PARALLEL) {
    const batch = chunks.slice(i, i + PARALLEL);
    onProgress && onProgress(batch[0][0], batch[batch.length - 1][1], latest);
    const hit = (await Promise.all(batch.map(scan))).find(Boolean);
    if (hit) return { tx: hit.transactionHash, block: parseInt(hit.blockNumber, 16), from: "0x" + hit.topics[1].slice(26) };
  }
  return null;
}

// ---------- Wallet ----------
function transferData(to, units) {
  return "0xa9059cbb" + pad32(to).slice(2) + BigInt(units).toString(16).padStart(64, "0");
}
async function payWithWallet(chainKey, to, units) {
  const eth = window.ethereum;
  if (!eth) throw new Error("No browser wallet found. Scan the QR code or send manually.");
  const c = CHAINS[chainKey];
  const [account] = await eth.request({ method: "eth_requestAccounts" });
  const hex = "0x" + c.id.toString(16);
  if ((await eth.request({ method: "eth_chainId" })) !== hex) {
    try { await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] }); }
    catch (e) {
      if (e.code !== 4902) throw e; // 4902: wallet doesn't know this network yet
      await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: hex, chainName: c.name, rpcUrls: [c.rpcs[0]], blockExplorerUrls: [c.explorer], nativeCurrency: { name: c.native, symbol: c.native, decimals: 18 } }] });
    }
  }
  return eth.request({ method: "eth_sendTransaction", params: [{ from: account, to: c.usdc, data: transferData(to, units) }] });
}
function eip681(chainKey, to, units) { const c = CHAINS[chainKey]; return `ethereum:${c.usdc}@${c.id}/transfer?address=${to}&uint256=${units}`; }

// ---------- Pro license (trustless: a USDC transfer to the treasury) ----------
async function verifyLicenseTx(chainKey, hash) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("That doesn't look like a transaction hash.");
  const r = await rpc(chainKey, "eth_getTransactionReceipt", [hash]);
  if (!r) throw new Error("Transaction not found on " + CHAINS[chainKey].name + " (yet). Try again in a minute or pick another chain.");
  if (r.status !== "0x1") throw new Error("That transaction failed on-chain.");
  const ok = r.logs.some((l) => l.address.toLowerCase() === CHAINS[chainKey].usdc.toLowerCase() && l.topics[0] === TRANSFER_TOPIC && l.topics[2] === pad32(TREASURY) && BigInt(l.data) >= BigInt(PRO_PRICE) * 1000000n);
  if (!ok) throw new Error(`No transfer of ≥ ${PRO_PRICE} USDC to the opnaco treasury in that transaction.`);
  const lic = { chain: chainKey, tx: hash, at: Date.now() };
  store.set("license", lic);
  return lic;
}
const isPro = () => !!store.get("license");

// ---------- Storage (best-effort) ----------
const store = {
  get(k, d = null) { try { const v = localStorage.getItem("opnaco." + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("opnaco." + k, JSON.stringify(v)); } catch {} },
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
