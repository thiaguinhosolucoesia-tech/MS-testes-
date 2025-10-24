/* ==================================================================
PROTÓTIPO HÍBRIDO EletroIA-MVP - PARTE 1: SETUP
Versão: FINAL COMPLETA e CORRIGIDA (Listener Timing Fix) - 23/10/2025
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
const GEMINI_API_KEY = "COLE_SUA_GEMINI_API_KEY_AQUI"; // <<<<<<<<<<<<<<< SUBSTITUA AQUI
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;
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
    void notification.offsetWidth;
    notification.classList.add('show');
    setTimeout(() => {
      notification.classList.remove('show');
      notification.addEventListener('transitionend', () => {
        if (container.contains(notification)) container.removeChild(notification);
      }, { once: true });
    }, 4000);
  } else { console.error("Container de notificações não encontrado."); }
}

/* ==================================================================
UPLOAD DE ARQUIVOS
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
       const errorData = await response.json(); console.error("Erro Cloudinary:", errorData);
       throw new Error(errorData.error?.message || `Falha no upload (${response.status})`);
    }
    const data = await response.json();
    showNotification(`'${file.name}' enviado!`, 'success');
    return data.secure_url;
  } catch (error) {
    console.error("Erro no upload Cloudinary:", error);
    showNotification(`Erro upload ${file.name}: ${error.message}`, 'error');
    throw error;
  }
};

/* ==================================================================
INICIALIZAÇÃO DO SISTEMA E ESTADO GLOBAL
==================================================================
*/
// Estado
let currentUser = null, allPedidos = {}, configData = { produtos: [] }, vendedores = [];
let lightboxMedia = [], currentLightboxIndex = 0, filesToUpload = [], initialDataLoaded = false;
let itensAdicionadosState = [];
let isMyAgendaViewActive = false;
let listenersAttached = false; // Flag para garantir que listeners sejam anexados só uma vez

// Constantes
const FORMAS_PAGAMENTO = ['PIX', 'Boleto', 'Cartão de Crédito', 'Dinheiro', 'Transferência'];
const STATUS_LIST = ['Novos-Leads', 'Em-Negociacao', 'Aguardando-Pagamento', 'Entregue'];
const CROSS_SELL_RULES = {
    "Disjuntor Steck": ["Caixa de Passagem Steck", "Fita Isolante"],
    "Cabo Flexível": ["Eletroduto Corrugado", "Conector Wago"],
    "Tomada Dupla": ["Placa 4x2", "Interruptor Simples"]
};
const FREQUENCY_ALERT_DAYS = 45;

// Seletores DOM (Cache)
const userScreen = document.getElementById('userScreen'), app = document.getElementById('app'), userList = document.getElementById('userList'),
      vendedorDashboard = document.getElementById('vendedorDashboard'), addPedidoBtn = document.getElementById('addPedidoBtn'),
      logoutButton = document.getElementById('logoutButton'), pedidoModal = document.getElementById('pedidoModal'),
      pedidoForm = document.getElementById('pedidoForm'), detailsModal = document.getElementById('detailsModal'),
      deleteBtn = document.getElementById('deleteBtn'), configBtn = document.getElementById('configBtn'),
      configModal = document.getElementById('configModal'), logForm = document.getElementById('logForm'),
      lightbox = document.getElementById('lightbox'), mediaInput = document.getElementById('media-input'),
      globalSearchInput = document.getElementById('globalSearchInput'), globalSearchResults = document.getElementById('globalSearchResults'),
      confirmDeleteModal = document.getElementById('confirmDeleteModal'), confirmDeleteBtn = document.getElementById('confirmDeleteBtn'),
      cancelDeleteBtn = document.getElementById('cancelDeleteBtn'), confirmDeleteText = document.getElementById('confirmDeleteText'),
      openCameraBtn = document.getElementById('openCameraBtn'), openGalleryBtn = document.getElementById('openGalleryBtn'),
      fileNameDisplay = document.getElementById('fileName'), lightboxClose = document.getElementById('lightbox-close'),
      toggleAgendaBtn = document.getElementById('toggleAgendaBtn'), dashboardNav = document.getElementById('dashboard-nav'),
      dashboardTitle = document.getElementById('dashboard-title');

// Funções Utilitárias
const formatCurrency = (value) => `R$ ${parseFloat(value || 0).toFixed(2).replace('.', ',')}`;
const formatStatus = (status) => status ? status.replace(/-/g, ' ') : 'Status Inválido';
const formatDate = (isoString) => isoString ? new Date(isoString).toLocaleDateString('pt-BR') : 'Data Inválida';
const formatDateTime = (isoString) => isoString ? new Date(isoString).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'}) : 'Data/Hora Inválida';

