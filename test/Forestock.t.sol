// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "../contracts/Forestock.sol";

interface Vm {
    function deal(address, uint256) external;
    function prank(address) external;
    function warp(uint256) external;
    function expectRevert() external;
}

contract ForestockTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant agent = address(11);
    address constant supplier = address(12);
    bytes32 constant id = bytes32("copper");
    bytes32 constant terms = bytes32("100lb");
    bytes32 constant quote = bytes32("offer");
    Forestock vault;

    function setUp() public {
        vm.deal(address(this), 1000 ether);
        vault = new Forestock{value: 1000 ether}(agent, supplier, 600 ether);
        vault.authorize(id, terms, 600 ether, block.timestamp + 1 days);
    }

    function lock() internal {
        vm.prank(agent);
        vault.hold(id, terms, quote, 580 ether, block.timestamp + 30, block.timestamp + 300);
    }

    function testPayOnce() public {
        lock();
        vm.prank(supplier);
        vault.accept(id, quote);
        require(supplier.balance == 580 ether && vault.freeBalance() == 420 ether);
        vm.expectRevert();
        vm.prank(supplier);
        vault.accept(id, quote);
    }

    function testExpiryAcrossWeek() public {
        lock();
        uint256 old = vault.period();
        vm.warp(block.timestamp + 8 days);
        vault.refund(id);
        require(vault.freeBalance() == 1000 ether && vault.committed(old) == 0);
        vm.expectRevert();
        vm.prank(supplier);
        vault.accept(id, quote);
    }

    function testBudgetAcrossOrders() public {
        lock();
        bytes32 other = bytes32("second");
        vault.authorize(other, terms, 100 ether, block.timestamp + 300);
        vm.expectRevert();
        vm.prank(agent);
        vault.hold(other, terms, quote, 21 ether, block.timestamp + 30, block.timestamp + 300);
    }

    function testPauseAndUnauthorized() public {
        vault.configure(600 ether, true);
        vm.expectRevert();
        lock();
        vault.configure(600 ether, false);
        lock();
        vm.expectRevert();
        vault.accept(id, quote);
    }

    receive() external payable {}

    function testDepositAndWithdrawUncommittedFunds() public {
        lock();
        vault.withdraw(420 ether);
        require(vault.freeBalance() == 0 && address(vault).balance == 580 ether);
        vault.deposit{value: 100 ether}();
        require(vault.freeBalance() == 100 ether && vault.committed(vault.period()) == 580 ether);
    }

    function testSupplierDeclineRestoresAllowanceOnce() public {
        lock();
        vm.prank(supplier);
        vault.refund(id);
        require(vault.freeBalance() == 1000 ether && vault.committed(vault.period()) == 0);
        vm.expectRevert();
        vm.prank(supplier);
        vault.refund(id);
    }

    function testPendingOrderCanSettleWhilePaused() public {
        lock();
        vault.configure(600 ether, true);
        vm.prank(supplier);
        vault.accept(id, quote);
        require(supplier.balance == 580 ether);
    }

    function testBuyerOnlyMandateAndPaymentBoundToQuote() public {
        vm.expectRevert();
        vm.prank(agent);
        vault.configure(10000 ether, false);
        lock();
        vm.expectRevert();
        vm.prank(supplier);
        vault.accept(id, bytes32("other quote"));
        vm.expectRevert();
        vault.refund(id);
        vm.warp(block.timestamp + 300);
        vm.expectRevert();
        vm.prank(supplier);
        vault.accept(id, quote);
        vault.refund(id);
    }
}
