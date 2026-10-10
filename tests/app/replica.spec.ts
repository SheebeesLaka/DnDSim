import { describe, expect, it } from 'vitest';
import { ReplicaStore, publishStore } from '../../src/app/replica.ts';
import { loopbackPair } from '../../src/app/transport/loopback.ts';
import { Store } from '../../src/app/store.ts';
import { ctx, fresh } from '../helpers/engine.ts';

describe('DM → player replica over a transport', () => {
  it('a late-joining player gets the current snapshot; every change is mirrored with its events; stale seqs are dropped', () => {
    const c = ctx();
    const store = new Store(fresh({ partyList: [] }, undefined, c).state, c);
    const [dmSide, playerSide] = loopbackPair();
    const pub = publishStore(
      dmSide,
      () => ({
        battle: store.battle,
        session: {
          selectedId: store.session.selectedId,
          mode: store.session.mode,
          hover: store.session.hover,
        },
      }),
      () => ({ 'display.player.enemyHp': 'HIDDEN' }),
    );
    store.subscribe((_doc, events) => pub.publish(events));
    store.dispatch({ type: 'PLACE_ENTITY', name: 'Henry Keaton', r: 0, c: 0 });
    const replica = new ReplicaStore(playerSide); // sends hello → gets prefs + snapshot
    expect(replica.state.battle?.units).toHaveLength(1);
    expect(replica.state.prefs['display.player.enemyHp']).toBe('HIDDEN');
    const got: string[] = [];
    replica.subscribe((_d, events) => got.push(...events.map((e) => e.type)));
    store.dispatch({ type: 'PLACE_ENEMY', templateStem: 'Spider', r: 3, c: 3 });
    expect(replica.state.battle?.units).toHaveLength(2);
    expect(got).toContain('unitPlaced');
    const seq = replica.state.seq;
    replica.receive({
      t: 'snapshot',
      battle: fresh({ partyList: [] }, undefined, c).state,
      session: replica.state.session,
      events: [],
      seq: seq - 1,
    });
    expect(replica.state.battle?.units).toHaveLength(2);
    replica.close();
    pub.stop();
  });
});
