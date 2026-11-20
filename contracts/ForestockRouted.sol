// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./ForestockLive.sol";

interface IArcUSDC {
    function approve(address spender, uint256 amount) external returns (bool);
}

interface ITokenMessengerV2 {
    function depositForBurnWithHook(uint256 amount, uint32 domain, bytes32 recipient, address token,
        bytes32 destinationCaller, uint256 maxFee, uint32 finality, bytes calldata hook) external;
}

/// Each buyer can bind a new watching order to a Base Sepolia supplier offer.
/// On Arc the ERC-20 USDC interface and native balance represent the same funds.
contract ForestockRouted is ForestockLive {
    struct BaseOffer { uint32 unitCents; uint64 feeMicros; }
    mapping(bytes32 => BaseOffer) public baseOffer;
    address public immutable baseSupplier;
    IArcUSDC public immutable usdc;
    ITokenMessengerV2 public immutable messenger;
    event Burned(bytes32 indexed id, address indexed recipient, uint256 grossMicros, uint256 maxFee);

    constructor(address agent_, address supplier_, address baseSupplier_, address token_, address messenger_)
        ForestockLive(agent_, supplier_) {
        require(baseSupplier_ != address(0) && token_.code.length > 0 && messenger_.code.length > 0, "route unavailable");
        baseSupplier = baseSupplier_;
        usdc = IArcUSDC(token_);
        messenger = ITokenMessengerV2(messenger_);
    }

    function selectBase(bytes32 salt, uint32 unitCents, uint64 feeMicros) external {
        bytes32 id = keccak256(abi.encode(msg.sender, salt));
        Order storage o = orders[id];
        require(o.buyer == msg.sender && o.status == Status.Watching && baseOffer[id].unitCents == 0, "invalid route");
        require(unitCents > 0 && unitCents <= o.capCents, "offer above cap");
        uint256 cents = (uint256(o.quantityMilli) * unitCents + 500) / 1000;
        require(feeMicros > 0 && feeMicros < (cents == 0 ? 1 : cents) * 10000, "invalid fee");
        baseOffer[id] = BaseOffer(unitCents, feeMicros);
    }

    function validateOffer(bytes32 id, uint32 unitCents) internal view override {
        uint32 agreed = baseOffer[id].unitCents;
        require(agreed == 0 || agreed == unitCents, "offer changed");
    }

    function paySupplier(bytes32 id, Order storage o) internal override {
        BaseOffer memory offer = baseOffer[id];
        if (offer.unitCents == 0) {
            super.paySupplier(id, o);
            return;
        }
        uint256 grossMicros = uint256(o.amount) / 1e12;
        o.status = Status.InTransit;
        require(usdc.approve(address(messenger), grossMicros), "USDC approval failed");
        messenger.depositForBurnWithHook(grossMicros, 6, bytes32(uint256(uint160(baseSupplier))), address(usdc),
            bytes32(0), offer.feeMicros, 2000, abi.encodePacked(bytes32("cctp-forward")));
        emit Burned(id, baseSupplier, grossMicros, offer.feeMicros);
    }
}
