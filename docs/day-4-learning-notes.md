# Ethereum & Solidity Learning Notes

## Table of Contents

### Morning — The Language and the Machine
1. EVM
2. Transaction Cost and Gas
3. Storage, Memory, and Calldata
4. Solidity Data Types
5. Function Visibility and `view`
6. `require`, Custom Errors, and Reverts
7. `msg.sender` and `tx.origin`
8. `block.timestamp`
9. Events and `indexed`
10. Constructor, `immutable`, and `constant`
11. Access Control

### Afternoon — Toolchain and Backend Integration
12. Compiling Contracts and ABI
13. Writing and Running Contract Tests
14. Local Hardhat Network
15. Nonce
16. Backend Transactions and `view` Calls
17. Transaction Receipts and Confirmations
18. Chain Reorganisations
19. Reading Historical Events
20. `keccak256`
21. Private Key Storage
22. Public Test Networks

---

# Part 1 — Morning: The Language and the Machine

## 1. EVM

### What is the EVM?

**EVM** stands for **Ethereum Virtual Machine**.

The EVM is the execution environment that runs smart contracts on Ethereum.

### Why do nodes execute contract code?

Full validating nodes independently process transactions using the same Ethereum/EVM rules.

This allows nodes to verify blockchain state changes without trusting a central server or block producer.

### Basic Flow

```text
Write Solidity
      ↓
Compile Contract
      ↓
EVM Bytecode
      ↓
Deploy Transaction
      ↓
Contract Exists on Ethereum
      ↓
User Sends Transaction
      ↓
Transaction Included in Block
      ↓
EVM Executes Contract Code
      ↓
State Changes
      ↓
Nodes Verify Result
```

### Key Point

> The EVM is the environment responsible for executing Ethereum smart-contract bytecode.

---

## 2. Transaction Cost and Gas

### What is Gas?

Gas is a unit used to measure how much computational work the EVM performs.

### Transaction Cost

Conceptually:

```text
Transaction Cost
      =
Gas Used × Effective Gas Price
```

### Who Pays?

The account that sends the transaction pays the transaction fee.

### What is the Gas Limit?

The gas limit controls the maximum amount of gas the transaction is allowed to consume.

```text
Transaction
     ↓
EVM Execution
     ↓
Consumes Gas
     ↓
Gas Limit Reached?
     ↓
    Yes
     ↓
Out of Gas
     ↓
Transaction Reverts
```

If execution runs out of gas:

- Execution stops.
- The transaction fails/reverts.
- Partial state changes are not kept.
- Gas already consumed is still charged.

### Key Point

> Gas measures EVM work, and the transaction sender pays for that work.

---

## 3. `storage`, `memory`, and `calldata`

### `storage`

Permanent contract data.

```solidity
uint256 public count;
```

The value becomes part of the contract's persistent state.

### `memory`

Temporary working data used while a function is executing.

It disappears after the function finishes.

### `calldata`

Read-only input data supplied to an external function.

Example:

```solidity
function createUser(string calldata name) external {
    // use name
}
```

### Comparison

| Type | Lifetime | Writable? | Main Purpose |
|---|---|---:|---|
| `storage` | Persistent | Yes | Contract state |
| `memory` | Function execution | Yes | Temporary working data |
| `calldata` | Function call | No | External function input |

### Why is Storage Expensive?

Storage writes modify Ethereum's persistent blockchain state.

```text
storage
   ↓
Permanent State
   ↓
Must Be Maintained as Blockchain State
   ↓
More Expensive
```

### Key Point

> `storage` is permanent, `memory` is temporary, and `calldata` is read-only function input.

---

## 4. Important Solidity Data Types

### `address`

Represents an Ethereum account or smart-contract address.

```solidity
address public owner;
```

### `uint256`

An unsigned 256-bit integer.

```solidity
uint256 public balance;
```

It cannot represent negative numbers.

### `bytes32`

Stores exactly 32 bytes.

```solidity
bytes32 public hash;
```

### `mapping`

Stores key-value relationships.

```solidity
mapping(address => uint256) public balances;
```

Conceptually:

```text
Alice Address → 100
Bob Address   → 250
John Address  → 75
```

### `struct`

Creates a custom data structure by grouping values.

```solidity
struct User {
    address wallet;
    string name;
    uint256 age;
}
```

### Key Point

```text
address  → Ethereum address
uint256  → Non-negative integer
bytes32  → 32 bytes
mapping  → Key/value storage
struct   → Custom grouped data
```

