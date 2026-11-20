// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "../contracts/ForestockLive.sol";
import {Vm} from "./Forestock.t.sol";
contract LiveEscrowTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant agent = address(11);
    address constant supplier = address(12);
    address constant buyer = address(13);
    ForestockLive vault;
    bytes32 id;
    function setUp() public {
        vault = new ForestockLive(agent, supplier);
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        vault.configure{value: 1 ether}(0.06 ether);
        vm.prank(buyer);
        vault.plan("salt", "COPPER", 10, 600, uint64(block.timestamp + 1 days), 30, false);
        id = keccak256(abi.encode(buyer, bytes32("salt")));
    }
    function hold() internal { vm.prank(agent); vault.hold(id, 580, "evidence", false, 30); }
    function testRealFundsAndSeparateRoles() public {
        vm.expectRevert(); vault.hold(id, 580, "x", false, 30);
        vm.prank(agent); vm.expectRevert(); vault.hold(id, 580, "x", true, 30);
        vm.prank(agent); vm.expectRevert(); vault.hold(id, 601, "x", false, 30);
        hold();
        require(vault.free(buyer) == 0.94 ether && vault.order(id).amount == 0.06 ether);
        vm.prank(agent); vm.expectRevert(); vault.settle(id, true);
        vm.prank(supplier); vault.settle(id, true);
        require(supplier.balance == 0.06 ether);
        vm.prank(supplier); vm.expectRevert(); vault.settle(id, true);
    }
    function testWeeklyCapAndRefund() public {
        vm.prank(buyer); vault.configure(0.05 ether);
        vm.expectRevert(); hold();
        vm.prank(buyer); vault.configure(0.06 ether);
        hold();
        uint256 period = vault.week(block.timestamp);
        vm.warp(block.timestamp + 8 days);
        vault.settle(id, false);
        require(vault.free(buyer) == 1 ether && vault.committed(buyer, period) == 0);
        vm.prank(buyer); vault.withdraw(1 ether);
        require(buyer.balance == 1 ether);
    }
    function testTermsAreOwnedByBuyer() public {
        vm.expectRevert(); vault.changeThreshold(id, 1);
        vm.prank(buyer); vault.changeThreshold(id, 40);
        vm.expectRevert(); hold();
        vm.prank(buyer); vault.cancel(id);
        vm.prank(agent); vm.expectRevert(); vault.hold(id, 580, "x", false, 40);
    }
}
