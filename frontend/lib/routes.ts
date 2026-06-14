export const CLIENT_HUB_BASE = '/workspace/client';
export const WHATSAPP_BASE = '/workspace/whatsapp';

export const CLIENT_HUB_ROUTES = {
  dashboard: CLIENT_HUB_BASE,
  login: `${CLIENT_HUB_BASE}/login`,
  projects: `${CLIENT_HUB_BASE}/projects`,
  newProject: `${CLIENT_HUB_BASE}/new-project`,
  library: `${CLIENT_HUB_BASE}/library`,
  media: `${CLIENT_HUB_BASE}/media`,
  notifications: `${CLIENT_HUB_BASE}/notifications`,
  profile: `${CLIENT_HUB_BASE}/profile`,
};

export const WHATSAPP_ROUTES = {
  dashboard: WHATSAPP_BASE,
  sessions: `${WHATSAPP_BASE}/sessions`,
  conversations: `${WHATSAPP_BASE}/conversations`,
  agents: `${WHATSAPP_BASE}/agents`,
  knowledge: `${WHATSAPP_BASE}/knowledge`,
  chatbot: `${WHATSAPP_BASE}/chatbot`,
  analytics: `${WHATSAPP_BASE}/analytics`,
  settings: `${WHATSAPP_BASE}/settings`,
};