---

## 5. Function Visibility and `view`

### `public`

Can be called from outside or inside the contract.

```solidity
function setNumber(uint256 number) public {
    value = number;
}
```

### `external`

Primarily designed to be called from outside the contract.

```solidity
function deposit() external {
    // ...
}
```

### `internal`

Can be called by:

- The current contract
- Contracts that inherit from it

```solidity
function calculateFee(
    uint256 amount
) internal pure returns (uint256) {
    return amount / 100;
}
```

### `private`

Can only be called from the contract where it is defined.

`private` does **not** mean secret on a public blockchain.

### `view`

A `view` function can read state but cannot modify it.

```solidity
function getBalance() external view returns (uint256) {
    return balance;
}
```

### Read vs Write

```text
VIEW
 ↓
Read State
 ↓
No State Change


WRITE
 ↓
Execute Transaction
 ↓
Change State
```

---

## 6. `require`, Custom Errors, and Reverts

### `require`

`require` means:

> This condition must be true. Otherwise, stop execution and revert.

```solidity
function withdraw(uint256 amount) external {
    require(
        amount > 0,
        "Amount must be greater than zero"
    );

    // continue...
}
```

### Custom Error

```solidity
error InvalidAmount();

function withdraw(uint256 amount) external {
    if (amount == 0) {
        revert InvalidAmount();
    }
}
```

Custom errors are useful for structured and gas-efficient error handling.

### What Happens During a Revert?

```text
Execute Transaction
      ↓
Something Fails
      ↓
Revert
      ↓
State Changes Undone
```

Gas already consumed by execution is not returned.

Unused gas is generally not consumed merely because the transaction reverted.

### Key Point

> A revert undoes state changes, but it does not undo the computational work that already consumed gas.

---

## 7. `msg.sender` and `tx.origin`

### `msg.sender`

`msg.sender` is the address that directly called the current contract/function.

### `tx.origin`

`tx.origin` is the original externally owned account that started the transaction.

Example:

```text
Alice
  ↓
Contract A
  ↓
Contract B
```

Inside Contract A:

```text
msg.sender = Alice
tx.origin  = Alice
```

Inside Contract B:

```text
msg.sender = Contract A
tx.origin  = Alice
```

Notice:

```text
msg.sender changes.

tx.origin remains Alice.
```

### Why Not Use `tx.origin` for Access Control?

An intermediate malicious contract could potentially cause a user to initiate a call chain.

Access-control checks should therefore normally use `msg.sender`.

```solidity
require(msg.sender == owner);
```

### Key Point

> Use `msg.sender` for normal caller-based authorization. Do not use `tx.origin` as an access-control check.

---

## 8. `block.timestamp`

`block.timestamp` is the timestamp associated with the block in which the transaction executes.

It is represented as a Unix timestamp in seconds.

```solidity
require(
    block.timestamp >= unlockTime,
    "Still locked"
);
```

### Common Uses

- Deadlines
- Time locks
- Expiration logic

### Do Not Treat It As

- An exact trusted clock
- A source of randomness
- A secret value

### Key Point

> `block.timestamp` is useful for approximate blockchain time conditions, but it should not be treated as an exact trusted clock.

---

## 9. Events and `indexed`

### Event

Events create transaction logs that off-chain applications can observe.

```solidity
event Deposited(
    address user,
    uint256 amount
);
```

Emit it:

```solidity
emit Deposited(msg.sender, 100);
```

### `indexed`

`indexed` makes selected event parameters efficiently searchable/filterable.

```solidity
event Transfer(
    address indexed from,
    address indexed to,
    uint256 amount
);
```

### Storage vs Events

| Storage | Event |
|---|---|
| Persistent contract state | Transaction log |
| Contracts can read it later | Mainly used by off-chain systems |
| More expensive | Usually cheaper |
| Used for application state | Used for observation/history |

### Key Point

> Storage changes persistent contract state. Events write logs primarily intended for off-chain consumers.

---

## 10. Constructor, `immutable`, and `constant`

### Constructor

Runs once when the contract is deployed.

```solidity
constructor() {
    owner = msg.sender;
}
```

### `immutable`

Can be assigned during contract creation and cannot be changed afterward.

```solidity
address public immutable owner;

constructor() {
    owner = msg.sender;
}
```

### `constant`

Fixed in the source code.

```solidity
uint256 public constant MAX_USERS = 100;
```

### Comparison

