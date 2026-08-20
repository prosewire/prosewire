import {
  NodeChildProcessSpawner,
  NodeCrypto,
  NodeFileSystem,
  NodePath,
  NodeStdio,
  NodeTerminal,
} from "@effect/platform-node-shared";
import { Layer } from "effect";

export const nodeServicesLayer = Layer.provideMerge(
  NodeChildProcessSpawner.layer,
  Layer.mergeAll(
    NodeFileSystem.layer,
    NodeCrypto.layer,
    NodePath.layer,
    NodeStdio.layer,
    NodeTerminal.layer,
  ),
);
