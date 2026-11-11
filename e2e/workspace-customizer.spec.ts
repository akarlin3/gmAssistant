import { test, expect } from '@playwright/test';

test.describe('Conversational Campaign & Table Customizer E2E', () => {
  test('GM flow: opens via Ctrl+Shift+K, renders mocked structured Diff Preview + guardrail warning, applies Duet/trackers/terms/HUD, and rolls back via Ctrl+Z', async ({
    page,
  }) => {
    const capturedRequestBodies: Array<Record<string, any>> = [];

    await page.route('**/api/workspace-architect', async (route) => {
      const body = route.request().postDataJSON() as Record<string, any>;
      capturedRequestBodies.push(body);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          provider: 'cloud_pro',
          turn: {
            reply:
              'Configured a 2-player Duet cosmic horror mystery with Sanity & Luck trackers, Cash/Leads terminology, and pinned Clocks + Investigation Board.',
            followUpOptions: [
              {
                id: 'opt_sanity_99',
                label: 'Option A: d100 Sanity (99)',
                description: 'Classic percentile Sanity cap',
                promptReply: 'Use 99 max Sanity',
              },
              {
                id: 'opt_sanity_10',
                label: 'Option B: Compact Sanity (10)',
                description: 'Rules-light 10-box Stress/Sanity track',
                promptReply: 'Use 10 max Sanity',
              },
            ],
            patch: {
              campaignMode: {
                mode: 'duet',
                prepTargetOverrides: {
                  secrets: 6,
                  npcs: 4,
                  locations: 3,
                  encounters: 2,
                },
              },
              systemFlavorAndTrackers: {
                genre: 'cosmic-horror',
                toneTags: ['cosmic-horror', 'mystery'],
                resourcePoolTemplates: [
                  { name: 'Sanity', max: 99, rechargeOn: 'manual' },
                  { name: 'Luck', max: 50, rechargeOn: 'long' },
                ],
                clockCategories: ['Investigation', 'Mythos Doom'],
              },
              terminologyMap: {
                gold: 'Cash',
                quests: 'Leads',
              },
              hudLayoutPrefs: {
                density: 'compact',
                widgets: {
                  clocks: { visible: true, pinnedTop: true, order: 0 },
                  conspiracyBoard: { visible: true, pinnedTop: true, order: 1 },
                },
              },
              // Non-whitelisted PC field to exercise guardrail warning banner
              pcPatches: [
                {
                  pcId: 'pc_alice',
                  updates: {
                    gmSecretField: 'SHOULD_BE_STRIPPED',
                  },
                },
              ],
            },
          },
        }),
      });
    });

    await page.goto('/e2e-sandbox?suite=workspace-customizer&role=gm');
    await expect(page.getByTestId('e2e-customizer-harness')).toHaveAttribute(
      'data-hydrated',
      'true',
    );
    await expect(page.getByTestId('e2e-role')).toHaveText('gm');
    await expect(page.getByTestId('e2e-campaign-mode')).toHaveText('standard');
    await expect(page.getByTestId('e2e-prep-secrets')).toHaveText('default');
    await expect(page.getByTestId('e2e-gold-label')).toHaveText('Gold');
    await expect(page.getByTestId('e2e-alice-pools')).toHaveText('none');
    await expect(page.getByTestId('e2e-pinned-widgets')).toHaveText('none');

    // 1. Open Customizer via Ctrl + Shift + K
    await page.keyboard.press('Control+Shift+K');
    const dialog = page.getByRole('dialog', {
      name: /Conversational Campaign & Table Customizer/i,
    });
    await expect(dialog).toBeVisible();

    // 2. Submit mixed natural-language prompt
    const promptInput = dialog.getByLabel(
      /Describe your system, custom trackers, terminology, or HUD layout/i,
    );
    await promptInput.fill(
      'Set up a 2-player cosmic horror mystery: switch to Duet prep counts, add Sanity and Luck trackers to PCs, rename Gold to Cash and Quests to Leads, and pin Clocks + Investigation Board to the top of Run',
    );
    await dialog.getByRole('button', { name: /Compile/i }).click();

    // 3. Inspect mocked structured response, Diff Preview, Option chips, and guardrail warning
    await expect(dialog.getByTestId('workspace-diff-preview')).toBeVisible();
    await expect(dialog.getByText(/Option A: d100 Sanity/i)).toBeVisible();
    await expect(dialog.getByText(/CRDT Privacy & Authority Guard/i)).toBeVisible();
    await expect(
      dialog.getByText(
        /Blocked non-editable or GM-only field "gmSecretField" on "pc_alice"/i,
      ),
    ).toBeVisible();

    // Outbound context summary must never leak GM secret notes
    expect(capturedRequestBodies).toHaveLength(1);
    expect(JSON.stringify(capturedRequestBodies[0])).not.toContain(
      'TOP_SECRET_CULT_LEADER_IS_MAYOR_VANCE',
    );

    // 4. Click Apply to Campaign
    await dialog.getByRole('button', { name: /^Apply to Campaign$/i }).click();

    await expect(page.getByTestId('e2e-campaign-mode')).toHaveText('duet');
    await expect(page.getByTestId('e2e-prep-secrets')).toHaveText('6');
    await expect(page.getByTestId('e2e-gold-label')).toHaveText('Cash');
    await expect(page.getByTestId('e2e-quests-label')).toHaveText('Leads');
    await expect(page.getByTestId('e2e-alice-pools')).toHaveText('Sanity, Luck');
    await expect(page.getByTestId('e2e-pinned-widgets')).toHaveText(
      'clocks, conspiracyBoard',
    );

    // 5. Press Ctrl + Z to roll back cleanly
    await page.keyboard.press('Control+z');

    await expect(page.getByTestId('e2e-campaign-mode')).toHaveText('standard');
    await expect(page.getByTestId('e2e-prep-secrets')).toHaveText('default');
    await expect(page.getByTestId('e2e-gold-label')).toHaveText('Gold');
    await expect(page.getByTestId('e2e-quests-label')).toHaveText('Quests');
    await expect(page.getByTestId('e2e-alice-pools')).toHaveText('none');
    await expect(page.getByTestId('e2e-pinned-widgets')).toHaveText('none');
    await expect(dialog.getByText(/Rolled back workspace customization/i)).toBeVisible();
  });

  test('Player (/player) boundary flow: permits local HUD + owned PC writebacks while blocking unowned PC max HP & campaign mutations, and rolls back via Ctrl+Z', async ({
    page,
  }) => {
    const capturedRequestBodies: Array<Record<string, any>> = [];

    await page.route('**/api/workspace-architect', async (route) => {
      const body = route.request().postDataJSON() as Record<string, any>;
      capturedRequestBodies.push(body);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          provider: 'cloud_pro',
          turn: {
            reply:
              'Prepared your local Play HUD layout and Sanity tracker for Investigator Alice.',
            patch: {
              // Unauthorized campaign-level mutation (must be stripped for player)
              campaignMode: {
                mode: 'duet',
                prepTargetOverrides: { secrets: 9 },
              },
              terminologyMap: {
                gold: 'Credits',
              },
              hudLayoutPrefs: {
                widgets: {
                  clocks: { visible: true, pinnedTop: true, order: 0 },
                },
              },
              systemFlavorAndTrackers: {
                resourcePoolTemplates: [
                  { name: 'Sanity', max: 80, rechargeOn: 'long' },
                ],
              },
              pcPatches: [
                {
                  // Allowed owned PC current HP writeback + forbidden GM-only ownership override
                  pcId: 'pc_alice',
                  updates: {
                    'hp.current': 21,
                    ownership: { ownerType: 'dm' },
                  },
                },
                {
                  // Unauthorized unowned PC max HP mutation (must be stripped)
                  pcId: 'pc_bob',
                  updates: {
                    'hp.max': 999,
                    'hp.current': 1,
                  },
                },
              ],
            },
          },
        }),
      });
    });

    await page.goto('/e2e-sandbox?suite=workspace-customizer&role=player');
    await expect(page.getByTestId('e2e-customizer-harness')).toHaveAttribute(
      'data-hydrated',
      'true',
    );
    await expect(page.getByTestId('e2e-role')).toHaveText('player');
    await expect(page.getByTestId('e2e-alice-hp')).toHaveText('28/28');
    await expect(page.getByTestId('e2e-bob-maxhp')).toHaveText('42');

    // 1. Open Customizer via Ctrl + Shift + K
    await page.keyboard.press('Control+Shift+K');
    const dialog = page.getByRole('dialog', {
      name: /Conversational Campaign & Table Customizer/i,
    });
    await expect(dialog).toBeVisible();

    // 2. Submit mixed prompt
    const promptInput = dialog.getByLabel(
      /Describe your system, custom trackers, terminology, or HUD layout/i,
    );
    await promptInput.fill(
      'Switch campaign to Duet, set Bob max HP to 999, set my current HP to 21, add Sanity, rename Gold to Credits, and pin Clocks',
    );
    await dialog.getByRole('button', { name: /Compile/i }).click();

    // 3. Verify Diff Preview + Guardrail warnings + Campaign button disabled
    await expect(dialog.getByTestId('workspace-diff-preview')).toBeVisible();
    await expect(dialog.getByText(/CRDT Privacy & Authority Guard/i)).toBeVisible();
    await expect(
      dialog.getByText(/Blocked modification to unowned PC "pc_bob"/i),
    ).toBeVisible();
    await expect(
      dialog.getByText(
        /Campaign mode and prep target overrides require GM campaign-owner authority/i,
      ),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: /^Apply to Campaign$/i }),
    ).toBeDisabled();

    // Outbound player context never includes unowned PC or GM notes
    expect(capturedRequestBodies).toHaveLength(1);
    const serializedReq = JSON.stringify(capturedRequestBodies[0]);
    expect(serializedReq).not.toContain('TOP_SECRET_CULT_LEADER_IS_MAYOR_VANCE');
    expect(serializedReq).not.toContain('pc_bob');

    // 4. Apply to Local HUD & My Sheet
    await dialog
      .getByRole('button', { name: /Apply to Local HUD & My Sheet/i })
      .click();

    // Claimed PC & local HUD updated; unowned PC max HP and campaign mode untouched!
    await expect(page.getByTestId('e2e-alice-hp')).toHaveText('21/28');
    await expect(page.getByTestId('e2e-alice-pools')).toHaveText('Sanity');
    await expect(page.getByTestId('e2e-gold-label')).toHaveText('Credits');
    await expect(page.getByTestId('e2e-pinned-widgets')).toHaveText('clocks');
    await expect(page.getByTestId('e2e-bob-maxhp')).toHaveText('42');
    await expect(page.getByTestId('e2e-campaign-mode')).toHaveText('standard');
    await expect(page.getByTestId('e2e-prep-secrets')).toHaveText('default');

    // 5. Press Ctrl + Z to roll back cleanly
    await page.keyboard.press('Control+z');

    await expect(page.getByTestId('e2e-alice-hp')).toHaveText('28/28');
    await expect(page.getByTestId('e2e-alice-pools')).toHaveText('none');
    await expect(page.getByTestId('e2e-gold-label')).toHaveText('Gold');
    await expect(page.getByTestId('e2e-pinned-widgets')).toHaveText('none');
    await expect(page.getByTestId('e2e-bob-maxhp')).toHaveText('42');
    await expect(dialog.getByText(/Rolled back workspace customization/i)).toBeVisible();
  });
});
