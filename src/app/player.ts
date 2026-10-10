/** Player window entry: mirror the DM's board through a BroadcastChannel replica. */
import '../ui/styles.css';
import { mountPlayerScreen } from '../ui/playerScreen.ts';
import { pickRenderer } from '../ui/renderer/pickRenderer.ts';
import { ReplicaStore } from './replica.ts';
import { broadcastChannelTransport } from './transport/broadcastChannel.ts';

const root = document.getElementById('app') as HTMLElement;
const replica = new ReplicaStore(broadcastChannelTransport());
const renderer = pickRenderer(new URLSearchParams(location.search), { view: { blur: false } });
mountPlayerScreen(root, replica, renderer);
(window as unknown as { dndsimPlayer: unknown }).dndsimPlayer = { replica, renderer };
