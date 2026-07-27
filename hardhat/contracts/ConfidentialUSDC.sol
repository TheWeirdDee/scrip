// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {ERC20ToERC7984Wrapper} from "@iexec-nox/nox-confidential-contracts/contracts/token/extensions/ERC20ToERC7984Wrapper.sol";

/// Phase 1: real Sepolia USDC wraps 1:1 into a Nox-confidential ERC-7984 token.
/// This is the confidential token Scrip pays owners in (Phase 3), fed by 0xSplits'
/// public total (Phase 2) via wrap().
contract ConfidentialUSDC is ERC20ToERC7984Wrapper {
    constructor(IERC20 usdc) ERC20ToERC7984Wrapper("Confidential USDC", "cUSDC", "", usdc) {}
}
