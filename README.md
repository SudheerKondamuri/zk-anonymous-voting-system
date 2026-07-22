# ZK-SNARK Anonymous Voting System

This project is a decentralized, privacy-preserving anonymous voting system built using Zero-Knowledge SNARKs (Groth16), Circom circuits, Solidity smart contracts, and an Express.js backend.

## Architecture

1. **Circom Circuit (`circuits/vote.circom`)**:
   - Represents the core logic of the voting proof.
   - Verifies the inclusion of a voter's commitment (hash of their secret and nullifier) in a depth-16 sparse Merkle Tree.
   - Constrains the voter's nullifier hash (`nullifierHash`) to be correctly computed, preventing double-voting.
   - Constrains the vote choice to be a binary option (0 or 1).
   - Binds public signals `encryptedVote` and `pollId` to the generated proof.
2. **Solidity Smart Contract (`contracts/AnonymousVoting.sol`)**:
   - Manages polls, stores on-chain Merkle roots, records used nullifiers, and tallies vote counts.
   - Integrates the generated `Groth16Verifier` to verify submitted ZK-SNARK proofs on-chain before admitting votes.
3. **Backend API (`packages/api`)**:
   - Orchestrates the off-chain components.
   - Auto-deploys contracts locally on startup if no deployed address is specified.
   - Reconstructs Merkle Trees from local voter data upon server restart.
   - Generates proofs using `snarkjs` and submits transactions to the blockchain.

---

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)

### Build and Run with Docker Compose

To start the local blockchain (Hardhat) and the Express API in containerized environments, run:

```bash
docker-compose up --build
```

This starts:
- **Hardhat local node** on `http://localhost:8545`
- **Express API service** on `http://localhost:8000`

The API container has a healthcheck and will wait until the Hardhat node is online. On first launch, it will automatically deploy the Solidity verifier and voting contracts, and write the details to `deployment.json`.

---

## API Endpoints

### 1. Health Check
- **GET** `/health`
  - Returns `200 OK` when active.

### 2. Create Poll
- **POST** `/api/polls`
  - **Request Body**:
    ```json
    {
      "question": "Is ZK-SNARK technology revolutionary?",
      "options": ["No", "Yes"],
      "duration": 86400
    }
    ```
  - **Success Response (201 Created)**:
    ```json
    {
      "pollId": 1,
      "question": "Is ZK-SNARK technology revolutionary?",
      "merkleRoot": "0x...",
      "txHash": "0x..."
    }
    ```

### 3. Register Voter
- **POST** `/api/polls/:pollId/register`
  - Generates a secret and nullifier, inserts the voter's commitment into the Merkle Tree, updates the root on-chain, and stores voter data in `data/voters.json`.
  - **Success Response (201 Created)**:
    ```json
    {
      "commitment": "0x...",
      "voterIndex": 0
    }
    ```

### 4. Cast Vote
- **POST** `/api/polls/:pollId/vote`
  - Generates the ZK-SNARK proof off-chain and submits the proof and public signals to the smart contract.
  - **Request Body**:
    ```json
    {
      "voterCommitment": "0x...",
      "voteChoice": 1
    }
    ```
  - **Success Response (200 OK)**:
    ```json
    {
      "txHash": "0x...",
      "nullifierHash": "0x..."
    }
    ```

### 5. Fetch Poll Results
- **GET** `/api/polls/:pollId/results`
  - Fetches the vote tally from the smart contract after the poll expires.
  - **Success Response (200 OK)**:
    ```json
    {
      "pollId": 1,
      "question": "Is ZK-SNARK technology revolutionary?",
      "results": {
        "Yes": 1,
        "No": 0
      },
      "isActive": false
    }
    ```

---

## Running Integration Tests

While the application is running via `docker-compose up`, execute the integration test suite:

```bash
node tests/integration.js
```

This test will:
1. Verify the API is healthy.
2. Create a test poll with an 8-second expiration.
3. Register 2 voters.
4. Cast a YES vote for voter 1 and a NO vote for voter 2.
5. Confirm that attempts to double-vote or view results prematurely fail.
6. Sleep until the poll expires, then fetch and assert the correct tallies.
