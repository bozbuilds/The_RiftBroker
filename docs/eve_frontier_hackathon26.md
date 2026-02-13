# EVE Frontier × SUI hackathon: a builder's strategic playbook

**The March 11–31 EVE Frontier × SUI Hackathon offers $80,000 in prizes for "Toolkit for Civilization" submissions — and the timing is perfect.** CCP's October 2025 migration from Ethereum L2/Solidity to SUI/Move has reset the playing field: every previous community tool must be rebuilt, the builder docs are freshly rewritten, and SUI's object-centric primitives unlock mechanics that were impossible on EVM. For a developer with EVE Online wormhole-mapper experience, TypeScript/React fluency, and 1–2 months to build, the highest-impact opportunity sits at the intersection of three gaps: **no market/trading tools exist yet, no collaborative intel infrastructure exists, and nobody has applied DeFi primitives to EVE Frontier's on-chain economy.** The competition accepts both in-world Smart Assembly mods and external API-connected apps, with community voting playing a meaningful role in selecting winners — meaning tools that players actually use during the judging period carry an edge.

---

## The ecosystem just reset — and everything is up for grabs

EVE Frontier is CCP Games' space sandbox MMO where players are "Riders" — awakened clones surviving in a hostile universe of **100,000+ solar systems**. The game runs seasonal 3-month "Cycles," with **Cycle 5 (March 2026)** introducing new scanning systems, expanded base combat, and the full SUI blockchain integration. Over 11,000 characters exist; the economy follows a creation→destruction loop managed by a real-world economist CCP hired from Iceland's Central Bank.

**Smart Assemblies** are the core builder primitive. These are on-chain programmable structures deployed in space that other players physically encounter. Three types currently exist:

- **Smart Storage Units (SSUs)** hold items and currencies with dual inventory (owner-controlled primary + per-player ephemeral). Builders can restrict all transfers to flow through custom smart contracts, enabling vending machines, marketplaces, quest givers, or any custom economic logic.
- **Smart Turrets** provide automated defense with programmable targeting priority queues. Up to 3 can attach to any assembly, each running custom aggression logic.
- **Smart Gates** connect solar systems with programmable access control — gate passage can require tribe membership, reputation scores, item possession, or any on-chain condition.

The SUI migration replaced Solidity/MUD with **Move smart contracts** and brought SUI's full stack: **zkLogin** (Google/Twitch sign-in, no wallet needed), **sponsored transactions** (gasless play), **Seal** (native encrypted data access controls for information asymmetry), and **Walrus** (decentralized storage). The previous architecture used a single World contract entry point with namespace-based isolation, a Smart Object Framework for entity/class hierarchies, and a hooks system allowing before/after logic injection on any game function. The new SUI architecture preserves these design goals but leverages SUI's object model directly.

---

## SUI's primitives unlock mechanics impossible on Ethereum

SUI's architecture is uniquely powerful for gaming. Every on-chain entity is an **object with a globally unique ID, an owner, and a version number** — not an entry in a contract's mapping. This means game assets are inherently composable, truly owned, and parallelizable.

**The primitives that matter most for this hackathon:**

**Shared objects** enable multi-user interaction without bottlenecking. An AMM pool, a marketplace, or a prediction market can be a shared object that thousands of players access simultaneously, with SUI's Mysticeti consensus ordering only the transactions that touch the same object. Transactions on different objects execute in parallel — critical for a game with thousands of concurrent players. Finality is **~400ms at ~$0.0005 per transaction**.

**Programmable Transaction Blocks (PTBs)** allow up to **1,024 sequential commands in a single atomic transaction**. This enables flash-loan-style operations natively: borrow resources → execute arbitrage across multiple markets → repay with profit → all in one transaction that reverts entirely if any step fails. No special flash loan contracts needed — it's a core protocol feature.

**Kiosks and Transfer Policies** provide a native framework for programmable marketplaces with enforced royalties, floor prices, and custom trading rules. A game item can have a Transfer Policy requiring the buyer to hold a reputation token, pay a fee to the creator, or satisfy any arbitrary on-chain condition. The **Closed-Loop Token** standard creates currencies that can only be spent within specific contexts — perfect for alliance-internal currencies or loyalty systems.

**Seal** enables encrypted data that can only be decrypted by specific addresses or under specific conditions. Combined with **Walrus** for storage, this creates a native foundation for **information markets** — selling encrypted scouting data, intel packages, or map overlays where the seller controls who can access what. This is particularly relevant because CCP explicitly designed EVE Frontier around information asymmetry.

**On-chain randomness** via threshold cryptography provides provably fair, unbiasable random numbers — enabling loot mechanics, tournament brackets, or any probabilistic game element without trusting a server.