| Feature | When Assigned | Can Change Later? |
|---|---|---:|
| Normal state variable | Runtime | Yes |
| `immutable` | Construction | No |
| `constant` | Source/compile time | No |

---

## 11. Access Control

### Owner Pattern

One privileged authority.

```solidity
address public owner;

modifier onlyOwner() {
    require(msg.sender == owner, "Not owner");
    _;
}
```

Useful for simpler contracts.

### Role Pattern

Different accounts receive different permissions.

```text
ADMIN_ROLE
MINTER_ROLE
EDITOR_ROLE
```

Useful for larger systems.

### Comparison

| Owner | Roles |
|---|---|
| One main authority | Multiple permission groups |
| Simple | Flexible |
| `onlyOwner` style | `onlyRole` style |
| Smaller contracts | Larger systems |

---

# Part 2 — Afternoon: Toolchain and Backend Integration

## 12. Compiling Contracts and ABI

Ethereum cannot directly execute Solidity source code.

```text
Solidity Source
      ↓
Solidity Compiler
      ↓
 ┌────┴────┐
 ↓         ↓
Bytecode   ABI
```

### Bytecode

Machine-level instructions understood by the EVM.

### ABI

ABI stands for:

> **Application Binary Interface**

The ABI describes how external programs communicate with the contract.

It describes things such as:

- Function names
- Input parameters
- Output types
- Events
- Errors

### Mental Model

```text
Bytecode
   ↓
What the EVM executes


ABI
   ↓
How applications communicate with the contract
```

---

## 13. Writing and Running a Smart Contract Test

A smart-contract test verifies that your Solidity contract behaves as expected.

For example, if we have:

```solidity
contract Counter {
    uint256 public count;

    function increment() external {
        count++;
    }
}
```

A test should verify:

```text
Initial count = 0
      ↓
Call increment()
      ↓
Expected count = 1
```

Typical Hardhat projects run tests with a command such as:

```bash
npx hardhat test
```

### Important

A **smart-contract test** is different from a **service/API contract test**.

Here we are testing Solidity contract behaviour.

---

## 14. Running a Local Hardhat Network

A local Hardhat network is a development Ethereum blockchain running on your computer.

Benefits:

- Fake ETH
- Fast transactions
- No real money
- Easy testing
- Easy reset

### Step 1 — Create Project

```bash
mkdir hardhat-demo
cd hardhat-demo
npm init -y
npm install --save-dev hardhat
npx hardhat --init
```

### Step 2 — Write Contract

Create your Solidity contract.

### Step 3 — Compile

```bash
npx hardhat compile
```

### Step 4 — Start Local Network

```bash
npx hardhat node
```

Typical RPC endpoint:

```text
http://127.0.0.1:8545
```

### Step 5 — Deploy

In another terminal:

```bash
npx hardhat ignition deploy ignition/modules/Counter.ts --network localhost
```

### Flow

```text
Write Contract
     ↓
Compile
     ↓
Start Hardhat Node
     ↓
Deploy Contract
     ↓
Interact with Contract
```

---

## 15. Nonce

A nonce is a sequence number associated with transactions sent from an Ethereum account.

Example:

```text
Transaction A → nonce 0
Transaction B → nonce 1
Transaction C → nonce 2
Transaction D → nonce 3
```

### Why Is It Important?

It helps:

- Order transactions from an account
- Prevent replay of already-used transaction nonces

### Two Backend Processes

```text
             Same Wallet
                 │
        ┌────────┴────────┐
        ↓                 ↓
   Process A          Process B
        ↓                 ↓
   nonce = 10         nonce = 10
        └────────┬────────┘
                 ↓
           Nonce Conflict
```

Possible problems include:

```text
nonce too low
already known
replacement-related errors
```

Multiple processes using one wallet therefore need coordinated nonce management.

---

# 16. Backend Transactions and `view` Calls

## Basic Idea

Consider:

```solidity
contract Counter {
    uint256 public count;

    function increment() public {
        count++;
    }

    function getCount()
        public
        view
        returns (uint256)
    {
        return count;
    }
}
```

There are two fundamentally different operations.

### Write

```text
increment()
    ↓
Changes count
    ↓
Transaction
```

### Read

```text
getCount()
    ↓
Reads count
    ↓
eth_call
```

> **Transaction = change blockchain state.**

> **View call = read blockchain state without changing it.**

---

## Backend Architecture

```text
Node.js Backend
      ↓
ethers.js / viem
      ↓
JSON-RPC
      ↓
Ethereum Node
      ↓
Ethereum Network
      ↓
Smart Contract
```

