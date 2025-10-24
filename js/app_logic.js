/* ==================================================================
PROTÓTIPO HÍBRIDO EletroIA-MVP - PARTE 2: LÓGICA
Versão: FINAL COMPLETA e CORRIGIDA (Listeners Fix) - 23/10/2025
==================================================================
*/

// Este arquivo DEPENDE das variáveis e funções definidas em app_setup.js
// Garanta que este arquivo (app_logic.js) seja carregado ANTES de app_setup.js no index.html // <--- CORREÇÃO NO COMENTÁRIO

/* ==================================================================
FUNÇÕES DE MANIPULAÇÃO DE PEDIDOS
==================================================================
*/
const updatePedidoStatus = async (id, newStatus) => {
    // Código completo da função updatePedidoStatus
    const pedido = allPedidos[id];
    if (!pedido) { showNotification("Erro: Pedido não encontrado.", "error"); return; }
    if (!newStatus || !STATUS_LIST.includes(newStatus)) { showNotification(`Erro: Status inválido.`, "error"); return; }
    if (pedido.status === newStatus) return; // Já está no status desejado

    const oldStatus = pedido.status;
    // Log detalhado da mudança de status
    const logEntry = {
        timestamp: new Date().toISOString(),
        user: currentUser.name,
        description: `Status alterado de "${formatStatus(oldStatus)}" para "${formatStatus(newStatus)}".`,
        type: 'status' // Marca como log de mudança de status
    };
    try {
         if (!db) throw new Error("DB Firebase não inicializado.");
         // 1. Adiciona o log
         await db.ref(`pedidos/${id}/logs`).push(logEntry);
         // 2. Atualiza o status e a data da última modificação do pedido
         await db.ref(`pedidos/${id}`).update({ status: newStatus, lastUpdate: new Date().toISOString() });
         // Notificação opcional, pode ser removida se for muito frequente
         // showNotification(`Pedido movido para ${formatStatus(newStatus)}.`, "success");
    } catch (error) {
        console.error("Erro ao atualizar status do pedido:", error);
        showNotification("Falha ao mover o pedido. Tente novamente.", "error");
    }
};

const openNewPedidoModal = () => {
    if (!pedidoForm || !pedidoModal) { console.error("Modal de novo pedido não encontrado."); return; }
    pedidoForm.reset(); // Limpa o formulário
    const pedidoIdInput = document.getElementById('pedidoId');
    if(pedidoIdInput) pedidoIdInput.value = ''; // Limpa ID oculto
    const modalTitle = document.getElementById('pedidoModalTitle');
    if(modalTitle) modalTitle.textContent = 'Novo Pedido de Venda'; // Define título

    // Popula dropdown de vendedores
    const vendedorSelect = document.getElementById('vendedorResponsavel');
    if (vendedorSelect && vendedores.length > 0) {
        vendedorSelect.innerHTML = '<option value="">Selecione Vendedor...</option>' + vendedores.map(v =>
            `<option value="${v.name}" ${currentUser && currentUser.name === v.name ? 'selected' : ''}>${v.name}</option>`
        ).join('');
    } else if (vendedorSelect) {
         vendedorSelect.innerHTML = '<option value="">Erro: Vendedores não carregados</option>';
    }

    // Popula lista de produtos iniciais (checkboxes)
    const servicosListContainer = document.getElementById('servicosList');
    if (servicosListContainer && configData.produtos) {
        if (configData.produtos.length > 0) {
             servicosListContainer.innerHTML = configData.produtos.map(p => `
                <label class="flex items-center space-x-2 cursor-pointer p-2 bg-white rounded-md shadow-sm hover:bg-gray-50 border border-gray-200">
                   <input type="checkbox" value="${p.price}" data-name="${p.name}" class="form-checkbox h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                   <span class="text-sm text-gray-700">${p.name} (${formatCurrency(p.price)})</span>
                </label>`).join('');
        } else {
             servicosListContainer.innerHTML = '<p class="text-gray-500 text-sm col-span-full italic">Nenhum produto cadastrado.</p>';
        }
    } else if (servicosListContainer) {
         servicosListContainer.innerHTML = '<p class="text-red-500 text-sm col-span-full">Erro ao carregar produtos.</p>';
    }

    pedidoModal.classList.remove('hidden'); // Mostra o modal
    pedidoModal.classList.add('flex');
};

const saveNewPedido = async (e) => {
    // Código completo da função saveNewPedido
    e.preventDefault(); // Impede recarregamento da página
    const clienteNomeInput = document.getElementById('clienteNome');
    const vendedorSelect = document.getElementById('vendedorResponsavel');
    const observacoesInput = document.getElementById('pedidoObservacoes');
    const formButton = pedidoForm ? pedidoForm.querySelector('button[type="submit"]') : null;

    if(formButton) formButton.disabled = true; // Desabilita botão durante o processo

    const clienteNome = clienteNomeInput?.value.trim() || '';
    const vendedorResponsavel = vendedorSelect?.value || '';
    const observacoes = observacoesInput?.value.trim() || '';

    // Validação de campos obrigatórios
    if (!clienteNome || !vendedorResponsavel) {
         showNotification("Nome do cliente e Vendedor são obrigatórios.", "error");
         if(formButton) formButton.disabled = false; // Reabilita botão
         return;
    }

    // Coleta itens selecionados (checkboxes)
    const selectedItensCheckboxes = Array.from(document.querySelectorAll('#servicosList input:checked'));
    const itens = selectedItensCheckboxes.map(input => ({
        name: input.dataset.name,
        price: parseFloat(input.value) || 0
    }));
    const valorTotalInicial = itens.reduce((sum, item) => sum + item.price, 0);

    let pedidoNumero = 1000; // Número padrão inicial
    try {
         // Gera número sequencial usando transaction no Firebase
         if (!db) throw new Error("DB Firebase não inicializado.");
         const configRef = db.ref('config/proximoPedido');
         const { committed, snapshot } = await configRef.transaction(currentValue => (currentValue || 1000) + 1);
         if (committed && snapshot.val()) {
             pedidoNumero = snapshot.val();
         } else {
              throw new Error("Falha na transação do Firebase para obter o número do pedido.");
         }
    } catch (error) {
         console.error("Erro crítico ao gerar número do pedido:", error);
         showNotification('Erro ao gerar número do pedido. Tente novamente mais tarde.', 'error');
         if(formButton) formButton.disabled = false; // Reabilita botão
         return; // Aborta a criação do pedido
    }

    const timestamp = new Date().toISOString(); // Timestamp atual

    // Monta o objeto de dados do novo pedido
    const pedidoData = {
      pedidoNumero, clienteNome, vendedorResponsavel, observacoes,
      agendamento: timestamp, // Data/Hora de criação
      itens: itens,
      formaPagamento: FORMAS_PAGAMENTO[0], // Usa o primeiro da lista como padrão
      valorTotal: valorTotalInicial, desconto: 0,
      status: STATUS_LIST[0], // Status inicial ('Novos-Leads')
      createdAt: timestamp, lastUpdate: timestamp,
      // 'logs' será adicionado via push separadamente
    };

    try {
        if (!db) throw new Error("DB Firebase não inicializado.");
        const newPedidoRef = db.ref('pedidos').push(); // Cria um novo nó com ID único
        const pedidoIdFirebase = newPedidoRef.key; // Obtém o ID gerado

        // Cria o log inicial de criação
        const initialLog = { timestamp, user: currentUser.name, description: 'Pedido criado.', type: 'log' };
        // Adiciona o log inicial usando push() dentro do nó 'logs' do novo pedido
        await db.ref(`pedidos/${pedidoIdFirebase}/logs`).push(initialLog);

        // Define os dados principais do pedido (sem os logs, pois já foram adicionados)
        await newPedidoRef.set(pedidoData);

        showNotification(`Pedido #${pedidoNumero} criado com sucesso!`, 'success');
        if(pedidoModal) pedidoModal.classList.add('hidden'); // Fecha o modal
    } catch (error) {
        console.error("Erro ao salvar o novo pedido no Firebase:", error);
        showNotification(`Erro ao salvar pedido: ${error.message}`, 'error');
        // Considerar reverter o contador 'proximoPedido' em caso de falha aqui (lógica mais complexa)
    } finally {
         if(formButton) formButton.disabled = false; // Reabilita botão sempre ao final
    }
};

