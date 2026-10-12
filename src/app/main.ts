/**
 * DM window entry. Loads assets once into the editors' AssetStore, then
 * navigates like AppController: main menu → battle setup → battle, Character
 * Sheets, Asset Editor. A running battle stays mounted (hidden) while the
 * Character Sheets screen is open over it, and sheet edits reach it at once.
 *
 * URL options: ?scenario=<name> (fixture: nothing is written), ?battle=<name>,
 * ?view=menu|setup|sheets|assets, ?readonly=1, ?seed=, ?bench=1, ?renderer=2d, ?ui=next (Spotlight UI).
 */
import '../ui/styles.css';
import { SAVE_PATHS } from '../assets/filenames.ts';
import { gridShapePresetToJson, stringifyLike } from '../assets/write.ts';
import { createBattle } from '../engine/createBattle.ts';
import { parseBattle, serializeBattle } from '../engine/serialize.ts';
import { partySheetsToPersist } from '../engine/selectors/persistence.ts';
import type { BattleState, GridSetup } from '../engine/types.ts';
import { buildBoardViewModel } from '../engine/view/boardViewModel.ts';
import { AssetStore } from '../editors/assetStore.ts';
import { mountAssetEditor } from '../ui/editors/assetEditor.ts';
import { openSpellEditor } from '../ui/editors/spellEditor.ts';
import { mountSheetsScreen } from '../ui/editors/sheetsScreen.ts';
import { mountBattleScreen } from '../ui/battleScreen.ts';
import { mountSpotlightScreen } from '../ui/battle/spotlightScreen.ts';
import { mountMenuScreen } from '../ui/menuScreen.ts';
import { alertDialog } from '../ui/panels/dialogs.ts';
import { pickRenderer } from '../ui/renderer/pickRenderer.ts';
import { viewOptionsFromPrefs } from '../ui/viewPrefs.ts';
import { mountSetupScreen } from '../ui/setupScreen.ts';
import {
  deleteFile,
  fetchAssets,
  getBattle,
  getScenario,
  listBattles,
  putBattle,
  putFile,
} from '../assets/client.ts';
import { createSheetPersister, renderUiPrefs, uiPrefsPath } from './persistence.ts';
import { PrefsStore } from './prefs.ts';
import { holdPresence } from './presence.ts';
import { publishStore } from './replica.ts';
import { applyScenario, engineAssetsOf, rngFromParams, type Scenario } from './scenario.ts';
import { Store } from './store.ts';
import { broadcastChannelTransport } from './transport/broadcastChannel.ts';

holdPresence();
const root = document.getElementById('app') as HTMLElement;
const params = new URLSearchParams(location.search);

interface ActiveBattle {
  store: Store;
  host: HTMLElement;
  /** write pending party sheets now */
  flush: () => Promise<void>;
}

