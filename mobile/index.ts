// Must run before viem: provides crypto.getRandomValues on iOS and Android.
import "react-native-get-random-values";
import { registerRootComponent } from "expo";

import App from "./App";

registerRootComponent(App);
