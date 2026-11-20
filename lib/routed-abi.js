import { parseAbi } from "viem";
export const routeAbi = parseAbi([
  "function baseOffer(bytes32) view returns (uint32 unitCents,uint64 feeMicros)",
  "function baseSupplier() view returns (address)",
  "function selectBase(bytes32 salt,uint32 unitCents,uint64 feeMicros)",
  "event Burned(bytes32 indexed id,address indexed recipient,uint256 grossMicros,uint256 maxFee)",
]);
