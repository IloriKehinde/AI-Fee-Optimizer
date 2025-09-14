# AI Fee Optimizer

## Overview

AI Fee Optimizer is a Web3 project built on the Stacks blockchain using Clarity smart contracts. It leverages AI-driven predictions based on on-chain data to optimize transaction fees for cross-chain transfers and DeFi operations. By analyzing historical and real-time on-chain metrics (e.g., gas prices, network congestion, block times), an off-chain AI model predicts the lowest-fee paths for routing transfers across supported networks (e.g., Stacks to Bitcoin, Ethereum via bridges, or other L2s). This solves real-world problems such as:

- **High and Unpredictable Fees**: Users often overpay due to volatile gas prices, especially during peak times on networks like Ethereum.
- **Inefficient Cross-Chain Routing**: Manual selection of bridges or paths leads to suboptimal costs and delays.
- **Accessibility Barriers**: High fees deter small-scale users from participating in DeFi, NFTs, or micropayments.
- **Network Congestion**: By predicting and avoiding congested paths, it reduces failed transactions and improves reliability.

The project includes an off-chain AI component (e.g., using machine learning models trained on blockchain data APIs like those from Stacks or Bitcoin explorers) that feeds predictions into on-chain oracles. Smart contracts then enforce secure, automated routing.

Key Features:
- AI predictions updated periodically via oracles.
- Multi-path routing for transfers (e.g., direct Stacks tx, Bitcoin settlement, or bridged to other chains).
- User-initiated transfers with fee estimates.
- Governance for parameter updates.
- Integration with STX token for fees and rewards.

## Architecture

- **Off-Chain Components**:
  - AI Model: Trained on on-chain data (e.g., fee histories, block data) to predict fees for paths. Uses libraries like TensorFlow or scikit-learn.
  - Data Fetcher: Pulls data from Stacks API, Bitcoin RPC, or other blockchain explorers.
  - Oracle Updater: Submits predictions to on-chain oracles.

- **On-Chain Components**:
  - 6 Clarity smart contracts (described below) deployed on Stacks.
  - Uses STX as the native token for transactions.

- **User Flow**:
  1. User deposits funds into a vault contract.
  2. Queries predicted fees via the oracle.
  3. Initiates transfer, which routes through the lowest-fee path selected by the routing contract.
  4. Transfer executes via bridge or direct tx, with settlement on target chain.

## Smart Contracts

The project consists of 6 solid Clarity smart contracts. Each is designed for security, with read-only functions for queries, private functions for internal logic, and public functions for user interactions. Contracts use traits for modularity (e.g., ownable-trait for governance).

### 1. FeePredictionOracle.clar
This contract acts as an oracle to store AI-predicted fee data for different paths. It allows authorized updaters (e.g., off-chain AI service) to submit predictions.

```clarity
;; FeePredictionOracle.clar

(define-trait ownable-trait
  (
    (get-owner () (response principal uint))
    (transfer-ownership (principal) (response bool uint))
  ))

(define-data-var owner principal tx-sender)
(define-map predicted-fees { path-id: uint } { predicted-fee: uint, timestamp: uint })

(define-public (update-prediction (path-id uint) (fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get owner)) (err u100)) ;; Only owner can update
    (map-set predicted-fees { path-id: path-id } { predicted-fee: fee, timestamp: block-height })
    (ok true)
  )
)

(define-read-only (get-prediction (path-id uint))
  (map-get? predicted-fees { path-id: path-id })
)

(define-public (transfer-ownership (new-owner principal))
  (begin
    (asserts! (is-eq tx-sender (var-get owner)) (err u100))
    (var-set owner new-owner)
    (ok true)
  )
)
```

### 2. PathRegistry.clar
Registers available transfer paths (e.g., Stacks direct, Bitcoin bridge) with metadata. Used by routing logic.

```clarity
;; PathRegistry.clar

(use-trait ownable-trait .FeePredictionOracle.ownable-trait)

(define-map paths uint { name: (string-ascii 32), target-chain: (string-ascii 32), bridge-address: principal })
(define-data-var next-path-id uint u0)
(define-data-var owner principal tx-sender)

(define-public (register-path (name (string-ascii 32)) (target-chain (string-ascii 32)) (bridge-address principal))
  (begin
    (asserts! (is-eq tx-sender (var-get owner)) (err u100))
    (let ((path-id (var-get next-path-id)))
      (map-set paths path-id { name: name, target-chain: target-chain, bridge-address: bridge-address })
      (var-set next-path-id (+ path-id u1))
      (ok path-id)
    )
  )
)

(define-read-only (get-path (path-id uint))
  (map-get? paths path-id)
)
```

### 3. RoutingEngine.clar
Core logic to select the lowest-fee path based on oracle predictions. Integrates with oracle and registry.

