// Gera o payload de seed da camada de IA a partir dos arrays do front.
// Escreve JSON em stdout. Rodar com: node_modules/.bin/vite-node scripts/gen-seed-payload.ts > seed-payload.json
import {
  IA_UNIVERSAL_RULES, STAGE_SPECIFIC_RULES, LEAD_BEHAVIORS,
  FOLLOWUP_LADDERS, HANDOFF_TRIGGERS, STAGE_PLAYBOOKS,
} from '../src/data/iaBehavior';
import { SKILL_SEEDS } from '../src/data/iaSkills';

const payload = {
  overwrite: false,
  organization_id: '11111111-1111-1111-1111-111111111111',
  rules: [...IA_UNIVERSAL_RULES, ...STAGE_SPECIFIC_RULES],
  behaviors: LEAD_BEHAVIORS,
  ladders: FOLLOWUP_LADDERS,
  triggers: HANDOFF_TRIGGERS,
  playbooks: STAGE_PLAYBOOKS,
  skills: SKILL_SEEDS,
};

process.stdout.write(JSON.stringify(payload));