// --- Inicialização do Firebase ---
let db;
try {
    if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); console.log("Firebase inicializado."); }
    else { firebase.app(); console.log("Firebase já inicializado."); }
    db = firebase.database();
} catch(e) { console.error("Erro CRÍTICO Firebase:", e); setTimeout(() => showNotification("Erro crítico: Falha Firebase.", "error"), 500); throw new Error("Falha Firebase."); }

/* ==================================================================
LÓGICA DE LOGIN E AUTENTICAÇÃO
==================================================================
*/
const loadVendedores = async () => {
     try {
        if (!db) throw new Error("DB Firebase não disponível.");
        const snapshot = await db.ref('vendedores').once('value');
        const vendedoresData = snapshot.val();
        if (vendedoresData && typeof vendedoresData === 'object' && Object.keys(vendedoresData).length > 0) {
            vendedores = Object.entries(vendedoresData).map(([key, value]) => ({ id: key, name: value.name || key, role: value.role || 'Vendedor' }));
            console.log("Vendedores carregados:", vendedores);
        } else {
             console.warn("Nenhum vendedor no Firebase ou formato inválido. Usando simulação.");
             vendedores = [{ name: 'Thiago', role: 'Vendedor 1' }, { name: 'Raul', role: 'Vendedor 2' }, { name: 'Guilherme', role: 'Gestor' }];
        }
         if(vendedores.length === 0){ console.error("CRÍTICO: Lista vendedores vazia."); showNotification("Erro: Vendedores não configurados.", "error"); }
     } catch (error) { console.error("Erro loadVendedores:", error); showNotification("Erro carregar vendedores.", "error"); vendedores = []; }
};

const loginUser = async (user) => {
    if (!user?.name) { console.error("Login inválido:", user); return; }
    currentUser = user; localStorage.setItem('eletroIAUser', JSON.stringify(user));
    const userNameDisplay = document.getElementById('currentUserName'); if(userNameDisplay) userNameDisplay.textContent = user.name;
    const isGestor = user.role?.toLowerCase().includes('gestor');
    if(configBtn) configBtn.classList.toggle('hidden', !isGestor);
    const tabBtnGerencial = document.getElementById('tab-btn-gerencial'); if(tabBtnGerencial) tabBtnGerencial.classList.toggle('hidden', !isGestor);
    if(dashboardNav) dashboardNav.classList.remove('hidden');
    if(userScreen) userScreen.classList.add('hidden'); if(app) app.classList.remove('hidden');
    if(vendedorDashboard) vendedorDashboard.innerHTML = '<p class="text-center tc my-10 animate-pulse">Carregando...</p>';

    await loadConfig();
    initializeDashboard(); // Prepara a estrutura do dashboard
    listenToPedidos(); // Inicia o carregamento e monitoramento dos pedidos

    // A chamada setupEventListeners() FOI MOVIDA para a inicialização (startApp)
    // para garantir que os botões de login funcionem.

    if (isGestor) renderDashboardGerencial(); else switchDashboardTab('vendas');
};

const checkLoggedInUser = async () => {
    // Esta função é 'async' pois depende de 'loadVendedores'
    await loadVendedores();
    const storedUser = localStorage.getItem('eletroIAUser');
    if (storedUser) {
        try {
            const parsedUser = JSON.parse(storedUser);
            if(vendedores.some(v => v.name === parsedUser.name)){
                loginUser(parsedUser); // Usuário já logado, entra direto
            } else {
                console.warn("Usuário salvo inválido.");
                localStorage.removeItem('eletroIAUser');
                displayLoginScreen(); // Usuário salvo não existe mais, mostra login
            }
        } catch(e) {
            console.error("Erro parse usuário:", e);
            localStorage.removeItem('eletroIAUser');
            displayLoginScreen(); // Erro, mostra login
        }
    } else {
        displayLoginScreen(); // Nenhum usuário salvo, mostra login
    }
};

