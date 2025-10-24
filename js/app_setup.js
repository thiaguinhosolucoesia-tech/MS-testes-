/* ==================================================================
PROTÓTIPO HÍBRIDO EletroIA-MVP - PARTE 1: SETUP
Versão: FINAL COMPLETA e CORRIGIDA (Vendedores Atualizados) - 24/10/2025
==================================================================
*/

/* ==================================================================
!!! CREDENCIAIS REAIS INSERIDAS !!!
==================================================================
*/
const firebaseConfig = {
  apiKey: "AIzaSyB6mJ6Rpkb7toXJmG3fEHejC8Xctn6D8wg",
  authDomain: "eletroia-distribuidora.firebaseapp.com",
  databaseURL: "https://eletroia-distribuidora-default-rtdb.firebaseio.com",
  projectId: "eletroia-distribuidora",
  storageBucket: "eletroia-distribuidora.appspot.com",
  messagingSenderId: "579178573325",
  appId: "1:579178573325:web:b1b2295f9dbb0aa2252f44"
};

const CLOUDINARY_CLOUD_NAME = "dpaayfwlj";
const CLOUDINARY_UPLOAD_PRESET = "eletroia_unsigned";

// !!! ATENÇÃO: INSEGURANÇA !!!
// SUBSTITUA A LINHA ABAIXO PELA SUA CHAVE REAL DA API DO GEMINI (Google AI Studio)
const GEMINI_API_KEY = "AIzaSyClCOFugk4oeE_cn05Zpampe7YFlgc_8Cs"; // <<<<<<<<<<<<<<< SUBSTITUA AQUI
// -----------------------------------------------------------------------------
const GEMINI_MODEL = "gemini-2.5-flash"; // Modelo revertido para flash, pois nano não é suportado no endpoint V1.
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
/* ==================================================================
FIM DA SEÇÃO DE CREDENCIAIS
==================================================================
*/

/* ==================================================================
SISTEMA DE NOTIFICAÇÕES
==================================================================
*/
function showNotification(message, type = 'success') {
  const existingNotifications = document.querySelectorAll('.notification');
  existingNotifications.forEach(notif => notif.remove());
  const notification = document.createElement('div');
  notification.id = 'notification';
  notification.className = `notification ${type}`;
  notification.textContent = message;
  const container = document.getElementById('notification-container'); // Usa o container dedicado
  if (container) {
    container.appendChild(notification);
    void notification.offsetWidth; // Force reflow para disparar a animação
    notification.classList.add('show');
    setTimeout(() => {
      notification.classList.remove('show');
      notification.addEventListener('transitionend', () => {
        if (container.contains(notification)) container.removeChild(notification);
      }, { once: true });
    }, 4000);
  } else { console.error("Container de notificações ('notification-container') não encontrado."); }
}

/* ==================================================================
UPLOAD DE ARQUIVOS (Cloudinary)
==================================================================
*/
const uploadFileToCloudinary = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  const apiUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
  try {
    showNotification(`Enviando ${file.name}...`, 'warning');
    const response = await fetch(apiUrl, { method: 'POST', body: formData });
    if (!response.ok) {
       // Tenta extrair mensagem de erro específica do Cloudinary
       const errorData = await response.json().catch(() => ({ error: { message: `HTTP status ${response.status}` } }));
       console.error("Erro no upload para Cloudinary:", errorData);
       throw new Error(errorData.error?.message || `Falha no upload para Cloudinary (${response.status})`);
    }
    const data = await response.json();
    showNotification(`Arquivo '${file.name}' enviado com sucesso!`, 'success');
    console.log("Cloudinary upload response:", data); // Log para depuração
    return data.secure_url; // Retorna a URL segura
  } catch (error) {
    console.error("Erro detalhado no uploadFileToCloudinary:", error);
    showNotification(`Erro no upload de ${file.name}: ${error.message}`, 'error');
    throw error; // Re-lança o erro para ser tratado pela função chamadora (saveLogAndUploads)
  }
};

/* ==================================================================
INICIALIZAÇÃO DO SISTEMA E ESTADO GLOBAL
==================================================================
*/
// Estado da Aplicação (Variáveis Globais)
let currentUser = null; // Informações do usuário logado
let allPedidos = {}; // Cache local de todos os pedidos carregados do Firebase
let configData = { produtos: [] }; // Configurações (principalmente lista de produtos)
let vendedores = []; // Lista de vendedores carregada (Firebase ou fallback)
let lightboxMedia = []; // Array de mídias para o lightbox atual
let currentLightboxIndex = 0; // Índice da mídia atual no lightbox
let filesToUpload = []; // Array de arquivos selecionados para upload
let initialDataLoaded = false; // Flag: Dados iniciais dos pedidos já carregados?
let itensAdicionadosState = []; // Estado local dos itens no modal de detalhes
let isMyAgendaViewActive = false; // Flag: Visão "Minha Agenda" está ativa?
let listenersAttached = false; // Flag: Listeners de UI já foram anexados?

// Constantes Globais
const FORMAS_PAGAMENTO = ['PIX', 'Boleto', 'Cartão de Crédito', 'Dinheiro', 'Transferência'];
const STATUS_LIST = ['Novos-Leads', 'Em-Negociacao', 'Aguardando-Pagamento', 'Entregue'];
// Regras simples de cross-sell (exemplo)
const CROSS_SELL_RULES = {
    "Disjuntor Steck": ["Caixa de Passagem Steck", "Fita Isolante"],
    "Cabo Flexível": ["Eletroduto Corrugado", "Conector Wago"],
    "Tomada Dupla": ["Placa 4x2", "Interruptor Simples"]
};
const FREQUENCY_ALERT_DAYS = 45; // Dias para alerta de frequência de compra

