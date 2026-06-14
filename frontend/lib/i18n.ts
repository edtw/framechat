// Internationalization (i18n) - Preparado para multi-idioma
// Atualmente em PT-BR, fácil expandir para EN, ES, etc.

import { useState, useEffect } from "react";

export const translations = {
  "pt-BR": {
    // Inbox
    inbox: "Caixa de Entrada",
    newConversation: "Nova conversa",
    searchConversations: "Buscar conversas...",
    filter: "Filtrar",
    noConversations: "Nenhuma conversa",
    noConversationsDescription:
      "Inicie uma nova conversa ou aguarde mensagens recebidas",

    // Conversation status
    agent: "Agente",
    assigned: "Atribuída",
    you: "Você",

    // Takeover
    youAreHandling: "Você está gerenciando esta conversa",
    userIsHandling: "{user} está gerenciando esta conversa",
    agentIsHandling: "Agente está gerenciando esta conversa",
    agentResponsesPaused: "Respostas automáticas pausadas",
    automatedResponsesActive: "Respostas automáticas ativas",
    takeOver: "Assumir",
    returnToAgent: "Devolver ao Agente",
    takingOver: "Assumindo...",
    returning: "Devolvendo...",

    // Message composer
    typeMessage: "Digite uma mensagem...",
    attachFile: "Anexar arquivo",
    sendMessage: "Enviar mensagem",
    pressEnterToSend:
      "Pressione Enter para enviar, Shift + Enter para nova linha",

    // Chat window
    online: "Online",
    offline: "Offline",
    typing: "digitando...",
    viewProfile: "Ver perfil",
    closeConversation: "Fechar conversa",
    assignTo: "Atribuir para",

    // Common
    loading: "Carregando...",
    error: "Erro",
    success: "Sucesso",
    cancel: "Cancelar",
    save: "Salvar",
    delete: "Excluir",
    edit: "Editar",

    // Time
    justNow: "Agora mesmo",
    minutesAgo: "{minutes} minutos atrás",
    hoursAgo: "{hours} horas atrás",
    daysAgo: "{days} dias atrás",

    // Errors
    failedToSend: "Falha ao enviar mensagem",
    failedToLoad: "Falha ao carregar",
    tryAgain: "Tentar novamente",

    // CRM Sidebar
    favorites: "FAVORITOS",
    allProjects: "TODOS OS PROJETOS",
    archive: "ARQUIVO",
    newProject: "Novo Projeto",
    search: "Pesquisar...",

    // CRM Tabs
    tasks: "Tarefas",
    timeline: "Linha do Tempo",
    files: "Arquivos",
    overview: "Visão Geral",

    // View Modes
    kanban: "Kanban",
    table: "Tabela",
    listView: "Lista",

    // Kanban
    newRequest: "Nova Solicitação",
    inProgress: "Em Progresso",
    complete: "Concluído",
    addSubtask: "Adicionar Subtarefa",
    addColumn: "Adicionar Coluna",

    // AI
    aiProspecting: "AI Prospecção",
    niche: "Nicho/Segmento",
    region: "Região",
    dataSources: "Fontes de Dados",
    startProspecting: "Iniciar Prospecção IA",

    // Task Details
    title: "Título",
    description: "Descrição",
    status: "Status",
    priority: "Prioridade",
    assignees: "Responsáveis",
    dueDate: "Data de Vencimento",
    comments: "Comentários",
    attachments: "Anexos",

    // Table
    task: "Tarefa",
    assignee: "Responsável",
    tags: "Tags",

    // Calendar
    calendar: "Calendário",
    sharedCalendar: "Calendário Compartilhado",
    myCalendar: "Meu Calendário",
    today: "Hoje",
    week: "Semana",
    month: "Mês",
    agenda: "Agenda",
    createEvent: "Criar Evento",
    eventTitle: "Título do Evento",
    eventDescription: "Descrição do Evento",
    startDate: "Data de Início",
    endDate: "Data de Término",
    location: "Local",
    attendees: "Participantes",
    allDay: "Dia Inteiro",
    repeat: "Repetir",
    reminder: "Lembrete",

    // Team Chat
    teamChat: "Chat da Equipe",
    channels: "Canais",
    directMessages: "Mensagens Diretas",
    general: "Geral",
    development: "Desenvolvimento",
    design: "Design",
    marketing: "Marketing",
    videoEditing: "Edição de Vídeo",
    newChannel: "Novo Canal",
    addMembers: "Adicionar Membros",
    searchMessages: "Buscar mensagens...",
    pinMessage: "Fixar mensagem",
    editMessage: "Editar mensagem",
    deleteMessage: "Deletar mensagem",
    reply: "Responder",
    thread: "Thread",
    reactions: "Reações",

    // Sidebar
    collapseAll: "Recolher Tudo",
    expandAll: "Expandir Tudo",
    hideSidebar: "Esconder Barra Lateral",
    showSidebar: "Mostrar Barra Lateral",
  },

  "en-US": {
    // Inbox
    inbox: "Inbox",
    newConversation: "New conversation",
    searchConversations: "Search conversations...",
    filter: "Filter",
    noConversations: "No conversations",
    noConversationsDescription: "Start a new conversation or wait for incoming messages",

    // Conversation status
    agent: "Agent",
    assigned: "Assigned",
    you: "You",

    // Takeover
    youAreHandling: "You are managing this conversation",
    userIsHandling: "{user} is managing this conversation",
    agentIsHandling: "Agent is managing this conversation",
    agentResponsesPaused: "Automated responses paused",
    automatedResponsesActive: "Automated responses active",
    takeOver: "Take Over",
    returnToAgent: "Return to Agent",
    takingOver: "Taking over...",
    returning: "Returning...",

    // Message composer
    typeMessage: "Type a message...",
    attachFile: "Attach file",
    sendMessage: "Send message",
    pressEnterToSend: "Press Enter to send, Shift + Enter for new line",

    // Chat window
    online: "Online",
    offline: "Offline",
    typing: "typing...",
    viewProfile: "View profile",
    closeConversation: "Close conversation",
    assignTo: "Assign to",

    // Common
    loading: "Loading...",
    error: "Error",
    success: "Success",
    cancel: "Cancel",
    save: "Save",
    delete: "Delete",
    edit: "Edit",

    // Time
    justNow: "Just now",
    minutesAgo: "{minutes} minutes ago",
    hoursAgo: "{hours} hours ago",
    daysAgo: "{days} days ago",

    // Errors
    failedToSend: "Failed to send message",
    failedToLoad: "Failed to load",
    tryAgain: "Try again",

    // CRM Sidebar
    favorites: "FAVORITES",
    allProjects: "ALL PROJECTS",
    archive: "ARCHIVE",
    newProject: "New Project",
    search: "Search...",

    // CRM Tabs
    tasks: "Tasks",
    timeline: "Timeline",
    files: "Files",
    overview: "Overview",

    // View Modes
    kanban: "Kanban",
    table: "Table",
    listView: "List View",

    // Kanban
    newRequest: "New Request",
    inProgress: "In Progress",
    complete: "Complete",
    addSubtask: "Add Subtask",
    addColumn: "Add Column",

    // AI
    aiProspecting: "AI Prospecting",
    niche: "Niche/Segment",
    region: "Region",
    dataSources: "Data Sources",
    startProspecting: "Start AI Prospecting",

    // Task Details
    title: "Title",
    description: "Description",
    status: "Status",
    priority: "Priority",
    assignees: "Assignees",
    dueDate: "Due Date",
    comments: "Comments",
    attachments: "Attachments",

    // Table
    task: "Task",
    assignee: "Assignee",
    tags: "Tags",

    // Calendar
    calendar: "Calendar",
    sharedCalendar: "Shared Calendar",
    myCalendar: "My Calendar",
    today: "Today",
    week: "Week",
    month: "Month",
    agenda: "Agenda",
    createEvent: "Create Event",
    eventTitle: "Event Title",
    eventDescription: "Event Description",
    startDate: "Start Date",
    endDate: "End Date",
    location: "Location",
    attendees: "Attendees",
    allDay: "All Day",
    repeat: "Repeat",
    reminder: "Reminder",

    // Team Chat
    teamChat: "Team Chat",
    channels: "Channels",
    directMessages: "Direct Messages",
    general: "General",
    development: "Development",
    design: "Design",
    marketing: "Marketing",
    videoEditing: "Video Editing",
    newChannel: "New Channel",
    addMembers: "Add Members",
    searchMessages: "Search messages...",
    pinMessage: "Pin message",
    editMessage: "Edit message",
    deleteMessage: "Delete message",
    reply: "Reply",
    thread: "Thread",
    reactions: "Reactions",

    // Sidebar
    collapseAll: "Collapse All",
    expandAll: "Expand All",
    hideSidebar: "Hide Sidebar",
    showSidebar: "Show Sidebar",
    close: "Close",
  },

  "es-ES": {
    // Inbox
    inbox: "Bandeja de entrada",
    newConversation: "Nueva conversación",
    searchConversations: "Buscar conversaciones...",
    filter: "Filtrar",
    noConversations: "Sin conversaciones",
    noConversationsDescription: "Inicia una nueva conversación o espera mensajes entrantes",

    // Conversation status
    agent: "Agente",
    assigned: "Asignada",
    you: "Tú",

    // Takeover
    youAreHandling: "Estás gestionando esta conversación",
    userIsHandling: "{user} está gestionando esta conversación",
    agentIsHandling: "El agente está gestionando esta conversación",
    agentResponsesPaused: "Respuestas automáticas pausadas",
    automatedResponsesActive: "Respuestas automáticas activas",
    takeOver: "Tomar Control",
    returnToAgent: "Devolver al Agente",
    takingOver: "Tomando control...",
    returning: "Devolviendo...",

    // Message composer
    typeMessage: "Escribe un mensaje...",
    attachFile: "Adjuntar archivo",
    sendMessage: "Enviar mensaje",
    pressEnterToSend: "Presiona Enter para enviar, Shift + Enter para nueva línea",

    // Chat window
    online: "En línea",
    offline: "Desconectado",
    typing: "escribiendo...",
    viewProfile: "Ver perfil",
    closeConversation: "Cerrar conversación",
    assignTo: "Asignar a",

    // Common
    loading: "Cargando...",
    error: "Error",
    success: "Éxito",
    cancel: "Cancelar",
    save: "Guardar",
    delete: "Eliminar",
    edit: "Editar",

    // Time
    justNow: "Justo ahora",
    minutesAgo: "hace {minutes} minutos",
    hoursAgo: "hace {hours} horas",
    daysAgo: "hace {days} días",

    // Errors
    failedToSend: "Fallo al enviar mensaje",
    failedToLoad: "Fallo al cargar",
    tryAgain: "Intentar de nuevo",

    // CRM Sidebar
    favorites: "FAVORITOS",
    allProjects: "TODOS LOS PROYECTOS",
    archive: "ARCHIVO",
    newProject: "Nuevo Proyecto",
    search: "Buscar...",

    // CRM Tabs
    tasks: "Tareas",
    timeline: "Línea de Tiempo",
    files: "Archivos",
    overview: "Resumen",

    // View Modes
    kanban: "Kanban",
    table: "Tabla",
    listView: "Vista de Lista",

    // Kanban
    newRequest: "Nueva Solicitud",
    inProgress: "En Progreso",
    complete: "Completado",
    addSubtask: "Añadir Subtarea",
    addColumn: "Añadir Columna",

    // AI
    aiProspecting: "AI Prospección",
    niche: "Nicho/Segmento",
    region: "Región",
    dataSources: "Fuentes de Datos",
    startProspecting: "Iniciar Prospección IA",

    // Task Details
    title: "Título",
    description: "Descripción",
    status: "Estado",
    priority: "Prioridad",
    assignees: "Asignados",
    dueDate: "Fecha de Vencimiento",
    comments: "Comentarios",
    attachments: "Adjuntos",

    // Table
    task: "Tarea",
    assignee: "Asignado",
    tags: "Etiquetas",

    // Calendar
    calendar: "Calendario",
    sharedCalendar: "Calendario Compartido",
    myCalendar: "Mi Calendario",
    today: "Hoy",
    week: "Semana",
    month: "Mes",
    agenda: "Agenda",
    createEvent: "Crear Evento",
    eventTitle: "Título del Evento",
    eventDescription: "Descripción del Evento",
    startDate: "Fecha de Inicio",
    endDate: "Fecha de Fin",
    location: "Ubicación",
    attendees: "Asistentes",
    allDay: "Todo el Día",
    repeat: "Repetir",
    reminder: "Recordatorio",

    // Team Chat
    teamChat: "Chat del Equipo",
    channels: "Canales",
    directMessages: "Mensajes Directos",
    general: "General",
    development: "Desarrollo",
    design: "Diseño",
    marketing: "Marketing",
    videoEditing: "Edición de Video",
    newChannel: "Nuevo Canal",
    addMembers: "Añadir Miembros",
    searchMessages: "Buscar mensajes...",
    pinMessage: "Fijar mensaje",
    editMessage: "Editar mensaje",
    deleteMessage: "Eliminar mensaje",
    reply: "Responder",
    thread: "Hilo",
    reactions: "Reacciones",

    // Sidebar
    collapseAll: "Colapsar Todo",
    expandAll: "Expandir Todo",
    hideSidebar: "Ocultar Barra Lateral",
    showSidebar: "Mostrar Barra Lateral",
    close: "Cerrar",
  },
};

