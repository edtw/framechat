// Discord domain types — mirror the /api/discord backend shapes.

export interface DiscordAccount {
  id: string;
  name: string;
  status: string; // DISCONNECTED | CONNECTING | CONNECTED | ERROR ...
  hasToken?: boolean;
  aiEnabled?: boolean;
  engagementEnabled?: boolean;
  username?: string | null;
  avatarUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
  hasSelfSignature?: boolean;
  selfSignature?: SelfSignature | null;
}

export interface DiscordConfig {
  enabled?: boolean;
  replyToDms?: boolean;
  replyToMentions?: boolean;
  maxTokens?: number;
  temperature?: number;
  agentConfig?: Record<string, unknown> | null;
  scope?: string | null;
  engagementEnabled?: boolean;
  engagementPlan?: Record<string, unknown> | null;
}

export interface DiscordQueueItem {
  id: string;
  guildName?: string | null;
  channelName?: string | null;
  triggerContext?: string | null;
  proposedMessage?: string | null;
  relevanceScore?: number | null;
  status: string; // PENDING | APPROVED | REJECTED ...
  createdAt?: string;
}

export interface DiscordConversation {
  id: string;
  channelId: string;
  channelType: 'DM' | 'GUILD_TEXT';
  guildId: string | null;
  guildName: string | null;
  contactName: string;
  contactDiscordId: string;
  lastMessage: string;
  lastMessageTime: string;
  messageCount: number;
  hasSignature: boolean;
  source: 'REACTIVE' | 'ENGAGEMENT';
}

export interface DiscordMessage {
  id: string;
  fromMe: boolean;
  body: string;
  messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';
  timestamp: string;
  aiProcessed: boolean;
}

export interface WritingSignature {
  avgMessageLength: number;
  medianMessageLength: number;
  avgWordsPerMessage: number;
  emojiFrequency: number;
  topEmojis: string[];
  punctuationStyle: string;
  capitalization: string;
  questionFrequency: number;
  exclamationFrequency: number;
  commonWords: string[];
  formalityScore: number;
  abbreviationRate: number;
  messageCount: number;
  analyzedAt?: string;
}

export interface Persona {
  id: string;
  name: string;
  description?: string | null;
  systemPrompt: string;
  avatarUrl?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    agentConfigs: number;
  };
}

export interface SelfSignature {
  avgMessageLength: number;
  medianMessageLength: number;
  avgWordsPerMessage: number;
  emojiFrequency: number;
  topEmojis: string[];
  punctuationStyle: string;
  capitalization: string;
  questionFrequency: number;
  exclamationFrequency: number;
  commonWords: string[];
  formalityScore: number;
  abbreviationRate: number;
  messageCount: number;
  analyzedAt?: string;
}