// Seletores DOM (Cache para performance)
const userScreen = document.getElementById('userScreen');
const app = document.getElementById('app');
const userList = document.getElementById('userList');
const vendedorDashboard = document.getElementById('vendedorDashboard');
const addPedidoBtn = document.getElementById('addPedidoBtn');
const logoutButton = document.getElementById('logoutButton');
const pedidoModal = document.getElementById('pedidoModal');
const pedidoForm = document.getElementById('pedidoForm');
const detailsModal = document.getElementById('detailsModal');
const deleteBtn = document.getElementById('deleteBtn');
const configBtn = document.getElementById('configBtn');
const configModal = document.getElementById('configModal');
const logForm = document.getElementById('logForm');
const lightbox = document.getElementById('lightbox');
const mediaInput = document.getElementById('media-input');
const globalSearchInput = document.getElementById('globalSearchInput');
const globalSearchResults = document.getElementById('globalSearchResults');
const confirmDeleteModal = document.getElementById('confirmDeleteModal');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteText = document.getElementById('confirmDeleteText');
const openCameraBtn = document.getElementById('openCameraBtn');
const openGalleryBtn = document.getElementById('openGalleryBtn');
const fileNameDisplay = document.getElementById('fileName');
const lightboxClose = document.getElementById('lightbox-close');
const toggleAgendaBtn = document.getElementById('toggleAgendaBtn');
const dashboardNav = document.getElementById('dashboard-nav');
const dashboardTitle = document.getElementById('dashboard-title');

// Funções Utilitárias de Formatação
const formatCurrency = (value) => `R$ ${parseFloat(value || 0).toFixed(2).replace('.', ',')}`;
const formatStatus = (status) => status ? status.replace(/-/g, ' ') : 'Status Inválido'; // Troca hífens por espaços
const formatDate = (isoString) => isoString ? new Date(isoString).toLocaleDateString('pt-BR') : 'Data Inválida';
const formatDateTime = (isoString) => isoString ? new Date(isoString).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'}) : 'Data/Hora Inválida';

// --- Inicialização do Firebase ---
let db; // Variável global para a instância do database
try {
    // Inicializa o Firebase apenas se ainda não foi inicializado
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log("Firebase inicializado com sucesso.");
    } else {
        firebase.app(); // Pega a instância já inicializada
        console.log("Firebase já estava inicializado.");
    }
    db = firebase.database(); // Pega a referência do Realtime Database
} catch(e) {
    console.error("Erro CRÍTICO na inicialização do Firebase:", e);
    // Tenta notificar o usuário após um pequeno delay
    setTimeout(() => showNotification("Erro crítico: Falha ao conectar com o banco de dados. Recarregue a página.", "error"), 500);
    // Interrompe a execução se o Firebase falhar
    throw new Error("Falha na inicialização do Firebase. A aplicação não pode continuar.");
}

/* ==================================================================
LÓGICA DE LOGIN E AUTENTICAÇÃO
==================================================================
*/
// Carrega a lista de vendedores (do Firebase ou fallback)
const loadVendedores = async () => {
     try {
        if (!db) throw new Error("DB Firebase não disponível para carregar vendedores.");
        const snapshot = await db.ref('vendedores').once('value'); // Lê o nó 'vendedores' uma vez
        const vendedoresData = snapshot.val();

        // Tenta carregar do Firebase
        if (vendedoresData && typeof vendedoresData === 'object' && Object.keys(vendedoresData).length > 0) {
            // Mapeia o objeto do Firebase para um array de objetos de vendedor
            vendedores = Object.entries(vendedoresData).map(([key, value]) => ({
                id: key, // Usa a chave do Firebase como ID
                name: value.name || `Usuário ${key.slice(-4)}`, // Usa o nome salvo ou um padrão
                role: value.role || 'Vendedor' // Usa o cargo salvo ou 'Vendedor' como padrão
            }));
            console.log("Vendedores carregados do Firebase:", vendedores);
        } else {
             // Se Firebase vazio/erro, usa a lista fixa ATUALIZADA
             console.warn("Nenhum vendedor encontrado no Firebase ou formato inválido. Usando lista fallback.");
             vendedores = [
                 { id: 'vend001', name: 'Thiago Ventura Valêncio', role: 'Vendedor' }, // ATUALIZADO
                 { id: 'vend002', name: 'Mauro Andrigo', role: 'Vendedor' },            // ATUALIZADO
                 { id: 'gest001', name: 'Raul Scremin', role: 'Gestor' },              // ATUALIZADO
                 { id: 'gest002', name: 'Guilherme Scremin', role: 'Gestor' }          // ATUALIZADO
                ];
             console.log("Usando vendedores da lista fallback:", vendedores);
        }
         // Validação final: Garante que haja pelo menos um vendedor
         if(vendedores.length === 0){
             console.error("CRÍTICO: Lista de vendedores está vazia mesmo após fallback.");
             showNotification("Erro: Nenhum vendedor configurado na aplicação.", "error");
        }
     } catch (error) {
        console.error("Erro grave ao carregar vendedores:", error);
        showNotification("Erro ao carregar lista de vendedores.", "error");
        vendedores = []; // Define como vazio em caso de erro para evitar problemas posteriores
    }
};

