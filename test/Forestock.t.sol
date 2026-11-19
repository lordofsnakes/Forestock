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
}