const saveDetailsAndMaybeAdvance = async (advanceStatus = false) => {
    // Código completo da função saveDetailsAndMaybeAdvance
    const id = document.getElementById('logPedidoId')?.value;
    if (!id || !allPedidos[id]) { showNotification("Erro: ID do pedido inválido para salvar.", "error"); return false; }
    const pedidoAtual = allPedidos[id]; const saveButton = document.getElementById('saveAndNextStatusBtn');
    if(saveButton) saveButton.disabled = true; // Desabilita botão durante o processo
    const valorTotalCalculado = calculateDetailsTotal(false); // Calcula o valor com base nos itens do modal
    const updates = {
        itens: itensAdicionadosState, // Salva o array de itens atual do modal
        formaPagamento: document.getElementById('detailsFormaPagamento')?.value || pedidoAtual.formaPagamento,
        desconto: parseFloat(document.getElementById('detailsDesconto')?.value) || 0,
        valorTotal: valorTotalCalculado, // Salva o total recém-calculado
        lastUpdate: new Date().toISOString() // Atualiza data da última modificação
    };
    try {
        if (!db) throw new Error("DB Firebase não inicializado.");
        await db.ref(`pedidos/${id}`).update(updates); // Envia as atualizações para o Firebase
        let notificationMessage = 'Alterações salvas com sucesso!';
        // Se a opção de avançar status foi marcada
        if (advanceStatus) {
            const currentStatusIndex = STATUS_LIST.indexOf(pedidoAtual.status);
            const nextStatus = currentStatusIndex < STATUS_LIST.length - 1 ? STATUS_LIST[currentStatusIndex + 1] : null;
            if (nextStatus) {
                // Chama a função que atualiza o status E adiciona o log de status
                await updatePedidoStatus(id, nextStatus);
                notificationMessage = 'Pedido salvo e status avançado!';
            } else {
                 notificationMessage = 'Pedido salvo! Já está no último status.';
            }
        }
        showNotification(notificationMessage, 'success'); // Notifica o usuário
        if(detailsModal) detailsModal.classList.add('hidden'); // Fecha o modal após sucesso
        return true; // Indica sucesso
    } catch (error) {
        console.error("Erro ao salvar detalhes e/ou avançar status:", error);
        showNotification(`Erro ao salvar: ${error.message}`, 'error');
        return false; // Indica falha
    } finally {
         if(saveButton) saveButton.disabled = false; // Reabilita o botão ao final
    }
};

const saveLogAndUploads = async (e) => {
    // Código completo da função saveLogAndUploads
   e.preventDefault(); const submitBtn = e.target.querySelector('button[type="submit"]'); if (!submitBtn) return;
    const pedidoId = document.getElementById('logPedidoId')?.value; const descriptionInput = document.getElementById('logDescricao');
    const description = descriptionInput?.value.trim() || '';
    if (!pedidoId) { showNotification("Erro: ID pedido.", "error"); return; }
    if (!description && filesToUpload.length === 0) { showNotification("Descrição ou arquivos.", "warning"); return; }
    submitBtn.disabled = true; submitBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin mr-2'></i> Salvando...`;
    const timestamp = new Date().toISOString(); const logEntry = { timestamp, user: currentUser.name, type: 'log', description: description || `Adicionou ${filesToUpload.length} mídia(s).` };
    try {
        if (!db) throw new Error("DB Firebase não inicializado.");
        await db.ref(`pedidos/${pedidoId}/logs`).push(logEntry); // Salva log
        if (filesToUpload.length > 0) { // Processa uploads
            submitBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin mr-2'></i> Enviando ${filesToUpload.length} mídia(s)...`;
            const uploadPromises = filesToUpload.map(async file => { const url = await uploadFileToCloudinary(file); return { type: file.type || 'application/octet-stream', url, name: file.name, timestamp }; });
            const mediaResults = await Promise.all(uploadPromises); const mediaRef = db.ref(`pedidos/${pedidoId}/media`);
            for (const result of mediaResults) { await mediaRef.push().set(result); } // Salva refs da mídia
        }
        if(logForm) logForm.reset(); filesToUpload = []; if(fileNameDisplay) fileNameDisplay.textContent = ''; showNotification('Atualização adicionada!', 'success');
    } catch (error) { if (!error.message?.includes('upload')) { showNotification(`Erro: ${error.message || 'Erro desconhecido'}`, 'error'); } console.error("Erro saveLog:", error); }
    finally { submitBtn.disabled = false; submitBtn.innerHTML = `<i class='bx bx-message-square-add mr-2'></i> Add Histórico`; }
};

