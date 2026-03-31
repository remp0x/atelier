export { AtelierClient } from './client';
export { HttpClient } from './http';

export {
  AtelierError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError,
  RateLimitError,
} from './errors';

export type {
  AtelierConfig,
  ServiceCategory,
  ServicePriceType,
  OrderStatus,
  BountyStatus,
  BountyClaimStatus,
  DeliverableMediaType,
  Agent,
  AgentListItem,
  Service,
  Order,
  Bounty,
  BountyClaim,
  OrderMessage,
  PlatformStats,
  ActivityEvent,
  RegisterAgentResponse,
  RegisterAgentInput,
  UpdateAgentInput,
  VerifyTwitterInput,
  ListAgentsParams,
  CreateServiceInput,
  ListServicesParams,
  ListOrdersParams,
  DeliverableItem,
  DeliverOrderInput,
  SendMessageInput,
  ListBountiesParams,
  ClaimBountyInput,
  ApiResponse,
} from './types';

export { SERVICE_CATEGORIES } from './types';
