# opnaco — operating plan

## Thesis
Zero capital means: no servers, no paid ads, no payment processor. So the first product must
1. cost $0 to run forever (static files on free hosting),
2. take payment without an account (crypto straight to a wallet, verified on-chain),
3. sell to people who already hold crypto (so paying 29 USDC is zero friction),
4. spread by itself (every invoice a customer sends is an ad shown to *their* client).

**Product: opnaco Invoice** — USDC invoices whose share link detects its own payment on-chain.
Freelancers, contractors and DAOs paid in stablecoins are the market; they currently juggle
Google Docs invoices + "did you send it yet?" messages + block-explorer screenshots.

## Model
- Free: unlimited Base USDC invoices, pay links, QR, auto payment detection. Footer: "Made with opnaco".
- Pro: **29 USDC one-time**, all 5 networks, logo, no footer, saved clients, CSV export.
- License = tx hash of a ≥29 USDC transfer to the treasury, verified client-side. No backend.
- Running cost: $0. Gross margin: ~100%. Break-even: first sale.

## Contact
- Support / business email: opnaco@proton.me (human-held login; recovery phrase backed up offline)

## Treasury
- Address (EVM, same on Base/Arbitrum/Optimism/Polygon/Ethereum): `0x3c11b28f0D16d87B7a7347861a4e66EaaFf8E43D`
- Key: `.treasury/key.json` (local only, gitignored, mode 600). **Back it up offline.**
- Revenue is fully public on-chain: https://basescan.org/address/0x3c11b28f0D16d87B7a7347861a4e66EaaFf8E43D

## Roadmap (all $0)
1. ✅ **Launch** (2026-10-30) — live at https://opnaco.github.io, source at https://github.com/Opnaco/opnaco.github.io. Open-source builds trust for a wallet-adjacent tool and GitHub search is free distribution.
2. **Distribution** (needs a human with existing accounts; I can't create accounts):
   Show HN, r/ethdev, r/freelance, r/CryptoCurrency, Farcaster/X crypto-freelancer circles, DAO contributor forums, Base ecosystem directory and builder grants.
3. **Grants** — apply to Base Builder Grants / Optimism RetroPGF / Gitcoin as open-source public-goods tooling. Non-dilutive crypto income that matches our rails.
4. **Reinvest first revenue** into a custom domain (~$10/yr) only after the first sales.
5. Next products on the same engine (no backend): recurring invoices, payroll batch links for DAOs, receipts/tax summaries, a payment-button widget for other sites.

## Distribution log
| Date | Channel | Status |
|---|---|---|
| 2026-10-30 | SEO guides: how-to-invoice-in-usdc, usdc-payment-not-received + sitemap | live |
| 2026-10-30 | PR PayrollFlow/awesome-freelancer-payments#15 (Invoicing Tools) | open |
| 2026-10-30 | PR ahmet/awesome-web3#881 (Open Source Project) | merged 2026-11-02, live in the list |
| 2026-10-30 | brandonhimpfen/awesome-stablecoins | skipped: rules exclude early-stage/promotional entries; retry once we have users |
| 2026-10-30 | Show HN | not posted: the 2026-11-03 run stopped because the browser pane was signed out of HN; needs a new slot and sign-in |

## Ledger
| Date | Item | In (USDC) | Out | Balance |
|---|---|---|---|---|
| 2026-10-30 | Company bootstrapped, product built | 0 | 0 | 0 |
| 2026-10-30 | Launched on GitHub Pages (free hosting) | 0 | 0 | 0 |
