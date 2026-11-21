# ConflictOracle

Frontend for a GenLayer Intelligent Contract that resolves conflicting observations through validator consensus.

- Network: GenLayer Testnet Bradbury (Phase 2, chain ID 4221)
- Contract: contracts/conflict_oracle.py
- Set the deployed contract address with the VITE_CONTRACT_ADDRESS environment variable

## How it works
1. Open a case with a question.
2. Add two or more conflicting observations from different sources.
3. The case creator calls resolve. GenLayer validators independently judge the observations and must agree on the same winner.

## Run locally
npm install
npm run dev

Updated for Bradbury Phase 2.