The backend normally needs:

```text
RPC URL
Contract Address
ABI
```

For state-changing transactions it additionally needs a signer/wallet capable of authorizing the transaction.

---

## Sending a Transaction

Example:

```typescript
const tx = await contract.increment();
const receipt = await tx.wait();
```

Behind the scenes:

```text
Backend
   ↓
increment()
   ↓
ABI Encode
   ↓
Build Transaction
   ↓
Set Nonce
   ↓
Estimate / Set Gas
   ↓
Set Transaction Fees
   ↓
Sign with Private Key
   ↓
Send Through JSON-RPC
   ↓
Ethereum Node
   ↓
Ethereum Network
   ↓
Pending
   ↓
Included in Block
   ↓
EVM Executes
   ↓
Blockchain State Changes
   ↓
Transaction Receipt
```

---

## ABI Encoding

Ethereum does not receive:

```text
increment()
```

as normal text.

The library converts the call into bytes.

```text
increment()
     ↓
ABI Encoding
     ↓
0xd09de08a
```

For a function with parameters:

```solidity
function setCount(uint256 newCount) public {
    count = newCount;
}
```

Calling:

```typescript
await contract.setCount(100);
```

conceptually becomes:

```text
setCount(100)
      ↓
Function Selector
      +
Encoded Argument
      ↓
Ethereum Bytes
```

---

## Function Selector

Ethereum identifies a function using its selector.

```text
Function Signature
       ↓
Keccak-256
       ↓
Hash
       ↓
First 4 Bytes
       ↓
Function Selector
```

For:

```solidity
increment()
```

the selector is:

```text
0xd09de08a
```

---

## Transaction Structure

Conceptually:

```text
{
    from: sender,
    to: contractAddress,
    data: encodedFunctionCall,
    nonce: transactionNonce,
    gas: gasLimit,
    fee: transactionFeeParameters
}
```

Important fields:

| Field | Purpose |
|---|---|
| `from` | Sender |
| `to` | Contract |
| `data` | Encoded function call |
| `nonce` | Transaction sequence |
| `gas` | Execution limit |
| Fee parameters | Transaction pricing |
| Signature | Authorization |

---

## Signing

```text
Transaction
     +
Private Key
     ↓
Digital Signature
     ↓
Signed Transaction
```

The private key itself is not sent to Ethereum.

```text
Private Key
     ↓
Signs Locally
     ↓
Signed Transaction
     ↓
Ethereum Network
```

---

## Calling a `view` Function

Example:

```typescript
const count = await contract.getCount();
```

The flow is:

```text
Backend
   ↓
getCount()
   ↓
ABI Encode
   ↓
eth_call
   ↓
Ethereum Node
   ↓
EVM Executes Against Existing State
   ↓
Read Storage
   ↓
Encoded Result
   ↓
ABI Decode
   ↓
Backend Receives Value
```

### `eth_call`

`eth_call` asks an Ethereum node to execute a call against blockchain state and return the result without submitting a normal state-changing blockchain transaction.

Therefore:

```text
Private Key Required?     Usually No
Transaction Created?      No normal transaction
Block Inclusion?          No
Transaction Fee Paid?     No
State Changed?            No
```

---

## Transaction vs `view`

| Feature | Transaction | `view` Call |
|---|---|---|
| Example | `increment()` | `getCount()` |
| Purpose | Write | Read |
| State changes | Yes | No |
| Private key | Required to authorize normal wallet transaction | Usually not |
| Transaction signature | Yes | No normal transaction signature |
| Transaction fee | Yes | No on-chain transaction fee |
| Block inclusion | Yes | No |
| Transaction hash | Yes | No normal transaction hash |
| Receipt | Yes | No |
| Typical RPC | `eth_sendRawTransaction` | `eth_call` |

### Easy Memory Trick

```text
WRITE:

Backend
  ↓
Encode
  ↓
Build
  ↓
Sign
  ↓
Send
  ↓
Block
  ↓
EVM
  ↓
Change State
  ↓
Receipt
```

```text
READ:

Backend
  ↓
Encode
  ↓
eth_call
  ↓
Node
  ↓
EVM Read
  ↓
Decode
  ↓
Result
```

---

# 17. Transaction Receipt and Confirmations

## Transaction Receipt

A transaction receipt is the execution result/report associated with an included transaction.

It can contain information such as:

- Transaction status
- Transaction hash
- Block number
- Gas used
- Logs/events

### Flow