const generateWhatsappOffer = () => {
    // Código completo da função generateWhatsappOffer
    const pedidoId = document.getElementById('logPedidoId')?.value; const pedido = allPedidos[pedidoId]; if (!pedido) { showNotification("Erro: Pedido não carregado.", "error"); return; } const cliente = pedido.clienteNome || "Cliente"; const valorTotal = calculateDetailsTotal(false); const vendedor = currentUser.name || "Vendedor"; let itensTexto = "*Itens:*"; if (itensAdicionadosState.length > 0) { itensTexto += '\n' + itensAdicionadosState.map(item => `- ${item.name} (${formatCurrency(item.price)})`).join('\n'); } else { itensTexto += "\n- (Nenhum item selecionado)"; } const desconto = parseFloat(document.getElementById('detailsDesconto')?.value || 0); const descontoTexto = desconto > 0 ? `\n\n*Desconto:* ${formatCurrency(desconto)}` : ''; const valorFinalTexto = `\n\n*Valor Total:* ${formatCurrency(valorTotal)}`; const pagamentoTexto = `\n*Forma Pgto:* ${document.getElementById('detailsFormaPagamento')?.value || 'A definir'}`; const oferta = `Olá ${cliente},\nSegue cotação solicitada:\n\n${itensTexto}${descontoTexto}${valorFinalTexto}${pagamentoTexto}\n\nQualquer dúvida, estou à disposição!\n\nAtt,\n${vendedor}\nMS Distribuidora`; try { navigator.clipboard.writeText(oferta); showNotification("Texto copiado! Cole no WhatsApp.", "success"); const logEntry = { timestamp: new Date().toISOString(), user: currentUser.name, description: `Gerou texto oferta (Valor: ${formatCurrency(valorTotal)})`, type: 'log' }; if(db) db.ref(`pedidos/${pedidoId}/logs`).push(logEntry); } catch (err) { console.error('Erro copiar texto: ', err); showNotification('Erro ao copiar.', 'error'); }
};


/* ==================================================================
MODAL DE DETALHES - Funções Internas
==================================================================
*/
const openDetailsModal = async (id) => {
    // Código completo da função openDetailsModal
    const pedido = allPedidos[id]; if (!pedido) { showNotification("Erro: Pedido não encontrado.", "error"); return; } if(!detailsModal) return;
    detailsModal.scrollTop = 0; if(logForm) logForm.reset(); const logPedidoIdInput = document.getElementById('logPedidoId'); if(logPedidoIdInput) logPedidoIdInput.value = id; filesToUpload = []; if(fileNameDisplay) fileNameDisplay.textContent = '';
    const detailsClienteNome = document.getElementById('detailsClienteNome'); if(detailsClienteNome) detailsClienteNome.textContent = pedido.clienteNome || 'Cliente'; const detailsPedidoNumero = document.getElementById('detailsPedidoNumero'); if(detailsPedidoNumero) detailsPedidoNumero.textContent = `Pedido #${String(pedido.pedidoNumero || 'N/A').padStart(4, '0')}`; const detailsAgendamento = document.getElementById('detailsAgendamento'); if(detailsAgendamento) detailsAgendamento.textContent = `Aberto em: ${formatDateTime(pedido.createdAt || pedido.agendamento)}`; const detailsVendedor = document.getElementById('detailsVendedor'); if(detailsVendedor) detailsVendedor.textContent = `Vendedor: ${pedido.vendedorResponsavel || 'N/A'}`; const obsContainer = document.getElementById('detailsObservacoesContainer'); if(obsContainer){ if (pedido.observacoes) { obsContainer.innerHTML = `<h4 class="text-xs font-medium text-gray-500 mb-1">Obs. Iniciais:</h4><p class="text-gray-700 bg-yellow-50 border border-yellow-200 p-2 rounded-md whitespace-pre-wrap text-sm">${pedido.observacoes}</p>`; obsContainer.classList.remove('hidden'); } else { obsContainer.innerHTML = ''; obsContainer.classList.add('hidden'); } } const pgtoSelect = document.getElementById('detailsFormaPagamento'); if(pgtoSelect){ pgtoSelect.innerHTML = FORMAS_PAGAMENTO.map(f => `<option value="${f}" ${f === pedido.formaPagamento ? 'selected' : ''}>${f}</option>`).join(''); } const descInput = document.getElementById('detailsDesconto'); if(descInput) descInput.value = pedido.desconto || 0; const itemsSelect = document.getElementById('detailsServicosList'); if(itemsSelect && configData.produtos){ itemsSelect.innerHTML = '<option value="">-- Adicionar --</option>' + configData.produtos.map(p => `<option value="${p.name}|${p.price}">${p.name} - ${formatCurrency(p.price)}</option>`).join(''); } else if(itemsSelect){ itemsSelect.innerHTML = '<option value="">-- Erro --</option>'; }
    itensAdicionadosState = Array.isArray(pedido.itens) ? [...pedido.itens] : [];
    renderDetailsItems(); calculateDetailsTotal(false); renderTimeline(pedido); renderMediaGallery(pedido);
    if(deleteBtn) { deleteBtn.classList.toggle('hidden', !(currentUser?.role?.toLowerCase().includes('gestor'))); deleteBtn.dataset.id = id; }
    detailsModal.classList.remove('hidden'); detailsModal.classList.add('flex');
    const historicoContainer = document.getElementById('detailsHistoricoCliente'); if(historicoContainer && pedido.clienteNome) { historicoContainer.innerHTML = '<p class="text-gray-400 text-xs italic animate-pulse">Buscando...</p>'; try { if (!db) throw new Error("DB não inicializado."); const snapshot = await db.ref('pedidos').orderByChild('clienteNome').equalTo(pedido.clienteNome).limitToLast(6).once('value'); const historico = snapshot.val() || {}; const anteriores = Object.entries(historico).map(([k, p]) => ({...p, id: k})).filter(p => p.id !== id && p.status === 'Entregue').sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5); pedido.historicoAnterior = anteriores; if(anteriores.length > 0) { historicoContainer.innerHTML = anteriores.map(p => `<div class="historico-item"><div class="flex justify-between text-xs text-gray-500 mb-1"><span>#${p.pedidoNumero || p.id.slice(-4)} (${formatDate(p.createdAt)})</span><span class="font-medium">${formatCurrency(p.valorTotal)}</span></div><p class="text-gray-700 truncate text-xs" title="${(p.itens || []).map(i=>i.name).join(', ')}">${(p.itens || []).map(i=>i.name).join(', ') || 'N/A'}</p></div>`).join(''); } else { historicoContainer.innerHTML = '<p class="text-gray-500 text-xs italic tc">Nenhum pedido anterior.</p>'; } generateSalesAssistV1Suggestions(pedido, anteriores); } catch (error) { console.error("Erro histórico:", error); historicoContainer.innerHTML = '<p class="text-red-500 text-xs">Erro buscar.</p>'; generateSalesAssistV1Suggestions(pedido, []); } } else if (historicoContainer) { historicoContainer.innerHTML = '<p class="text-gray-500 text-xs italic">Cliente não identificado.</p>'; generateSalesAssistV1Suggestions(pedido, []); } getGeminiSuggestions(pedido, itensAdicionadosState);
};

const renderDetailsItems = () => {
     const container = document.getElementById('detailsItensContainer'); if (!container) return; const itens = Array.isArray(itensAdicionadosState) ? itensAdicionadosState : []; if (itens.length === 0) { container.innerHTML = '<p class="text-gray-500 text-sm italic">Nenhum item.</p>'; return; } container.innerHTML = itens.map((item, index) => `<div class="flex justify-between items-center bg-gray-50 p-2 rounded text-sm border border-gray-200 shadow-sm mb-1"><span>${item.name || 'Item s/ nome'} - ${formatCurrency(item.price)}</span><button type="button" class="remove-item-btn text-red-500 hover:text-red-700 font-bold px-2 text-lg leading-none" data-index="${index}" title="Remover">&times;</button></div>`).join('');
};

