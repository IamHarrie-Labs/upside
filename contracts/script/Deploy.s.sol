// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {CallBook} from "../src/CallBook.sol";
import {UpsideConfig} from "../src/UpsideConfig.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {Handles} from "../src/Handles.sol";
import {AttestedGate} from "../src/AttestedGate.sol";
import {KeeperPriceSource} from "../src/KeeperPriceSource.sol";
import {DemoRouter} from "../src/demo/DemoRouter.sol";
import {DemoToken} from "../src/demo/DemoToken.sol";

/// @notice Deploys Upside.
///   DEMO=true  (testnet): also deploys demo AUSD/WMON tokens and a DemoRouter that fills at the keeper mid.
///   DEMO=false (mainnet): needs SETTLEMENT_TOKEN (AUSD), BASE_TOKEN and ROUTER (Kuru Flow router).
/// Run:  forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast --private-key $DEPLOYER_KEY
contract Deploy is Script {
    function run() external {
        bool demo = vm.envOr("DEMO", true);
        address treasury = vm.envOr("TREASURY", msg.sender);
        address keeper = vm.envOr("KEEPER", msg.sender);
        address attester = vm.envOr("ATTESTER", msg.sender);

        vm.startBroadcast();
        address deployer = msg.sender;

        AttestedGate gate = new AttestedGate(deployer);
        gate.setAttester(attester, true);

        KeeperPriceSource prices = new KeeperPriceSource(deployer, 10 minutes);
        prices.setKeeper(keeper, true);

        address settlement;
        address base;
        address router;
        if (demo) {
            DemoToken ausd = new DemoToken("Demo AUSD", "dAUSD", 6);
            DemoToken wmon = new DemoToken("Demo WMON", "dWMON", 18);
            DemoRouter demoRouter = new DemoRouter(prices);
            ausd.faucet(address(demoRouter), 10_000_000e6);
            wmon.faucet(address(demoRouter), 10_000_000e18);
            settlement = address(ausd);
            base = address(wmon);
            router = address(demoRouter);
        } else {
            settlement = vm.envAddress("SETTLEMENT_TOKEN");
            base = vm.envAddress("BASE_TOKEN");
            router = vm.envAddress("ROUTER");
        }

        CallBook book = new CallBook(deployer, prices, gate);
        book.setPair(base, settlement, true);

        UpsideConfig config = new UpsideConfig(deployer, book, settlement, treasury, 1000, 300);
        config.setRouter(router, true);

        VaultFactory factory = new VaultFactory(config);
        Handles handles = new Handles();
        vm.stopBroadcast();

        _write(demo, [address(gate), address(prices), address(book), address(config), address(factory), settlement, base, router, address(handles)]);

        console2.log("AttestedGate     ", address(gate));
        console2.log("KeeperPriceSource", address(prices));
        console2.log("CallBook         ", address(book));
        console2.log("UpsideConfig     ", address(config));
        console2.log("VaultFactory     ", address(factory));
        console2.log("Settlement token ", settlement);
        console2.log("Base token       ", base);
        console2.log("Router           ", router);
    }

    function _write(bool demo, address[9] memory a) internal {
        string memory k = "deployment";
        vm.serializeBool(k, "demo", demo);
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "startBlock", block.number);
        vm.serializeAddress(k, "gate", a[0]);
        vm.serializeAddress(k, "priceSource", a[1]);
        vm.serializeAddress(k, "callBook", a[2]);
        vm.serializeAddress(k, "config", a[3]);
        vm.serializeAddress(k, "factory", a[4]);
        vm.serializeAddress(k, "settlement", a[5]);
        vm.serializeAddress(k, "base", a[6]);
        vm.serializeAddress(k, "router", a[7]);
        string memory json = vm.serializeAddress(k, "handles", a[8]);
        vm.writeJson(json, string.concat("./deployments/", vm.toString(block.chainid), ".json"));
    }
}