// Realiza o login do usuário selecionado
const loginUser = async (user) => {
    // Validação básica do objeto 'user'
    if (!user || typeof user !== 'object' || !user.name) {
         console.error("Tentativa de login com dados de usuário inválidos:", user);
         showNotification("Erro: Dados de usuário inválidos.", "error");
         return;
    }
    console.log(`Logando como: ${user.name} (${user.role})`);
    currentUser = user; // Define o usuário atual globalmente
    localStorage.setItem('eletroIAUser', JSON.stringify(user)); // Salva no localStorage para persistência

    // Atualiza UI com nome do usuário
    const userNameDisplay = document.getElementById('currentUserName');
    if(userNameDisplay) userNameDisplay.textContent = user.name;

    // Controla visibilidade de botões baseada no cargo (role)
    const isGestor = user.role?.toLowerCase().includes('gestor');
    if(configBtn) configBtn.classList.toggle('hidden', !isGestor); // Mostra/esconde botão Produtos
    const tabBtnGerencial = document.getElementById('tab-btn-gerencial');
    if(tabBtnGerencial) tabBtnGerencial.classList.toggle('hidden', !isGestor); // Mostra/esconde aba Gerencial

    // Mostra a aplicação principal e esconde a tela de login
    if(dashboardNav) dashboardNav.classList.remove('hidden');
    if(userScreen) userScreen.classList.add('hidden');
    if(app) app.classList.remove('hidden');

    // Mostra indicador de carregamento no dashboard
    if(vendedorDashboard) vendedorDashboard.innerHTML = '<p class="text-center tc my-10 animate-pulse">Carregando painel...</p>';

    // Carrega configurações e inicializa o dashboard e listeners de pedidos
    await loadConfig();       // Carrega produtos, etc.
    initializeDashboard();    // Monta a estrutura do Kanban
    listenToPedidos();        // Conecta ao Firebase para carregar e ouvir pedidos

    // A chamada setupEventListeners() está agora na função startApp()

    // Renderiza o painel gerencial se for gestor, senão garante que a aba de vendas esteja ativa
    if (isGestor && typeof renderDashboardGerencial === 'function') {
         renderDashboardGerencial();
    } else if (typeof switchDashboardTab === 'function') {
        switchDashboardTab('vendas');
    }
};

// Verifica se há um usuário salvo no localStorage e tenta logar
const checkLoggedInUser = async () => {
    console.log("Verificando usuário logado...");
    // Garante que a lista de vendedores (Firebase ou fallback) seja carregada primeiro
    await loadVendedores();
    const storedUser = localStorage.getItem('eletroIAUser'); // Tenta pegar usuário salvo

    if (storedUser) { // Se encontrou algo no localStorage
        try {
            const parsedUser = JSON.parse(storedUser); // Tenta converter de string JSON para objeto
            // Verifica se o usuário salvo AINDA EXISTE na lista atual de vendedores
            if(vendedores.some(v => v.name === parsedUser.name)){
                console.log(`Usuário ${parsedUser.name} encontrado no localStorage. Logando...`);
                await loginUser(parsedUser); // Realiza o login automaticamente
            } else {
                // O usuário salvo não está mais na lista (removido do Firebase/fallback?)
                console.warn("Usuário salvo no localStorage é inválido ou não existe mais na lista atual. Removendo...");
                localStorage.removeItem('eletroIAUser'); // Limpa localStorage
                displayLoginScreen(); // Mostra a tela de login
            }
        } catch(e) {
            // Erro ao parsear o JSON (dado corrompido no localStorage)
            console.error("Erro ao processar usuário salvo no localStorage:", e);
            localStorage.removeItem('eletroIAUser'); // Limpa localStorage
            displayLoginScreen(); // Mostra a tela de login
        }
    } else {
        // Nenhum usuário salvo, mostra a tela de login
        console.log("Nenhum usuário salvo encontrado. Exibindo tela de login.");
        displayLoginScreen();
    }
};

// Exibe a tela de seleção de usuário (login)
const displayLoginScreen = () => {
     // Garante que a tela de login esteja visível e a app principal escondida
     if(userScreen) userScreen.classList.remove('hidden');
     if(app) app.classList.add('hidden');
     if(dashboardNav) dashboardNav.classList.add('hidden'); // Esconde nav se não logado

     if (userList) { // Se o container da lista de usuários existe
         if(vendedores.length > 0){ // Se a lista de vendedores foi carregada
            // Gera os botões HTML para cada vendedor
            userList.innerHTML = vendedores.map(user =>
                // Usa JSON.stringify e replace para armazenar dados do usuário no botão
                `<div class="p-4 bg-gray-50 border border-gray-200 rounded-lg hover:bg-blue-100 hover:shadow-md cursor-pointer shadow-sm transition-all user-btn"
                     data-user='${JSON.stringify(user).replace(/'/g, "&apos;")}'
                     role="button" tabindex="0" aria-label="Entrar como ${user.name}">
                  <p class="font-semibold text-gray-800 pointer-events-none">${user.name}</p>
                  <p class="text-sm text-gray-500 pointer-events-none">${user.role||'Vendedor'}</p>
                </div>`
            ).join('');
        } else {
            // Mensagem de erro se nenhum vendedor foi carregado
            userList.innerHTML = '<p class="text-red-500 text-sm col-span-full">Erro crítico: Nenhum usuário encontrado para login.</p>';
        }
    } else {
        // Erro grave se o container da lista não existe no HTML
        console.error("Elemento 'userList' (container dos botões de login) não encontrado no HTML.");
        // Alerta visível se a tela de login deveria estar ativa
        if(userScreen && !userScreen.classList.contains('hidden')) alert("Erro fatal: A interface de login está incompleta. Contate o suporte.");
    }
};


