/** Player window entry: mirror the DM's board through a BroadcastChannel replica. */
import '../ui/styles.css';
import { mountTvScreen } from '../ui/battle/tvScreen.ts';
import { createBoardRenderer, NO_WEBGL_MESSAGE, webglAvailable } from '../ui/renderer/createBoardRenderer.ts';
import { ReplicaStore } from './replica.ts';
import { holdPresence } from './presence.ts';
import { broadcastChannelTransport } from './transport/broadcastChannel.ts';

holdPresence();
const root = document.getElementById('app') as HTMLElement;
if (webglAvailable()) {
  const replica = new ReplicaStore(broadcastChannelTransport());
  const params = new URLSearchParams(location.search);
  const renderer = createBoardRenderer(params, { view: { blur: false } });
  mountTvScreen(root, replica, renderer);
  (window as unknown as { dndsimPlayer: unknown }).dndsimPlayer = { replica, renderer };
} else {
  root.textContent = NO_WEBGL_MESSAGE;
}
