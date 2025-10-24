/* ==================================================================
CONFIGURAÇÃO DO FIREBASE (Banco de Dados)
==================================================================
*/
const firebaseConfig = {
  apiKey: "AIzaSyB5JpYm8l0AlF5ZG3HtkyFZgmrpsUrDhv0",
  authDomain: "dashboard-oficina-pro.firebaseapp.com",
  databaseURL: "https://dashboard-oficina-pro-default-rtdb.firebaseio.com",
  projectId: "dashboard-oficina-pro",
  storageBucket: "dashboard-oficina-pro.appspot.com",
  messagingSenderId: "736157192887",
  appId: "1:736157192887:web:c23d3daade848a33d67332"
};

/* ==================================================================
CONFIGURAÇÃO DO CLOUDINARY (Armazenamento de Mídia)
==================================================================
*/
const CLOUDINARY_CLOUD_NAME = "dfqdoome7";
const CLOUDINARY_UPLOAD_PRESET = "pvjfvkvb";

/* ==================================================================
SISTEMA DE NOTIFICAÇÕES
==================================================================
*/
function showNotification(message, type = 'success') {
  const existing = document.getElementById('notification');
  if (existing) {
    existing.remove();
  }
  const notification = document.createElement('div');
  notification.id = 'notification';
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 500);
  }, 4000);
}

/* ==================================================================
LÓGICA DE UPLOAD DE ARQUIVOS (AGORA COM CLOUDINARY)
==================================================================
*/
const uploadFileToCloudinary = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error.message || 'Falha no upload da mídia.');
    }

    const data = await response.json();
    return data.secure_url; // Retorna a URL segura do arquivo
  } catch (error) {
    console.error("Erro no upload para o Cloudinary:", error);
    throw error;
  }
};


