/** Player window entry: mirror the DM's board through a BroadcastChannel replica. */
import '../ui/styles.css';
import { mountPlayerScreen } from '../ui/playerScreen.ts';
import { Canvas2DRenderer } from '../ui/renderer/canvas2d.ts';
import { ReplicaStore } from './replica.ts';
import { broadcastChannelTransport } from './transport/broadcastChannel.ts';

const root = document.getElementById('app') as HTMLElement;
const replica = new ReplicaStore(broadcastChannelTransport());
mountPlayerScreen(root, replica, new Canvas2DRenderer());
(window as unknown as { dndsimPlayer: unknown }).dndsimPlayer = { replica };