const displayLoginScreen = () => {
     if(userScreen) userScreen.classList.remove('hidden'); if(app) app.classList.add('hidden');
     if (userList) {
         if(vendedores.length > 0){
            userList.innerHTML = vendedores.map(user =>
                `<div class="p-4 bg-gray-50 border border-gray-200 rounded-lg hover:bg-blue-100 hover:shadow-md cursor-pointer shadow-sm transition-all user-btn" data-user='${JSON.stringify(user).replace(/'/g, "&apos;")}'>
                  <p class="font-semibold text-gray-800 pointer-events-none">${user.name}</p>
                  <p class="text-sm text-gray-500 pointer-events-none">${user.role||'Vendedor'}</p>
                </div>`
            ).join('');
        } else {
            userList.innerHTML = '<p class="text-red-500 text-sm col-span-full">Erro: Vendedores não configurados.</p>';
        }
    } else {
        console.error("userList não encontrado.");
        if(userScreen && !userScreen.classList.contains('hidden')) alert("Erro interface login.");
    }
};


/* ==================================================================
LÓGICA DO DASHBOARD E KANBAN
==================================================================
*/
const initializeDashboard = () => {
    if (!vendedorDashboard) { console.error("vendedorDashboard não encontrado."); return; } if (vendedores.length === 0) { vendedorDashboard.innerHTML = '<p class="text-red-500">Erro: Vendedores não carregados.</p>'; return; }
    vendedorDashboard.innerHTML = '';
    const vendedoresToShow = isMyAgendaViewActive ? vendedores.filter(v => v.name === currentUser.name) : vendedores;
    vendedoresToShow.forEach(vendedor => {
        const vendedorSection = document.createElement('section'); vendedorSection.className = 'vendedor-section'; vendedorSection.id = `section-${vendedor.name.replace(/\s+/g, '-')}`; const header = document.createElement('h2'); header.className = 'vendedor-header'; header.textContent = vendedor.name; vendedorSection.appendChild(header); const kanbanContainer = document.createElement('div'); kanbanContainer.className = 'kanban-container';
        STATUS_LIST.forEach(status => { const statusColumn = document.createElement('div'); statusColumn.className = 'status-column'; statusColumn.dataset.statusHeader = status; const statusHeader = document.createElement('h3'); statusHeader.textContent = formatStatus(status); statusColumn.appendChild(statusHeader); const clientList = document.createElement('div'); clientList.className = 'client-list'; clientList.dataset.status = status; clientList.dataset.vendedor = vendedor.name; clientList.innerHTML = '<p class="text-gray-400 text-xs italic p-4 tc">Carregando...</p>'; statusColumn.appendChild(clientList); kanbanContainer.appendChild(statusColumn); });
        vendedorSection.appendChild(kanbanContainer); vendedorDashboard.appendChild(vendedorSection);
    });
     if(dashboardTitle) dashboardTitle.textContent = isMyAgendaViewActive ? `Minha Agenda - ${currentUser.name}` : 'Visão Geral - Todos Vendedores';
};

const createCardHTML = (pedido) => {
    const clienteDisplay = (pedido.clienteNome || 'Cliente Desc.').substring(0, 25); const dataDisplay = formatDateTime(pedido.createdAt || pedido.agendamento); const itensArray = Array.isArray(pedido.itens)?pedido.itens:[]; const itensDisplay = itensArray.length > 0 ? itensArray.map(s => s.name).join(', ') : "S/ Itens"; const valorDisplay = formatCurrency(pedido.valorTotal); const vendedorDisplay = pedido.vendedorResponsavel || 'N/A'; const currentStatusIndex = STATUS_LIST.indexOf(pedido.status); const nextStatus = currentStatusIndex < STATUS_LIST.length - 1 ? STATUS_LIST[currentStatusIndex + 1] : null; const prevStatus = currentStatusIndex > 0 ? STATUS_LIST[currentStatusIndex - 1] : null;
    return `<div id="${pedido.id}" class="vehicle-card status-${pedido.status}" data-id="${pedido.id}"><div class="flex justify-between items-start"><div class="card-clickable-area cursor-pointer flex-grow space-y-1 pr-2 card-info overflow-hidden"><div class="flex justify-between items-baseline"><p class="name truncate" title="${pedido.clienteNome||''}">${clienteDisplay}</p><p class="time flex-shrink-0 ml-2">${dataDisplay}</p></div><p class="text-sm truncate service text-gray-600" title="${itensDisplay}">${itensDisplay}</p><div class="flex justify-between items-center mt-2 pt-1 border-t border-gray-100"><p class="barber text-xs">${vendedorDisplay}</p><p class="price font-semibold">${valorDisplay}</p></div></div><div class="flex flex-col items-center justify-center -mt-1 -mr-1 flex-shrink-0"><button data-id="${pedido.id}" data-new-status="${nextStatus}" class="btn-move-status p-1 rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-100 ${!nextStatus?'invisible':''}" title="Avançar"><i class='bx bx-chevron-right text-2xl'></i></button><button data-id="${pedido.id}" data-new-status="${prevStatus}" class="btn-move-status p-1 rounded-full text-gray-400 hover:text-orange-600 hover:bg-orange-100 ${!prevStatus?'invisible':''}" title="Retroceder"><i class='bx bx-chevron-left text-2xl'></i></button></div></div></div>`;
};

 const renderCard = (pedido) => {
   if (!pedido?.vendedorResponsavel || !pedido.status || !pedido.id) { console.warn("Render inválido:", pedido); return; } if (isMyAgendaViewActive && pedido.vendedorResponsavel !== currentUser.name) { const existing = document.getElementById(pedido.id); if (existing) existing.remove(); return; } const cardHTML = createCardHTML(pedido); const listSelector = `#vendedorDashboard .client-list[data-vendedor="${pedido.vendedorResponsavel}"][data-status="${pedido.status}"]`; let list = document.querySelector(listSelector); if (!list) { console.warn(`Lista ${listSelector} não achada. Fallback.`); const fallbackSelector = `#vendedorDashboard .client-list[data-status="${pedido.status}"]`; list = document.querySelector(fallbackSelector); } const existingCard = document.getElementById(pedido.id); if (existingCard) { existingCard.remove(); } if (list) { const placeholder = list.querySelector('p.text-gray-400'); if (placeholder) placeholder.remove(); list.insertAdjacentHTML('beforeend', cardHTML); } else { console.error(`CRÍTICO: Lista ${pedido.status} não achada. Card ${pedido.id} perdido.`); }
 };