/* ==================================================================
LÓGICA DO DASHBOARD E KANBAN
==================================================================
*/
// Monta a estrutura inicial do dashboard (seções de vendedor e colunas de status)
const initializeDashboard = () => {
    if (!vendedorDashboard) { console.error("Elemento 'vendedorDashboard' não encontrado."); return; }
    // Verifica se a lista de vendedores foi carregada
    if (vendedores.length === 0 && !currentUser) { // Permite inicializar mesmo sem vendedores se já logado (caso raro)
        vendedorDashboard.innerHTML = '<p class="text-center text-red-500 my-10">Erro: Vendedores não carregados. Não é possível montar o painel.</p>';
        return;
    }

    vendedorDashboard.innerHTML = ''; // Limpa o conteúdo anterior

    // Define quais vendedores exibir baseado na visão (Todos ou Minha Agenda)
    const vendedoresToShow = isMyAgendaViewActive && currentUser ?
                               vendedores.filter(v => v.name === currentUser.name) :
                               vendedores;

    // Caso especial: Minha Agenda ativa, mas o usuário atual não está na lista (improvável)
    if (vendedoresToShow.length === 0 && isMyAgendaViewActive) {
         vendedorDashboard.innerHTML = '<p class="text-center text-gray-500 my-10">Nenhum pedido encontrado para o seu usuário.</p>';
         if (dashboardTitle) dashboardTitle.textContent = `Minha Agenda - ${currentUser.name}`;
         return;
    }
    // Caso especial: Nenhum vendedor cadastrado
     if (vendedoresToShow.length === 0 && !isMyAgendaViewActive) {
         vendedorDashboard.innerHTML = '<p class="text-center text-gray-500 my-10">Nenhum vendedor cadastrado para exibir.</p>';
          if (dashboardTitle) dashboardTitle.textContent = 'Visão Geral';
         return;
    }


    // Cria a seção e as colunas para cada vendedor a ser exibido
    vendedoresToShow.forEach(vendedor => {
        const vendedorSection = document.createElement('section');
        vendedorSection.className = 'vendedor-section';
        // ID único para a seção, útil para targeting futuro
        vendedorSection.id = `section-${vendedor.name.replace(/[^a-zA-Z0-9]/g, '-')}`; // Sanitiza nome para ID

        // Cabeçalho com o nome do vendedor
        const header = document.createElement('h2');
        header.className = 'vendedor-header';
        header.textContent = vendedor.name;
        vendedorSection.appendChild(header);

        // Container para as colunas Kanban
        const kanbanContainer = document.createElement('div');
        kanbanContainer.className = 'kanban-container';

        // Cria as colunas de status (Novos-Leads, Em-Negociacao, etc.)
        STATUS_LIST.forEach(status => {
            const statusColumn = document.createElement('div');
            statusColumn.className = 'status-column';
            statusColumn.dataset.statusHeader = status; // Armazena o status original

            // Cabeçalho da coluna (ex: "Novos Leads")
            const statusHeader = document.createElement('h3');
            statusHeader.textContent = formatStatus(status); // Formata o nome do status
            statusColumn.appendChild(statusHeader);

            // Lista onde os cards de pedido serão inseridos
            const clientList = document.createElement('div');
            clientList.className = 'client-list';
            clientList.dataset.status = status; // Identifica a coluna pelo status
            clientList.dataset.vendedor = vendedor.name; // Identifica a coluna pelo vendedor
            // Placeholder inicial enquanto os dados não chegam
            clientList.innerHTML = '<p class="text-gray-400 text-xs italic p-4 tc">Aguardando pedidos...</p>';
            statusColumn.appendChild(clientList);

            kanbanContainer.appendChild(statusColumn);
        });

        vendedorSection.appendChild(kanbanContainer);
        vendedorDashboard.appendChild(vendedorSection); // Adiciona a seção completa ao dashboard
    });

    // Atualiza o título principal do dashboard
     if(dashboardTitle) dashboardTitle.textContent = isMyAgendaViewActive && currentUser ? `Minha Agenda - ${currentUser.name}` : 'Visão Geral - Todos Vendedores';
};

