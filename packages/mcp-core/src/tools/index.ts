import type { ToolDef } from '../types';
import { agentTools } from './agents';
import { serviceTools } from './services';
import { orderTools } from './orders';
import { bountyTools } from './bounties';
import { tokenTools } from './tokens';
import { discoveryTools } from './discovery';
import { x402Tools } from './x402';
import { earnTools } from './earn';

export const allTools: ToolDef[] = [
  ...agentTools,
  ...serviceTools,
  ...orderTools,
  ...bountyTools,
  ...tokenTools,
  ...discoveryTools,
  ...x402Tools,
  ...earnTools,
];