async function boot(): Promise<void> {
  const loaded = await fetchAssets();
  let bundle = loaded.bundle;
  if (bundle.problems.length) console.warn('asset problems', bundle.problems);
  // Fixture scenarios and ?readonly=1 keep prefs, sheets and assets in memory only.
  let readOnly = params.get('readonly') === '1';
  const prefs = new PrefsStore(bundle.uiPrefs, (p) =>
    readOnly ? Promise.resolve() : putFile(uiPrefsPath, renderUiPrefs(p)),
  );
  const rng = rngFromParams(params);

  const scenarioName = params.get('scenario');
  const battleName = params.get('battle');
  let initial: BattleState | null = null;
  if (scenarioName) {
    const sc = await getScenario<Scenario>(scenarioName);
    if (!sc) alertDialog('Scenario', `No scenario named ${scenarioName}`);
    else {
      const applied = applyScenario(sc, bundle);
      bundle = applied.bundle;
      initial = applied.battle;
      if (sc.assets !== undefined) readOnly = true; // inline fixture assets must never overwrite saves/
    }
  } else if (battleName) {
    const saved = await getBattle(battleName);
    if (saved) initial = parseBattle(saved);
  }

  const assets = new AssetStore(bundle, loaded.raw, { put: putFile, del: deleteFile }, { readOnly });
  assets.onError = (err) => alertDialog('Save Failed', String(err));

  // ---- layout: the battle lives in its own host so a page can cover it ----
  const battleHost = document.createElement('div');
  battleHost.className = 'host';
  const pageHost = document.createElement('div');
  pageHost.className = 'host';
  root.replaceChildren(battleHost, pageHost);
  let unmountPage: (() => void) | null = null;
  let battle: ActiveBattle | null = null;

  const showPage = (mount: (el: HTMLElement) => () => void) => {
    unmountPage?.();
    battleHost.style.display = 'none';
    pageHost.style.display = '';
    unmountPage = mount(pageHost);
  };
  const showBattle = () => {
    unmountPage?.();
    unmountPage = null;
    pageHost.style.display = 'none';
    battleHost.style.display = '';
  };

  // keep the engine's view of the assets current, and push sheet edits into a running battle
  assets.subscribe((change) => {
    if (!battle) return;
    battle.store.ctx.assets = engineAssetsOf(assets.bundle);
    if (change.kind !== 'sheet' || !change.sheet) return;
    const sourceName = change.oldName ?? change.sheet.name;
    const b = battle.store.battle;
    const inBattle =
      b.units.some((u) => u.kind === 'entity' && u.sourceName === sourceName) ||
      b.graveyard.some((g) => g.sourceName === sourceName) ||
      b.turn.placementQueue.includes(sourceName);
    if (inBattle) battle.store.dispatch({ type: 'REPLACE_SHEET', sourceName, sheet: change.sheet });
  });

  const go = {
    menu: () =>
      showPage((el) =>
        mountMenuScreen(el, {
          onBattle: () => go.setup(),
          onSheets: () => go.sheets(),
          onAssets: () => go.assets(),
          readOnly,
        }),
      ),
    setup: () => {
      void listBattles().then((battles) =>
        showPage((el) => {
          mountSetupScreen(el, {
            presets: assets.bundle.gridshapes,
            savePreset: (p) =>
              putFile(SAVE_PATHS.gridshape(p.name), stringifyLike('gridshape', gridShapePresetToJson(p))),
            deletePreset: (name) => deleteFile(SAVE_PATHS.gridshape(name)),
            battles,
            onStart: (setup: GridSetup) =>
              startBattle(
                createBattle(setup, engineAssetsOf(assets.bundle), { partyList: assets.bundle.partyList }),
              ),
            onLoadBattle: (name) => {
              void getBattle(name).then((saved) => saved && startBattle(parseBattle(saved)));
            },
            onBack: () => go.menu(),
          });
          return () => el.replaceChildren();
        }),
      );
    },
    sheets: () => {
      // a running battle has the freshest sheets (damage, statuses, slots)
      if (battle) assets.adoptSheets(partySheetsToPersist(battle.store.battle));
      showPage((el) =>
        mountSheetsScreen(el, {
          assets,
          prefs,
          inBattle: battle !== null,
          onBack: () => (battle ? showBattle() : go.menu()),
        }),
      );
    },
    assets: () => showPage((el) => mountAssetEditor(el, { assets, onBack: () => go.menu() })),
  };

  const startBattle = (state: BattleState) => {
    const store = new Store(state, { rng, assets: engineAssetsOf(assets.bundle) });
    const persister = createSheetPersister({
      rawParty: loaded.raw.party ?? {},
      partyStems: assets.bundle.partyStems,
      putFile,
      onError: (e) => console.warn('sheet save failed', e),
    });
    persister.readOnly = readOnly;
    const transport = broadcastChannelTransport();
    const pub = publishStore(
      transport,
      () => buildBoardViewModel(store.battle, store.session, store.ctx.assets),
      () => prefs.all,
    );
    const unsubPrefs = prefs.subscribe(() => pub.publishPrefs());
    store.subscribe((doc, events) => {
      persister.onState(doc.battle);
      pub.publish(events);
    });
    window.addEventListener('beforeunload', () => void persister.flush());
    pub.publish([]);
    const renderer = pickRenderer(params, { view: viewOptionsFromPrefs(prefs.all, 'dm') });
    battle = { store, host: battleHost, flush: () => persister.flush() };
    showBattle();
    // ?ui=next: the Spotlight battle UI (design/05-build-plan.md) while it is being built
    const mountScreen = params.get('ui') === 'next' ? mountSpotlightScreen : mountBattleScreen;
    const unmount = mountScreen(battleHost, {
      store,
      getBundle: () => assets.bundle,
      prefs,
      renderer,
      onVictoryShown: (party) => pub.publishVictory(party),
      onOpenSheets: () => go.sheets(),
      editSpell: (name, onSaved) => {
        const spell = assets.bundle.spells[name];
        if (spell) openSpellEditor(assets, spell, onSaved);
      },
      onLeave: () => {
        pub.publishVictory(null);
        unmount();
        unsubPrefs();
        pub.stop();
        transport.close();
        const finished = store.battle;
        battle = null;
        void persister.flush().then(() => {
          assets.adoptSheets(partySheetsToPersist(finished));
          go.menu();
        });
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
    expose({ store, renderer });
  };

  const expose = (extra: Record<string, unknown> = {}) => {
    (window as unknown as { dndsim: unknown }).dndsim = {
      assets,
      prefs,
      get bundle() {
        return assets.bundle;
      },
      ...extra,
    };
  };
  expose();

  const view = params.get('view');
  if (view === 'sheets') go.sheets();
  else if (view === 'assets') go.assets();
  else if (view === 'menu') go.menu();
  else if (view === 'setup') go.setup();
  else if (initial) startBattle(initial);
  else go.menu();
}

boot().catch((err: unknown) => {
  console.error(err);
  root.textContent = `Failed to start: ${String(err)}`;
});
