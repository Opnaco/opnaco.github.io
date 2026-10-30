# opnaco Invoice

Free USDC invoices that detect their own payment on-chain. No signup, no server.

**Live:** https://opnaco.github.io

- Fill in an invoice; the whole invoice is compressed into the link's URL fragment (never sent to a server).
- Your client pays by QR code (EIP-681) or a "pay with wallet" button.
- Each amount carries a unique fingerprint in its last decimals. The page records the block at creation and scans USDC `Transfer` logs to your address via public RPCs (`eth_getLogs`) to find the exact payment, then shows **Paid** with the transaction hash.
- Networks: Base (free), plus Arbitrum, Optimism, Polygon and Ethereum (Pro).

Pro is 29 USDC one-time; the license is the hash of your payment to the opnaco treasury, verified on-chain in the browser.

Plain HTML + vanilla JS, no build step. Run locally with `python3 -m http.server`.

Support: opnaco@proton.me · License: MIT
