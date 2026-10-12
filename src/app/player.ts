/** Player window entry: mirror the DM's board through a BroadcastChannel replica. */
import '../ui/styles.css';
import { mountTvScreen } from '../ui/battle/tvScreen.ts';
import { pickRenderer } from '../ui/renderer/pickRenderer.ts';
import { ReplicaStore } from './replica.ts';
import { holdPresence } from './presence.ts';
import { broadcastChannelTransport } from './transport/broadcastChannel.ts';

holdPresence();
const root = document.getElementById('app') as HTMLElement;
const replica = new ReplicaStore(broadcastChannelTransport());
const params = new URLSearchParams(location.search);
const renderer = pickRenderer(params, { view: { blur: false } });
mountTvScreen(root, replica, renderer);
(window as unknown as { dndsimPlayer: unknown }).dndsimPlayer = { replica, renderer };
