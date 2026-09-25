// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ID20VRF, ID20VRFConsumer} from "@d20dao/vrf-sdk/contracts/interfaces/ID20VRF.sol";
import {RandomnessMapping} from "@d20dao/vrf-sdk/contracts/libraries/RandomnessMapping.sol";
import {ID20Status} from "./OreNine.sol";

/// @dev Local tests only. Never deploy or configure this as a production oracle.
contract MockD20 is ID20VRF {
    uint256 public nextId = 1;
    uint256 public fee = 0.02 ether;
    struct Request { address consumer; uint32 population; bool fulfilled; uint256 result; }
    mapping(uint256 => Request) public requests;

    function quoteFee(uint32) external view returns (uint256) { return fee; }
    function quoteFeeAt(uint32, uint256) external view returns (uint256) { return fee; }
    function requestRandomness(bytes32, uint32, address) external payable returns (uint256) { revert("use mapped"); }
    function requestMappedRandomness(bytes32, uint32, address, RandomnessMapping.Spec calldata spec)
        external payable returns (uint256 id) {
        require(msg.value == fee && spec.operation == RandomnessMapping.Operation.ChooseOne && spec.count == 1);
        id = nextId++;
        requests[id] = Request(msg.sender, spec.population, false, 0);
    }
    function fulfill(uint256 id, uint256 selected, bool callback) external {
        Request storage r = requests[id];
        require(r.consumer != address(0) && !r.fulfilled && selected < r.population);
        r.fulfilled = true;
        r.result = selected;
        if (callback) ID20VRFConsumer(r.consumer).rawFulfillRandomness(id, bytes32(selected));
    }
    function getMappedResult(uint256 id) external view returns (uint256[] memory out) {
        require(requests[id].fulfilled, "not fulfilled");
        out = new uint256[](1);
        out[0] = requests[id].result;
    }
    function getRequest(uint256 id) external view returns (ID20Status.Request memory out) {
        Request storage r = requests[id];
        require(r.consumer != address(0), "unknown");
        out.consumer = r.consumer;
        out.fulfilled = r.fulfilled;
    }
}