// Gera o HTML para um único card de pedido
const createCardHTML = (pedido) => {
    // Formata os dados para exibição, com fallbacks para dados ausentes
    const clienteDisplay = (pedido.clienteNome || 'Cliente Desconhecido').substring(0, 25); // Limita tamanho
    const dataDisplay = formatDateTime(pedido.createdAt || pedido.agendamento); // Usa createdAt como preferência
    // Garante que itens seja um array antes de processar
    const itensArray = Array.isArray(pedido.itens) ? pedido.itens : [];
    // Formata a lista de itens (incluindo quantidade e unidade)
    const itensDisplay = itensArray.length > 0 ?
                         itensArray.map(item => `${item.quantity || 1}${item.unit || 'un'} ${item.name}`).join(', ') :
                         "Sem Itens";
    const valorDisplay = formatCurrency(pedido.valorTotal);
    const vendedorDisplay = pedido.vendedorResponsavel || 'N/A';

    // Determina os status anterior e próximo para os botões de mover
    const currentStatusIndex = STATUS_LIST.indexOf(pedido.status);
    // Próximo status é válido se não for o último da lista
    const nextStatus = currentStatusIndex < STATUS_LIST.length - 1 ? STATUS_LIST[currentStatusIndex + 1] : null;
    // Status anterior é válido se não for o primeiro da lista
    const prevStatus = currentStatusIndex > 0 ? STATUS_LIST[currentStatusIndex - 1] : null;

    // Gera o HTML do card usando template literals
    return `
    <div id="${pedido.id}" class="vehicle-card status-${pedido.status}" data-id="${pedido.id}">
        <div class="flex justify-between items-start">
            <div class="card-clickable-area cursor-pointer flex-grow space-y-1 pr-2 card-info overflow-hidden" aria-label="Abrir detalhes do pedido ${pedido.pedidoNumero || pedido.id.slice(-4)} para ${clienteDisplay}">
                <div class="flex justify-between items-baseline">
                    <p class="name truncate" title="${pedido.clienteNome||'Cliente Desconhecido'}">${clienteDisplay}</p>
                    <p class="time flex-shrink-0 ml-2">${dataDisplay}</p>
                </div>
                <p class="text-sm truncate service text-gray-600" title="${itensDisplay}">${itensDisplay}</p> <!-- Mostra itens com quantidade -->
                <div class="flex justify-between items-center mt-2 pt-1 border-t border-gray-100">
                    <p class="barber text-xs">${vendedorDisplay}</p>
                    <p class="price font-semibold">${valorDisplay}</p>
                </div>
            </div>
            <div class="flex flex-col items-center justify-center -mt-1 -mr-1 flex-shrink-0">
                <button data-id="${pedido.id}" data-new-status="${nextStatus || 'null'}" class="btn-move-status p-1 rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-100 ${!nextStatus?'invisible':''}" title="Avançar Status" ${!nextStatus?'disabled':''}>
                    <i class='bx bx-chevron-right text-2xl pointer-events-none'></i> <!-- Icone não recebe eventos -->
                </button>
                <button data-id="${pedido.id}" data-new-status="${prevStatus || 'null'}" class="btn-move-status p-1 rounded-full text-gray-400 hover:text-orange-600 hover:bg-orange-100 ${!prevStatus?'invisible':''}" title="Retroceder Status" ${!prevStatus?'disabled':''}>
                    <i class='bx bx-chevron-left text-2xl pointer-events-none'></i> <!-- Icone não recebe eventos -->
                </button>
            </div>
        </div>
    </div>`;
};


 // Renderiza ou atualiza um card de pedido na coluna correta do Kanban
 const renderCard = (pedido) => {
   // --- Validações Essenciais ---
   if (!pedido || typeof pedido !== 'object' || !pedido.id || !pedido.status || !pedido.vendedorResponsavel) {
        console.warn("Tentativa de renderizar card com dados inválidos ou incompletos:", pedido);
        return; // Impede a renderização se dados essenciais faltarem
   }
   // Verifica se o status do pedido é válido
   if (!STATUS_LIST.includes(pedido.status)) {
        console.warn(`Status "${pedido.status}" inválido para o pedido ${pedido.id}. Card não será renderizado.`);
        return; // Impede renderização com status desconhecido
   }

   // --- Filtro da Visão "Minha Agenda" ---
   if (isMyAgendaViewActive && currentUser && pedido.vendedorResponsavel !== currentUser.name) {
       // Se a visão "Minha Agenda" está ativa e o pedido não é do usuário atual, remove o card se ele existir
       const existingCardElement = document.getElementById(pedido.id);
       if (existingCardElement) {
            console.log(`Removendo card ${pedido.id} (visão Minha Agenda ativa).`);
            existingCardElement.remove();
       }
       return; // Não renderiza o card de outro vendedor
   }

   // --- Geração e Inserção do Card ---
   const cardHTML = createCardHTML(pedido); // Gera o HTML do card

   // Encontra a lista (coluna) correta no DOM: baseada no VENDEDOR e STATUS
   const listSelector = `#vendedorDashboard .client-list[data-vendedor="${pedido.vendedorResponsavel}"][data-status="${pedido.status}"]`;
   let targetList = document.querySelector(listSelector);

   // Fallback: Se a lista específica Vendedor+Status não for encontrada (raro, pode acontecer se a seção do vendedor sumir)
   if (!targetList) {
       console.warn(`Lista específica ${listSelector} não encontrada. Tentando fallback para coluna de status ${pedido.status} geral.`);
       // Procura por QUALQUER coluna com o status correto (pode ir para a seção errada se houver múltiplos vendedores)
       const fallbackListSelector = `#vendedorDashboard .client-list[data-status="${pedido.status}"]`;
       targetList = document.querySelector(fallbackListSelector);
   }

   // Remove o card antigo, se ele existir em QUALQUER lugar do dashboard
   // Isso é crucial para quando um pedido muda de status ou vendedor
   const existingCardElement = document.getElementById(pedido.id);
   if (existingCardElement) {
       // Se o card antigo estava em uma lista diferente da atual, atualiza a lista antiga (adiciona placeholder se vazia)
       const oldList = existingCardElement.parentElement;
       existingCardElement.remove();
       if (oldList && oldList !== targetList && oldList.classList.contains('client-list') && oldList.children.length === 0) {
            oldList.innerHTML = '<p class="tc text-gray-400 text-xs italic p-4">Nenhum pedido neste status.</p>';
       }
   }

   // Adiciona o card (novo ou atualizado) na lista de destino correta
   if (targetList) {
       // Remove o placeholder ("Aguardando...", "Nenhum pedido...") se existir
       const placeholder = targetList.querySelector('p.text-gray-400');
       if (placeholder) placeholder.remove();
       // Insere o HTML do card no final da lista
       targetList.insertAdjacentHTML('beforeend', cardHTML);
   } else {
        // Erro grave: Não encontrou NENHUMA lista para inserir o card
        console.error(`CRÍTICO: Não foi possível encontrar a lista de destino para o pedido ${pedido.id} (Status: ${pedido.status}, Vendedor: ${pedido.vendedorResponsavel}). O card não será exibido.`);
        // Notifica o usuário sobre o problema de exibição
        showNotification(`Erro ao exibir o pedido ${pedido.pedidoNumero || pedido.id.slice(-4)}. Recarregue a página ou contate o suporte.`, 'error');
   }
 };

