// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CallBook} from "../src/CallBook.sol";
import {UpsideConfig} from "../src/UpsideConfig.sol";
import {FollowVault} from "../src/FollowVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {AttestedGate} from "../src/AttestedGate.sol";
import {KeeperPriceSource} from "../src/KeeperPriceSource.sol";
import {MockToken, MockPrice, MockRouter} from "./mocks/Mocks.sol";

contract UpsideTest is Test {
    MockToken ausd; // 6 decimals, settlement
    MockToken wmon; // 18 decimals, base
    MockPrice price;
    MockRouter router;
    AttestedGate gate;
    CallBook book;
    UpsideConfig config;
    VaultFactory factory;
    FollowVault vault;

    address admin = makeAddr("admin");
    address treasury = makeAddr("treasury");
    address caller = makeAddr("caller");
    address follower = makeAddr("follower");
    address stranger = makeAddr("stranger");

    uint16 constant FEE_BPS = 2000; // 20% of net gain
    uint16 constant PROTOCOL_BPS = 1000; // 10% of the fee

    function setUp() public {
        ausd = new MockToken("AUSD", 6);
        wmon = new MockToken("WMON", 18);
        price = new MockPrice();
        router = new MockRouter(price);
        ausd.mint(address(router), 1_000_000e6);
        wmon.mint(address(router), 1_000_000e18);

        vm.startPrank(admin);
        gate = new AttestedGate(admin);
        gate.setAttester(admin, true);
        gate.attest(caller, uint64(block.timestamp + 365 days), keccak256("apass-ref"));
        book = new CallBook(admin, price, gate);
        book.setPair(address(wmon), address(ausd), true);
        config = new UpsideConfig(admin, book, address(ausd), treasury, PROTOCOL_BPS, 300);
        config.setRouter(address(router), true);
        vm.stopPrank();

        factory = new VaultFactory(config);
        vm.prank(follower);
        vault = FollowVault(factory.createVault(1_000e6));
        ausd.mint(address(vault), 1_000e6);

        _setPrice(2e6); // 1 WMON = 2 AUSD
    }

    // ----------------------------------------------------------------- helpers

    function _setPrice(uint256 ausdPerMonRaw) internal {
        // raw AUSD per 1e18 raw WMON, scaled by 1e18 => ausdPerMonRaw
        price.set(address(wmon), address(ausd), ausdPerMonRaw);
    }

    function _post(address who) internal returns (uint256 id) {
        uint256 mid = price.midPrice(address(wmon), address(ausd));
        vm.prank(who);
        id = book.postCall(address(wmon), address(ausd), CallBook.Side.Long, mid * 2, mid / 2, FEE_BPS, 1 hours);
    }

    function _buyData(uint256 amountIn) internal view returns (bytes memory) {
        return abi.encodeCall(MockRouter.swap, (address(ausd), address(wmon), amountIn, false, address(vault)));
    }

    function _sellData(uint256 amountIn, address recipient) internal view returns (bytes memory) {
        return abi.encodeCall(MockRouter.swap, (address(wmon), address(ausd), amountIn, true, recipient));
    }

    function _follow(uint256 callId, uint256 amountIn) internal returns (uint256 pid) {
        vm.prank(follower);
        pid = vault.follow(callId, amountIn, address(router), _buyData(amountIn), 0);
    }

    function _close(uint256 pid) internal returns (int256 pnl, uint256 fee) {
        uint256 base = vault.getPosition(pid).baseAmount;
        vm.prank(follower);
        (pnl, fee) = vault.close(pid, address(router), _sellData(base, address(vault)), 0);
    }

    // ----------------------------------------------------------------- CallBook

    function test_postAndScoreLong() public {
        uint256 id = _post(caller);
        assertTrue(book.isActive(id));
        _setPrice(2.2e6);
        vm.warp(block.timestamp + 1 hours);
        int256 r = book.scoreCall(id);
        assertEq(r, 1000); // +10%
        (int256 sum, uint32 posted, uint32 scored, uint32 wins) = book.records(caller);
        assertEq(sum, 1000);
        assertEq(posted, 1);
        assertEq(scored, 1);
        assertEq(wins, 1);
    }

    function test_cannotScoreEarlyOrTwice() public {
        uint256 id = _post(caller);
        vm.expectRevert(CallBook.NotExpired.selector);
        book.scoreCall(id);
        vm.warp(block.timestamp + 1 hours);
        book.scoreCall(id);
        vm.expectRevert(CallBook.AlreadyScored.selector);
        book.scoreCall(id);
    }

    function test_rejectsUnlistedPairAndBadLevels() public {
        vm.prank(caller);
        vm.expectRevert(CallBook.PairNotAllowed.selector);
        book.postCall(address(ausd), address(wmon), CallBook.Side.Long, 1, 0, FEE_BPS, 1 hours);

        vm.prank(caller);
        vm.expectRevert(CallBook.BadLevels.selector);
        book.postCall(address(wmon), address(ausd), CallBook.Side.Long, 1e6, 1e6, FEE_BPS, 1 hours);
    }

    /// Fake followers piling into a call do not change its score: the score only reads market mids.
    function test_fakeFollowersDoNotMoveScore() public {
        uint256 id = _post(caller);
        for (uint256 i; i < 5; ++i) {
            _follow(id, 100e6);
        }
        _setPrice(1.9e6);
        vm.warp(block.timestamp + 1 hours);
        assertEq(book.scoreCall(id), -500); // -5% regardless of follower volume
    }

    // ----------------------------------------------------------------- vault

    function test_profitPaysCallerAndTreasury() public {
        uint256 id = _post(caller);
        uint256 pid = _follow(id, 100e6); // 50 WMON
        _setPrice(2.4e6); // +20%
        (int256 pnl, uint256 fee) = _close(pid);
        assertEq(pnl, 20e6);
        // fee = 20% of 20 = 4 AUSD; protocol keeps 10% of that
        assertEq(fee, 3.6e6);
        assertEq(ausd.balanceOf(caller), 3.6e6);
        assertEq(ausd.balanceOf(treasury), 0.4e6);
    }

    /// The worked example from the report: -20, +10, then +30. Only the last close pays, on 20 of gain.
    function test_highWaterMark_lossesRecoveredFirst() public {
        // call 1: lose 20
        uint256 pid = _follow(_post(caller), 100e6);
        _setPrice(1.6e6);
        (int256 pnl1, uint256 fee1) = _close(pid);
        assertEq(pnl1, -20e6);
        assertEq(fee1, 0);

        // call 2: gain 10, still net -10
        pid = _follow(_post(caller), 100e6);
        _setPrice(1.76e6);
        (int256 pnl2, uint256 fee2) = _close(pid);
        assertApproxEqAbs(pnl2, 10e6, 2);
        assertEq(fee2, 0);

        // call 3: gain 30, now net +20 above the high-water mark of 0
        pid = _follow(_post(caller), 100e6);
        _setPrice(2.288e6);
        (int256 pnl3, uint256 fee3) = _close(pid);
        assertApproxEqAbs(pnl3, 30e6, 2);
        // 20% of ~20 = ~4, minus 10% protocol = ~3.6
        assertApproxEqAbs(fee3, 3.6e6, 2);
        assertApproxEqAbs(vault.highWater(caller), 20e6, 2);
    }

    function test_unverifiedCallerEarnsNothing() public {
        uint256 id = _post(stranger);
        uint256 pid = _follow(id, 100e6);
        _setPrice(3e6);
        (int256 pnl, uint256 fee) = _close(pid);
        assertEq(pnl, 50e6);
        assertEq(fee, 0);
        assertEq(ausd.balanceOf(stranger), 0);
        // high-water mark still advanced, so a later verification cannot charge retroactively
        assertEq(vault.highWater(stranger), 50e6);
    }

    function test_exposureLimit() public {
        uint256 id = _post(caller);
        _follow(id, 600e6);
        vm.prank(follower);
        vm.expectRevert(FollowVault.OverExposure.selector);
        vault.follow(id, 500e6, address(router), _buyData(500e6), 0);
    }

    function test_cannotFollowExpiredCall() public {
        uint256 id = _post(caller);
        vm.warp(block.timestamp + 1 hours);
        vm.prank(follower);
        vm.expectRevert(FollowVault.CallNotActive.selector);
        vault.follow(id, 100e6, address(router), _buyData(100e6), 0);
    }

    function test_onlyAllowlistedRouter() public {
        uint256 id = _post(caller);
        MockRouter rogue = new MockRouter(price);
        vm.prank(follower);
        vm.expectRevert(FollowVault.RouterNotAllowed.selector);
        vault.follow(id, 100e6, address(rogue), _buyData(100e6), 0);
    }

    /// A follower cannot dodge the fee by routing sale proceeds to another address.
    function test_redirectingProceedsReverts() public {
        uint256 pid = _follow(_post(caller), 100e6);
        _setPrice(3e6);
        uint256 base = vault.getPosition(pid).baseAmount;
        vm.prank(follower);
        vm.expectRevert(FollowVault.Slippage.selector);
        vault.close(pid, address(router), _sellData(base, follower), 0);
    }

    function test_lockedBaseCannotBeWithdrawn() public {
        uint256 pid = _follow(_post(caller), 100e6);
        uint256 base = vault.getPosition(pid).baseAmount;
        vm.prank(follower);
        vm.expectRevert(FollowVault.Locked.selector);
        vault.withdraw(address(wmon), base, follower);

        // free settlement balance can be withdrawn
        vm.prank(follower);
        vault.withdraw(address(ausd), 900e6, follower);
        assertEq(ausd.balanceOf(follower), 900e6);
    }

    function test_onlyOwnerActs() public {
        uint256 id = _post(caller);
        vm.prank(stranger);
        vm.expectRevert(FollowVault.NotOwner.selector);
        vault.follow(id, 100e6, address(router), _buyData(100e6), 0);
    }

    function test_oneVaultPerFollower() public {
        vm.prank(follower);
        vm.expectRevert(VaultFactory.AlreadyCreated.selector);
        factory.createVault(1);
        assertEq(factory.predictVault(follower), address(vault));
    }

    // ----------------------------------------------------------------- price source

    function test_keeperPriceStaleness() public {
        KeeperPriceSource ks = new KeeperPriceSource(admin, 120);
        vm.prank(admin);
        ks.setKeeper(admin, true);
        vm.prank(admin);
        ks.push(address(wmon), address(ausd), 2e6);
        assertEq(ks.midPrice(address(wmon), address(ausd)), 2e6);
        vm.warp(block.timestamp + 121);
        vm.expectRevert(KeeperPriceSource.Stale.selector);
        ks.midPrice(address(wmon), address(ausd));
    }

    // Review evidence: these tests record current limitations, not desired production guarantees.
    function test_reviewLateScoringUsesPriceAtExecution() public {
        uint256 id = _post(caller);
        vm.warp(block.timestamp + 1 hours);
        _setPrice(2.2e6); // +10% at expiry, but nobody scores the call.
        vm.warp(block.timestamp + 1 days);
        _setPrice(2.8e6);
        assertEq(book.scoreCall(id), 4000); // +40% at actual scoring time.
    }

    function test_reviewStalePriceBlocksCloseAndKeepsBaseLocked() public {
        KeeperPriceSource ks = new KeeperPriceSource(admin, 120);
        vm.startPrank(admin);
        ks.setKeeper(admin, true);
        ks.push(address(wmon), address(ausd), 2e6);
        book.setPriceSource(ks);
        vm.stopPrank();
        uint256 pid = _follow(_post(caller), 100e6);
        uint256 base = vault.getPosition(pid).baseAmount;
        vm.warp(block.timestamp + 121);
        bytes memory closeData = _sellData(base, address(vault));
        vm.prank(follower);
        vm.expectRevert(KeeperPriceSource.Stale.selector);
        vault.close(pid, address(router), closeData, 0);
        assertTrue(vault.getPosition(pid).open);
        assertEq(vault.lockedBase(address(wmon)), base);
    }

    function test_reviewOpenLossDoesNotOffsetClosedWinnerFee() public {
        uint256 winner = _follow(_post(caller), 100e6); // 50 WMON at 2.
        _setPrice(4e6);
        uint256 loser = _follow(_post(caller), 400e6); // 100 WMON at 4.
        _setPrice(3e6);
        (int256 pnl, uint256 callerFee) = _close(winner);
        assertEq(pnl, 50e6);
        assertEq(callerFee, 9e6); // 10 total fee, including the protocol's 1.
        assertEq(vault.netPnl(caller), 50e6);
        assertTrue(vault.getPosition(loser).open);
        uint256 remainingValue = vault.getPosition(loser).baseAmount * 3e6 / 1e18;
        assertEq(remainingValue, 300e6); // Remaining position has an unrealized loss of 100.
        assertLt(pnl + int256(remainingValue) - 400e6, 0); // Combined trading result is negative.
    }
}