const calculateDetailsTotal = (saveToDB = false) => {
     const itens = Array.isArray(itensAdicionadosState) ? itensAdicionadosState : []; const itensTotal = itens.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0); const descontoInput = document.getElementById('detailsDesconto'); const desconto = parseFloat(descontoInput?.value || 0) || 0; const total = Math.max(0, itensTotal - desconto); const totalDisplay = document.getElementById('detailsValorTotalDisplay'); if(totalDisplay) totalDisplay.textContent = formatCurrency(total); if (saveToDB) { const id = document.getElementById('logPedidoId')?.value; if (id && allPedidos[id]) { const valorAtualDB = allPedidos[id].valorTotal; if (formatCurrency(valorAtualDB) !== formatCurrency(total)) { if(db) db.ref(`pedidos/${id}/valorTotal`).set(total).catch(error => { console.error("Erro salvar total:", error); }); } } } return total;
};

const renderTimeline = (pedido) => {
   const timelineContainer = document.getElementById('timelineContainer'); if (!timelineContainer) return; const logs = pedido.logs ? Object.entries(pedido.logs).map(([key, value]) => ({ ...value, id: key })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)) : []; if (logs.length === 0) { timelineContainer.innerHTML = '<p class="text-gray-500 text-center py-4 text-sm italic">Nenhum histórico.</p>'; return; } timelineContainer.innerHTML = logs.map(log => { const iconClass = log.type === 'status' ? 'bx-transfer' : 'bx-message-detail'; const iconColor = log.type === 'status' ? 'text-green-600 border-green-500' : 'text-blue-600 border-blue-500'; const userDisplay = log.user || 'Sistema'; return `<div class="timeline-item ${log.type === 'status' ? 'timeline-item-status' : 'timeline-item-log'}"><div class="timeline-icon ${iconColor}"><i class='bx ${iconClass}'></i></div><div class="bg-white p-3 rounded-lg shadow-sm border border-gray-200 ml-2 relative"><div class="flex justify-between items-start mb-1 gap-2"><h4 class="font-semibold text-gray-700 text-sm flex-grow">${userDisplay}</h4><span class="text-xs text-gray-500 flex-shrink-0">${formatDateTime(log.timestamp)}</span></div><p class="text-gray-600 text-sm break-words">${log.description || '(S/ Desc.)'}</p></div></div>`; }).join('');
};

const renderMediaGallery = (pedido) => {
    const thumbnailGrid = document.getElementById('thumbnail-grid'); if(!thumbnailGrid) return; const media = pedido.media || {}; const mediaEntries = Object.entries(media).map(([key, item]) => ({ ...item, key: key })); lightboxMedia = mediaEntries; if (mediaEntries.length === 0) { thumbnailGrid.innerHTML = `<div class="col-span-full text-center py-6 text-gray-400"><i class='bx bx-image bx-sm mb-2'></i><p class="text-xs italic">Nenhuma mídia.</p></div>`; return; } thumbnailGrid.innerHTML = mediaEntries.map((item, index) => { if (!item?.url) return ''; const canDelete = currentUser?.role?.toLowerCase().includes('gestor'); const deleteButtonHTML = canDelete ? `<button class="delete-media-btn z-10" data-pedido-id="${pedido.id}" data-media-key="${item.key}" title="Excluir"><i class='bx bxs-trash bx-xs'></i></button>` : ''; const fileType = item.type || ''; const isImage = fileType.startsWith('image/'); const isVideo = fileType.startsWith('video/'); const isPdf = fileType === 'application/pdf'; const fileName = item.name || `Arquivo_${index + 1}`; let thumbnailContent; if (isImage) { thumbnailContent = `<img src="${item.url}" alt="${fileName}" loading="lazy" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 t-transform duration-200">`; } else if (isVideo) { thumbnailContent = `<div class="flex flex-col items-center justify-center h-full p-1 tc"><i class='bx bx-play-circle text-3xl text-blue-500'></i><span class="text-xs text-gray-600 mt-1 truncate w-full px-1" title="${fileName}">${fileName}</span></div>`; } else if (isPdf) { thumbnailContent = `<div class="flex flex-col items-center justify-center h-full p-1 tc"><i class='bx bxs-file-pdf text-3xl text-red-500'></i><span class="text-xs text-gray-600 mt-1 truncate w-full px-1" title="${fileName}">${fileName}</span></div>`; } else { thumbnailContent = `<div class="flex flex-col items-center justify-center h-full p-1 tc"><i class='bx bx-file text-3xl text-gray-400'></i><span class="text-xs text-gray-500 mt-1 truncate w-full px-1" title="${fileName}">${fileName}</span></div>`; } return `<div class="thumbnail-container group bg-gray-100 rounded-md overflow-hidden flex items-center justify-center relative border border-gray-300 hover:shadow-lg t-shadow aspect-square">${deleteButtonHTML}<div class="thumbnail-item w-full h-full cursor-pointer flex items-center justify-center relative" data-index="${index}">${thumbnailContent}</div></div>`; }).join('');
};

const openLightbox = (index) => {
    if (!lightboxMedia || index < 0 || index >= lightboxMedia.length) return; currentLightboxIndex = index; const media = lightboxMedia[index]; if (!media?.url) { showNotification("Erro abrir mídia.", "error"); return; } const lightboxContent = document.getElementById('lightbox-content'); if(!lightboxContent) return; lightboxContent.innerHTML = '<p class="text-white animate-pulse tc">Carregando...</p>'; if (media.type === 'application/pdf') { lightboxContent.innerHTML = `<div class="tc p-6 bg-gray-800 rounded"><i class='bx bxs-file-pdf text-6xl text-red-400 mb-4'></i><p class="text-gray-300 text-sm mb-4 break-all">${media.name || 'PDF'}</p><a href="${media.url}" target="_blank" rel="noopener noreferrer" class="btn btn-red"><i class='bx bx-link-external mr-1'></i>Abrir PDF</a></div>`; } else if (media.type?.startsWith('image/')) { const img = new Image(); img.onload = () => { lightboxContent.innerHTML = ''; lightboxContent.appendChild(img); }; img.onerror = () => { lightboxContent.innerHTML = '<p class="text-red-400 tc">Erro carregar.</p>'; }; img.src = media.url; img.alt = media.name || 'Imagem'; img.className = "block max-w-full max-h-full object-contain rounded"; } else if (media.type?.startsWith('video/')) { lightboxContent.innerHTML = `<video src="${media.url}" controls controlsList="nodownload" class="block max-w-full max-h-full rounded"></video>`; } else { lightboxContent.innerHTML = `<div class="tc p-6 bg-gray-800 rounded"><i class='bx bx-file text-6xl text-gray-400 mb-4'></i><p class="text-gray-300 text-sm mb-4 break-all">${media.name || 'Arquivo'}</p><a href="${media.url}" target="_blank" rel="noopener noreferrer" class="btn btn-blue"><i class='bx bx-download mr-1'></i>Abrir/Baixar</a></div>`; } if(lightbox){ lightbox.classList.remove('hidden'); lightbox.classList.add('flex'); }
};

