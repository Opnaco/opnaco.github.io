#!/usr/bin/env python3
"""Weekly health check for the free RPCs opnaco's payment detection depends on.

Reads the CHAINS config from the LIVE lib.js, then for every network:
  1. finds a real USDC transfer from ~3 days ago,
  2. re-runs the site's payment search over several chunks of `span` blocks
     (same RPC order, same chunk size, same split-on-error fallback),
  3. fetches that transaction's receipt (what Pro license verification needs),
  4. checks the RPC sends CORS headers for https://opnaco.github.io.
Prints one line per network and exits non-zero if any network fails.
"""
import json, re, sys, time, urllib.request

SITE = "https://opnaco.github.io"
TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
HEADERS = {"content-type": "application/json", "Origin": SITE, "User-Agent": "Mozilla/5.0 opnaco-healthcheck"}


def http(url, body=None):
    req = urllib.request.Request(url, json.dumps(body).encode() if body else None, HEADERS)
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read(), r.headers.get("access-control-allow-origin")


def call(rpcs, method, params):
    """Same fallback as lib.js rpc(): try each RPC in order."""
    err = None
    for url in rpcs:
        try:
            raw, _ = http(url, {"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
            j = json.loads(raw)
            if "error" in j:
                raise RuntimeError(j["error"].get("message", "rpc error"))
            return j["result"]
        except Exception as e:
            err = e
    raise err


def load_chains():
    js = http(f"{SITE}/lib.js?healthcheck={int(time.time())}")[0].decode()
    pat = re.compile(r'(\w+):\s*\{\s*id:\s*(\d+),\s*name:\s*"([^"]+)",\s*usdc:\s*"(0x[0-9a-fA-F]{40})",\s*rpcs:\s*\[([^\]]*)\],\s*span:\s*(\d+)')
    chains = {m[0]: {"name": m[2], "usdc": m[3], "rpcs": re.findall(r'"([^"]+)"', m[4]), "span": int(m[5])} for m in pat.findall(js)}
    if len(chains) < 5:
        raise RuntimeError(f"could only parse {len(chains)} chains from live lib.js; parser needs updating")
    return chains


def find_sample(c):
    """A real USDC transfer ~3 days old (block rate estimated from timestamps)."""
    latest = int(call(c["rpcs"], "eth_blockNumber", []), 16)
    t1 = int(call(c["rpcs"], "eth_getBlockByNumber", [hex(latest), False])["timestamp"], 16)
    t0 = int(call(c["rpcs"], "eth_getBlockByNumber", [hex(latest - 10000), False])["timestamp"], 16)
    per_day = int(10000 * 86400 / max(1, t1 - t0))
    b = latest - 3 * per_day
    logs = call(c["rpcs"], "eth_getLogs", [{"fromBlock": hex(b), "toBlock": hex(b + 50), "address": c["usdc"], "topics": [TRANSFER]}])
    for l in logs:
        if 1_000_000 <= int(l["data"], 16) < 10**12:
            return l, per_day
    raise RuntimeError("no sample transfer found ~3 days back")


def scan(c, to_topic, want, frm, to):
    """Mirror of lib.js findPayment's per-chunk scan, including split-on-error."""
    q = [{"fromBlock": hex(frm), "toBlock": hex(to), "address": c["usdc"], "topics": [TRANSFER, None, to_topic]}]
    try:
        return next((l for l in call(c["rpcs"], "eth_getLogs", q) if int(l["data"], 16) == want), None)
    except Exception:
        if to - frm < 2000:
            raise
        time.sleep(0.8)
        mid = frm + (to - frm) // 2
        return scan(c, to_topic, want, frm, mid) or scan(c, to_topic, want, mid + 1, to)


def check(key, c):
    t = time.time()
    sample, per_day = find_sample(c)
    blk, want, to_topic = int(sample["blockNumber"], 16), int(sample["data"], 16), sample["topics"][2]
    # Invoice "created" half a day (at least 2 chunks) before the payment, like a real invoice.
    start = blk - max(per_day // 2, 2 * c["span"])
    hit, f = None, start
    while f <= blk and not hit:
        hit = scan(c, to_topic, want, f, min(f + c["span"] - 1, blk))
        f += c["span"]
    if not hit or hit["transactionHash"] != sample["transactionHash"]:
        raise RuntimeError("payment search did not find the sample transfer")
    rcpt = call(c["rpcs"], "eth_getTransactionReceipt", [sample["transactionHash"]])
    if not rcpt or rcpt.get("status") != "0x1":
        raise RuntimeError("could not read transaction receipt (Pro license verification would fail)")
    _, cors = http(c["rpcs"][0], {"jsonrpc": "2.0", "id": 1, "method": "eth_chainId", "params": []})
    if cors not in ("*", SITE):
        raise RuntimeError(f"primary RPC CORS header is {cors!r}; browsers would block it")
    return f"scanned {(blk - start):,} blocks, {time.time() - t:.0f}s"


def main():
    chains = load_chains()
    failed = 0
    for key, c in chains.items():
        try:
            print(f"PASS  {c['name']:9} {c['rpcs'][0]:45} {check(key, c)}", flush=True)
        except Exception as e:
            failed += 1
            print(f"FAIL  {c['name']:9} {c['rpcs'][0]:45} {str(e)[:120]}", flush=True)
    print(f"\n{len(chains) - failed}/{len(chains)} networks healthy")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