const toggleMyAgendaView = () => {
    isMyAgendaViewActive = !isMyAgendaViewActive;
    if(toggleAgendaBtn) { toggleAgendaBtn.classList.toggle('bg-blue-100', isMyAgendaViewActive); toggleAgendaBtn.classList.toggle('text-blue-700', isMyAgendaViewActive); toggleAgendaBtn.classList.toggle('border-blue-300', isMyAgendaViewActive); toggleAgendaBtn.classList.toggle('bg-white', !isMyAgendaViewActive); toggleAgendaBtn.classList.toggle('text-gray-700', !isMyAgendaViewActive); toggleAgendaBtn.classList.toggle('border-gray-300', !isMyAgendaViewActive); }
    initializeDashboard(); Object.values(allPedidos).forEach(renderCard);
    if(vendedorDashboard){ vendedorDashboard.querySelectorAll('.client-list').forEach(list => { if(list.children.length === 0){ list.innerHTML = '<p class="tc text-gray-400 text-xs italic p-4">Nenhum pedido.</p>'; } }); }
};

/* ==================================================================
LISTENERS DO FIREBASE
==================================================================
*/
const listenToPedidos = () => {
    if (!db) { console.error("DB Firebase não inicializado."); return; } const ref = db.ref('pedidos'); initialDataLoaded = false;
    // A flag 'listenersAttached' é controlada pelo bloco de inicialização (startApp)
    if (vendedorDashboard) { vendedorDashboard.querySelectorAll('.client-list').forEach(list => list.innerHTML = '<p class="tc text-gray-400 text-xs italic p-4 animate-pulse">Carregando...</p>'); }
    else { console.error("Dashboard não encontrado."); return; } allPedidos = {};

    ref.once('value', snapshot => {
        allPedidos = snapshot.val() || {}; Object.keys(allPedidos).forEach(key => { if(allPedidos[key]) allPedidos[key].id = key; });
        if (vendedorDashboard) { vendedorDashboard.querySelectorAll('.client-list').forEach(list => list.innerHTML = ''); }
        Object.values(allPedidos).forEach(renderCard);
        if(vendedorDashboard){ vendedorDashboard.querySelectorAll('.client-list').forEach(list => { if(list.children.length === 0){ list.innerHTML = '<p class="tc text-gray-400 text-xs italic p-4">Nenhum pedido.</p>'; } }); }
        initialDataLoaded = true; console.log(`Carga: ${Object.keys(allPedidos).length} pedidos.`);

        // Confirma que os listeners de clique já foram anexados pela função startApp()
        if (listenersAttached) {
             console.log("Listeners de eventos (clique) já configurados pela inicialização.");
        } else {
             // Isso é um fallback, mas não deve acontecer no fluxo normal
             console.error("ERRO GRAVE: Listeners de clique não foram anexados na inicialização.");
             // Tenta anexar agora para salvar a aplicação
             if (typeof setupEventListeners === 'function') {
                setupEventListeners();
                listenersAttached = true;
                console.log("Listeners de clique anexados como fallback.");
             } else {
                showNotification("Erro: Falha ao carregar interações.", "error");
             }
        }

        startIndividualListeners(ref); // Inicia listeners individuais para updates

    }, error => { console.error("Erro carga inicial:", error); showNotification("Erro dados.", "error"); if (vendedorDashboard) { vendedorDashboard.innerHTML = '<p class="tc text-red-500 my-10">Falha carregar.</p>'; } });
};

