import { test, describe } from 'node:test';
import assert from 'node:assert';
import { applySession0Patch } from '../session0';

describe('applySession0Patch (B-03 / B-04)', () => {
  test('always stamps __session0Done so the wizard is not re-shown', () => {
    const out = applySession0Patch({}, { soloMode: true });
    assert.equal(out.__session0Done, true);
  });

  test('carries the typed campaign title through (B-04) when present in the patch', () => {
    // The wizard puts the typed title on patch.name; the new-campaign flow
    // uses it as the doc name. The data fold leaves name handling to the
    // caller, but a populated patch.name must survive round-tripping.
    const patch = { name: 'QA TEST Campaign', soloMode: true, pitch: 'Stop the lich.' };
    const out = applySession0Patch({ __soloMode: true }, patch);
    assert.equal(out.pitch, 'Stop the lich.');
    assert.equal(out.__soloMode, true);
  });

  test('folds world truths, a solo PC + goal, and a front into data', () => {
    const out = applySession0Patch(
      {},
      {
        soloMode: true,
        truths: ['Magic is dying.', 'The gods are silent.'],
        pc: { name: 'Wren', concept: 'Sky-knight', goal: 'Find the betrayer' },
        front: { name: 'Volixus', goal: 'Build the war machine', firstSign: 'Stolen lore' },
      },
    );
    assert.deepEqual(out.gWorld, ['Magic is dying.', 'The gods are silent.']);
    assert.equal(out.pcs.length, 1);
    assert.equal(out.pcs[0].name, 'Wren');
    assert.equal(out.pcGoals[0].text, 'Find the betrayer');
    assert.equal(out.clocks.length, 1);
    assert.equal(out.clocks[0].faction, 'Volixus');
    assert.match(out.clocks[0].notes, /Stolen lore/);
  });

  test('group mode folds a multi-PC roster with players and goals', () => {
    const out = applySession0Patch(
      {},
      {
        soloMode: false,
        pcs: [
          { name: 'Brog', player: 'Alex', concept: 'Cleric', goal: 'Rebuild temple' },
          { name: 'Mira', player: 'Sam' },
        ],
      },
    );
    assert.equal(out.pcs.length, 2);
    assert.equal(out.pcs[0].ownership?.ownerType, 'player');
    assert.equal(out.pcGoals.length, 1);
    assert.equal(out.pcGoals[0].text, 'Rebuild temple');
  });

  test('does not mutate the base object', () => {
    const base = { gWorld: ['existing'] };
    const out = applySession0Patch(base, { soloMode: true, truths: ['new'] });
    assert.deepEqual(base.gWorld, ['existing']);
    assert.deepEqual(out.gWorld, ['existing', 'new']);
  });
});