/* ==================================================================
ASSISTENTE DE VENDAS e IA
==================================================================
*/
const generateSalesAssistV1Suggestions = (pedidoAtual, pedidosAnteriores) => {
    const outputDiv = document.getElementById('assistenteVendasOutput'); if (!outputDiv) return; const suggestions = []; const itensAtuaisNomes = (Array.isArray(pedidoAtual.itens)?pedidoAtual.itens:[]).map(i => i.name.toLowerCase()); pedidosAnteriores = Array.isArray(pedidosAnteriores)?pedidosAnteriores:[];
    itensAtuaisNomes.forEach(itemName => { for (const ruleItem in CROSS_SELL_RULES) { if (itemName.includes(ruleItem.toLowerCase())) { CROSS_SELL_RULES[ruleItem].forEach(suggestion => { if (!itensAtuaisNomes.some(i => i.includes(suggestion.toLowerCase()))) { suggestions.push(`P/ ${ruleItem}: Ofereça **${suggestion}**.`); } }); } } });
    const produtoFreq = "Fita Isolante"; const comprasProd = pedidosAnteriores.filter(p => p.itens?.some(i => i.name.toLowerCase().includes(produtoFreq.toLowerCase()))).sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0)); if (comprasProd.length > 0) { const diffDays = Math.floor((new Date() - new Date(comprasProd[0].createdAt)) / 86400000); if (diffDays > FREQUENCY_ALERT_DAYS) { suggestions.push(`ALERTA: Última compra de ${produtoFreq} há ${diffDays} dias.`); } } else if (pedidosAnteriores.length > 0) { suggestions.push(`OPORT.: Cliente parece não comprar ${produtoFreq}.`); }
    if (itensAtuaisNomes.some(i => i.includes("1.5mm"))) { const comprouMaior = pedidosAnteriores.some(p => p.itens?.some(i => i.name.includes("2.5mm") || i.name.includes("4mm"))); if (comprouMaior) { suggestions.push(`INFO: Cliente já usou cabos > 1.5mm.`); } }
    if (suggestions.length > 0) { outputDiv.innerHTML = '<ul>' + suggestions.slice(0, 3).map(s => `<li class="mb-1 text-xs">${s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</li>`).join('') + '</ul>'; }
    else { outputDiv.innerHTML = '<p class="italic text-xs text-gray-500">Sem sugestões (V1).</p>'; }
};

const getGeminiSuggestions = async (pedidoAtual, itensAtuais) => {
    const outputDiv = document.getElementById('assistenteVendasOutput'); const refreshBtn = document.getElementById('geminiRefreshBtn'); if (!outputDiv || !refreshBtn || !GEMINI_API_KEY || GEMINI_API_KEY === "COLE_SUA_GEMINI_API_KEY_AQUI") { console.warn("Gemini desativado."); if(outputDiv && !outputDiv.innerHTML.includes('<li>')) outputDiv.innerHTML = '<p class="italic text-xs text-gray-500">IA não config.</p>'; if(refreshBtn) refreshBtn.classList.add('hidden'); return; } if(refreshBtn) refreshBtn.classList.remove('hidden'); outputDiv.innerHTML = '<p class="animate-pulse-subtle text-xs text-blue-700">IA pensando...</p>'; refreshBtn.disabled = true;
    const nomeCliente = pedidoAtual.clienteNome || "Cliente"; const itensAtuaisNomes = (Array.isArray(itensAtuais)?itensAtuais:[]).map(i => i.name).join(', ') || "Nenhum"; const historicoItens = pedidoAtual.historicoAnterior?.slice(0,2).flatMap(p => p.itens||[]).map(i => i.name).join(', ') || "Nenhum";
    const prompt = `Assistente de vendas B2B (materiais elétricos/construção). Cliente "${nomeCliente}". Pedido ATUAL: ${itensAtuaisNomes}. Histórico RECENTE: ${historicoItens}. Gere EXATAMENTE 2 sugestões CURTAS e PRÁTICAS para o vendedor: 1. Cross-sell (item complementar ao pedido atual). 2. Oportunidade (baseada no histórico ou falta dele). Use **negrito** para produtos. Formato: "- Sugestão 1.\\n- Sugestão 2."`;
    try { const response = await fetch(GEMINI_API_URL, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], safetySettings: [{ category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },{ category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },{ category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },{ category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }], generationConfig: { temperature: 0.6, maxOutputTokens: 150 } }) }); if (!response.ok) { const errTxt = await response.text(); console.error("Erro Gemini:", response.status, errTxt); throw new Error(`API (${response.status})`); } const data = await response.json(); const suggestionText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (suggestionText) { const formatted = suggestionText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/^- /gm, '<li class="mb-1">').replace(/\n/g, '</li>'); outputDiv.innerHTML = `<ul class="list-disc pl-4 text-xs">${formatted}</li></ul>`; }
        else { console.warn("Resposta IA vazia:", data); outputDiv.innerHTML = '<p class="italic text-xs text-orange-700">IA sem sugestões.</p>'; }
    } catch (error) { console.error("Erro Gemini API:", error); outputDiv.innerHTML = `<p class="italic text-xs text-red-600">Erro IA (${error.message}).</p>`; } finally { refreshBtn.disabled = false; }
};