---

## What the community has built (and the vast gaps remaining)

The existing tool landscape is sparse. **Atlas** (frontier-atlas.com) provides a basic star map. **efbom.com** offers a bill-of-materials crafting calculator. **Alpha-Strike** runs a basic killboard. **EVE Datacore** is a blockchain data explorer. A Rust-based **route planner** exists on GitHub. DaOpa's fansite has ship/module/ammo databases.

**What's completely missing — mapped against EVE Online's rich tool ecosystem:**

| Critical gap | EVE Online equivalent | Blockchain enhancement potential |
|---|---|---|
| Collaborative real-time mapping | Pathfinder, Tripwire | POD-verified scout data, incentivized intel sharing |
| Market intelligence | EVE Marketer, Janice | On-chain price discovery from SSU trades, cross-system arbitrage detection |
| Fleet coordination | Fleet-Up, doctrine managers | Smart contract-enforced doctrines, automated loot distribution |
| Intel/threat detection | NEAR2, Vintel, Intel channels | Seal-encrypted early warning networks, reputation-gated access |
| Alliance management | SeAT | DAO treasury, on-chain voting, role-based access via Move |
| Ship fitting simulator | Pyfa | Dynamic stat calculations with on-chain module data |

The previous hackathon winner, **Sovrun**, built an eSports ecosystem and was praised for being "complete and well thought out." Someone memorably ran **DOOM inside a Smart Assembly**. The third hackathon (May 2025) focused on maps, data explorers, and analytics. This fourth hackathon's $80K prize pool — a **26× increase** from the previous $3K in travel vouchers — signals CCP's escalating investment in the builder ecosystem.

---

## Three competition-winning project concepts ranked by impact

After analyzing the whitespace, SUI's primitives, the competition criteria (community voting, live deployment, creativity), and feasibility for a solo developer in 1–2 months, here are the strongest concepts — ordered from most to least recommended.

### Concept 1: "The Frontier Exchange" — AMM resource markets with cross-system arbitrage

**The idea:** Deploy Smart Storage Units across multiple star systems that function as **automated market makers** using bonding curves (x·y=k). Each SSU-market prices resources algorithmically based on local supply and demand. Because prices differ across systems, players discover **arbitrage opportunities** — buy cheap ore in System A, sell expensive in System B. Liquidity providers deposit resources and earn trading fees. The killer feature: SUI's PTBs enable **flash convoys** — borrow resources, execute cross-market arbitrage, and repay within a single atomic transaction.

**Why this wins:** It fills the single biggest gap (no market tools), creates emergent gameplay (trade routes become liquidity arbitrage), is genuinely novel (no MMO has DeFi-native resource markets), and generates immediate player engagement during judging because everyone needs to trade. The external app component is a React dashboard showing real-time prices across systems, arbitrage opportunity alerts, and LP position tracking. The wormhole-mapper architectural experience translates directly to building the cross-system visualization layer.

**Technical feasibility:** High. The core AMM math is well-understood. The Move contract manages a shared object (the pool) with deposit/withdraw/swap functions. The SSU's dual inventory system (primary for the pool, ephemeral for user deposits) maps naturally to LP mechanics. The external dashboard reads on-chain events via SUI's GraphQL RPC. **Estimated build: 3–4 weeks for core contracts + dashboard, 2 weeks for polish and multi-system deployment.**

### Concept 2: "The Dark Net" — encrypted intel marketplace powered by Seal

**The idea:** A Smart Assembly network where scouts **sell encrypted intelligence**. Scouts discover valuable locations (rich asteroid fields, enemy fleet positions, undefended bases) and encrypt this data using SUI's native **Seal** access controls, storing it on **Walrus**. Buyers browse available intel packages (with unencrypted metadata: system region, intel type, freshness timestamp, scout reputation score) and pay to unlock decryption access. The scout earns tokens; the buyer gets actionable intel. A **soulbound reputation system** tracks scout accuracy — if intel is verified as accurate by subsequent players, the scout's reputation increases; stale or false intel decreases it.

**Why this wins:** It leverages two SUI-native primitives (Seal + Walrus) that **don't exist on any other blockchain**, making it impossible to replicate elsewhere — exactly the kind of technical differentiation judges notice. It creates an entirely new gameplay loop (intelligence economy) that's deeply thematic for EVE's espionage culture. The external app is a React-based intel browser with a map overlay showing available intel regions, scout leaderboards, and purchase history.

**Technical feasibility:** Medium-high. Seal's documentation is newer and may require more exploration, but the encryption/decryption flow is documented. The core contract manages listings, payments, and reputation scores. Walrus handles data storage. **Estimated build: 4–5 weeks including Seal integration learning curve.**

