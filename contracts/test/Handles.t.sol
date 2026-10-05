// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Handles} from "../src/Handles.sol";

contract HandlesTest is Test {
    Handles h;
    address a = makeAddr("a");
    address b = makeAddr("b");

    function setUp() public {
        h = new Handles();
    }

    function test_setAndRename() public {
        vm.prank(a);
        h.setHandle("ada");
        assertEq(h.handleOf(a), "ada");
        assertEq(h.ownerOf(keccak256("ada")), a);

        vm.prank(a);
        h.setHandle("ada_calls");
        assertEq(h.ownerOf(keccak256("ada")), address(0)); // released
        vm.prank(b);
        h.setHandle("ada"); // now free
        assertEq(h.handleOf(b), "ada");
    }

    function test_uniqueness() public {
        vm.prank(a);
        h.setHandle("femi");
        vm.prank(b);
        vm.expectRevert(Handles.Taken.selector);
        h.setHandle("femi");
    }

    function test_rejectsBadHandles() public {
        vm.startPrank(a);
        vm.expectRevert(Handles.BadHandle.selector);
        h.setHandle("ab");
        vm.expectRevert(Handles.BadHandle.selector);
        h.setHandle("Ada");
        vm.expectRevert(Handles.BadHandle.selector);
        h.setHandle("ada-x");
        vm.expectRevert(Handles.BadHandle.selector);
        h.setHandle("abcdefghijklmnopqrstu");
        vm.stopPrank();
    }
}