```clarity
;; RoutingEngine.clar

(use-trait ownable-trait .FeePredictionOracle.ownable-trait)

(define-constant ERR-NO-PREDICTION u101)
(define-constant ERR-INVALID-PATH u102)

(define-public (select-best-path (path-ids (list 10 uint)))
  (fold find-lowest-fee path-ids { best-path: u0, lowest-fee: u999999999 })
)

(define-private (find-lowest-fee (path-id uint) (acc { best-path: uint, lowest-fee: uint }))
  (match (contract-call? .FeePredictionOracle get-prediction path-id)
    prediction (let ((fee (get predicted-fee prediction)))
                 (if (< fee (get lowest-fee acc))
                     { best-path: path-id, lowest-fee: fee }
                     acc))
    acc ;; Default to current acc if no prediction
  )
)

(define-read-only (get-best-path (path-ids (list 10 uint)))
  (ok (get best-path (select-best-path path-ids)))
)
```

### 4. UserVault.clar
Holds user funds in escrow during routing. Supports deposits and withdrawals after routing.

```clarity
;; UserVault.clar

(use-trait ownable-trait .FeePredictionOracle.ownable-trait)

(define-map balances principal uint)
(define-data-var owner principal tx-sender)

(define-public (deposit (amount uint))
  (begin
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    (map-set balances tx-sender (+ (default-to u0 (map-get? balances tx-sender)) amount))
    (ok amount)
  )
)

(define-public (withdraw (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender (var-get owner)) (err u100)) ;; Only owner (or authorized) can withdraw
    (asserts! (>= (default-to u0 (map-get? balances recipient)) amount) (err u103))
    (map-set balances recipient (- (default-to u0 (map-get? balances recipient)) amount))
    (as-contract (try! (stx-transfer? amount tx-sender recipient)))
    (ok amount)
  )
)

(define-read-only (get-balance (user principal))
  (ok (default-to u0 (map-get? balances user)))
)
```

### 5. TransferExecutor.clar
Executes the transfer via the selected path, interacting with bridges or direct transfers.

```clarity
;; TransferExecutor.clar

(use-trait ownable-trait .FeePredictionOracle.ownable-trait)

(define-constant ERR-INSUFFICIENT-BALANCE u104)

(define-public (execute-transfer (user principal) (amount uint) (path-id uint) (recipient principal))
  (let ((path (unwrap! (contract-call? .PathRegistry get-path path-id) (err u102))))
    (asserts! (>= (unwrap-panic (contract-call? .UserVault get-balance user)) amount) (err u104))
    ;; Simulate bridge call (in practice, call bridge contract)
    (try! (contract-call? .UserVault withdraw amount user))
    ;; Assume bridge transfer here
    (print { event: "transfer-executed", path: path-id, amount: amount })
    (ok true)
  )
)
```

### 6. Governance.clar
Manages ownership and updates across contracts. Implements voting for parameter changes.

```clarity
;; Governance.clar

(define-trait ownable-trait
  (
    (get-owner () (response principal uint))
    (transfer-ownership (principal) (response bool uint))
  ))

(define-map proposals uint { proposer: principal, votes-for: uint, votes-against: uint, executed: bool })
(define-data-var proposal-count uint u0)
(define-data-var owner principal tx-sender)

(define-public (create-proposal)
  (let ((proposal-id (var-get proposal-count)))
    (map-set proposals proposal-id { proposer: tx-sender, votes-for: u0, votes-against: u0, executed: false })
    (var-set proposal-count (+ proposal-id u1))
    (ok proposal-id)
  )
)

(define-public (vote (proposal-id uint) (support bool))
  (match (map-get? proposals proposal-id)
    proposal (begin
               (if support
                   (map-set proposals proposal-id (merge proposal { votes-for: (+ (get votes-for proposal) u1) }))
                   (map-set proposals proposal-id (merge proposal { votes-against: (+ (get votes-against proposal) u1) })))
               (ok true))
    (err u105)
  )
)

(define-public (execute-proposal (proposal-id uint) (new-owner principal))
  (match (map-get? proposals proposal-id)
    proposal (begin
               (asserts! (> (get votes-for proposal) (get votes-against proposal)) (err u106))
               (asserts! (not (get executed proposal)) (err u107))
               (map-set proposals proposal-id (merge proposal { executed: true }))
               (try! (contract-call? .FeePredictionOracle transfer-ownership new-owner)) ;; Example action
               (ok true))
    (err u105)
  )
)
```

## Installation

1. Install Clarinet (Stacks dev tool): `cargo install clarinet`.
2. Clone repo: `git clone <repo-url>`.
3. Navigate to project: `cd ai-fee-optimizer`.
4. Deploy contracts: `clarinet deploy`.
5. Set up off-chain AI: Use Python script (in `/offchain/ai_predictor.py`) to train/feed data.

## Usage

- Deploy contracts on Stacks testnet/mainnet.
- Update oracle with AI predictions via off-chain script.
- Users interact via frontend (e.g., React dApp): Deposit STX, query paths, execute transfer.
- Example TX: Call `deposit` on UserVault, then `execute-transfer` on TransferExecutor.

## Contributing

Fork the repo, submit PRs. Focus on security audits for contracts.

## License

MIT License.