// Alterna a visualização do dashboard entre "Todos Vendedores" e "Minha Agenda"
const toggleMyAgendaView = () => {
    isMyAgendaViewActive = !isMyAgendaViewActive; // Inverte o estado da flag

    // Atualiza a aparência do botão "Minha Agenda" para refletir o estado ativo/inativo
    if(toggleAgendaBtn) {
        toggleAgendaBtn.classList.toggle('bg-blue-100', isMyAgendaViewActive); // Fundo azul claro se ativo
        toggleAgendaBtn.classList.toggle('text-blue-700', isMyAgendaViewActive); // Texto azul escuro se ativo
        toggleAgendaBtn.classList.toggle('border-blue-300', isMyAgendaViewActive); // Borda azul se ativo
        toggleAgendaBtn.classList.toggle('bg-white', !isMyAgendaViewActive); // Fundo branco se inativo
        toggleAgendaBtn.classList.toggle('text-gray-700', !isMyAgendaViewActive); // Texto cinza se inativo
        toggleAgendaBtn.classList.toggle('border-gray-300', !isMyAgendaViewActive); // Borda cinza se inativo
        // Atualiza o atributo aria-pressed para acessibilidade
        toggleAgendaBtn.setAttribute('aria-pressed', isMyAgendaViewActive);
    }

    // Recria a estrutura do dashboard (monta seções e colunas)
    // Isso vai mostrar apenas a seção do usuário atual se isMyAgendaViewActive for true
    initializeDashboard();

    // Renderiza novamente TODOS os cards do cache local (allPedidos)
    // A função `renderCard` possui a lógica interna para exibir apenas os cards relevantes
    // baseado no estado atual de `isMyAgendaViewActive`
    Object.values(allPedidos).forEach(renderCard);

    // Após re-renderizar, verifica se alguma lista ficou vazia e adiciona placeholder
    if(vendedorDashboard){
        vendedorDashboard.querySelectorAll('.client-list').forEach(list => {
            // Se a lista (coluna) não tem nenhum card filho
            if(list.children.length === 0){
                 list.innerHTML = '<p class="tc text-gray-400 text-xs italic p-4">Nenhum pedido para exibir neste status.</p>'; // Mensagem mais específica
            }
        });
    }
    console.log(`Visão Minha Agenda ${isMyAgendaViewActive ? 'ativada' : 'desativada'}.`);
};


/* ==================================================================
LISTENERS DO FIREBASE (Observadores em Tempo Real)
==================================================================
*/
// Configura os listeners principais para o nó 'pedidos' no Firebase
const listenToPedidos = () => {
    if (!db) { console.error("Conexão com Firebase DB não estabelecida. Listeners não podem ser anexados."); return; }

    const ref = db.ref('pedidos'); // Referência principal para todos os pedidos
    initialDataLoaded = false; // Reseta a flag de carga inicial

    // Mostra indicador de carregamento visualmente no dashboard
    if (vendedorDashboard) {
        vendedorDashboard.querySelectorAll('.client-list').forEach(list => list.innerHTML = '<p class="tc text-gray-400 text-xs italic p-4 animate-pulse">Carregando pedidos...</p>');
    } else {
        console.error("Elemento 'vendedorDashboard' não encontrado. Não é possível mostrar carregamento.");
        return; // Interrompe se o dashboard não existe
    }
    allPedidos = {}; // Limpa o cache local antes da carga inicial

    // 1. Carga Inicial: Usa '.once()' para buscar todos os dados uma vez
    console.log("Iniciando carga inicial de pedidos do Firebase...");
    ref.once('value', snapshot => {
        try {
            allPedidos = snapshot.val() || {}; // Pega os dados ou um objeto vazio se o nó não existir
            console.log(`Dados brutos recebidos (${Object.keys(allPedidos).length} nós). Processando...`);

            // Processa cada pedido recebido para adicionar ID e garantir estrutura
            Object.keys(allPedidos).forEach(key => {
                const pedido = allPedidos[key];
                if(pedido && typeof pedido === 'object') { // Verifica se é um objeto válido
                    pedido.id = key; // Adiciona a chave do Firebase como 'id'
                    // Garante que 'itens' seja sempre um array com 'quantity' e 'unit'
                    if (Array.isArray(pedido.itens)) {
                        pedido.itens = pedido.itens.map(item => ({
                            ...item,
                            quantity: item.quantity || 1, // Default 1 se ausente
                            unit: item.unit || 'un'      // Default 'un' se ausente
                        }));
                    } else {
                        // Se 'itens' não existe ou não é array, define como array vazio
                        if (pedido.itens) console.warn(`Campo 'itens' inválido para pedido ${key}, redefinindo para [].`, pedido.itens);
                        pedido.itens = [];
                    }
                } else {
                    // Remove entradas inválidas (não-objetos) do cache
                    console.warn(`Nó inválido encontrado em 'pedidos' com chave ${key}, removendo do cache.`, pedido);
                    delete allPedidos[key];
                }
            });

            // Limpa os placeholders de carregamento do dashboard
            if (vendedorDashboard) { vendedorDashboard.querySelectorAll('.client-list').forEach(list => list.innerHTML = ''); }

            // Renderiza todos os cards válidos processados
            console.log(`Processamento concluído. Renderizando ${Object.keys(allPedidos).length} cards...`);
            Object.values(allPedidos).forEach(renderCard);

            // Adiciona placeholder em colunas que ficaram vazias após a renderização
            if(vendedorDashboard){
                vendedorDashboard.querySelectorAll('.client-list').forEach(list => {
                    if(list.children.length === 0){
                        list.innerHTML = '<p class="tc text-gray-400 text-xs italic p-4">Nenhum pedido neste status.</p>';
                    }
                });
            }

            initialDataLoaded = true; // Marca que a carga inicial foi bem-sucedida
            console.log(`Carga inicial e renderização concluídas.`);

            // Confirma que os listeners de UI foram anexados (devem ter sido no startApp)
            if (!listenersAttached) {
                 console.error("ALERTA GRAVE: Listeners de UI não foram anexados durante a inicialização. A interface pode não responder.");
                 showNotification("Erro: Interações da página podem não funcionar. Recarregue.", "error");
                 // Tentar anexar agora PODE causar problemas se startApp ainda estiver rodando.
                 // É melhor focar em garantir que startApp funcione corretamente.
            }

            // 2. Inicia Listeners em Tempo Real: Usa '.on()' para ouvir mudanças futuras
            startIndividualListeners(ref);

        } catch (error) {
            console.error("Erro durante o processamento da carga inicial:", error);
            showNotification("Erro ao processar dados iniciais.", "error");
            if (vendedorDashboard) { vendedorDashboard.innerHTML = '<p class="tc text-red-500 my-10">Erro ao processar dados.</p>'; }
        }

    }, error => { // Função de callback para erro do '.once()'
        console.error("Erro crítico na carga inicial de pedidos do Firebase:", error);
        showNotification("Falha grave ao conectar e carregar dados. Verifique a conexão e as regras de segurança do Firebase.", "error");
        // Mostra erro visualmente no dashboard
        if (vendedorDashboard) { vendedorDashboard.innerHTML = '<p class="tc text-red-500 my-10">Falha crítica ao carregar dados iniciais.</p>'; }
        // Considerar desabilitar partes da UI ou mostrar mensagem de erro persistente
    });
};