/* ==================================================================
MODAL DE CONFIGURAÇÃO - Funções
==================================================================
*/
const openConfigModal = () => {
    renderConfigLists(); if(configModal){ configModal.classList.remove('hidden'); configModal.classList.add('flex'); } else { console.error("Modal config não encontrado."); }
};
const renderConfigLists = () => {
   const listContainer = document.getElementById('configServicosList'); if (!listContainer) return; const produtos = Array.isArray(configData.produtos)?configData.produtos:[]; if(produtos.length === 0){ listContainer.innerHTML = '<p class="tc italic p-4 text-gray-500 text-sm">Nenhum produto.</p>'; return; } produtos.sort((a,b)=>(a.name||'').localeCompare(b.name||'')); listContainer.innerHTML = produtos.map((p,i)=>`<div class="flex justify-between items-center bg-white p-3 rounded border border-gray-200 shadow-sm mb-2 hover:bg-gray-50"><span class="text-sm text-gray-800 flex-grow mr-2">${p.name} - ${formatCurrency(p.price)}</span><button class="remove-servico-btn text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100 text-xl leading-none flex-shrink-0" data-index="${i}" title="Excluir">&times;</button></div>`).join('');
};
const addProdutoConfig = async (e) => {
    e.preventDefault(); const nameInput = document.getElementById('newServicoName'); const priceInput = document.getElementById('newServicoPrice'); const btn = e.target.querySelector('button[type="submit"]'); const name = nameInput?.value.trim()||''; const price = parseFloat(priceInput?.value||0); if (!name||isNaN(price)||price<=0) { showNotification("Nome e preço (>0) obrigatórios.", "error"); return; } if (!Array.isArray(configData.produtos)) configData.produtos = []; const exists = configData.produtos.some(p => p.name.toLowerCase() === name.toLowerCase()); if (exists) { showNotification(`"${name}" já existe.`, "error"); return; } if(btn) btn.disabled = true; const newProd = {name, price}; const tentativeList = [...configData.produtos, newProd]; try { if(!db) throw new Error("DB indisponível"); await db.ref('config/produtos').set(tentativeList); configData.produtos = tentativeList; renderConfigLists(); if(nameInput) nameInput.value = ''; if(priceInput) priceInput.value = ''; showNotification(`"${name}" adicionado!`, "success"); } catch (error) { console.error("Erro add produto:", error); showNotification("Erro ao salvar.", "error"); } finally { if(btn) btn.disabled = false; }
};
const removeProdutoConfig = async (e) => {
    if (e.target.classList.contains('remove-servico-btn')) { const index = parseInt(e.target.dataset.index); if (!isNaN(index) && configData.produtos?.[index]) { const prodToRemove = configData.produtos[index]; if (confirm(`Remover "${prodToRemove.name}"?`)) { const updatedList = configData.produtos.filter((_, i) => i !== index); e.target.disabled = true; try { if(!db) throw new Error("DB indisponível"); await db.ref('config/produtos').set(updatedList); configData.produtos = updatedList; renderConfigLists(); showNotification(`"${prodToRemove.name}" removido.`, "success"); } catch (error) { console.error("Erro remover:", error); showNotification("Erro.", "error"); e.target.disabled = false; } } } }
};

/* ==================================================================
DASHBOARD GERENCIAL
==================================================================
*/
const renderDashboardGerencial = async () => {
    const cardsContainer = document.getElementById('gerencial-cards'); const rankingContainer = document.getElementById('gerencial-ranking-vendedores'); const statusContainer = document.getElementById('gerencial-pedidos-status'); if (!cardsContainer || !rankingContainer || !statusContainer) { console.warn("Elementos gerencial não encontrados."); return; } cardsContainer.innerHTML = '<p class="tc ap col-span-full">Calculando...</p>'; rankingContainer.innerHTML = '<p class="tc ap">Calculando...</p>'; statusContainer.innerHTML = '<p class="tc ap">Contando...</p>';
    try { const pedidosArray = initialDataLoaded ? Object.values(allPedidos) : []; if (!initialDataLoaded) console.warn("Dados não carregados p/ gerencial."); const agora = new Date(); const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1); let faturamentoMes = 0, pgtoValor = 0, pgtoCount = 0; const pedidosPorStatus = STATUS_LIST.reduce((acc, s) => { acc[s] = 0; return acc; }, {}); const vendasVendedorMes = vendedores.reduce((acc, v) => { acc[v.name] = { count: 0, valor: 0 }; return acc; }, {});
        pedidosArray.forEach(p => { if (p.status) pedidosPorStatus[p.status] = (pedidosPorStatus[p.status] || 0) + 1; const dataPedido = new Date(p.createdAt || 0); if (p.status === 'Entregue' && dataPedido >= inicioMes) { faturamentoMes += (p.valorTotal || 0); if (vendasVendedorMes[p.vendedorResponsavel]) { vendasVendedorMes[p.vendedorResponsavel].count++; vendasVendedorMes[p.vendedorResponsavel].valor += (p.valorTotal || 0); } } if (p.status === 'Aguardando-Pagamento') { pgtoValor += (p.valorTotal || 0); pgtoCount++; } }); const totalPedidos = pedidosArray.length;
        cardsContainer.innerHTML = `<div class="bg-white p-4 rounded-lg shadow border tc"><p class="text-xs font-medium text-gray-500 uppercase">Fat. Mês (Entr.)</p><p class="mt-1 text-2xl font-semibold text-green-600">${formatCurrency(faturamentoMes)}</p></div> <div class="bg-white p-4 rounded-lg shadow border tc"><p class="text-xs font-medium text-gray-500 uppercase">Aguard. Pgto</p><p class="mt-1 text-2xl font-semibold text-orange-600">${formatCurrency(pgtoValor)}</p><p class="text-xxs text-gray-500">(${pgtoCount} ped.)</p></div> <div class="bg-white p-4 rounded-lg shadow border tc"><p class="text-xs font-medium text-gray-500 uppercase">Pedidos Ativos</p><p class="mt-1 text-2xl font-semibold text-blue-600">${totalPedidos - (pedidosPorStatus['Entregue']||0)}</p><p class="text-xxs text-gray-500">(Total: ${totalPedidos})</p></div> <div class="bg-white p-4 rounded-lg shadow border tc"><p class="text-xs font-medium text-gray-500 uppercase">Produtos</p><p class="mt-1 text-2xl font-semibold text-gray-700">${configData.produtos?.length || 0}</p></div>`;
        const rankingArray = Object.entries(vendasVendedorMes).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.valor - a.valor); if(rankingArray.length > 0 && rankingArray.some(v => v.valor > 0)) { rankingContainer.innerHTML = `<ul class="space-y-2">${rankingArray.map((v, i) => `<li class="flex justify-between items-center p-2 rounded ${i === 0 ? 'bg-yellow-100' : 'bg-gray-50'} border"><span class="font-medium text-gray-700 text-sm">${i + 1}. ${v.name}</span><span class="text-xs text-green-700 font-semibold">${formatCurrency(v.valor)} (${v.count} ped.)</span></li>`).join('')}</ul>`; } else { rankingContainer.innerHTML = '<p class="text-gray-500 italic text-sm tc">Sem vendas no mês.</p>'; }
        statusContainer.innerHTML = `<ul class="space-y-1 text-sm">${STATUS_LIST.map(s => `<li class="flex justify-between p-1 px-2 rounded hover:bg-gray-100"><span class="text-gray-600">${formatStatus(s)}:</span><span class="font-semibold text-gray-800">${pedidosPorStatus[s] || 0}</span></li>`).join('')}<li class="flex justify-between p-1 px-2 border-t mt-2 pt-2"><span class="font-bold text-gray-700">TOTAL:</span><span class="font-bold text-gray-900">${totalPedidos}</span></li></ul>`;
    } catch (error) { console.error("Erro renderGerencial:", error); cardsContainer.innerHTML = '<p class="text-red-500 ci">Erro métricas.</p>'; rankingContainer.innerHTML = '<p class="text-red-500">Erro ranking.</p>'; statusContainer.innerHTML = '<p class="text-red-500">Erro status.</p>'; }
};
const switchDashboardTab = (tabId) => {
    document.querySelectorAll('.dashboard-content').forEach(c => c.classList.add('hidden')); document.querySelectorAll('.dashboard-tab').forEach(b => { b.classList.remove('active', 'text-blue-600', 'border-blue-600'); b.classList.add('border-transparent', 'text-gray-500', 'hover:text-gray-600', 'hover:border-gray-300'); }); const activeContent = document.getElementById(`${tabId}-content`); if (activeContent) activeContent.classList.remove('hidden'); const activeButton = document.querySelector(`.dashboard-tab[data-tab="${tabId}"]`); if (activeButton) { activeButton.classList.add('active', 'text-blue-600', 'border-blue-600'); activeButton.classList.remove('border-transparent', 'text-gray-500', 'hover:text-gray-600', 'hover:border-gray-300'); } if(tabId === 'gerencial') renderDashboardGerencial();
};

