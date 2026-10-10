/** DM window entry: load assets, pick a scenario/saved battle/fresh grid, mount the battle screen. */
import '../ui/styles.css';
import { SAVE_PATHS } from '../assets/filenames.ts';
import { gridShapePresetToJson, stringifyLike } from '../assets/write.ts';
import { createBattle } from '../engine/createBattle.ts';
import { parseBattle, serializeBattle } from '../engine/serialize.ts';
import type { BattleState, GridSetup } from '../engine/types.ts';
import { buildBoardViewModel } from '../engine/view/boardViewModel.ts';
import { mountBattleScreen } from '../ui/battleScreen.ts';
import { alertDialog } from '../ui/panels/dialogs.ts';
import { Canvas2DRenderer } from '../ui/renderer/canvas2d.ts';
import { mountSetupScreen } from '../ui/setupScreen.ts';
import { fetchAssets, getBattle, getScenario, listBattles, putBattle, putFile } from '../assets/client.ts';
import { createSheetPersister, renderUiPrefs, uiPrefsPath } from './persistence.ts';
import { PrefsStore } from './prefs.ts';
import { publishStore } from './replica.ts';
import { applyScenario, engineAssetsOf, rngFromParams, type Scenario } from './scenario.ts';
import { Store } from './store.ts';
import { broadcastChannelTransport } from './transport/broadcastChannel.ts';

const root = document.getElementById('app') as HTMLElement;
const params = new URLSearchParams(location.search);

async function boot(): Promise<void> {
  const loaded = await fetchAssets();
  let bundle = loaded.bundle;
  if (bundle.problems.length) console.warn('asset problems', bundle.problems);
  const prefs = new PrefsStore(bundle.uiPrefs, (p) => putFile(uiPrefsPath, renderUiPrefs(p)));
  const rng = rngFromParams(params);

  const scenarioName = params.get('scenario');
  const battleName = params.get('battle');
  let initial: BattleState | null = null;
  let fixtureAssets = false;
  if (scenarioName) {
    const sc = await getScenario<Scenario>(scenarioName);
    if (!sc) alertDialog('Scenario', `No scenario named ${scenarioName}`);
    else {
      const applied = applyScenario(sc, bundle);
      bundle = applied.bundle;
      initial = applied.battle;
      fixtureAssets = sc.assets !== undefined; // inline fixture sheets must never overwrite saves/entities/party
    }
  } else if (battleName) {
    const saved = await getBattle(battleName);
    if (saved) initial = parseBattle(saved);
  }

  const startBattle = (battle: BattleState) => {
    const assets = engineAssetsOf(bundle);
    const store = new Store(battle, { rng, assets });
    const persister = createSheetPersister({
      rawParty: loaded.raw.party ?? {},
      partyStems: bundle.partyStems,
      putFile,
      onError: (e) => console.warn('sheet save failed', e),
    });
    persister.readOnly = params.get('readonly') === '1' || fixtureAssets;
    const transport = broadcastChannelTransport();
    const pub = publishStore(
      transport,
      () => buildBoardViewModel(store.battle, store.session, assets),
      () => prefs.all,
    );
    prefs.subscribe(() => pub.publishPrefs());
    store.subscribe((doc, events) => {
      persister.onState(doc.battle);
      pub.publish(events);
    });
    window.addEventListener('beforeunload', () => void persister.flush());
    pub.publish([]);
    const renderer = new Canvas2DRenderer();
    const unmount = mountBattleScreen(root, {
      store,
      bundle,
      prefs,
      renderer,
      onVictoryShown: (party) => pub.publishVictory(party),
      onLeave: () => {
        pub.publishVictory(null);
        unmount();
        pub.stop();
        transport.close();
        void persister.flush().then(() => showSetup());
      },
      saveBattle: async (name) => {
        await putBattle(name, serializeBattle(store.battle));
        alertDialog('Saved', `Battle saved as saves/battles/${name}.json`);
      },
      loadBattle: async (name) => {
        const saved = await getBattle(name);
        if (saved) store.replace(parseBattle(saved));
      },
      listBattles,
      persisterReadOnly: { get: () => persister.readOnly, set: (v) => (persister.readOnly = v) },
    });
    // expose for e2e/debugging
    (window as unknown as { dndsim: unknown }).dndsim = { store, bundle, prefs, renderer };
  };

  const showSetup = async () => {
    const battles = await listBattles();
    mountSetupScreen(root, {
      presets: bundle.gridshapes,
      savePreset: (p) =>
        putFile(SAVE_PATHS.gridshape(p.name), stringifyLike('gridshape', gridShapePresetToJson(p))),
      deletePreset: async (name) => {
        await fetch(`/api/files/${SAVE_PATHS.gridshape(name)}`, { method: 'DELETE' });
      },
      battles,
      onStart: (setup: GridSetup) =>
        startBattle(createBattle(setup, engineAssetsOf(bundle), { partyList: bundle.partyList })),
      onLoadBattle: (name) => {
        void getBattle(name).then((saved) => saved && startBattle(parseBattle(saved)));
      },
    });
  };

  if (initial) startBattle(initial);
  else await showSetup();
}

boot().catch((err: unknown) => {
  console.error(err);
  root.textContent = `Failed to start: ${String(err)}`;
});