const startIndividualListeners = (ref) => {
    // Novo pedido
    ref.on('child_added', snapshot => { if (!initialDataLoaded) return; const pedido = { ...snapshot.val(), id: snapshot.key }; if (!allPedidos[pedido.id]) { console.log("Novo:", pedido.id); allPedidos[pedido.id] = pedido; renderCard(pedido); } });
    // Pedido modificado
    ref.on('child_changed', snapshot => { if (!initialDataLoaded) return; const pedido = { ...snapshot.val(), id: snapshot.key }; console.log("Modificado:", pedido.id); allPedidos[pedido.id] = pedido; renderCard(pedido); if (detailsModal && !detailsModal.classList.contains('hidden') && document.getElementById('logPedidoId')?.value === pedido.id) { openDetailsModal(pedido.id); } });
    // Pedido removido
    ref.on('child_removed', snapshot => { if (!initialDataLoaded) return; const pedidoId = snapshot.key; console.log("Removido:", pedidoId); delete allPedidos[pedidoId]; const card = document.getElementById(pedidoId); if (card) { const list = card.parentElement; card.remove(); if (list && list.children.length === 0) { list.innerHTML = '<p class="tc text-gray-400 text-xs italic p-4">Nenhum pedido.</p>'; } } if (detailsModal && !detailsModal.classList.contains('hidden') && document.getElementById('logPedidoId')?.value === pedidoId) { detailsModal.classList.add('hidden'); showNotification("Pedido excluído.", "warning"); } });
};

const loadConfig = async () => {
     try { if (!db) throw new Error("DB não disponível."); const snapshot = await db.ref('config').once('value'); configData = snapshot.val() || { produtos: [] }; if (configData.produtos && typeof configData.produtos === 'object' && !Array.isArray(configData.produtos)) { configData.produtos = Object.values(configData.produtos); } else if (!Array.isArray(configData.produtos)) { configData.produtos = []; } configData.produtos.sort((a, b) => (a.name || '').localeCompare(b.name || '')); console.log("Config carregada:", configData.produtos.length, "produtos."); } catch (error) { console.error("Erro loadConfig:", error); showNotification("Erro carregar produtos.", "error"); configData = { produtos: [] }; }
};


/* ==================================================================
INICIALIZAÇÃO DA APLICAÇÃO (BLOCO CORRIGIDO FINAL)
==================================================================
*/

// Função unificada de inicialização
const startApp = async () => { // <--- Adicionado 'async'
    console.log("Iniciando startApp...");
     // 1. ESPERA (await) a checagem de login terminar
     //    Isso garante que loadVendedores() e displayLoginScreen() já rodaram.
     try {
        await checkLoggedInUser(); // <--- Adicionado 'await'
        console.log("checkLoggedInUser concluído.");
     } catch (error) {
         console.error("Erro durante checkLoggedInUser:", error);
         showNotification("Erro crítico ao iniciar. Tente recarregar.", "error");
         return; // Interrompe se o login falhar criticamente
     }

     // 2. Anexa TODOS os listeners de eventos (incluindo o userList da tela de login)
     //    A verificação 'typeof' garante que app_logic.js foi carregado
     if (typeof setupEventListeners === 'function') {
        setupEventListeners(); // Chama a função que está em app_logic.js
        listenersAttached = true; // Informa o 'listenToPedidos' que já foi executado.
        console.log("setupEventListeners chamado.");
     } else {
        console.error("ERRO CRÍTICO: app_logic.js não carregou a função setupEventListeners.");
        showNotification("Erro: Falha ao carregar interações.", "error");
     }
     console.log("startApp finalizado.");
};

// Garante que o DOM esteja pronto ANTES de tentar configurar listeners ou checar login
if (document.readyState === 'loading') {
    console.log("DOM loading, aguardando DOMContentLoaded...");
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    // DOM já pronto, chama a inicialização
    console.log("DOM pronto, chamando startApp diretamente.");
    startApp();
}

// --- FIM app_setup.js ---