/* ==================================================================
BUSCA GLOBAL
==================================================================
*/
const handleGlobalSearch = () => {
    if(!globalSearchInput || !globalSearchResults) return; const searchTerm = globalSearchInput.value.toLowerCase().trim(); if (!searchTerm) { globalSearchResults.innerHTML = ''; globalSearchResults.classList.add('hidden'); return; } const results = Object.values(allPedidos).filter(p => (p.clienteNome?.toLowerCase().includes(searchTerm)) || (p.pedidoNumero&&String(p.pedidoNumero).includes(searchTerm)) || (p.id?.toLowerCase().includes(searchTerm.replace('#',''))) || (Array.isArray(p.itens)&&p.itens.some(i=>i.name?.toLowerCase().includes(searchTerm))) || (p.vendedorResponsavel?.toLowerCase().includes(searchTerm)) ).sort((a,b)=>new Date(b.lastUpdate||b.createdAt||0)-new Date(a.lastUpdate||a.createdAt||0)).slice(0,10); if (results.length > 0) { globalSearchResults.innerHTML = results.map(p => `<div class="search-result-item p-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0 transition-colors" data-id="${p.id}"><p class="font-semibold text-sm text-gray-800 truncate">${p.clienteNome||'Cliente'} (#${p.pedidoNumero||p.id.slice(-5)})</p><p class="text-xs text-gray-500">${p.vendedorResponsavel||'N/A'} - <span class="font-medium ${p.status==='Entregue'?'text-green-600':'text-blue-600'}">${formatStatus(p.status)}</span></p></div>`).join(''); globalSearchResults.classList.remove('hidden'); } else { globalSearchResults.innerHTML = '<p class="p-3 tc text-sm text-gray-500 italic">Nenhum pedido.</p>'; globalSearchResults.classList.remove('hidden'); }
};