/* ==================================================================
INICIALIZAÇÃO DO SISTEMA E DEMAIS FUNÇÕES
==================================================================
*/
document.addEventListener('DOMContentLoaded', () => {
  firebase.initializeApp(firebaseConfig);
  const db = firebase.database();

  let currentUser = null;
  let allServiceOrders = {};
  let lightboxMedia = [];
  let currentLightboxIndex = 0;
  let filesToUpload = [];
  let appStartTime = Date.now();

  const USERS = [
    { name: 'Augusto', role: 'Gestor', password: 'jose' },
    { name: 'William Barbosa', role: 'Atendente', password: '2312' },
    { name: 'Thiago Ventura Valencio', role: 'Atendente', password: '1940' },
    { name: 'Fernando', role: 'Mecânico', password: 'fernando' },
    { name: 'Gustavo', role: 'Mecânico', password: 'gustavo' },
    { name: 'Marcelo', role: 'Mecânico', password: 'marcelo' }
  ];

  const USERS_CAN_DELETE_MEDIA = ['Thiago Ventura Valencio', 'William Barbosa', 'Augusto'];

  const STATUS_LIST = [ 'Aguardando-Mecanico', 'Em-Analise', 'Orcamento-Enviado', 'Aguardando-Aprovacao', 'Servico-Autorizado', 'Em-Execucao', 'Finalizado-Aguardando-Retirada', 'Entregue' ];
  const ATTENTION_STATUSES = { 'Aguardando-Mecanico': { label: 'AGUARDANDO MECÂNICO', color: 'yellow', blinkClass: 'blinking-aguardando' }, 'Servico-Autorizado': { label: 'SERVIÇO AUTORIZADO', color: 'green', blinkClass: 'blinking-autorizado' } };
  const LED_TRIGGER_STATUSES = ['Aguardando-Mecanico', 'Servico-Autorizado'];

  // Seletores de elementos DOM
  const userScreen = document.getElementById('userScreen');
  const app = document.getElementById('app');
  const loginForm = document.getElementById('loginForm');
  const userSelect = document.getElementById('userSelect');
  const passwordInput = document.getElementById('passwordInput');
  const loginError = document.getElementById('loginError');
  const kanbanBoard = document.getElementById('kanbanBoard');
  const addOSBtn = document.getElementById('addOSBtn');
  const logoutButton = document.getElementById('logoutButton');
  const osModal = document.getElementById('osModal');
  const osForm = document.getElementById('osForm');
  const detailsModal = document.getElementById('detailsModal');
  const logForm = document.getElementById('logForm');
  const kmUpdateForm = document.getElementById('kmUpdateForm');
  const attentionPanel = document.getElementById('attention-panel');
  const attentionPanelContainer = document.getElementById('attention-panel-container');
  const togglePanelBtn = document.getElementById('toggle-panel-btn');
  const lightbox = document.getElementById('lightbox');
  const mediaInput = document.getElementById('media-input');
  const openCameraBtn = document.getElementById('openCameraBtn');
  const openGalleryBtn = document.getElementById('openGalleryBtn');
  const alertLed = document.getElementById('alert-led');
  const postLogActions = document.getElementById('post-log-actions');
  const deleteOsBtn = document.getElementById('deleteOsBtn');
  const confirmDeleteModal = document.getElementById('confirmDeleteModal');
  const confirmDeleteText = document.getElementById('confirmDeleteText');
  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
  const globalSearchInput = document.getElementById('globalSearchInput');
  const globalSearchResults = document.getElementById('globalSearchResults');
  const timelineContainer = document.getElementById('timelineContainer');
  const thumbnailGrid = document.getElementById('thumbnail-grid');
  const confirmDeleteLogModal = document.getElementById('confirmDeleteLogModal');
  const confirmDeleteLogText = document.getElementById('confirmDeleteLogText');
  const cancelDeleteLogBtn = document.getElementById('cancelDeleteLogBtn');
  const confirmDeleteLogBtn = document.getElementById('confirmDeleteLogBtn');
  const confirmDeleteMediaModal = document.getElementById('confirmDeleteMediaModal');
  const confirmDeleteMediaText = document.getElementById('confirmDeleteMediaText');
  const cancelDeleteMediaBtn = document.getElementById('cancelDeleteMediaBtn');
  const confirmDeleteMediaBtn = document.getElementById('confirmDeleteMediaBtn');


  const formatStatus = (status) => status.replace(/-/g, ' ');

  const logoutUser = () => {
    localStorage.removeItem('currentUserSession');
    location.reload();
  };

  const scheduleDailyLogout = () => {
    const now = new Date();
    const logoutTime = new Date();
    logoutTime.setHours(19, 0, 0, 0);

    if (now > logoutTime) {
      logoutTime.setDate(logoutTime.getDate() + 1);
    }

    const timeUntilLogout = logoutTime.getTime() - now.getTime();
    console.log(`Logout agendado via setTimeout para: ${logoutTime.toLocaleString('pt-BR')}`);

    setTimeout(() => {
      if (localStorage.getItem('currentUserSession')) {
        showNotification('Sessão encerrada por segurança.', 'success');
        setTimeout(logoutUser, 2000);
      }
    }, timeUntilLogout);
  };

  const loginUser = (user) => {
    const sessionData = {
      user: user,
      loginTime: new Date().toISOString()
    };
    localStorage.setItem('currentUserSession', JSON.stringify(sessionData));
    
    currentUser = user;
    document.getElementById('currentUserName').textContent = user.name;
    userScreen.classList.add('hidden');
    app.classList.remove('hidden');
    
    initializeKanban();
    listenToServiceOrders();
    listenToNotifications();
    scheduleDailyLogout(); // Mantém o agendamento para quem está com a tela aberta
  };

  const initializeLoginScreen = () => {
    const storedSession = localStorage.getItem('currentUserSession');
    
    if (storedSession) {
        const sessionData = JSON.parse(storedSession);
        const loginTime = new Date(sessionData.loginTime);

        // Calcula o último horário de corte (19h)
        const now = new Date();
        const lastCutoff = new Date();
        lastCutoff.setHours(19, 0, 0, 0);

        // Se agora é antes das 19h de hoje, o último corte foi ontem às 19h
        if (now < lastCutoff) {
            lastCutoff.setDate(lastCutoff.getDate() - 1);
        }

        // Se o login foi feito antes do último corte, a sessão é inválida
        if (loginTime < lastCutoff) {
            console.log("Sessão expirada. Realizando logout forçado.");
            logoutUser();
            return; // Interrompe a execução para forçar o reload
        }
        
        // Se a sessão é válida, prossegue com o login
        loginUser(sessionData.user);
        return;
    }

    // Se não há sessão, exibe a tela de login
    userScreen.classList.remove('hidden');
    app.classList.add('hidden');
    userSelect.innerHTML = '<option value="">Selecione seu usuário...</option>';
    USERS.forEach(user => {
        const option = document.createElement('option');
        option.value = user.name;
        option.textContent = user.name;
        userSelect.appendChild(option);
    });
  };

  const initializeKanban = () => {
    const collapsedState = JSON.parse(localStorage.getItem('collapsedColumns')) || {};
    kanbanBoard.innerHTML = STATUS_LIST.map(status => {
      const isCollapsed = collapsedState[status];
      const searchInputHTML = status === 'Entregue'
        ? `<div class="my-2"><input type="search" data-status="${status}" placeholder="Buscar por Placa..." class="w-full p-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 search-input-entregue"></div>`
        : '';
      const columnLedHTML = isCollapsed ? '<div class="column-led ml-2"></div>' : '';
      return `<div class="status-column p-4"><div class="flex justify-between items-center cursor-pointer toggle-column-btn mb-2" data-status="${status}"><div class="flex items-center"><h3 class="font-bold text-gray-800">${formatStatus(status)}</h3>${columnLedHTML}</div><i class='bx bxs-chevron-down transition-transform ${isCollapsed ? 'rotate-180' : ''}'></i></div>${searchInputHTML}<div class="space-y-3 vehicle-list ${isCollapsed ? 'collapsed' : ''}" data-status="${status}"></div></div>`;
    }).join('');
    updateAttentionPanel();
  };

  const createCardHTML = (os) => {
    const currentIndex = STATUS_LIST.indexOf(os.status);
    const prevStatus = currentIndex > 0 ? STATUS_LIST[currentIndex - 1] : null;
    const nextStatus = currentIndex < STATUS_LIST.length - 1 ? STATUS_LIST[currentIndex + 1] : null;
    const prevButton = prevStatus ? `<button data-os-id="${os.id}" data-new-status="${prevStatus}" class="btn-move-status p-2 rounded-full hover:bg-gray-100 transition-colors"><i class='bx bx-chevron-left text-xl text-gray-600'></i></button>` : `<div class="w-10 h-10"></div>`;
    const nextButton = nextStatus ? `<button data-os-id="${os.id}" data-new-status="${nextStatus}" class="btn-move-status p-2 rounded-full hover:bg-gray-100 transition-colors"><i class='bx bx-chevron-right text-xl text-gray-600'></i></button>` : `<div class="w-10 h-10"></div>`;
    const kmInfo = `<p class="text-xs text-gray-500">KM: ${os.km ? new Intl.NumberFormat('pt-BR').format(os.km) : 'N/A'}</p>`;
    const priorityIndicatorHTML = os.priority ? `<div class="priority-indicator priority-${os.priority}" title="Urgência: ${os.priority}"></div>` : '';
    return `<div id="${os.id}" class="vehicle-card status-${os.status}" data-os-id="${os.id}">${priorityIndicatorHTML}<div class="flex justify-between items-start"><div class="card-clickable-area cursor-pointer flex-grow"><p class="font-bold text-base text-gray-800">${os.placa}</p><p class="text-sm text-gray-600">${os.modelo}</p><div class="text-xs mt-1">${kmInfo}</div></div><div class="flex flex-col -mt-1 -mr-1">${nextButton}${prevButton}</div></div></div>`;
  };

  const renderDeliveredColumn = () => {
      const list = kanbanBoard.querySelector('.vehicle-list[data-status="Entregue"]');
      if (!list) return;
      const searchInput = kanbanBoard.querySelector('.search-input-entregue');
      const searchTerm = searchInput ? searchInput.value.toUpperCase().trim() : '';
      let deliveredItems = Object.values(allServiceOrders).filter(os => os.status === 'Entregue');
      if (searchTerm) {
          deliveredItems = deliveredItems.filter(os => (os.placa && os.placa.toUpperCase().includes(searchTerm)) || (os.modelo && os.modelo.toUpperCase().includes(searchTerm)));
      }
      deliveredItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      list.innerHTML = deliveredItems.map(os => createCardHTML(os)).join('');
  };

  const listenToServiceOrders = () => {
    const osRef = db.ref('serviceOrders');
    osRef.on('child_added', snapshot => {
      const os = { ...snapshot.val(), id: snapshot.key };
      allServiceOrders[os.id] = os;
      if (os.status === 'Entregue') {
        renderDeliveredColumn();
      } else {
        const list = kanbanBoard.querySelector(`.vehicle-list[data-status="${os.status}"]`);
        if (list) { list.insertAdjacentHTML('beforeend', createCardHTML(os)); }
      }
      updateAttentionPanel();
    });
    osRef.on('child_changed', snapshot => {
      const os = { ...snapshot.val(), id: snapshot.key };
      const oldOs = allServiceOrders[os.id];
      allServiceOrders[os.id] = os;
      const existingCard = document.getElementById(os.id);
      if (oldOs && oldOs.status !== os.status) {
        if (existingCard) existingCard.remove();
        if (os.status === 'Entregue') {
          renderDeliveredColumn();
        } else {
          const newList = kanbanBoard.querySelector(`.vehicle-list[data-status="${os.status}"]`);
          if (newList) newList.insertAdjacentHTML('beforeend', createCardHTML(os));
        }
        if(oldOs.status === 'Entregue') { renderDeliveredColumn(); }
      }
      else if (existingCard) {
        if (os.status === 'Entregue') {
            renderDeliveredColumn();
        } else {
            existingCard.outerHTML = createCardHTML(os);
        }
      }
       if (detailsModal.classList.contains('flex') && document.getElementById('logOsId').value === os.id) {
            renderTimeline(os);
            renderMediaGallery(os);
       }
      updateAttentionPanel();
    });
    osRef.on('child_removed', snapshot => {
      const osId = snapshot.key;
      const removedOs = allServiceOrders[osId];
      delete allServiceOrders[osId];
      if (removedOs && removedOs.status === 'Entregue') {
          renderDeliveredColumn();
      } else {
          const cardToRemove = document.getElementById(osId);
          if (cardToRemove) cardToRemove.remove();
      }
      updateAttentionPanel();
    });
  };

  const updateAttentionPanel = () => {
    let vehiclesTriggeringAlert = new Set();
    Object.values(allServiceOrders).forEach(os => {
        if (LED_TRIGGER_STATUSES.includes(os.status)) { vehiclesTriggeringAlert.add(os.id); }
    });
    attentionPanel.innerHTML = Object.entries(ATTENTION_STATUSES).map(([statusKey, config]) => {
        const vehiclesInStatus = Object.values(allServiceOrders).filter(os => os.status === statusKey);
        const hasVehicles = vehiclesInStatus.length > 0;
        const blinkingClass = (hasVehicles && config.blinkClass && !attentionPanelContainer.classList.contains('collapsed')) ? config.blinkClass : '';
        const vehicleListHTML = hasVehicles
            ? vehiclesInStatus.map(os => `<p class="cursor-pointer attention-vehicle text-white hover:text-blue-300" data-os-id="${os.id}">${os.placa} - ${os.modelo}</p>`).join('')
            : `<p class="text-gray-400">- Vazio -</p>`;
        return `<div class="attention-box p-2 rounded-md bg-gray-900 border-2 border-gray-700 ${blinkingClass}" data-status-key="${statusKey}"><h3 class="text-center text-${config.color}-400 font-bold text-xs sm:text-sm truncate">${config.label}</h3><div class="mt-1 text-center text-white text-xs space-y-1 h-16 overflow-y-auto">${vehicleListHTML}</div></div>`;
    }).join('');
    updateLedState(vehiclesTriggeringAlert);
  };

  function sendTeamNotification(message) {
      if (!currentUser) return;
      const notificationRef = db.ref('notifications').push();
      notificationRef.set({ message: message, user: currentUser.name, timestamp: firebase.database.ServerValue.TIMESTAMP });
  }

  function listenToNotifications() {
      const notificationsRef = db.ref('notifications').orderByChild('timestamp').startAt(appStartTime);
      notificationsRef.on('child_added', snapshot => {
          const notification = snapshot.val();
          if (notification && notification.user !== currentUser.name) {
              showNotification(notification.message, 'success');
          }
          snapshot.ref.remove();
      });
  }

  const updateLedState = (vehiclesTriggeringAlert) => {
    if (vehiclesTriggeringAlert.size > 0 && attentionPanelContainer.classList.contains('collapsed')) {
        alertLed.classList.remove('hidden');
    } else {
        alertLed.classList.add('hidden');
    }
  };

  const updateServiceOrderStatus = async (osId, newStatus) => {
    const os = allServiceOrders[osId];
    if (!os) return;
    const oldStatus = os.status;
    const logEntry = { timestamp: new Date().toISOString(), user: currentUser.name, description: `Status alterado de "${formatStatus(oldStatus)}" para "${formatStatus(newStatus)}".`, type: 'status' };
    const updates = { status: newStatus, lastUpdate: new Date().toISOString() };
    if (newStatus === 'Em-Analise') updates.responsibleForBudget = currentUser.name;
    else if (newStatus === 'Em-Execucao') updates.responsibleForService = currentUser.name;
    else if (newStatus === 'Entregue') updates.responsibleForDelivery = currentUser.name;
    try {
        await db.ref(`serviceOrders/${osId}/logs`).push().set(logEntry);
        await db.ref(`serviceOrders/${osId}`).update(updates);
        sendTeamNotification(`O.S. ${os.placa} movida para ${formatStatus(newStatus)} por ${currentUser.name}`);
    } catch (error) {
        console.error("Erro ao atualizar status e registrar log:", error);
        showNotification("Falha ao mover O.S. Tente novamente.", "error");
    }
  };

  const openDetailsModal = (osId) => {
    const os = allServiceOrders[osId];
    if (!os) {
        showNotification("Não foi possível carregar os detalhes desta O.S.", "error");
        return;
    }
    document.getElementById('detailsPlacaModelo').textContent = `${os.placa} - ${os.modelo}`;
    document.getElementById('detailsCliente').innerHTML = `Cliente: ${os.cliente} <br> <span class="text-sm text-gray-500">Telefone: ${os.telefone || 'Não informado'}</span>`;
    document.getElementById('detailsKm').textContent = `KM: ${os.km ? new Intl.NumberFormat('pt-BR').format(os.km) : 'N/A'}`;
    document.getElementById('responsible-attendant').textContent = os.responsible || 'N/D';
    document.getElementById('responsible-budget').textContent = os.responsibleForBudget || 'N/D';
    document.getElementById('responsible-service').textContent = os.responsibleForService || 'N/D';
    document.getElementById('responsible-delivery').textContent = os.responsibleForDelivery || 'N/D';
    const observacoesContainer = document.getElementById('detailsObservacoes');
    if (os.observacoes) {
      observacoesContainer.innerHTML = `<h4 class="text-sm font-semibold text-gray-500 mb-1">Queixa do Cliente:</h4><p class="text-gray-800 bg-yellow-100 p-3 rounded-md whitespace-pre-wrap">${os.observacoes}</p>`;
      observacoesContainer.classList.remove('hidden');
    } else {
      observacoesContainer.classList.add('hidden');
    }
    if (currentUser && (currentUser.role === 'Gestor' || currentUser.role === 'Atendente')) {
        deleteOsBtn.classList.remove('hidden');
    } else {
        deleteOsBtn.classList.add('hidden');
    }
    document.getElementById('logOsId').value = osId;
    logForm.reset();
    document.getElementById('fileName').textContent = '';
    filesToUpload = [];
    postLogActions.style.display = 'none';
    renderTimeline(os);
    renderMediaGallery(os);
    detailsModal.classList.remove('hidden');
    detailsModal.classList.add('flex');
  };

  const renderTimeline = (os) => {
    const logs = os.logs || {};
    const logEntries = Object.entries(logs).sort(([,a], [,b]) => new Date(b.timestamp) - new Date(a.timestamp));

    timelineContainer.innerHTML = logEntries.map(([logId, log]) => {
      const date = new Date(log.timestamp);
      const formattedDate = date.toLocaleDateString('pt-BR');
      const formattedTime = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      let iconClass = 'bx-message-detail';
      let itemClass = 'timeline-item-log';
      if (log.type === 'status') { iconClass = 'bx-transfer'; itemClass = 'timeline-item-status'; }
      else if (log.value) { iconClass = 'bx-dollar'; itemClass = 'timeline-item-value'; }

      const canDelete = (currentUser.role === 'Gestor' || currentUser.role === 'Atendente') && log.description && !log.description.startsWith('ATT EXCLUIDA');
      const deleteButtonHTML = canDelete
        ? `<button class="delete-log-btn" data-os-id="${os.id}" data-log-id="${logId}" title="Excluir esta atualização"><i class='bx bx-x text-lg'></i></button>`
        : '';

      const descriptionHTML = log.description && log.description.startsWith('ATT EXCLUIDA')
        ? `<p class="text-red-500 italic text-sm">${log.description}</p>`
        : `<p class="text-gray-700 text-sm">${log.description || ''}</p>`;

      return `<div class="timeline-item ${itemClass}"><div class="timeline-icon"><i class='bx ${iconClass}'></i></div><div class="bg-gray-50 p-3 rounded-lg relative">${deleteButtonHTML}<div class="flex justify-between items-start mb-1"><h4 class="font-semibold text-gray-800 text-sm">${log.user}</h4><span class="text-xs text-gray-500">${formattedDate} ${formattedTime}</span></div>${descriptionHTML}${log.parts ? `<p class="text-gray-600 text-xs mt-1"><strong>Peças:</strong> ${log.parts}</p>` : ''}${log.value ? `<p class="text-green-600 text-xs mt-1"><strong>Valor:</strong> R$ ${parseFloat(log.value).toFixed(2)}</p>` : ''}</div></div>`;
    }).join('');

    if (logEntries.length === 0) {
      timelineContainer.innerHTML = '<p class="text-gray-500 text-center py-4">Nenhum registro encontrado.</p>';
    }
  };

  const renderMediaGallery = (os) => {
    const media = os.media || {};
    const mediaEntries = Object.entries(media);
    lightboxMedia = mediaEntries.map(entry => ({...entry[1], key: entry[0]}));
    
    thumbnailGrid.innerHTML = mediaEntries.map(([key, item], index) => {
        if (!item || !item.type) return '';

        const canDelete = currentUser && USERS_CAN_DELETE_MEDIA.includes(currentUser.name);
        const deleteButtonHTML = canDelete 
            ? `<button class="delete-media-btn" data-os-id="${os.id}" data-media-key="${key}" title="Excluir Mídia"><i class='bx bxs-trash'></i></button>` 
            : '';

        const isImage = item.type.startsWith('image/');
        const isVideo = item.type.startsWith('video/');
        const isPdf = item.type === 'application/pdf';
        
        let thumbnailContent = `<i class='bx bx-file text-4xl text-gray-500'></i>`;
        if (isImage) { thumbnailContent = `<img src="${item.url}" alt="Imagem ${index + 1}" loading="lazy" class="w-full h-full object-cover">`; }
        else if (isVideo) { thumbnailContent = `<i class='bx bx-play-circle text-4xl text-blue-500'></i>`; }
        else if (isPdf) { thumbnailContent = `<i class='bx bxs-file-pdf text-4xl text-red-500'></i>`; }

        return `<div class="thumbnail-container aspect-square bg-gray-200 rounded-md overflow-hidden flex items-center justify-center relative">
                    ${deleteButtonHTML}
                    <div class="thumbnail-item w-full h-full cursor-pointer" data-index="${index}">${thumbnailContent}</div>
                </div>`;
    }).join('');

    if (mediaEntries.length === 0) {
      thumbnailGrid.innerHTML = `<div class="col-span-full text-center py-8 text-gray-400"><i class='bx bx-image text-4xl mb-2'></i><p class="text-sm">Nenhuma mídia adicionada</p></div>`;
    }
  };

  const exportOsToPrint = (osId) => {
    const os = allServiceOrders[osId];
    if (!os) { showNotification('Dados da O.S. não encontrados.', 'error'); return; }
    const formatDate = (isoString) => {
        if (!isoString) return 'N/A';
        return new Date(isoString).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    };
    const logs = os.logs ? Object.values(os.logs).sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp)) : [];
    let totalValue = 0;
    const timelineHtml = logs.map(log => {
        if (log.value) { totalValue += parseFloat(log.value); }
        return `<tr><td>${formatDate(log.timestamp)}</td><td>${log.user}</td><td>${log.description}</td><td>${log.parts || '---'}</td><td style="text-align: right;">${log.value ? `R$ ${parseFloat(log.value).toFixed(2)}` : '---'}</td></tr>`;
    }).join('');
    const media = os.media ? Object.values(os.media) : [];
    const photos = media.filter(item => item && item.type.startsWith('image/'));
    const photosHtml = photos.length > 0 ? `<div class="section"><h2>Fotos Anexadas</h2><div class="photo-gallery">${photos.map(photo => `<img src="${photo.url}" alt="Foto da O.S.">`).join('')}</div></div>` : '';
    const printHtml = `<html><head><title>Ordem de Serviço - ${os.placa}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;margin:0;padding:20px;color:#333}.container{max-width:800px;margin:auto}.header{text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:20px}.header h1{margin:0;font-size:24px}.header p{margin:5px 0}.section{margin-bottom:20px;border:1px solid #ccc;border-radius:8px;padding:15px;page-break-inside:avoid}.section h2{margin-top:0;font-size:18px;border-bottom:1px solid #eee;padding-bottom:5px;margin-bottom:10px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.grid-item strong{display:block;color:#555}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:14px}th{background-color:#f2f2f2}.total{text-align:right;font-size:18px;font-weight:bold;margin-top:20px}.footer{text-align:center;margin-top:50px;padding-top:20px;border-top:1px solid #ccc}.signature{margin-top:60px}.signature-line{border-bottom:1px solid #000;width:300px;margin:0 auto}.signature p{margin-top:5px;font-size:14px}.photo-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:10px}.photo-gallery img{width:100%;height:auto;border:1px solid #ddd;border-radius:4px}.dev-signature{margin-top:40px;font-size:12px;color:#888;text-align:center}@media print{body{padding:10px}.no-print{display:none}}</style></head><body><div class="container"><div class="header"><h1>CHEVRON Bosch Car Service</h1><p>Ordem de Serviço</p></div><div class="section"><h2>Detalhes da O.S.</h2><div class="grid"><div class="grid-item"><strong>Placa:</strong> ${os.placa}</div><div class="grid-item"><strong>Modelo:</strong> ${os.modelo}</div><div class="grid-item"><strong>Cliente:</strong> ${os.cliente}</div><div class="grid-item"><strong>Telefone:</strong> ${os.telefone||"N/A"}</div><div class="grid-item"><strong>KM:</strong> ${os.km?new Intl.NumberFormat("pt-BR").format(os.km):"N/A"}</div><div class="grid-item"><strong>Data de Abertura:</strong> ${formatDate(os.createdAt)}</div><div class="grid-item"><strong>Atendente:</strong> ${os.responsible||"N/A"}</div></div></div>${os.observacoes?`<div class="section"><h2>Queixa do Cliente / Observações Iniciais</h2><p style="white-space: pre-wrap;">${os.observacoes}</p></div>`:""}<div class="section"><h2>Histórico de Serviços e Peças</h2><table><thead><tr><th>Data/Hora</th><th>Usuário</th><th>Descrição</th><th>Peças</th><th style="text-align: right;">Valor</th></tr></thead><tbody>${timelineHtml||'<tr><td colspan="5" style="text-align: center;">Nenhum registro no histórico.</td></tr>'}</tbody></table><div class="total">Total: R$ ${totalValue.toFixed(2)}</div></div>${photosHtml}<div class="footer"><div class="signature"><div class="signature-line"></div><p>Assinatura do Cliente</p></div><p>Documento gerado em: ${new Date().toLocaleString("pt-BR")}</p><div class="dev-signature">Desenvolvido com 🤖 - por thIAguinho Soluções</div></div></div><script>window.onload=function(){window.print();setTimeout(function(){window.close()},100)}<\/script></body></html>`;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printHtml);
    printWindow.document.close();
  };

  const openLightbox = (index) => {
    if (!lightboxMedia || lightboxMedia.length === 0) return;
    currentLightboxIndex = index;
    const media = lightboxMedia[index];
    if (!media || !media.type) return; 
    if (media.type === 'application/pdf') { window.open(media.url, '_blank'); return; }
    const lightboxContent = document.getElementById('lightbox-content');
    if (media.type.startsWith('image/')) {
      lightboxContent.innerHTML = `<img src="${media.url}" alt="Imagem" class="max-w-full max-h-full object-contain">`;
    } else {
      lightboxContent.innerHTML = `<video src="${media.url}" controls class="max-w-full max-h-full"></video>`;
    }
    document.getElementById('lightbox-prev').style.display = index > 0 ? 'block' : 'none';
    document.getElementById('lightbox-next').style.display = index < lightboxMedia.length - 1 ? 'block' : 'none';
    const downloadBtn = document.getElementById('lightbox-download');
    downloadBtn.href = media.url;
    downloadBtn.download = `media_${index + 1}`;
    lightbox.classList.remove('hidden');
    lightbox.classList.add('flex');
  };

  // --- LISTENERS DE EVENTOS ---
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const selectedUserName = userSelect.value;
    const enteredPassword = passwordInput.value;
    if (!selectedUserName) {
        loginError.textContent = 'Por favor, selecione um usuário.';
        return;
    }
    const user = USERS.find(u => u.name === selectedUserName);
    if (user && user.password === enteredPassword) {
        loginUser(user);
    } else {
        loginError.textContent = 'Senha incorreta. Tente novamente.';
        passwordInput.value = '';
    }
  });

  logoutButton.addEventListener('click', logoutUser);

  togglePanelBtn.addEventListener('click', () => {
    attentionPanelContainer.classList.toggle('collapsed');
    togglePanelBtn.querySelector('i').classList.toggle('rotate-180');
    updateAttentionPanel();
  });

  attentionPanel.addEventListener('click', (e) => {
    const vehicleElement = e.target.closest('.attention-vehicle');
    if (vehicleElement) { openDetailsModal(vehicleElement.dataset.osId); }
  });

  kanbanBoard.addEventListener('click', (e) => {
    const card = e.target.closest('.vehicle-card');
    const moveBtn = e.target.closest('.btn-move-status');
    const clickableArea = e.target.closest('.card-clickable-area');
    const toggleBtn = e.target.closest('.toggle-column-btn');
    if (moveBtn) {
      e.stopPropagation();
      updateServiceOrderStatus(moveBtn.dataset.osId, moveBtn.dataset.newStatus);
    } else if (clickableArea && card) {
      openDetailsModal(card.dataset.osId);
    } else if (toggleBtn) {
      const status = toggleBtn.dataset.status;
      const vehicleList = kanbanBoard.querySelector(`.vehicle-list[data-status="${status}"]`);
      vehicleList.classList.toggle('collapsed');
      toggleBtn.querySelector('i').classList.toggle('rotate-180');
      const collapsedState = JSON.parse(localStorage.getItem('collapsedColumns')) || {};
      collapsedState[status] = vehicleList.classList.contains('collapsed');
      localStorage.setItem('collapsedColumns', JSON.stringify(collapsedState));
      const columnLed = toggleBtn.querySelector('.column-led');
      if (columnLed) columnLed.style.display = (collapsedState[status] && vehicleList.children.length > 0) ? 'block' : 'none';
    }
  });

  kanbanBoard.addEventListener('input', (e) => {
      if (e.target.matches('.search-input-entregue')) {
          renderDeliveredColumn();
      }
  });

  globalSearchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toUpperCase().trim();

    if (!searchTerm) {
        globalSearchResults.innerHTML = '';
        globalSearchResults.classList.add('hidden');
        return;
    }
    
    const matchingOrders = Object.values(allServiceOrders)
        .filter(os => os.placa && os.placa.toUpperCase().includes(searchTerm))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); 

    if (matchingOrders.length > 0) {
        globalSearchResults.innerHTML = matchingOrders.map(os => `
            <div class="search-result-item" data-os-id="${os.id}">
                <p class="font-bold">${os.placa} - ${os.modelo}</p>
                <p class="text-sm text-gray-600">Status: <span class="font-semibold text-blue-700">${formatStatus(os.status)}</span></p>
            </div>
        `).join('');
        globalSearchResults.classList.remove('hidden');
    } else {
        globalSearchResults.innerHTML = '<div class="p-3 text-center text-gray-500">Nenhum veículo encontrado.</div>';
        globalSearchResults.classList.remove('hidden');
    }
  });
  
  globalSearchResults.addEventListener('click', (e) => {
      const resultItem = e.target.closest('.search-result-item');
      if (resultItem) {
          const osId = resultItem.dataset.osId;
          openDetailsModal(osId);
          globalSearchInput.value = ''; 
          globalSearchResults.innerHTML = '';
          globalSearchResults.classList.add('hidden');
      }
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('.btn-close-modal') || e.target.id === 'detailsModal') { detailsModal.classList.add('hidden'); }
    if (e.target.closest('.btn-close-modal') || e.target.id === 'osModal') { osModal.classList.add('hidden'); }
    
    const searchContainer = document.querySelector('.search-container');
    if (searchContainer && !searchContainer.contains(e.target)) {
        globalSearchResults.classList.add('hidden');
    }
  });
  
  thumbnailGrid.addEventListener('click', (e) => {
      const thumbnailItem = e.target.closest('.thumbnail-item');
      const deleteButton = e.target.closest('.delete-media-btn');

      if (deleteButton) {
          e.stopPropagation();
          const { osId, mediaKey } = deleteButton.dataset;
          confirmDeleteMediaBtn.dataset.osId = osId;
          confirmDeleteMediaBtn.dataset.mediaKey = mediaKey;
          confirmDeleteMediaModal.classList.remove('hidden');
          confirmDeleteMediaModal.classList.add('flex');
          return;
      }
      
      if (thumbnailItem && thumbnailItem.dataset.index !== undefined) {
          openLightbox(parseInt(thumbnailItem.dataset.index));
      }
  });


  detailsModal.addEventListener('click', (e) => {
    const exportBtn = e.target.closest('#exportOsBtn');
    if (exportBtn) { exportOsToPrint(document.getElementById('logOsId').value); }
  });

  addOSBtn.addEventListener('click', () => {
    document.getElementById('osModalTitle').textContent = 'Nova Ordem de Serviço';
    document.getElementById('osId').value = '';
    osForm.reset();
    const responsavelSelect = document.getElementById('osResponsavel');
    responsavelSelect.innerHTML = '<option value="">Selecione um responsável...</option>' + USERS.map(user => `<option value="${user.name}">${user.name}</option>`).join('');
    osModal.classList.remove('hidden');
    osModal.classList.add('flex');
  });

  osForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const priority = document.querySelector('input[name="osPrioridade"]:checked').value;
    const osData = {
      placa: document.getElementById('osPlaca').value.toUpperCase(),
      modelo: document.getElementById('osModelo').value,
      cliente: document.getElementById('osCliente').value,
      telefone: document.getElementById('osTelefone').value,
      km: parseInt(document.getElementById('osKm').value) || 0,
      responsible: document.getElementById('osResponsavel').value,
      observacoes: document.getElementById('osObservacoes').value,
      priority: priority,
      status: 'Aguardando-Mecanico',
      createdAt: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
      logs: [],
      media: []
    };
    const osId = document.getElementById('osId').value;
    if (osId) {
      const { logs, media, ...dataToUpdate } = osData;
      db.ref(`serviceOrders/${osId}`).update(dataToUpdate);
      sendTeamNotification(`O.S. ${osData.placa} foi atualizada por ${currentUser.name}`);
    } else {
      const newOsRef = db.ref('serviceOrders').push();
      newOsRef.set(osData);
      sendTeamNotification(`Nova O.S. para ${osData.placa} criada por ${currentUser.name}`);
    }
    osModal.classList.add('hidden');
  });

  logForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Salvando...`;
    const osId = document.getElementById('logOsId').value;
    const description = document.getElementById('logDescricao').value;
    const parts = document.getElementById('logPecas').value;
    const value = document.getElementById('logValor').value;
    const logEntry = { timestamp: new Date().toISOString(), user: currentUser.name, description: description, type: 'log', parts: parts || null, value: value || null };
    try {
        if (filesToUpload && filesToUpload.length > 0) {
            submitBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Enviando mídia...`;
            const mediaPromises = filesToUpload.map(file =>
                uploadFileToCloudinary(file).then(url => ({
                    type: file.type, url: url, name: file.name, timestamp: new Date().toISOString()
                }))
            );
            const mediaResults = await Promise.all(mediaPromises);
            const mediaRef = db.ref(`serviceOrders/${osId}/media`);
            mediaResults.forEach(result => {
                mediaRef.push().set(result);
            });
        }
        const logsRef = db.ref(`serviceOrders/${osId}/logs`);
        const newLogRef = logsRef.push();
        await newLogRef.set(logEntry);
        logForm.reset();
        filesToUpload = [];
        document.getElementById('fileName').textContent = '';
        postLogActions.style.display = 'block';
        sendTeamNotification(`Novo registro adicionado à O.S. ${allServiceOrders[osId].placa} por ${currentUser.name}`);
    } catch (error) {
        console.error("Erro ao salvar registro:", error);
        showNotification(`Erro: ${error.message}`, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i class='bx bx-message-square-add'></i> Adicionar ao Histórico`;
    }
  });

  document.getElementById('btn-move-next').addEventListener('click', () => {
    const osId = document.getElementById('logOsId').value;
    const os = allServiceOrders[osId];
    const nextStatus = STATUS_LIST[STATUS_LIST.indexOf(os.status) + 1];
    if (nextStatus) { updateServiceOrderStatus(osId, nextStatus); detailsModal.classList.add('hidden'); }
  });

  document.getElementById('btn-move-prev').addEventListener('click', () => {
    const osId = document.getElementById('logOsId').value;
    const os = allServiceOrders[osId];
    const prevStatus = STATUS_LIST[STATUS_LIST.indexOf(os.status) - 1];
    if (prevStatus) { updateServiceOrderStatus(osId, prevStatus); detailsModal.classList.add('hidden'); }
  });

  document.getElementById('btn-stay').addEventListener('click', () => { postLogActions.style.display = 'none'; });

  kmUpdateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const osId = document.getElementById('logOsId').value;
    const newKm = parseInt(document.getElementById('updateKmInput').value);
    if (newKm && newKm > 0) {
      await db.ref(`serviceOrders/${osId}/km`).set(newKm);
      const logEntry = { timestamp: new Date().toISOString(), user: currentUser.name, description: `KM do veículo atualizado para ${new Intl.NumberFormat('pt-BR').format(newKm)} km.`, type: 'log' };
      await db.ref(`serviceOrders/${osId}/logs`).push().set(logEntry);
      document.getElementById('updateKmInput').value = '';
      showNotification('KM atualizado e registrado no histórico!', 'success');
      sendTeamNotification(`KM da O.S. ${allServiceOrders[osId].placa} atualizado para ${newKm} por ${currentUser.name}`);
    }
  });

  deleteOsBtn.addEventListener('click', () => {
    const osId = document.getElementById('logOsId').value;
    const os = allServiceOrders[osId];
    if (currentUser.role === 'Gestor' || currentUser.role === 'Atendente') {
      confirmDeleteText.innerHTML = `Você tem certeza que deseja excluir a O.S. da placa <strong>${os.placa}</strong>? <br><br>Esta ação não pode ser desfeita.`;
      confirmDeleteBtn.dataset.osId = osId;
      confirmDeleteModal.classList.remove('hidden');
      confirmDeleteModal.classList.add('flex');
    } else {
      showNotification('Você não tem permissão para excluir Ordens de Serviço.', 'error');
    }
  });

  confirmDeleteBtn.addEventListener('click', () => {
    const osId = confirmDeleteBtn.dataset.osId;
    if (osId) {
      const os = allServiceOrders[osId];
      db.ref(`serviceOrders/${osId}`).remove();
      detailsModal.classList.add('hidden');
      confirmDeleteModal.classList.add('hidden');
      confirmDeleteModal.classList.remove('flex');
      showNotification(`O.S. ${os.placa} foi excluída com sucesso.`, 'success');
      sendTeamNotification(`O.S. ${os.placa} foi excluída por ${currentUser.name}`);
    }
  });

  cancelDeleteBtn.addEventListener('click', () => {
    confirmDeleteModal.classList.add('hidden');
    confirmDeleteModal.classList.remove('flex');
  });

  confirmDeleteModal.addEventListener('click', (e) => {
      if (e.target.id === 'confirmDeleteModal') {
          confirmDeleteModal.classList.add('hidden');
          confirmDeleteModal.classList.remove('flex');
      }
  });

  timelineContainer.addEventListener('click', (e) => {
      const deleteButton = e.target.closest('.delete-log-btn');
      if (deleteButton) {
          const { osId, logId } = deleteButton.dataset;
          confirmDeleteLogText.textContent = 'Você tem certeza que deseja excluir esta atualização do histórico? Esta ação não pode ser desfeita.';
          confirmDeleteLogBtn.dataset.osId = osId;
          confirmDeleteLogBtn.dataset.logId = logId;
          confirmDeleteLogModal.classList.remove('hidden');
          confirmDeleteLogModal.classList.add('flex');
      }
  });

  confirmDeleteLogBtn.addEventListener('click', async () => {
      const { osId, logId } = confirmDeleteLogBtn.dataset;
      if (osId && logId) {
          try {
              await db.ref(`serviceOrders/${osId}/logs/${logId}`).remove();
              const exclusionLogEntry = {
                  timestamp: new Date().toISOString(),
                  user: currentUser.name,
                  description: `ATT EXCLUIDA POR: ${currentUser.name}`,
                  type: 'log'
              };
              await db.ref(`serviceOrders/${osId}/logs`).push().set(exclusionLogEntry);
              showNotification('Atualização excluída do histórico.', 'success');
          } catch (error) {
              console.error("Erro ao excluir atualização:", error);
              showNotification('Falha ao excluir a atualização.', 'error');
          } finally {
              confirmDeleteLogModal.classList.add('hidden');
              confirmDeleteLogModal.classList.remove('flex');
          }
      }
  });

  cancelDeleteLogBtn.addEventListener('click', () => {
      confirmDeleteLogModal.classList.add('hidden');
      confirmDeleteLogModal.classList.remove('flex');
  });

  confirmDeleteMediaBtn.addEventListener('click', async () => {
    const { osId, mediaKey } = confirmDeleteMediaBtn.dataset;
    if (osId && mediaKey) {
        try {
            await db.ref(`serviceOrders/${osId}/media/${mediaKey}`).remove();
            showNotification('Mídia excluída com sucesso.', 'success');
        } catch (error) {
            console.error("Erro ao excluir mídia:", error);
            showNotification('Falha ao excluir a mídia.', 'error');
        } finally {
            confirmDeleteMediaModal.classList.add('hidden');
            confirmDeleteMediaModal.classList.remove('flex');
        }
    }
  });

  cancelDeleteMediaBtn.addEventListener('click', () => {
      confirmDeleteMediaModal.classList.add('hidden');
      confirmDeleteMediaModal.classList.remove('flex');
  });

  openCameraBtn.addEventListener('click', () => {
    mediaInput.setAttribute('accept', 'image/*');
    mediaInput.setAttribute('capture', 'camera');
    mediaInput.multiple = true;
    mediaInput.value = null;
    mediaInput.click();
  });

  openGalleryBtn.addEventListener('click', () => {
    mediaInput.setAttribute('accept', 'image/*,video/*,application/pdf');
    mediaInput.removeAttribute('capture');
    mediaInput.multiple = true;
    mediaInput.value = null;
    mediaInput.click();
  });

  mediaInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) { filesToUpload.push(...e.target.files); }
    if (filesToUpload.length > 0) {
      document.getElementById('fileName').textContent = `${filesToUpload.length} arquivo(s) na fila`;
    } else {
      document.getElementById('fileName').textContent = '';
    }
  });

  document.getElementById('lightbox-prev').addEventListener('click', () => {
    if (currentLightboxIndex > 0) { openLightbox(currentLightboxIndex - 1); }
  });

  document.getElementById('lightbox-next').addEventListener('click', () => {
    if (currentLightboxIndex < lightboxMedia.length - 1) { openLightbox(currentLightboxIndex + 1); }
  });

  document.getElementById('lightbox-close').addEventListener('click', () => { lightbox.classList.add('hidden'); });
  document.getElementById('lightbox-close-bg').addEventListener('click', () => { lightbox.classList.add('hidden'); });

  document.getElementById('lightbox-copy').addEventListener('click', () => {
    const media = lightboxMedia[currentLightboxIndex];
    if (media && media.url) {
        navigator.clipboard.writeText(media.url).then(() => { showNotification('URL copiada para a área de transferência!'); });
    }
  });

  // --- INICIALIZAÇÃO DO LOGIN ---
  initializeLoginScreen();
});
