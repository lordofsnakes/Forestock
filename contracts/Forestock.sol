// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Single-manufacturer demo vault. Arc's native test USDC uses 18 decimals.
contract Forestock {
    address public immutable buyer;
    address public immutable agent;
    address public immutable supplier;
    uint256 public weeklyLimit;
    uint256 public freeBalance;
    bool public paused;
    mapping(uint256 => uint256) public committed;
    enum State {
        None,
        Held,
        Paid,
        Refunded
    }

    struct Need {
        uint256 maxTotal;
        uint256 orderBy;
        bytes32 terms;
    }

    struct Hold {
        uint256 amount;
        uint256 deadline;
        uint256 period;
        bytes32 quote;
        State state;
    }
    mapping(bytes32 => Need) public needs;
    mapping(bytes32 => Hold) public holds;

    event Held(bytes32 indexed id, uint256 amount, bytes32 quote);
    event Settled(bytes32 indexed id, State state);
    modifier onlyBuyer() {
        require(msg.sender == buyer, "buyer only");
        _;
    }

    constructor(address agent_, address supplier_, uint256 limit_) payable {
        require(agent_ != address(0) && supplier_ != address(0), "missing role");
        buyer = msg.sender;
        agent = agent_;
        supplier = supplier_;
        weeklyLimit = limit_;
        freeBalance = msg.value;
    }

    function period() public view returns (uint256) {
        return (block.timestamp + 3 days) / 1 weeks;
    }

    function deposit() external payable onlyBuyer {
        freeBalance += msg.value;
    }

    function configure(uint256 limit, bool pause) external onlyBuyer {
        weeklyLimit = limit;
        paused = pause;
    }

    function withdraw(uint256 amount) external onlyBuyer {
        freeBalance -= amount;
        sendValue(buyer, amount);
    }

    function authorize(bytes32 id, bytes32 terms, uint256 maxTotal, uint256 orderBy) external onlyBuyer {
        require(holds[id].state == State.None && terms != 0, "invalid need");
        needs[id] = Need(maxTotal, orderBy, terms);
    }

    function hold(bytes32 id, bytes32 terms, bytes32 quote, uint256 amount, uint256 quoteExpiry, uint256 deadline)
        external
    {
        Need memory need = needs[id];
        require(msg.sender == agent && !paused, "agent paused or unauthorized");
        require(holds[id].state == State.None && terms != 0 && need.terms == terms, "invalid order");
        require(amount > 0 && amount <= need.maxTotal && block.timestamp <= need.orderBy, "order limits");
        require(
            quote != 0 && block.timestamp <= quoteExpiry && deadline > block.timestamp
                && deadline <= block.timestamp + 1 days,
            "deadline"
        );
        uint256 p = period();
        require(committed[p] + amount <= weeklyLimit, "weekly limit");
        freeBalance -= amount;
        committed[p] += amount;
        holds[id] = Hold(amount, deadline, p, quote, State.Held);
        emit Held(id, amount, quote);
    }

    // The merchant submits a signed chain transaction identifying the immutable hold.
    function accept(bytes32 id, bytes32 quote) external {
        Hold storage h = holds[id];
        require(
            msg.sender == supplier && h.state == State.Held && quote == h.quote && block.timestamp < h.deadline,
            "invalid acceptance"
        );
        h.state = State.Paid;
        sendValue(supplier, h.amount);
        emit Settled(id, State.Paid);
    }

    function refund(bytes32 id) external {
        Hold storage h = holds[id];
        require(
            h.state == State.Held && (msg.sender == supplier || block.timestamp >= h.deadline), "refund unavailable"
        );
        h.state = State.Refunded;
        freeBalance += h.amount;
        committed[h.period] -= h.amount;
        emit Settled(id, State.Refunded);
    }

    function sendValue(address recipient, uint256 amount) private {
        (bool ok,) = payable(recipient).call{value: amount}("");
        require(ok, "transfer failed");
    }
}
