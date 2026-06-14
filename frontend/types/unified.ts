// Unified types bridging Discord + WhatsApp — single interface for the unified inbox.

export type Platform = 'whatsapp' | 'discord';

// ==================== Conversation ====================

export interface UnifiedConversation {
  /** Unique key for the conversation (includes platform prefix for dedup). */
  id: string;
  platform: Platform;

  contactName: string | null;
  /** Discord: contactDiscordId, WhatsApp: contactNumber (raw, without mask). */
  contactIdentifier: string;
  lastMessage: string | null;
  lastMessageTime: string | null;
  unreadCount: number;

  // Takeover
  isTakenOver: boolean;
  takenOverBy: string | null;
  /** Operator who currently holds the takeover (WhatsApp). */
  takenOverAt: string | null;

  avatarUrl: string | null;

  // Lead enrichment (WhatsApp has richer data)
  leadScore: number | null;
  lifecycleStage: string | null;
  contactMissing: boolean;

  // Platform-specific metadata, retained for detail panel and API calls
  metadata: DiscordConversationMeta | WhatsAppConversationMeta;
}

export interface DiscordConversationMeta {
  accountId: string;
  channelId: string;
  channelType: 'DM' | 'GUILD_TEXT';
  guildId: string | null;
  guildName: string | null;
  hasSignature: boolean;
  source: string;
}

export interface WhatsAppConversationMeta {
  sessionId: string;
  contactNumber: string;
  userNumber: string;
  isBotActive: boolean;
}

// ==================== Message ====================

export interface UnifiedMessage {
  id: string;
  platform: Platform;
  fromMe: boolean;
  body: string | null;
  timestamp: string;
  aiProcessed: boolean;
  messageType: string;
  /** WhatsApp uses 'incoming'/'outgoing'; Discord uses fromMe bool. Normalized. */
  direction: 'incoming' | 'outgoing';
  /** WhatsApp only — message send/read status. */
  status: string | null;
}

// ==================== Takeover ====================

export interface TakeoverState {
  isTakenOver: boolean;
  takenOverBy: string | null;
  loading: boolean;
}
