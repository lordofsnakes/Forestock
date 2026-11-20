// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {ForestockRouted, IArcUSDC, ITokenMessengerV2} from "../contracts/ForestockRouted.sol";
import {ForestockLive} from "../contracts/ForestockLive.sol";
import {Vm} from "./Forestock.t.sol";

contract RoutedTest is IArcUSDC, ITokenMessengerV2 {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    ForestockRouted vault;
    address constant recipient = address(135);
    bytes32 id;
    uint256 approved;
    bool fail;
    bool burned;
    function setUp() public {
        vault = new ForestockRouted(address(this),address(this),recipient,address(this),address(this));
        vm.deal(address(this),2 ether);
        vault.configure{value:1 ether}(1 ether);
        vault.plan("one","COPPER",100,600,uint64(block.timestamp+1 days),10,false);
        vault.selectBase("one",530,60000);
        id = keccak256(abi.encode(address(this),bytes32("one")));
    }
    function approve(address spender,uint256 amount) external returns(bool) {
        require(msg.sender==address(vault) && spender==address(this)); approved=amount; return true;
    }
    function depositForBurnWithHook(uint256 amount,uint32 domain,bytes32 to,address token,bytes32 caller,uint256 fee,uint32 finality,bytes calldata hook) external {
        require(!fail && msg.sender==address(vault));
        require(amount==530000 && approved==amount && fee==60000 && domain==6);
        require(to==bytes32(uint256(uint160(recipient))) && token==address(this) && caller==0 && finality==2000);
        require(keccak256(hook)==keccak256(abi.encodePacked(bytes32("cctp-forward"))));
        approved=0;
        burned=true;
    }
    function testBoundPayoutAndRetry() public {
        vm.expectRevert(); vault.hold(id,510,"evidence",false,10);
        vm.expectRevert(); vault.hold(id,530,"evidence",false,50);
        vault.hold(id,530,"evidence",false,10);
        fail=true;
        vm.expectRevert(); vault.settle(id,true);
        require(vault.order(id).status==ForestockLive.Status.Held && approved==0);
        fail=false;
        vault.settle(id,true);
        require(burned && vault.order(id).status==ForestockLive.Status.InTransit);
        vm.expectRevert(); vault.settle(id,true);
        require(vault.free(address(this))==0.47 ether);
    }
    // Run the same three calls that the buyer signs in one smart-account batch.
    function switchSupplier(ForestockLive original, bytes32 previous, uint32 unitCents) external {
        ForestockLive.Order memory terms = original.order(previous);
        original.cancel(previous);
        vault.plan("replacement",terms.series,terms.quantityMilli,terms.capCents,terms.orderBy,terms.threshold,terms.allowRecording);
        vault.selectBase("replacement",unitCents,60000);
    }
    function testSwitchKeepsOriginalWhenTheBaseOfferFails() public {
        ForestockLive original = new ForestockLive(address(this),address(this));
        original.plan("earlier","COPPER",100,600,uint64(block.timestamp+1 days),38,true);
        bytes32 previous = keccak256(abi.encode(address(this),bytes32("earlier")));
        bytes32 replacement = keccak256(abi.encode(address(this),bytes32("replacement")));

        vm.expectRevert(); this.switchSupplier(original,previous,601);
        require(original.order(previous).status==ForestockLive.Status.Watching);
        require(vault.order(replacement).status==ForestockLive.Status.Missing);

        this.switchSupplier(original,previous,530);
        require(original.order(previous).status==ForestockLive.Status.Cancelled);
        ForestockLive.Order memory order = vault.order(replacement);
        require(order.status==ForestockLive.Status.Watching && order.quantityMilli==100 && order.threshold==38 && order.allowRecording);
        require(order.orderBy==original.order(previous).orderBy && order.capCents==600);
        vm.expectRevert(); this.switchSupplier(original,previous,530);
    }
    function testCannotRedirectOrReplaceBaseOffer() public {
        vm.expectRevert(); vault.selectBase("one",540,1000);
        vm.prank(address(17)); vm.expectRevert(); vault.selectBase("one",530,60000);
    }
}
