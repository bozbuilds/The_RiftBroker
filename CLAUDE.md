# CLAUDE.md

Encrypted intel marketplace for EVE Frontier on SUI/Move — built for the EVE Frontier × SUI Hackathon (March 11–31, 2026). See `docs/ARCHITECTURE.md` for full technical details.

## Commands

```bash
# Contract
.sui-bin/sui.exe move build --path contracts
.sui-bin/sui.exe move test --path contracts        # 63 tests

# Frontend
cd frontend && pnpm dev
cd frontend && pnpm test                           # 258 tests
cd frontend && pnpm build

# Seed demo data (PowerShell — see .claude/rules/gotchas.md for syntax)
$env:SUI_PRIVATE_KEY="suiprivkey1..."; cd frontend; pnpm seed
```

## Deployment (2026-03-25 — SUI testnet)

| Object | ID |
|--------|-----|
| Package | `0xdb94b50f1dc1652d8a7a4299b6367c33a66ab2005fffd0f3815c325ab84d6f11` |
| LocationVKey | `0x29f32b3394a9550176299f28d5d406cab8129f86524a61a15e0a66c0a60e42e4` |
| DistanceVKey | `0x5087b225470a37ca587a6f73d7d17908500cb43df1e0ac8816eee962f4cdd477` |
| PresenceVKey | `0x671d42311c5fa43c690e112e1c41bdd86cd294fb35c8c0198c8a3ed535abed9a` |
| ReputationVKey | `0xcb9a8de361a9d9b795ad4eef975339918c768b5d9dfdcf6efd9f5d3a9693bb41` |
| ScoutRegistry | `0xfcfdc4d5b07a9173b13f912541b3c50ffb2491058be6345709fae03b0148d778` |
| Seed wallet | `0x42a0c3adb1991438134869f0df7dbfc81a1b9911091516b8a2684d240083769b` |

## Rules

- [Gotchas](.claude/rules/gotchas.md) — SUI dynamic field parsing, PowerShell seeding, proximity limitations

## Verification

After making changes:
```bash
.sui-bin/sui.exe move test --path contracts        # all 63 pass
cd frontend && pnpm test                           # all 258 pass
cd frontend && pnpm build                          # clean tsc + vite build
```