// Configura os listeners individuais para 'child_added', 'child_changed', 'child_removed'
const startIndividualListeners = (ref) => {
    console.log("Anexando listeners em tempo real do Firebase...");

    // Listener para NOVOS pedidos ('child_added')
    ref.on('child_added', snapshot => {
        // Ignora eventos que chegam ANTES da carga inicial ('once') terminar
        if (!initialDataLoaded) return;
        try {
            const pedido = { ...snapshot.val(), id: snapshot.key };
            // Validação e normalização dos dados do novo pedido
            if (!pedido || typeof pedido !== 'object' || !pedido.id) {
                 console.warn("Recebido 'child_added' com dados inválidos:", snapshot.val()); return;
            }
             pedido.itens = Array.isArray(pedido.itens) ? pedido.itens.map(item => ({...item, quantity: item.quantity || 1, unit: item.unit || 'un'})) : [];

            // Adiciona ao cache local e renderiza apenas se não existir (evita duplicação com 'once')
            if (!allPedidos[pedido.id]) {
                console.log("Novo pedido detectado (child_added):", pedido.id);
                allPedidos[pedido.id] = pedido;
                renderCard(pedido);
                // Atualiza métricas gerenciais em tempo real
                if(document.getElementById('gerencial-content') && !document.getElementById('gerencial-content').classList.contains('hidden') && typeof renderDashboardGerencial === 'function') {
                    renderDashboardGerencial();
                }
            } else {
                 console.log(`'child_added' ignorado para ${pedido.id}, já carregado via 'once'.`);
            }
        } catch (error) { console.error("Erro ao processar 'child_added':", error, snapshot.val()); }
    }, error => console.error("Erro no listener 'child_added':", error)); // Callback de erro para o listener

    // Listener para pedidos MODIFICADOS ('child_changed')
    ref.on('child_changed', snapshot => {
        if (!initialDataLoaded) return;
        try {
            const pedido = { ...snapshot.val(), id: snapshot.key };
             // Validação e normalização
            if (!pedido || typeof pedido !== 'object' || !pedido.id) {
                 console.warn("Recebido 'child_changed' com dados inválidos:", snapshot.val()); return;
            }
             pedido.itens = Array.isArray(pedido.itens) ? pedido.itens.map(item => ({...item, quantity: item.quantity || 1, unit: item.unit || 'un'})) : [];

            console.log("Pedido modificado detectado (child_changed):", pedido.id);
            allPedidos[pedido.id] = pedido; // Atualiza o cache local
            renderCard(pedido); // Re-renderiza o card (pode mudar de coluna/conteúdo)

            // Atualiza o modal de detalhes se estiver aberto para este pedido
            if (detailsModal && !detailsModal.classList.contains('hidden') && document.getElementById('logPedidoId')?.value === pedido.id) {
                 console.log("Modal de detalhes aberto para pedido modificado. Atualizando modal:", pedido.id);
                 openDetailsModal(pedido.id); // Reabre/atualiza o modal com os novos dados
            }
            // Atualiza métricas gerenciais se a aba estiver ativa
            if(document.getElementById('gerencial-content') && !document.getElementById('gerencial-content').classList.contains('hidden') && typeof renderDashboardGerencial === 'function') {
                renderDashboardGerencial();
            }
        } catch(error) { console.error("Erro ao processar 'child_changed':", error, snapshot.val()); }
    }, error => console.error("Erro no listener 'child_changed':", error));

    // Listener para pedidos REMOVIDOS ('child_removed')
    ref.on('child_removed', snapshot => {
         if (!initialDataLoaded) return;
         try {
             const pedidoId = snapshot.key;
             if (!pedidoId) { console.warn("Recebido 'child_removed' sem ID."); return; }

             console.log("Pedido removido detectado (child_removed):", pedidoId);
             // Remove do cache local apenas se existir
             if (allPedidos[pedidoId]) {
                delete allPedidos[pedidoId];
             }

             // Remove o card da interface
             const cardElement = document.getElementById(pedidoId);
             if (cardElement) {
                 const parentList = cardElement.parentElement;
                 cardElement.remove();
                 // Se a lista (coluna) ficou vazia, adiciona placeholder
                 if (parentList && parentList.classList.contains('client-list') && parentList.children.length === 0) {
                     parentList.innerHTML = '<p class="tc text-gray-400 text-xs italic p-4">Nenhum pedido neste status.</p>';
                 }
             } else {
                  console.warn(`Card ${pedidoId} não encontrado no DOM para remoção.`);
             }

             // Fecha o modal de detalhes se estava aberto para este pedido
            if (detailsModal && !detailsModal.classList.contains('hidden') && document.getElementById('logPedidoId')?.value === pedidoId) {
                 detailsModal.classList.add('hidden');
                 showNotification("O pedido que você estava visualizando foi excluído.", "warning");
            }
            // Atualiza métricas gerenciais se a aba estiver ativa
            if(document.getElementById('gerencial-content') && !document.getElementById('gerencial-content').classList.contains('hidden') && typeof renderDashboardGerencial === 'function') {
                renderDashboardGerencial();
            }
         } catch(error) { console.error("Erro ao processar 'child_removed':", error, snapshot.key); }
    }, error => console.error("Erro no listener 'child_removed':", error));

    console.log("Listeners em tempo real do Firebase anexados.");
};