/* ==================================================================
CONFIGURAÇÃO DOS LISTENERS DE EVENTOS GERAIS
==================================================================
*/
const setupEventListeners = () => {
   console.log("Configurando listeners...");

    // Login / Logout
    if (userList) { userList.addEventListener('click', (e) => { const userBtn = e.target.closest('.user-btn'); if (userBtn?.dataset.user) { try { loginUser(JSON.parse(userBtn.dataset.user.replace(/&apos;/g, "'"))); } catch(err){ console.error("Erro JSON user:", err); } } }); } else { console.warn("userList não encontrado."); }
    if (logoutButton) { logoutButton.addEventListener('click', () => { localStorage.removeItem('eletroIAUser'); try { if (db) db.ref('pedidos').off(); } catch(e) { console.warn("Erro desligar listener:", e); } location.reload(); }); } else { console.warn("logoutButton não encontrado."); }

    // Abrir Modais Principais
    if(addPedidoBtn) addPedidoBtn.addEventListener('click', openNewPedidoModal); else { console.warn("addPedidoBtn não encontrado."); }
    if(configBtn) configBtn.addEventListener('click', openConfigModal); else { console.warn("configBtn não encontrado."); }

    // Salvar Formulários Principais
    if(pedidoForm) pedidoForm.addEventListener('submit', saveNewPedido); else { console.warn("pedidoForm não encontrado."); }
    const addServicoForm = document.getElementById('addServicoForm'); if(addServicoForm) addServicoForm.addEventListener('submit', addProdutoConfig); else { console.warn("addServicoForm não encontrado."); }

    // Fechar Modais (Genérico)
    document.body.addEventListener('click', (e) => { if (e.target.closest('.btn-close-modal')) { e.target.closest('.modal-backdrop')?.classList.add('hidden'); } else if (e.target.classList.contains('modal-backdrop') && e.target.id !== 'lightbox') { e.target.classList.add('hidden'); } });
    if(lightboxClose) lightboxClose.addEventListener('click', () => { if(lightbox) lightbox.classList.add('hidden'); }); const lightboxCloseBg = document.getElementById('lightbox-close-bg'); if(lightboxCloseBg) lightboxCloseBg.addEventListener('click', () => { if(lightbox) lightbox.classList.add('hidden'); });

    // Ações no Kanban
    if (vendedorDashboard) { vendedorDashboard.addEventListener('click', (e) => { const moveBtn = e.target.closest('.btn-move-status'); const cardArea = e.target.closest('.card-clickable-area'); if (moveBtn?.dataset.id && moveBtn.dataset.newStatus) { e.stopPropagation(); updatePedidoStatus(moveBtn.dataset.id, moveBtn.dataset.newStatus); } else if (cardArea) { const card = e.target.closest('.vehicle-card'); if (card?.dataset.id) openDetailsModal(card.dataset.id); } }); } else { console.warn("vendedorDashboard não encontrado."); }

    // Ações no Modal de Detalhes
    if(detailsModal){ detailsModal.addEventListener('click', (e) => { if (e.target.id === 'detailsAddServicoBtn') { const select = document.getElementById('detailsServicosList'); if (select?.value) { const [name, priceStr] = select.value.split('|'); const price = parseFloat(priceStr); if(name && !isNaN(price)){ itensAdicionadosState.push({ name, price }); renderDetailsItems(); calculateDetailsTotal(false); select.value = ""; } else { console.warn("Seleção inválida:", select.value); } } } else if (e.target.classList.contains('remove-item-btn')) { const index = parseInt(e.target.dataset.index); if (!isNaN(index) && index >= 0 && index < itensAdicionadosState.length) { itensAdicionadosState.splice(index, 1); renderDetailsItems(); calculateDetailsTotal(false); } else { console.warn("Índice inválido:", e.target.dataset.index); } } else if (e.target.id === 'gerarOfertaWhatsappBtn') { generateWhatsappOffer(); } else if (e.target.id === 'geminiRefreshBtn') { const pedidoId = document.getElementById('logPedidoId')?.value; if(pedidoId && allPedidos[pedidoId]) getGeminiSuggestions(allPedidos[pedidoId], itensAdicionadosState); } }); const descontoInput = document.getElementById('detailsDesconto'); if(descontoInput) descontoInput.addEventListener('input', () => calculateDetailsTotal(false)); else { console.warn("detailsDesconto não encontrado."); } const saveAndNextBtn = document.getElementById('saveAndNextStatusBtn'); if(saveAndNextBtn) saveAndNextBtn.addEventListener('click', () => saveDetailsAndMaybeAdvance(true)); else { console.warn("saveAndNextStatusBtn não encontrado."); } if(deleteBtn) deleteBtn.addEventListener('click', (e) => { const id = e.target.dataset.id || e.target.closest('[data-id]')?.dataset.id; const pedido = allPedidos[id]; if(pedido && confirmDeleteText && confirmDeleteBtn && confirmDeleteModal){ confirmDeleteText.innerHTML = `Excluir Pedido <strong>#${pedido.pedidoNumero||id.slice(-5)}</strong> de <strong>${pedido.clienteNome||'Cliente'}</strong>?<br><strong class="text-red-600">Irreversível.</strong>`; confirmDeleteBtn.dataset.id = id; confirmDeleteModal.classList.remove('hidden'); confirmDeleteModal.classList.add('flex'); } else { console.warn("Erro abrir confirmação exclusão."); } }); else { console.warn("deleteBtn não encontrado."); } } else { console.warn("detailsModal não encontrado."); }

     // Confirmação de Exclusão (Pedido)
     if(confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', (e) => { const id = e.target.dataset.id; if (id && confirmDeleteModal) { confirmDeleteBtn.disabled = true; confirmDeleteBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin mr-2'></i> Excluindo..."; if(db) db.ref(`pedidos/${id}`).remove().then(() => { if(detailsModal) detailsModal.classList.add('hidden'); confirmDeleteModal.classList.add('hidden'); showNotification('Pedido excluído.', 'success'); }).catch(error => { console.error("Erro excluir:", error); showNotification("Erro.", "error"); }).finally(() => { confirmDeleteBtn.disabled = false; confirmDeleteBtn.innerHTML = "Sim, Excluir"; }); } }); else { console.warn("confirmDeleteBtn não encontrado."); }
     if(cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', () => { if(confirmDeleteModal) confirmDeleteModal.classList.add('hidden'); }); else { console.warn("cancelDeleteBtn não encontrado."); }

    // Formulário de Log e Uploads
    if(logForm) logForm.addEventListener('submit', saveLogAndUploads); else { console.warn("logForm não encontrado."); }
    if(openCameraBtn) openCameraBtn.addEventListener('click', () => { if(mediaInput) { mediaInput.setAttribute('accept', 'image/*'); mediaInput.setAttribute('capture', 'environment'); mediaInput.multiple = true; mediaInput.value = null; mediaInput.click(); } else { console.warn("media-input (câmera) não encontrado."); } }); else { console.warn("openCameraBtn não encontrado."); }
    if(openGalleryBtn) openGalleryBtn.addEventListener('click', () => { if(mediaInput){ mediaInput.setAttribute('accept', 'image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.zip,.rar'); mediaInput.removeAttribute('capture'); mediaInput.multiple = true; mediaInput.value = null; mediaInput.click(); } else { console.warn("media-input (galeria) não encontrado."); } }); else { console.warn("openGalleryBtn não encontrado."); }
    if(mediaInput) mediaInput.addEventListener('change', (e) => { filesToUpload = Array.from(e.target.files); if(fileNameDisplay) fileNameDisplay.textContent = filesToUpload.length > 0 ? `${filesToUpload.length} arquivo(s)` : ''; }); else { console.warn("media-input não encontrado."); }

    // Galeria de Mídia e Lightbox
    const thumbnailGrid = document.getElementById('thumbnail-grid'); if(thumbnailGrid) thumbnailGrid.addEventListener('click', (e) => { const thumbnailItem = e.target.closest('.thumbnail-item'); const deleteButton = e.target.closest('.delete-media-btn'); if (deleteButton) { e.stopPropagation(); const { pedidoId, mediaKey } = deleteButton.dataset; if (pedidoId && mediaKey && confirm('Excluir mídia?')) { deleteButton.innerHTML = "<i class='bx bx-loader-alt bx-spin bx-xs'></i>"; deleteButton.disabled = true; if(db) db.ref(`pedidos/${pedidoId}/media/${mediaKey}`).remove().then(() => showNotification("Mídia excluída.", "success")).catch(err => { console.error("Erro excluir mídia:", err); showNotification("Erro.", "error"); deleteButton.innerHTML = "<i class='bx bxs-trash bx-xs'></i>"; deleteButton.disabled = false; }); } } else if (thumbnailItem?.dataset.index !== undefined) { openLightbox(parseInt(thumbnailItem.dataset.index)); } }); else { console.warn("thumbnail-grid não encontrado."); }

     // Ações no Modal de Configuração
     if(configModal) configModal.addEventListener('click', removeProdutoConfig); else { console.warn("configModal não encontrado."); }

     // Busca Global
     if(globalSearchInput) globalSearchInput.addEventListener('input', handleGlobalSearch); else { console.warn("globalSearchInput não encontrado."); }
     if(globalSearchResults) globalSearchResults.addEventListener('click', (e) => { const resultItem = e.target.closest('.search-result-item'); if (resultItem?.dataset.id) { openDetailsModal(resultItem.dataset.id); if(globalSearchInput) globalSearchInput.value = ''; globalSearchResults.innerHTML = ''; globalSearchResults.classList.add('hidden'); } }); else { console.warn("globalSearchResults não encontrado."); }
     document.addEventListener('click', (e) => { const searchContainer = e.target.closest('.search-container'); if (!searchContainer && globalSearchResults && !globalSearchResults.classList.contains('hidden')) { globalSearchResults.classList.add('hidden'); } });

    // Botão Minha Agenda
    if(toggleAgendaBtn) toggleAgendaBtn.addEventListener('click', toggleMyAgendaView); else { console.warn("toggleAgendaBtn não encontrado."); }

    // Navegação por Abas do Dashboard
    if(dashboardNav) { dashboardNav.addEventListener('click', (e) => { const tabButton = e.target.closest('.dashboard-tab'); if(tabButton?.dataset.tab) { switchDashboardTab(tabButton.dataset.tab); } }); } else { console.warn("dashboardNav não encontrado."); }

    console.log("Listeners configurados.");
};

/* ==================================================================
INICIALIZAÇÃO DA APLICAÇÃO (BLOCO REMOVIDO)
==================================================================
*/
// --- O bloco de inicialização duplicado foi removido daqui ---
// A inicialização é controlada exclusivamente pelo app_setup.js

// --- FIM DO CÓDIGO ---