```text
Backend
   ↓
Create Transaction
   ↓
Sign
   ↓
Send
   ↓
Pending
   ↓
Included in Block
   ↓
EVM Executes
   ↓
Transaction Receipt
```

## Confirmation

A confirmation describes how deeply the transaction's block is buried under subsequently built blocks.

Conceptually:

```text
Block 100
└── Your Transaction

Block 101
└── Additional confirmation

Block 102
└── More depth

Block 103
└── More depth
```

More confirmations generally mean less exposure to a shallow chain reorganisation.

---

# 18. Chain Reorganisation

A chain reorganisation, or **reorg**, occurs when recently accepted blocks are replaced by another chain that becomes canonical.

### Example

```text
Initially:

100 → 101A → 102A
              ↑
          Your Event
```

Later:

```text
Canonical Chain:

100 → 101B → 102B → 103B
```

If your event existed only in the replaced block, it may no longer exist in canonical history.

### Important Backend Flow

```text
Event Emitted
     ↓
Backend Reads Event
     ↓
Observed ≠ Necessarily Final
     ↓
Reorg Could Occur
     ↓
Wait / Check Finality
     ↓
Perform Important Action
```

### Key Point

> Reading an event does not automatically mean that event is final forever.

---

# 19. Reading Historical Events by Block Range

Consider:

```solidity
contract Todo {
    event TodoCreated(
        uint256 indexed todoId,
        address indexed owner,
        string title
    );

    function createTodo(
        uint256 id,
        string calldata title
    ) external {
        emit TodoCreated(
            id,
            msg.sender,
            title
        );
    }
}
```

Events may exist across many blocks:

```text
Block 1000   → TodoCreated
Block 1001   → Nothing
Block 1002   → TodoCreated
Block 1003   → TodoCreated
...
Block 900000 → TodoCreated
```

Instead of requesting the entire history at once, query ranges.

```text
1000 → 2000
2001 → 3000
3001 → 4000
4001 → 5000
...
```

### Why Page the Requests?

Large log queries can:

- Be expensive for nodes
- Return huge responses
- Exceed provider block-range limits
- Exceed result limits
- Time out

Therefore:

```text
Huge Historical Query
        ↓
Split into Block Ranges
        ↓
Request Page 1
        ↓
Process Results
        ↓
Request Page 2
        ↓
Process Results
        ↓
Continue
```

### Key Point

> Page historical event queries so each RPC request handles a manageable block range.

---

# 20. `keccak256`

`keccak256` is a cryptographic hash function heavily used in Ethereum.

It produces a:

```text
256-bit
=
32-byte
```

hash.

Example:

```solidity
bytes32 hash = keccak256(
    abi.encode("1234")
);
```

### Important Security Problem

You might think:

```text
Attacker cannot reverse the hash
        ↓
Attacker cannot discover "1234"
```

That reasoning is unsafe when the original value is guessable.

An attacker can do:

```text
Guess "0000"
     ↓
Hash
     ↓
Compare

Guess "0001"
     ↓
Hash
     ↓
Compare

...

Guess "1234"
     ↓
Hash
     ↓
MATCH
```

This is a dictionary/brute-force style attack.

### Key Point

> Hashing a predictable or low-entropy secret does not automatically hide it.

---

# 21. Private Key Storage

A private key allows an application to sign blockchain transactions.

If someone obtains it, they may be able to act as that account.

## Never Put a Private Key In

```text
Source Code
Git Repository
GitHub
Logs
Frontend Code
Public Configuration
Documentation
```

Bad:

```typescript
const PRIVATE_KEY = "0xSECRET...";
```

Better architecture:

```text
Backend Application
       ↓
Secure Secret Source
       ↓
Private Key Available at Runtime
       ↓
Sign Transaction
       ↓
Ethereum
```

Depending on the environment, secrets may be supplied through a properly secured secret-management system or protected runtime configuration.

### Key Point

> The private key should never be committed to your repository.

---

# 22. Public Test Networks

A public test network, or **testnet**, is a blockchain network designed for development and testing without using real mainnet funds.

A common Ethereum testnet is **Sepolia**.

### Development Flow

```text
Write Contract
      ↓
Test Locally
      ↓
Deploy to Public Testnet
      ↓
Test with Test ETH
      ↓
Find Bugs
      ↓
Fix Bugs
      ↓
Test Again
      ↓
Deploy to Mainnet
```

## Testnet ETH vs Mainnet ETH

They belong to different blockchain networks.

