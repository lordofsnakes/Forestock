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
    function testCannotRedirectOrReplaceBaseOffer() public {
        vm.expectRevert(); vault.selectBase("one",540,1000);
        vm.prank(address(17)); vm.expectRevert(); vault.selectBase("one",530,60000);
    }
}
