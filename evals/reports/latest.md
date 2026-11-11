# Prompt Evaluation & Regression Diff Report

- **Run ID:** `eval_1794439432475`
- **Timestamp:** `2026-11-11T23:23:52.475Z`
- **Model / Temperature:** `deterministic-local-v1` @ `temperature=0`
- **Concurrency:** `4`
- **Judge Rubric Enabled (`--judge`):** `true`
- **Baseline Compared:** `eval_1794439101673` (2026-11-11T23:18:21.673Z)

## Aggregate Metrics vs. Baseline

| Metric | Current Run | Previous Baseline | Delta |
| :--- | ---: | ---: | ---: |
| **Pass Rate** | **100.0%** (15/15) | 100.0% (15/15) | 0.0% |
| **Total Tokens** | 21900 | 21900 | 0 |
| **Input / Output Tokens** | 20535 / 1365 | 20535 / 1365 | 0 / 0 |
| **Avg Latency** | 0.2 ms | 0.2 ms | 0.0 ms |
| **SQLite Cache Hits** | 15 / 15 | 15 / 15 | — |
| **Avg Judge Score (1–5)** | 5.00 / 5 | — | — |

## Test Case Results & Regression Diff

| Suite | Case ID | Status | Baseline Diff | Checks | Judge | Cache | Latency | Tokens (Δ) |
| :--- | :--- | :---: | :---: | ---: | ---: | :---: | ---: | ---: |
| `customization_layer` | `cruise_ceiling_and_sticky_guitar` | PASS | UNCHANGED | 11/11 | 5.00/5 | HIT | 0.2 ms | 1958 (0) |
| `customization_layer` | `flanking_house_rule_non_destructive` | PASS | UNCHANGED | 10/10 | 5.00/5 | HIT | 0.2 ms | 2117 (0) |
| `customization_layer` | `reject_out_of_bounds_block_duration` | PASS | UNCHANGED | 9/9 | 5.00/5 | HIT | 0.2 ms | 1812 (0) |
| `customization_layer` | `defense_in_depth_rogue_model_mutation_blocked` | PASS | UNCHANGED | 8/8 | 5.00/5 | HIT | 0.2 ms | 1927 (0) |
| `customization_layer` | `reject_unknown_channel_enum` | PASS | UNCHANGED | 6/6 | 5.00/5 | HIT | 0.2 ms | 1917 (0) |
| `customization_layer` | `reject_destructive_list_wipe` | PASS | UNCHANGED | 7/7 | 5.00/5 | HIT | 0.2 ms | 1963 (0) |
| `customization_layer` | `reject_player_campaign_house_rule_authority` | PASS | UNCHANGED | 6/6 | 5.00/5 | HIT | 0.2 ms | 1867 (0) |
| `customization_layer` | `ambiguous_directive_requests_clarification` | PASS | UNCHANGED | 8/8 | 5.00/5 | HIT | 0.2 ms | 1991 (0) |
| `customization_layer` | `conversational_undo_ring_buffer` | PASS | UNCHANGED | 8/8 | 5.00/5 | HIT | 0.2 ms | 1798 (0) |
| `customization_layer` | `adversarial_prompt_injection_and_secret_exfil` | PASS | UNCHANGED | 7/7 | 5.00/5 | HIT | 0.2 ms | 1881 (0) |
| `scene_turn_grounding` | `persuade_grounded_npc_check` | PASS | UNCHANGED | 9/9 | 5.00/5 | HIT | 0.2 ms | 713 (0) |
| `scene_turn_grounding` | `passive_observation_no_roll` | PASS | UNCHANGED | 6/6 | 5.00/5 | HIT | 0.2 ms | 650 (0) |
| `session_load_triage` | `imminent_session_low_energy_tier_1` | PASS | UNCHANGED | 9/9 | 5.00/5 | HIT | 0.2 ms | 445 (0) |
| `session_load_triage` | `balanced_cruise_prep_tier_2` | PASS | UNCHANGED | 10/10 | 5.00/5 | HIT | 0.2 ms | 447 (0) |
| `session_load_triage` | `high_energy_weekend_surge_tier_3` | PASS | UNCHANGED | 7/7 | 5.00/5 | HIT | 0.2 ms | 414 (0) |

## Regression & Failure Diagnostics

- **Regressions:** 0