// Carrega a configuração (lista de produtos) do Firebase
const loadConfig = async () => {
     try {
         if (!db) throw new Error("Conexão com DB Firebase não disponível para carregar config.");
         const snapshot = await db.ref('config').once('value'); // Lê o nó 'config' uma vez
         configData = snapshot.val() || { produtos: [] }; // Pega os dados ou um objeto padrão

         // Garante que 'produtos' seja sempre um array, mesmo que salvo como objeto no Firebase
         if (configData.produtos && typeof configData.produtos === 'object' && !Array.isArray(configData.produtos)) {
             console.warn("Nó 'config/produtos' no Firebase é um objeto, convertendo para array.");
             configData.produtos = Object.values(configData.produtos);
         } else if (!Array.isArray(configData.produtos)) {
             // Se 'produtos' não existe ou não é array/objeto, define como array vazio
              if (configData.produtos) console.warn("Campo 'config/produtos' não é um array ou objeto, redefinindo para [].", configData.produtos);
             configData.produtos = [];
         }

         // Ordena os produtos alfabeticamente pelo nome para exibição consistente
         configData.produtos.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
         console.log("Configuração (produtos) carregada e processada:", configData.produtos.length, "produtos.");

     } catch (error) {
         console.error("Erro grave ao carregar configuração (produtos) do Firebase:", error);
         showNotification("Erro ao carregar lista de produtos do catálogo. Funcionalidades podem ser limitadas.", "error");
         configData = { produtos: [] }; // Define como vazio em caso de erro para evitar falhas posteriores
     }
};


/* ==================================================================
INICIALIZAÇÃO DA APLICAÇÃO (BLOCO CORRIGIDO FINAL + ROBUSTEZ)
==================================================================
*/

// Função principal de inicialização da aplicação
const startApp = async () => {
    console.log("Iniciando processo de inicialização da aplicação (startApp)...");
     try {
        // 1. ESPERA (await) a conclusão da verificação de login/sessão.
        //    Isso é crucial porque `checkLoggedInUser` carrega os vendedores (`loadVendedores`)
        //    e decide se mostra a tela de login (`displayLoginScreen`) ou loga o usuário (`loginUser`).
        //    Precisamos que isso termine ANTES de anexar os listeners da UI.
        await checkLoggedInUser();
        console.log("checkLoggedInUser concluído.");

     } catch (error) {
         // Captura erros que podem ocorrer durante o carregamento de vendedores ou processamento do localStorage
         console.error("Erro crítico durante a verificação inicial de usuário (checkLoggedInUser):", error);
         showNotification("Erro crítico ao iniciar a aplicação. Por favor, recarregue a página.", "error");
         // Interrompe a inicialização se a verificação de login falhar catastroficamente
         return;
     }

     // 2. Anexa os listeners de eventos da interface do usuário (botões, modais, etc.).
     const attachListeners = () => {
        // Verifica se a função `setupEventListeners` (definida em app_logic.js)
        // está disponível globalmente. Isso confirma que app_logic.js foi carregado.
        if (typeof setupEventListeners === 'function') {
            try {
                setupEventListeners(); // Chama a função que adiciona todos os .addEventListener
                listenersAttached = true; // Marca que os listeners foram configurados com sucesso
                console.log("Listeners de eventos da UI (setupEventListeners) chamados com sucesso.");
            } catch (error) {
                console.error("Erro durante a execução de setupEventListeners:", error);
                showNotification("Erro ao configurar interações da página.", "error");
                listenersAttached = false; // Marca como falha
            }
        } else {
            // Se setupEventListeners não existe, indica um problema SÉRIO:
            // ou app_logic.js não carregou, ou carregou depois de app_setup.js,
            // ou contém um erro de sintaxe que impediu sua execução.
            console.error("ERRO CRÍTICO: Função 'setupEventListeners' não encontrada. O arquivo app_logic.js pode não ter sido carregado corretamente ou contém erros.");
            showNotification("Erro fatal: Falha ao carregar componentes da interface. Recarregue a página.", "error");
            listenersAttached = false; // Marca como falha
        }
     }

     attachListeners(); // Executa a anexação dos listeners
     console.log("startApp finalizado.");
};

// Controla quando a função `startApp` deve ser executada.
if (document.readyState === 'loading') {
    // Se o HTML ainda está sendo carregado/parseado, espera pelo evento 'DOMContentLoaded'.
    // Isso garante que todos os elementos HTML referenciados no JS já existam.
    console.log("O DOM ainda está carregando. Aguardando o evento DOMContentLoaded...");
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    // Se o HTML já foi completamente carregado e parseado ('interactive' ou 'complete'),
    // executa a inicialização imediatamente.
    console.log("O DOM já está pronto ('interactive' ou 'complete'). Chamando startApp diretamente.");
    startApp();
}

// --- FIM app_setup.js ---