export type Language = keyof typeof translations;
export type TranslationKey = keyof (typeof translations)["pt-BR"];

// Hook para usar traduções com state management
export function useTranslation() {
  const [language, setLanguage] = useState<Language>("pt-BR");

  // Load language from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedLang = localStorage.getItem("language") as Language;
      if (savedLang && translations[savedLang]) {
        setLanguage(savedLang);
      }
    }
  }, []);

  const changeLanguage = (newLang: Language) => {
    setLanguage(newLang);
    if (typeof window !== "undefined") {
      localStorage.setItem("language", newLang);
    }
  };

  const t = (key: TranslationKey, params?: Record<string, string | number>) => {
    let text = translations[language][key] || key;

    // Replace params like {user}, {minutes}, etc.
    if (params) {
      Object.entries(params).forEach(([paramKey, value]) => {
        text = text.replace(`{${paramKey}}`, String(value));
      });
    }

    return text;
  };

  return {
    t,
    language,
    changeLanguage,
  };
}

// Função helper para usar diretamente
export function t(
  key: TranslationKey,
  params?: Record<string, string | number>,
  lang: Language = "pt-BR",
) {
  let text = translations[lang][key] || key;

  if (params) {
    Object.entries(params).forEach(([paramKey, value]) => {
      text = text.replace(`{${paramKey}}`, String(value));
    });
  }

  return text;
}
