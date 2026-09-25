// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {D20VRFConsumer} from "@d20dao/vrf-sdk/contracts/D20VRFConsumer.sol";
import {ID20VRF} from "@d20dao/vrf-sdk/contracts/interfaces/ID20VRF.sol";
import {RandomnessMapping} from "@d20dao/vrf-sdk/contracts/libraries/RandomnessMapping.sol";

interface ID20Refunds {
    function refundRequest(uint256 requestId) external;
    function withdrawRefundCredit(address recipient) external;
}
interface ID20Status {
    struct Request {
        address consumer;
        uint32 callbackGasLimit;
        uint64 requestBlock;
        uint64 targetBlock;
        uint64 deadline;
        address refundAddress;
        bytes32 clientSeed;
        bytes32 mappingHash;
        bytes32 blockHash;
        bytes32 randomness;
        bytes32 proofHash;
        bytes32 transcriptHash;
        bool fulfilled;
        bool delivered;
        bool refunded;
        uint64 epochId;
        bytes32 epochHash;
    }
    function getRequest(uint256 requestId) external view returns (Request memory);
}

/// @notice Sequential 9-cell game. Arc native USDC has 18 decimals.
/// @dev Player liabilities are never used for oracle payments or owner fee withdrawals.
contract OreNine is D20VRFConsumer {
    uint256 public constant ROUND_SECONDS = 60;
    uint256 public constant DRAW_GRACE_SECONDS = 60;
    uint256 public constant FEE_BPS = 50;
    uint256 public constant BPS = 10_000;
    uint32 public constant CALLBACK_GAS = 100_000;
    uint256 public constant MIN_STAKE = 10_000; // 0.00000000000001 native USDC

    enum Status { Open, Drawing, Settled, Cancelled }
    struct Round {
        uint64 openedAt;
        uint64 closesAt;
        Status status;
        uint16 occupiedMask;
        uint8 occupiedCount;
        uint8 winner;
        uint256 requestId;
        uint256 oracleFee;
        uint256 gross;
        uint256 net;
        uint256 fees;
        uint256 claimed;
        uint256 losingRefund;
        uint256 bonus;
        uint256 participants;
        uint256 claims;
        uint256[9] cells;
    }

    ID20VRF public immutable oracle;
    address public immutable owner;
    uint256 public currentRound = 1;
    uint256 public operationsReserve;
    uint256 public withdrawableFees;
    uint256 private locked;
    mapping(uint256 => Round) private rounds;
    mapping(uint256 => mapping(address => uint256[9])) private stakes;
    mapping(uint256 => mapping(address => uint256)) public grossStake;
    mapping(uint256 => mapping(address => bool)) public claimed;
    mapping(uint256 => uint256) public requestRound;
    mapping(uint256 => bytes32) public callbackWord;

    event RoundOpened(uint256 indexed roundId, uint256 closesAt);
    event Staked(uint256 indexed roundId, address indexed player, uint8 indexed cell, uint256 gross, uint256 fee);
    event DrawRequested(uint256 indexed roundId, uint256 indexed requestId, uint256 oracleFee);
    event DrawReady(uint256 indexed roundId, uint256 indexed requestId);
    event RoundSettled(uint256 indexed roundId, uint8 winner, uint256 bonus);
    event RoundCancelled(uint256 indexed roundId);
    event Claimed(uint256 indexed roundId, address indexed player, uint256 amount);
    event OperationsFunded(address indexed sender, uint256 amount);
    event FeesWithdrawn(address indexed owner, uint256 amount);

    error WrongState();
    error TooEarly();
    error InvalidStake();
    error AlreadyClaimed();
    error NoStake();
    error TransferFailed();
    error InsufficientReserve();
    error InvalidResult();
    error Reentrant();
    error OnlyOwner();
    error InvalidWithdrawal();

    modifier nonReentrant() {
        if (locked != 0) revert Reentrant();
        locked = 1;
        _;
        locked = 0;
    }

    constructor(address coordinator) D20VRFConsumer(coordinator) {
        oracle = ID20VRF(coordinator);
        owner = msg.sender;
        _open(1);
    }

    receive() external payable {
        operationsReserve += msg.value;
        emit OperationsFunded(msg.sender, msg.value);
    }

    function fundOperations() external payable {
        operationsReserve += msg.value;
        emit OperationsFunded(msg.sender, msg.value);
    }

    /// @notice The deployer may withdraw only settled, unspent project fees.
    ///         Sponsor deposits and all pending player payouts remain locked.
    function withdrawFees(uint256 amount) external nonReentrant {
        if (msg.sender != owner) revert OnlyOwner();
        if (amount == 0 || amount > withdrawableFees) revert InvalidWithdrawal();
        withdrawableFees -= amount;
        operationsReserve -= amount;
        (bool ok,) = payable(owner).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit FeesWithdrawn(owner, amount);
    }

    function stake(uint8 cell) external payable nonReentrant {
        Round storage r = rounds[currentRound];
        if (r.status != Status.Open || block.timestamp >= r.closesAt) revert WrongState();
        if (cell >= 9 || msg.value < MIN_STAKE) revert InvalidStake();
        uint256 fee = msg.value * FEE_BPS / BPS;
        uint256 net = msg.value - fee;
        if (net == 0) revert InvalidStake();
        if (grossStake[currentRound][msg.sender] == 0) r.participants++;
        if ((r.occupiedMask & (uint16(1) << cell)) == 0) {
            r.occupiedMask |= uint16(1) << cell;
            r.occupiedCount++;
        }
        grossStake[currentRound][msg.sender] += msg.value;
        stakes[currentRound][msg.sender][cell] += net;
        r.cells[cell] += net;
        r.gross += msg.value;
        r.net += net;
        r.fees += fee;
        emit Staked(currentRound, msg.sender, cell, msg.value, fee);
    }

    /// @notice Anyone can request after cutoff; if fewer than two cells participated, cancel instead.
    function requestDraw() external nonReentrant {
        uint256 id = currentRound;
        Round storage r = rounds[id];
        if (r.status != Status.Open) revert WrongState();
        if (block.timestamp < r.closesAt) revert TooEarly();
        if (r.occupiedCount < 2 || block.timestamp >= r.closesAt + DRAW_GRACE_SECONDS) {
            _cancel(id);
            return;
        }
        uint256 fee = oracle.quoteFee(CALLBACK_GAS);
        if (operationsReserve < fee) revert InsufficientReserve();
        uint256 sponsorFunds = operationsReserve - withdrawableFees;
        operationsReserve -= fee;
        if (fee > sponsorFunds) withdrawableFees -= fee - sponsorFunds;
        r.oracleFee = fee;
        r.status = Status.Drawing;
        bytes32 seed = keccak256(abi.encode(block.chainid, address(this), id, r.occupiedMask, r.cells));
        uint256 requestId = oracle.requestMappedRandomness{value: fee}(
            seed, CALLBACK_GAS, address(this),
            RandomnessMapping.Spec(RandomnessMapping.Operation.ChooseOne, 0, 0, 1, r.occupiedCount)
        );
        r.requestId = requestId;
        requestRound[requestId] = id;
        emit DrawRequested(id, requestId, fee);
    }

    function finalize() external nonReentrant {
        uint256 id = currentRound;
        Round storage r = rounds[id];
        if (r.status != Status.Drawing) revert WrongState();
        uint256[] memory result = oracle.getMappedResult(r.requestId);
        if (result.length != 1 || result[0] >= r.occupiedCount) revert InvalidResult();
        uint8 ordinal;
        for (uint8 cell; cell < 9; ++cell) {
            if ((r.occupiedMask & (uint16(1) << cell)) != 0) {
                if (ordinal == result[0]) {
                    r.winner = cell;
                    break;
                }
                ordinal++;
            }
        }
        uint256 losers = r.net - r.cells[r.winner];
        r.losingRefund = losers * 30 / 100;
        r.bonus = losers - r.losingRefund;
        r.status = Status.Settled;
        operationsReserve += r.fees;
        withdrawableFees += r.fees;
        emit RoundSettled(id, r.winner, r.bonus);
        _open(id + 1);
    }

    /// @notice At cutoff+60, a still-unfulfilled draw or a round with <2 cells is fully refundable.
    ///         A fulfilled draw always settles with its original result, including failed callbacks.
    function cancelExpired() external nonReentrant {
        uint256 id = currentRound;
        Round storage r = rounds[id];
        if (block.timestamp < r.closesAt + DRAW_GRACE_SECONDS) revert TooEarly();
        if (r.status != Status.Open && r.status != Status.Drawing) revert WrongState();
        if (r.status == Status.Drawing && ID20Status(vrfCoordinator).getRequest(r.requestId).fulfilled)
            revert InvalidResult(); // the accepted proof must be settled, including failed callbacks
        _cancel(id);
    }

    function claim(uint256 id) external nonReentrant returns (uint256 amount) {
        Round storage r = rounds[id];
        if (r.status != Status.Settled && r.status != Status.Cancelled) revert WrongState();
        if (claimed[id][msg.sender]) revert AlreadyClaimed();
        uint256 gross = grossStake[id][msg.sender];
        if (gross == 0) revert NoStake();
        if (r.status == Status.Cancelled) {
            amount = gross;
        } else {
            uint256[9] storage mine = stakes[id][msg.sender];
            uint256 losingNet;
            for (uint8 cell; cell < 9; ++cell) {
                if (cell != r.winner) losingNet += mine[cell];
            }
            amount = mine[r.winner] + losingNet * 30 / 100
                + r.bonus * mine[r.winner] / r.cells[r.winner];
            // Assign rounding dust to the final claimant; no player funds become trapped.
            if (r.claims + 1 == r.participants) amount = r.net - r.claimed;
        }
        claimed[id][msg.sender] = true;
        r.claims++;
        r.claimed += amount;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Claimed(id, msg.sender, amount);
    }

    function roundInfo(uint256 id) external view returns (Round memory) { return rounds[id]; }
    function myStakes(uint256 id, address player) external view returns (uint256[9] memory) { return stakes[id][player]; }
    function quoteOracleFee() external view returns (uint256) { return oracle.quoteFee(CALLBACK_GAS); }

    /// @notice Recover an expired D20 request fee into the operating reserve.
    function refundExpiredOracleRequest(uint256 id) external nonReentrant {
        uint256 requestId = rounds[id].requestId;
        if (requestId == 0 || rounds[id].status != Status.Cancelled) revert WrongState();
        ID20Refunds(vrfCoordinator).refundRequest(requestId);
    }

    /// @notice Pull refunds credited by D20 when its direct transfer could not complete.
    function recoverOracleCredit() external nonReentrant {
        ID20Refunds(vrfCoordinator).withdrawRefundCredit(address(this));
    }

    function _fulfillRandomness(uint256 requestId, bytes32 word) internal override {
        uint256 id = requestRound[requestId];
        if (id == 0 || rounds[id].status != Status.Drawing) revert WrongState();
        callbackWord[requestId] = word;
        emit DrawReady(id, requestId);
    }

    function _cancel(uint256 id) internal {
        rounds[id].status = Status.Cancelled;
        emit RoundCancelled(id);
        _open(id + 1);
    }

    function _open(uint256 id) internal {
        currentRound = id;
        Round storage r = rounds[id];
        r.openedAt = uint64(block.timestamp);
        r.closesAt = uint64(block.timestamp + ROUND_SECONDS);
        r.status = Status.Open;
        emit RoundOpened(id, r.closesAt);
    }
}