```text
Ethereum Mainnet
      ↓
Mainnet ETH
      ↓
Real economic value
```

```text
Sepolia
   ↓
Sepolia ETH
   ↓
Testing currency
```

Even when using the same wallet address:

```text
Mainnet Balance ≠ Sepolia Balance
```

## Where Does Test ETH Come From?

Usually from a **faucet**.

```text
Developer
    ↓
Requests Test ETH
    ↓
Faucet
    ↓
Faucet Wallet
    ↓
Sends Testnet ETH
    ↓
Developer Wallet
```

Testnet currency is intended for development/testing rather than real-world payment or investment.

---

# Final Revision Summary

## Solidity

```text
EVM
Gas
storage / memory / calldata
address / uint256 / bytes32
mapping / struct
Function visibility
require / revert
msg.sender
block.timestamp
Events
constructor
immutable / constant
Access control
```

## Development Toolchain

```text
Solidity
   ↓
Compiler
   ↓
Bytecode + ABI
   ↓
Hardhat
   ↓
Local Network
   ↓
Tests
   ↓
Deployment
```

## Backend Integration

```text
Backend
   ↓
ethers.js / viem
   ↓
ABI
   ↓
JSON-RPC
   ↓
Ethereum Node
   ↓
Smart Contract
```

## Write Operation

```text
Backend
   ↓
ABI Encode
   ↓
Build Transaction
   ↓
Nonce
   ↓
Gas + Fees
   ↓
Sign
   ↓
Send
   ↓
Block
   ↓
EVM
   ↓
State Change
   ↓
Receipt
```

## Read Operation

```text
Backend
   ↓
ABI Encode
   ↓
eth_call
   ↓
Ethereum Node
   ↓
EVM Read
   ↓
ABI Decode
   ↓
Result
```

## Event Processing

```text
Smart Contract
      ↓
Emit Event
      ↓
Transaction Log
      ↓
Backend Reads Event
      ↓
Wait for Required Finality
      ↓
Process Important Action
```

## Historical Events

```text
Start Block
    ↓
Read Small Block Range
    ↓
Process Events
    ↓
Save Progress
    ↓
Next Block Range
    ↓
Repeat
```

---

# Quick Memory Sheet

| Concept | Remember |
|---|---|
| EVM | Executes smart-contract bytecode |
| Gas | Measures computational work |
| Storage | Permanent blockchain state |
| Memory | Temporary function data |
| Calldata | Read-only call input |
| ABI | Describes contract interface |
| Bytecode | EVM-executable code |
| Nonce | Transaction sequence |
| `msg.sender` | Direct caller |
| Event | Transaction log |
| `indexed` | Makes event fields filterable |
| Transaction | Changes state |
| `view` | Reads state |
| `eth_call` | RPC method commonly used for reads |
| Receipt | Transaction execution report |
| Confirmation | Transaction/block depth |
| Reorg | Recent canonical blocks replaced |
| `keccak256` | 256-bit Ethereum hash function |
| Private key | Authorizes/signs transactions |
| Testnet | Public development blockchain |
| Faucet | Source of testnet currency |

---

# Most Important Mental Model

```text
                    ETHEREUM APPLICATION

                          Backend
                             │
                    ethers.js / viem
                             │
                          JSON-RPC
                             │
                       Ethereum Node
                             │
             ┌───────────────┴───────────────┐
             │                               │
             ▼                               ▼
          WRITE                            READ
       Transaction                       eth_call
             │                               │
             ▼                               ▼
       Sign Transaction                 Execute Read
             │                               │
             ▼                               ▼
       Ethereum Network                    Result
             │
             ▼
           Block
             │
             ▼
            EVM
             │
             ▼
       State Changes
             │
             ▼
          Receipt
```

> **The central idea: A transaction changes blockchain state, while a `view` call reads blockchain state without changing it.**




**Practice — throwaway, committed, and it does not have to be good**

23. Write a contract with one `struct`, one `mapping`, one function that writes, one `view`
    that reads, and one event. Deploy it to a local Hardhat network. Call it from a Node
    script. Read the event back.
24. Deploy that same practice contract to a public test network, get the coin from a faucet,
    and send one transaction to it. Write down how long it took to confirm. You will need
    this for BC-5 and BC-9.
25. Send the same transaction from two scripts at the same time, using the same account,
    and write down exactly what happened. You will need this for BC-12.
26. Measure the gas of your write function with one record stored, and again with a
    thousand. Write both numbers down. You will need this for BC-16.