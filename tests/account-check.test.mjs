import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from './harness.mjs';

for (const provider of ['none', 'anilist', 'mal', 'unavailable']) {
  test('account check reports ' + provider + ' without writing to a list', async t => {
    const isMal = provider === 'mal';
    const name = isMal ? 'MalTester' : 'Tester';
    const key = isMal ? 'mal' : 'anilist';
    const storage = provider === 'none' ? {} : {
      [key + 'Accounts']: JSON.stringify([{ provider: key, name, token: 'fixture-only' }]),
      [key + 'Active']: name
    };
    const p = await openPage({ storage, accountCheckListUnavailable: provider === 'unavailable' });
    t.after(() => p.close());
    await p.click(p.$('settingsButton'));
    await p.click(p.$('accountCheckButton'));
    const result = p.$('accountCheckResults').textContent;
    if (provider === 'none') assert.match(result, /Kein Listen-Konto/);
    else {
      assert.match(result, /Anmeldung gültig/);
      assert.match(result, /Guckplan:/);
      assert.match(result, provider === 'unavailable' ? /konnte nicht gelesen werden/ : /Lesen funktioniert/);
    }
    assert.doesNotMatch(result, /fixture-only/);
    assert.ok(!p.calls.some(call => /mutation/.test(call.query)));
  });
}