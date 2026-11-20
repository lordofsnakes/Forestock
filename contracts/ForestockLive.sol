// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Native Arc test USDC uses 18 decimals. Each buyer signs their own terms.
contract ForestockLive {
    enum Status { Missing, Watching, Held, Paid, Refunded, Cancelled, InTransit }
    struct Order {
        address buyer;
        bytes32 series;
        uint32 quantityMilli;
        uint32 capCents;
        uint64 orderBy;
        uint8 threshold;
        bool allowRecording;
        Status status;
        uint64 holdTime;
        uint64 holdBlock;
        uint64 settlementBlock;
        uint128 amount;
    }
    address public immutable agent;
    address public immutable supplier;
    mapping(address => uint256) public free;
    mapping(address => uint256) public weeklyLimit;
    mapping(address => mapping(uint256 => uint256)) public committed;
    mapping(bytes32 => Order) internal orders;
    mapping(address => bytes32[]) private buyerOrders;
    event Planned(bytes32 indexed id, address indexed buyer);
    event Held(bytes32 indexed id, uint256 amount, bytes32 evidence, bool recorded);
    event Settled(bytes32 indexed id, Status status);

    constructor(address agent_, address supplier_) {
        require(agent_ != address(0) && supplier_ != address(0), "missing role");
        agent = agent_;
        supplier = supplier_;
    }
    function week(uint256 t) public pure returns (uint256) { return (t + 3 days) / 1 weeks; }
    function configure(uint256 limit) external payable {
        weeklyLimit[msg.sender] = limit;
        free[msg.sender] += msg.value;
    }
    function withdraw(uint256 amount) external {
        free[msg.sender] -= amount;
        transferTo(msg.sender, amount);
    }
    function plan(bytes32 salt, bytes32 series, uint32 quantityMilli, uint32 capCents, uint64 orderBy,
                  uint8 threshold, bool allowRecording) external {
        bytes32 id = keccak256(abi.encode(msg.sender, salt));
        require(orders[id].status == Status.Missing && series != 0, "invalid id");
        require(quantityMilli > 0 && quantityMilli <= 500000 && capCents > 0, "invalid terms");
        require(threshold > 0 && threshold <= 100 && orderBy > block.timestamp, "invalid timing");
        Order storage o = orders[id];
        o.buyer = msg.sender;
        o.series = series;
        o.quantityMilli = quantityMilli;
        o.capCents = capCents;
        o.orderBy = orderBy;
        o.threshold = threshold;
        o.allowRecording = allowRecording;
        o.status = Status.Watching;
        buyerOrders[msg.sender].push(id);
        emit Planned(id, msg.sender);
    }
    function list(address buyer, uint256 offset, uint256 length) external view returns (bytes32[] memory ids) {
        uint256 n = buyerOrders[buyer].length;
        uint256 size = offset >= n ? 0 : n - offset;
        if (size > length) size = length;
        ids = new bytes32[](size);
        for (uint256 i; i < size; ++i) ids[i] = buyerOrders[buyer][offset + i];
    }
    function order(bytes32 id) external view returns (Order memory) { return orders[id]; }
    function changeThreshold(bytes32 id, uint8 value) external {
        Order storage o = orders[id];
        require(o.buyer == msg.sender && o.status == Status.Watching && value > 0 && value <= 100, "invalid change");
        o.threshold = value;
    }
    function cancel(bytes32 id) external {
        Order storage o = orders[id];
        require(o.buyer == msg.sender && o.status == Status.Watching, "not yours or already held");
        o.status = Status.Cancelled;
    }
    function hold(bytes32 id, uint32 unitCents, bytes32 evidence, bool recorded, uint8 expectedThreshold) external {
        Order storage o = orders[id];
        require(msg.sender == agent && o.status == Status.Watching && block.timestamp <= o.orderBy, "invalid hold");
        require(o.threshold == expectedThreshold && (!recorded || o.allowRecording), "terms changed");
        require(unitCents > 0 && unitCents <= o.capCents && evidence != 0, "quote");
        validateOffer(id, unitCents);
        uint256 cents = (uint256(o.quantityMilli) * unitCents + 500) / 1000;
        uint256 amount = (cents == 0 ? 1 : cents) * 1e16;
        uint256 p = week(block.timestamp);
        require(committed[o.buyer][p] + amount <= weeklyLimit[o.buyer], "weekly limit");
        free[o.buyer] -= amount;
        committed[o.buyer][p] += amount;
        o.amount = uint128(amount);
        o.holdTime = uint64(block.timestamp);
        o.holdBlock = uint64(block.number);
        o.status = Status.Held;
        emit Held(id, amount, evidence, recorded);
    }
    function settle(bytes32 id, bool accept) external {
        Order storage o = orders[id];
        bool expired = block.timestamp >= o.holdTime + 1 hours;
        require(o.status == Status.Held && (msg.sender == supplier || expired), "invalid settlement");
        if (accept) {
            require(!expired, "acceptance expired");
            o.status = Status.Paid;
            paySupplier(id, o);
        } else {
            o.status = Status.Refunded;
            free[o.buyer] += o.amount;
            committed[o.buyer][week(o.holdTime)] -= o.amount;
        }
        o.settlementBlock = uint64(block.number);
        emit Settled(id, o.status);
    }
    function validateOffer(bytes32, uint32) internal view virtual {}
    function paySupplier(bytes32, Order storage o) internal virtual { transferTo(supplier, o.amount); }
    function transferTo(address to, uint256 amount) private {
        (bool success,) = to.call{value: amount}("");
        require(success, "transfer failed");
    }
}