### Concept 3: "The Underwriter" — ship insurance with automated bounty feedback loop

**The idea:** A Smart Assembly where players **insure their ships and cargo** by paying premiums into a shared pool. If their ship is destroyed (verifiable via on-chain kill data), the insurance contract automatically pays out a claim AND posts an **on-chain bounty** on the attacker. When a bounty hunter destroys the attacker's ship, the bounty is paid from the insurance pool. This creates a **self-reinforcing justice economy**: attack an insured player → bounty on your head → bounty hunters pursue you → insurance pool funds the cycle. Premium pricing is algorithmic, based on the player's combat history, destination system danger rating (derived from killboard data), and cargo value.

**Why this wins:** It's the "weird and creative" DeFi × gaming mashup that doesn't exist anywhere. Insurance protocols exist in DeFi; bounty systems exist in games; **nobody has closed the loop between them.** It creates emergent social dynamics (pirates avoiding insured targets, bounty hunter guilds forming, risk pricing becoming a skill). The external app shows insurance pool health, active bounties on a map, premium calculators, and claims history.

**Technical feasibility:** Medium. Requires reading on-chain kill data reliably, pricing risk algorithmically, and managing a pool contract. The bounty auto-posting is straightforward once kill verification works. **Estimated build: 5–6 weeks, tighter timeline but achievable.**

---

## How to maximize your competition score

**Community voting is the secret weapon.** Since submissions can be deployed into the live server during judging, tools that players actually use will win votes. The AMM Exchange concept has the strongest "use it immediately" appeal — every player trades resources. Deploying it to 3–5 high-traffic systems before voting starts creates a network effect.

**Combine both submission tracks.** Build the Smart Assembly (in-world mod) AND the external React dashboard (external app). This demonstrates full-stack capability and doubles your surface area for engagement. The in-game component creates the on-chain state; the external dashboard makes it legible and useful.

**Leverage your wormhole mapper background explicitly.** In your submission narrative, reference the Pathfinder/Tripwire architecture experience. CCP's judges are EVE Online veterans — they understand the significance of wormhole mapping architecture and will recognize the technical depth behind your spatial data visualization choices.

**Build on SUI-native primitives that showcase the migration's value.** Projects that demonstrate why SUI matters (Seal encryption, PTB atomicity, object composability, sub-second finality) align with CCP and Mysten Labs' strategic narrative. As CEO Hilmar Pétursson said: builders are "modding the server itself in real time" — show something that couldn't exist without SUI.

**Start with the TypeScript SDK.** Install `@mysten/sui` and `@mysten/dapp-kit`, scaffold with `pnpm create @mysten/dapp --template react-client-dapp`. Move contracts can be tested locally with `sui start` for a local devnet. The Move Book (move-book.com) and SUI Move Intro Course (intro.sui-book.com) are the fastest onboarding paths for the language itself. For gasless UX, integrate sponsored transactions via Shinami's Gas Station API or SUI's native sponsorship mechanism.

---

## A practical 8-week build timeline

**Weeks 1–2: Foundation.** Learn Move basics via the Move Book. Deploy a minimal Smart Assembly contract on SUI testnet. Set up the React dashboard scaffold with `@mysten/dapp-kit`. Get familiar with SUI's GraphQL RPC for reading on-chain state. Build the wallet connection flow with zkLogin.

**Weeks 3–4: Core mechanics.** Implement the primary smart contract logic (AMM swap math, pool management, or intel listing/purchasing, depending on chosen concept). Deploy to EVE Frontier's test environment. Build the external dashboard's core data visualization.

**Weeks 5–6: Integration and multi-system deployment.** Connect the external app to live game data via the official API. Deploy Smart Assemblies across multiple in-game locations. Implement the LP tracking, arbitrage detection, or reputation system. Polish the UX.

**Weeks 7–8: Hardening and competition prep.** Test with other players. Fix edge cases. Write the submission narrative emphasizing novelty, SUI-native features, and player impact. Record a demo video. Deploy to the live server before voting begins.

## What makes the difference between good and great

The winning submission won't just be technically sound — it will create **emergent gameplay that surprises even its creator.** EVE Online's magic has always been the unscripted stories: the betrayals, the market crashes, the espionage. The best hackathon project seeds new stories. An AMM market that causes a player-driven trade war between systems. An intel marketplace where double agents sell false data. An insurance protocol that spawns a bounty hunter guild. Build the infrastructure and let players create the narrative. That's what CCP means by "Toolkit for Civilization" — not just tools, but the foundations of player-driven civilization itself.