/* ==================================================================
PROTÓTIPO HÍBRIDO EletroIA-MVP - PARTE 2: LÓGICA
Versão: FINAL COMPLETA (Quantidade + Upload Fix + Vendedores) - 24/10/2025
==================================================================
*/

// Este arquivo DEPENDE das variáveis e funções definidas em app_setup.js
// Garanta que este arquivo (app_logic.js) seja carregado ANTES de app_setup.js no index.html

/* ==================================================================
FUNÇÕES DE MANIPULAÇÃO DE PEDIDOS
==================================================================
*/
const updatePedidoStatus = async (id, newStatus) => {
    const pedido = allPedidos[id];
    if (!pedido) { showNotification("Erro: Pedido não encontrado.", "error"); return; }
    if (!newStatus || !STATUS_LIST.includes(newStatus)) { showNotification(`Erro: Status inválido (${newStatus || 'N/A'}).`, "error"); return; }
    if (pedido.status === newStatus) return; // No change needed

    const oldStatus = pedido.status;
    const logEntry = {
        timestamp: new Date().toISOString(),
        user: currentUser.name,
        description: `Status alterado de "${formatStatus(oldStatus)}" para "${formatStatus(newStatus)}".`,
        type: 'status'
    };
    try {
         if (!db) throw new Error("DB Firebase não inicializado.");
         await db.ref(`pedidos/${id}/logs`).push(logEntry);
         await db.ref(`pedidos/${id}`).update({ status: newStatus, lastUpdate: new Date().toISOString() });
         // Optional notification
         // showNotification(`Pedido movido para ${formatStatus(newStatus)}.`, "info");
    } catch (error) {
        console.error("Erro ao atualizar status do pedido:", error);
        showNotification("Falha ao mover o pedido. Tente novamente.", "error");
    }
};

const openNewPedidoModal = () => {
    if (!pedidoForm || !pedidoModal) { console.error("Modal de novo pedido não encontrado."); return; }
    pedidoForm.reset();
    const pedidoIdInput = document.getElementById('pedidoId');
    if(pedidoIdInput) pedidoIdInput.value = '';
    const modalTitle = document.getElementById('pedidoModalTitle');
    if(modalTitle) modalTitle.textContent = 'Novo Pedido de Venda';

    // Populate seller dropdown
    const vendedorSelect = document.getElementById('vendedorResponsavel');
    if (vendedorSelect && vendedores.length > 0) {
        vendedorSelect.innerHTML = '<option value="">Selecione Vendedor...</option>' + vendedores.map(v =>
            `<option value="${v.name}" ${currentUser && currentUser.name === v.name ? 'selected' : ''}>${v.name}</option>`
        ).join('');
    } else if (vendedorSelect) {
         vendedorSelect.innerHTML = '<option value="">Erro: Vendedores não carregados</option>';
    }

    // Populate initial items list (checkboxes) - Quantity doesn't apply here yet
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

    pedidoModal.classList.remove('hidden');
    pedidoModal.classList.add('flex');
};

const saveNewPedido = async (e) => {
    e.preventDefault();
    const clienteNomeInput = document.getElementById('clienteNome');
    const vendedorSelect = document.getElementById('vendedorResponsavel');
    const observacoesInput = document.getElementById('pedidoObservacoes');
    const formButton = pedidoForm ? pedidoForm.querySelector('button[type="submit"]') : null;

    if(formButton) formButton.disabled = true;

    const clienteNome = clienteNomeInput?.value.trim() || '';
    const vendedorResponsavel = vendedorSelect?.value || '';
    const observacoes = observacoesInput?.value.trim() || '';

    if (!clienteNome || !vendedorResponsavel) {
         showNotification("Nome do cliente e Vendedor são obrigatórios.", "error");
         if(formButton) formButton.disabled = false;
         return;
    }

    // Collect selected items and set initial quantity to 1
    const selectedItensCheckboxes = Array.from(document.querySelectorAll('#servicosList input:checked'));
    const itens = selectedItensCheckboxes.map(input => ({
        name: input.dataset.name,
        price: parseFloat(input.value) || 0,
        quantity: 1, // <<< INITIAL QUANTITY
        unit: 'un' // <<< DEFAULT UNIT
    }));
    // Calculate initial total based on quantity (now always 1 per selected item)
    const valorTotalInicial = calculateTotalValue(itens, 0); // Use the updated calculation function

    let pedidoNumero = 1000;
    try {
         if (!db) throw new Error("DB Firebase não inicializado.");
         const configRef = db.ref('config/proximoPedido');
         // Firebase transaction to get the next sequential order number atomically
         const { committed, snapshot } = await configRef.transaction(currentValue => (currentValue || 1000) + 1);
         if (committed && snapshot.val()) {
             pedidoNumero = snapshot.val();
         } else {
              throw new Error("Falha na transação do Firebase para obter o número do pedido.");
         }
    } catch (error) {
         console.error("Erro crítico ao gerar número do pedido:", error);
         showNotification('Erro ao gerar número do pedido. Tente novamente.', 'error');
         if(formButton) formButton.disabled = false;
         return; // Abort order creation
    }

    const timestamp = new Date().toISOString();

    // Assemble the new order data object with the updated item structure
    const pedidoData = {
      pedidoNumero, clienteNome, vendedorResponsavel, observacoes,
      agendamento: timestamp, // Creation date/time
      itens: itens, // <<< Array with {name, price, quantity, unit}
      formaPagamento: FORMAS_PAGAMENTO[0], // Use the first payment method as default
      valorTotal: valorTotalInicial, // <<< Total already considers quantity
      desconto: 0,
      status: STATUS_LIST[0], // Initial status ('Novos-Leads')
      createdAt: timestamp, lastUpdate: timestamp,
      // 'logs' will be added via push separately
    };

    try {
        if (!db) throw new Error("DB Firebase não inicializado.");
        const newPedidoRef = db.ref('pedidos').push(); // Create a new node with a unique ID
        const pedidoIdFirebase = newPedidoRef.key; // Get the generated ID

        // Create the initial creation log
        const initialLog = { timestamp, user: currentUser.name, description: 'Pedido criado.', type: 'log' };
        // Add the initial log using push() inside the 'logs' node of the new order
        await db.ref(`pedidos/${pedidoIdFirebase}/logs`).push(initialLog);

        // Set the main order data (without logs, as they were already added)
        await newPedidoRef.set(pedidoData);

        showNotification(`Pedido #${pedidoNumero} criado com sucesso!`, 'success');
        if(pedidoModal) pedidoModal.classList.add('hidden'); // Close the modal
    } catch (error) {
        console.error("Erro ao salvar o novo pedido no Firebase:", error);
        showNotification(`Erro ao salvar pedido: ${error.message}`, 'error');
        // Consider reverting the 'proximoPedido' counter in case of failure here (more complex logic)
    } finally {
         if(formButton) formButton.disabled = false; // Always re-enable the button at the end
    }
};

const saveDetailsAndMaybeAdvance = async (advanceStatus = false) => {
    const id = document.getElementById('logPedidoId')?.value;
    if (!id || !allPedidos[id]) { showNotification("Erro: ID do pedido inválido para salvar.", "error"); return false; }

    // Update quantities from the DOM into the local state before saving
    updateItemQuantitiesFromDOM();

    const pedidoAtual = allPedidos[id];
    const saveButton = document.getElementById('saveAndNextStatusBtn');
    if(saveButton) saveButton.disabled = true; // Disable button during the process

    const desconto = parseFloat(document.getElementById('detailsDesconto')?.value) || 0;
    const valorTotalCalculado = calculateTotalValue(itensAdicionadosState, desconto); // Use the updated function

    // Prepare data for saving to Firebase
    const updates = {
        itens: itensAdicionadosState, // <<< Save the item array with {name, price, quantity, unit}
        formaPagamento: document.getElementById('detailsFormaPagamento')?.value || pedidoAtual.formaPagamento,
        desconto: desconto,
        valorTotal: valorTotalCalculado, // <<< Save the recalculated total
        lastUpdate: new Date().toISOString() // Update last modified date
    };
    try {
        if (!db) throw new Error("DB Firebase não inicializado.");
        await db.ref(`pedidos/${id}`).update(updates); // Send updates to Firebase
        let notificationMessage = 'Alterações salvas com sucesso!';

        // If the option to advance status was checked
        if (advanceStatus) {
            const currentStatusIndex = STATUS_LIST.indexOf(pedidoAtual.status);
            const nextStatus = currentStatusIndex < STATUS_LIST.length - 1 ? STATUS_LIST[currentStatusIndex + 1] : null;
            if (nextStatus) {
                // Call the function that updates the status AND adds the status log
                await updatePedidoStatus(id, nextStatus);
                notificationMessage = 'Pedido salvo e status avançado!';
            } else {
                 notificationMessage = 'Pedido salvo! Já está no último status.';
            }
        }
        showNotification(notificationMessage, 'success'); // Notify the user
        if(detailsModal) detailsModal.classList.add('hidden'); // Close the modal on success
        return true; // Indicate success
    } catch (error) {
        console.error("Erro ao salvar detalhes e/ou avançar status:", error);
        showNotification(`Erro ao salvar: ${error.message}`, 'error');
        return false; // Indicate failure
    } finally {
         if(saveButton) saveButton.disabled = false; // Re-enable the button at the end
    }
};

// Handles saving log descriptions and uploading/saving media files
const saveLogAndUploads = async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (!submitBtn) return;
    const pedidoId = document.getElementById('logPedidoId')?.value;
    const descriptionInput = document.getElementById('logDescricao');
    const description = descriptionInput?.value.trim() || '';

    // Validate order ID
    if (!pedidoId || !allPedidos[pedidoId]) {
        showNotification("Erro: Pedido inválido ou não encontrado.", "error");
        return;
    }
    // Require either a description or files
    if (!description && filesToUpload.length === 0) {
        showNotification("Adicione uma descrição ou anexe arquivos para salvar.", "warning");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin mr-2'></i> Salvando...`;

    const timestamp = new Date().toISOString();
    // Create log entry object
    const logEntry = {
        timestamp,
        user: currentUser.name,
        type: 'log',
        description: description || `Adicionou ${filesToUpload.length} mídia(s).` // Default description if only files
    };

    try {
        if (!db) throw new Error("DB Firebase não inicializado.");

        // --- Step 1: Save the text log entry ---
        console.log(`Salvando log para pedido ${pedidoId}:`, logEntry.description);
        await db.ref(`pedidos/${pedidoId}/logs`).push(logEntry);
        console.log("Log salvo com sucesso.");

        // --- Step 2: Process file uploads if any ---
        if (filesToUpload.length > 0) {
            submitBtn.innerHTML = `<i class='bx bx-loader-alt bx-spin mr-2'></i> Enviando ${filesToUpload.length} mídia(s)...`;
            console.log(`Iniciando upload de ${filesToUpload.length} arquivo(s) para Cloudinary...`);

            // Map each file to an upload promise
            const uploadPromises = filesToUpload.map(async (file, index) => {
                console.log(`[${index + 1}/${filesToUpload.length}] Enviando ${file.name}...`);
                const url = await uploadFileToCloudinary(file); // Upload via helper function
                console.log(`[${index + 1}/${filesToUpload.length}] Upload de ${file.name} concluído. URL: ${url}`);
                // Return the object structure to be saved in Firebase 'media' node
                return {
                    type: file.type || 'application/octet-stream', // File MIME type
                    url: url, // Secure URL from Cloudinary
                    name: file.name, // Original file name
                    timestamp // Timestamp of upload completion (approx)
                };
            });

            // Wait for all upload promises to resolve
            const mediaResults = await Promise.all(uploadPromises);
            console.log("Todos os uploads para Cloudinary concluídos. Resultados:", mediaResults);

            // --- Step 3: Save media references to Firebase ---
            const mediaRef = db.ref(`pedidos/${pedidoId}/media`);
            console.log(`Salvando ${mediaResults.length} referências de mídia no Firebase em /pedidos/${pedidoId}/media ...`);
            for (const result of mediaResults) {
                await mediaRef.push().set(result); // Add each media object under the 'media' node
                console.log(`Referência para ${result.name} salva no Firebase.`);
            }
            console.log("Todas as referências de mídia salvas no Firebase.");
        }

        // --- Cleanup and Success ---
        if(logForm) logForm.reset(); // Reset the form fields
        filesToUpload = []; // Clear the local array of files to upload
        if(fileNameDisplay) fileNameDisplay.textContent = ''; // Clear the file name display
        showNotification('Atualização adicionada com sucesso!', 'success');
        console.log("Formulário de log limpo e notificação de sucesso enviada.");

    } catch (error) {
        // Log the detailed error
        console.error("Erro detalhado em saveLogAndUploads:", error);
        // Provide user feedback
        // Avoid duplicate notification if error came from uploadFileToCloudinary
        if (!error.message?.toLowerCase().includes('upload') && !error.message?.toLowerCase().includes('cloudinary')) {
           showNotification(`Erro ao salvar atualização: ${error.message || 'Erro desconhecido. Verifique o console.'}`, 'error');
        } else {
             // Let uploadFileToCloudinary handle its specific errors, but log here too
             console.error("Erro originado durante o processo de upload para Cloudinary.");
        }
    } finally {
        // Always re-enable the submit button
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i class='bx bx-message-square-add mr-2'></i> Add ao Histórico`;
    }
};


// Generates formatted text for WhatsApp offer and copies to clipboard
const generateWhatsappOffer = () => {
    const pedidoId = document.getElementById('logPedidoId')?.value;
    const pedido = allPedidos[pedidoId];
    if (!pedido) { showNotification("Erro: Pedido não carregado para gerar oferta.", "error"); return; }

    // Ensure quantities are up-to-date from the DOM inputs
    updateItemQuantitiesFromDOM();

    const cliente = pedido.clienteNome || "Cliente";
    const desconto = parseFloat(document.getElementById('detailsDesconto')?.value || 0);
    // Use the updated calculation function
    const valorTotal = calculateTotalValue(itensAdicionadosState, desconto);
    const vendedor = currentUser.name || "Vendedor"; // Use logged-in user's name

    let itensTexto = "*Itens:*";
    if (itensAdicionadosState.length > 0) {
        // Format items including quantity, unit, name, price, and subtotal
        itensTexto += '\n' + itensAdicionadosState.map(item =>
            `- ${item.quantity || 1} ${item.unit || 'un'} x ${item.name} (${formatCurrency(item.price)}) = ${formatCurrency((item.quantity || 1) * (item.price || 0))}`
        ).join('\n');
    } else {
        itensTexto += "\n- (Nenhum item selecionado)";
    }

    // Add discount text only if discount > 0
    const descontoTexto = desconto > 0 ? `\n\n*Desconto:* ${formatCurrency(desconto)}` : '';
    // Format final total and payment method
    const valorFinalTexto = `\n\n*Valor Total:* ${formatCurrency(valorTotal)}`;
    const pagamentoTexto = `\n*Forma Pgto:* ${document.getElementById('detailsFormaPagamento')?.value || 'A definir'}`;

    // Assemble the complete offer text
    const oferta = `Olá ${cliente},\nSegue cotação solicitada:\n\n${itensTexto}${descontoTexto}${valorFinalTexto}${pagamentoTexto}\n\nQualquer dúvida, estou à disposição!\n\nAtt,\n${vendedor}\nMS Distribuidora`;

    try {
        // Use Clipboard API to copy text
        navigator.clipboard.writeText(oferta);
        showNotification("Texto da oferta copiado! Cole no WhatsApp.", "success");
        // Log the action in Firebase
        const logEntry = {
            timestamp: new Date().toISOString(),
            user: currentUser.name,
            description: `Gerou texto oferta para WhatsApp (Valor: ${formatCurrency(valorTotal)})`,
            type: 'log'
        };
        if(db) db.ref(`pedidos/${pedidoId}/logs`).push(logEntry); // Add log asynchronously
    } catch (err) {
        console.error('Erro ao copiar texto para a área de transferência: ', err);
        showNotification('Erro ao copiar texto. Verifique as permissões do navegador.', 'error');
    }
};


/* ==================================================================
MODAL DE DETALHES - Funções Internas e Auxiliares
==================================================================
*/
// Opens and populates the details modal for a given order ID
const openDetailsModal = async (id) => {
    const pedido = allPedidos[id];
    // Validate order data
    if (!pedido) { showNotification("Erro: Pedido não encontrado ou dados incompletos.", "error"); return; }
    if(!detailsModal) { console.error("Elemento do modal de detalhes (detailsModal) não encontrado."); return; }

    console.log(`Abrindo detalhes para pedido ID: ${id}`, pedido);

    detailsModal.scrollTop = 0; // Scroll modal to top
    if(logForm) logForm.reset(); // Reset log form
    const logPedidoIdInput = document.getElementById('logPedidoId'); if(logPedidoIdInput) logPedidoIdInput.value = id; // Set hidden ID for logs/uploads
    filesToUpload = []; // Clear files array
    if(fileNameDisplay) fileNameDisplay.textContent = ''; // Clear file name display

    // --- Populate Basic Order Information ---
    const detailsClienteNome = document.getElementById('detailsClienteNome'); if(detailsClienteNome) detailsClienteNome.textContent = pedido.clienteNome || 'Cliente Não Informado';
    const detailsPedidoNumero = document.getElementById('detailsPedidoNumero'); if(detailsPedidoNumero) detailsPedidoNumero.textContent = `Pedido #${String(pedido.pedidoNumero || 'N/A').padStart(4, '0')}`;
    const detailsAgendamento = document.getElementById('detailsAgendamento'); if(detailsAgendamento) detailsAgendamento.textContent = `Aberto em: ${formatDateTime(pedido.createdAt || pedido.agendamento)}`;
    const detailsVendedor = document.getElementById('detailsVendedor'); if(detailsVendedor) detailsVendedor.textContent = `Vendedor: ${pedido.vendedorResponsavel || 'N/A'}`;
    // Show initial observations block if observations exist
    const obsContainer = document.getElementById('detailsObservacoesContainer'); if(obsContainer){ if (pedido.observacoes) { obsContainer.innerHTML = `<h4 class="text-xs font-medium text-gray-500 mb-1">Observações Iniciais:</h4><p class="text-gray-700 bg-yellow-50 border border-yellow-200 p-2 rounded-md whitespace-pre-wrap text-sm">${pedido.observacoes}</p>`; obsContainer.classList.remove('hidden'); } else { obsContainer.innerHTML = ''; obsContainer.classList.add('hidden'); } }
    // Populate payment method dropdown
    const pgtoSelect = document.getElementById('detailsFormaPagamento'); if(pgtoSelect){ pgtoSelect.innerHTML = FORMAS_PAGAMENTO.map(f => `<option value="${f}" ${f === pedido.formaPagamento ? 'selected' : ''}>${f}</option>`).join(''); } else { console.warn("Elemento detailsFormaPagamento não encontrado."); }
    // Set discount input value
    const descInput = document.getElementById('detailsDesconto'); if(descInput) descInput.value = pedido.desconto || 0; else { console.warn("Elemento detailsDesconto não encontrado."); }
    // Populate dropdown for adding new items
    const itemsSelect = document.getElementById('detailsServicosList'); if(itemsSelect && configData.produtos){ itemsSelect.innerHTML = '<option value="">-- Adicionar Item --</option>' + configData.produtos.map(p => `<option value="${p.name}|${p.price}">${p.name} - ${formatCurrency(p.price)}</option>`).join(''); } else if(itemsSelect){ itemsSelect.innerHTML = '<option value="">-- Erro Produtos --</option>'; console.warn("Elemento detailsServicosList não encontrado ou produtos não carregados."); }
    // Reset quantity input for adding items
    const quantityInput = document.getElementById('detailsItemQuantity'); if(quantityInput) quantityInput.value = 1; else { console.warn("Elemento detailsItemQuantity não encontrado."); }

    // --- Load Order Items ---
    // Ensure items array exists and each item has quantity and unit (defaulting if necessary)
    itensAdicionadosState = Array.isArray(pedido.itens) ? pedido.itens.map(item => ({
        ...item,
        quantity: item.quantity || 1, // Default quantity to 1
        unit: item.unit || 'un'   // Default unit to 'un'
    })) : [];
    console.log("Itens carregados para o modal:", itensAdicionadosState);

    // --- Render Modal Components ---
    renderDetailsItems(); // Render the list of items with quantity inputs
    calculateDetailsTotal(false); // Calculate and display the initial total value
    renderTimeline(pedido); // Render the order history timeline
    renderMediaGallery(pedido); // Render the media thumbnail gallery

    // Toggle delete button visibility for 'Gestor' role
    if(deleteBtn) {
        deleteBtn.classList.toggle('hidden', !(currentUser?.role?.toLowerCase().includes('gestor')));
        deleteBtn.dataset.id = id; // Set order ID on the delete button
    } else { console.warn("Botão deleteBtn não encontrado."); }

    // --- Show the Modal ---
    detailsModal.classList.remove('hidden');
    detailsModal.classList.add('flex');
    console.log("Modal de detalhes exibido.");

    // --- Asynchronous Operations After Modal Display ---
    // Load customer history and generate AI suggestions
    const historicoContainer = document.getElementById('detailsHistoricoCliente');
    if(historicoContainer && pedido.clienteNome) {
        historicoContainer.innerHTML = '<p class="text-gray-400 text-xs italic animate-pulse">Buscando histórico do cliente...</p>';
        try {
            if (!db) throw new Error("DB não inicializado para buscar histórico.");
            // Query Firebase for previous orders from the same customer, limited and ordered
            const snapshot = await db.ref('pedidos')
                                   .orderByChild('clienteNome')
                                   .equalTo(pedido.clienteNome)
                                   .limitToLast(6) // Limit query for performance
                                   .once('value');
            const historico = snapshot.val() || {};
            // Process the results: filter out current order, keep only 'Entregue', sort newest first, limit
            const anteriores = Object.entries(historico)
                .map(([k, p]) => ({...p, id: k})) // Add Firebase key as 'id'
                .filter(p => p.id !== id && p.status === 'Entregue') // Exclude self, only delivered
                .sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)) // Sort descending by creation date
                .slice(0, 5); // Take the 5 most recent

            pedido.historicoAnterior = anteriores; // Store history on the order object for AI use
            console.log("Histórico do cliente carregado:", anteriores);

            // Render the customer history section
            if(anteriores.length > 0) {
                historicoContainer.innerHTML = anteriores.map(p => `
                    <div class="historico-item">
                        <div class="flex justify-between text-xs text-gray-500 mb-1">
                            <span>#${p.pedidoNumero || p.id.slice(-4)} (${formatDate(p.createdAt)})</span>
                            <span class="font-medium">${formatCurrency(p.valorTotal)}</span>
                        </div>
                        <p class="text-gray-700 truncate text-xs" title="${(p.itens || []).map(i=> `${i.quantity || 1}${i.unit || 'un'} ${i.name}`).join(', ')}">
                            ${(p.itens || []).map(i=> `${i.quantity || 1}${i.unit || 'un'} ${i.name}`).join(', ') || 'Nenhum item registrado'}
                        </p>
                    </div>`).join('');
            } else {
                historicoContainer.innerHTML = '<p class="text-gray-500 text-xs italic tc">Nenhum pedido anterior entregue encontrado para este cliente.</p>';
            }
            // Generate V1 (rule-based) suggestions
            if(typeof generateSalesAssistV1Suggestions === 'function') generateSalesAssistV1Suggestions(pedido, anteriores);

        } catch (error) {
            console.error("Erro ao buscar histórico do cliente:", error);
            historicoContainer.innerHTML = '<p class="text-red-500 text-xs tc">Erro ao buscar histórico.</p>';
            // Still attempt to generate V1 suggestions even if history fetch failed
            if(typeof generateSalesAssistV1Suggestions === 'function') generateSalesAssistV1Suggestions(pedido, []);
        }
    } else if (historicoContainer) { // Handle case where customer name is missing
        historicoContainer.innerHTML = '<p class="text-gray-500 text-xs italic tc">Nome do cliente não informado para buscar histórico.</p>';
        if(typeof generateSalesAssistV1Suggestions === 'function') generateSalesAssistV1Suggestions(pedido, []);
    } else { console.warn("Elemento detailsHistoricoCliente não encontrado."); }

    // Call AI suggestions (Gemini) function
    if(typeof getGeminiSuggestions === 'function') getGeminiSuggestions(pedido, itensAdicionadosState);
};


// Helper Function: Updates the 'itensAdicionadosState' array with quantities from the DOM input fields
const updateItemQuantitiesFromDOM = () => {
    const itemElements = document.querySelectorAll('#detailsItensContainer .item-detail-row');
    let quantityChanged = false; // Flag to check if any quantity was actually updated
    itemElements.forEach((row) => {
        const index = parseInt(row.dataset.index); // Get index from row data attribute
        const quantityInput = row.querySelector('.item-quantity-input');
        // Check if input exists, index is valid, and corresponding item exists in state
        if (quantityInput && !isNaN(index) && itensAdicionadosState[index]) {
            const currentQuantityInState = itensAdicionadosState[index].quantity;
            const newQuantity = parseInt(quantityInput.value);

            // Validate and update only if it's a valid positive number AND different from current state
            if (!isNaN(newQuantity) && newQuantity >= 1 && newQuantity !== currentQuantityInState) {
                itensAdicionadosState[index].quantity = newQuantity;
                quantityChanged = true;
                // console.log(`Quantity updated for index ${index} to ${newQuantity}`);
            } else if (isNaN(newQuantity) || newQuantity < 1) {
                // If input is invalid (e.g., empty, 0, negative), reset state and input field to 1
                if (currentQuantityInState !== 1) {
                     itensAdicionadosState[index].quantity = 1;
                     quantityChanged = true;
                }
                quantityInput.value = 1; // Correct the input field visually
                 console.warn(`Invalid quantity entered for item index ${index}, reset to 1.`);
                 // Avoid showing notification here as it might be annoying during typing
            }
        } else {
             console.warn(`Could not find quantity input or item state for index ${index}`);
        }
    });
    // Optional: Log if any quantities were changed
    // if (quantityChanged) {
    //     console.log("Quantities updated in itensAdicionadosState:", itensAdicionadosState);
    // }
};


// Renders the list of items within the details modal, including editable quantity inputs
const renderDetailsItems = () => {
    const container = document.getElementById('detailsItensContainer');
    if (!container) { console.error("Container de itens 'detailsItensContainer' não encontrado."); return; }

    // Ensure itensAdicionadosState is an array and items have default values if needed
    const itens = Array.isArray(itensAdicionadosState) ? itensAdicionadosState.map(item => ({
        ...item,
        quantity: item.quantity || 1, // Default quantity to 1
        unit: item.unit || 'un',   // Default unit to 'un'
        price: item.price || 0       // Default price to 0
    })) : [];

    // Display message if no items
    if (itens.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm italic">Nenhum item adicionado a este pedido.</p>';
        return;
    }

    // Generate HTML for each item row
    container.innerHTML = itens.map((item, index) => `
        <div class="item-detail-row" data-index="${index}"> <!-- Store index on the row -->
            <div class="item-info">
                <!-- Display item name and price -->
                <span>${item.name || 'Item sem nome'} (${formatCurrency(item.price)})</span>
            </div>
            <div class="item-controls">
                <!-- Label (Visually hidden but good for accessibility) -->
                <label for="qty-${index}" class="text-xs mr-1 sr-only">Quantidade:</label>
                <!-- Quantity Input -->
                <input type="number" id="qty-${index}" value="${item.quantity}" min="1" step="1"
                       class="item-quantity-input"
                       data-index="${index}" aria-label="Quantidade para ${item.name || 'item'}">
                <!-- Remove Button -->
                <button type="button" class="remove-item-btn"
                        data-index="${index}" title="Remover ${item.name || 'item'}">&times;</button>
            </div>
        </div>
    `).join('');

    // --- Add Event Listeners AFTER rendering ---
    container.querySelectorAll('.item-quantity-input').forEach(input => {
        // Recalculate total when quantity changes (on 'change' event - after blur or Enter)
        input.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            let newQuantity = parseInt(e.target.value);

            // Validate: Ensure quantity is a number and at least 1
            if (isNaN(newQuantity) || newQuantity < 1) {
                console.warn(`Quantidade inválida (${e.target.value}) para item ${index}, redefinindo para 1.`);
                newQuantity = 1;
                e.target.value = 1; // Correct the input visually
                showNotification("Quantidade deve ser 1 ou maior.", "warning");
            }

            // Update state only if index is valid
            if (!isNaN(index) && itensAdicionadosState[index]) {
                if (itensAdicionadosState[index].quantity !== newQuantity) {
                     itensAdicionadosState[index].quantity = newQuantity;
                     calculateDetailsTotal(false); // Recalculate and update total display
                }
            } else {
                 console.error(`Índice inválido (${index}) ou item não encontrado no estado ao mudar quantidade.`);
            }
        });

        // Optional: Recalculate on every key press (can be laggy)
        // input.addEventListener('input', (e) => { /* ... similar logic ... */ });

        // Prevent Enter key in quantity input from submitting potential parent forms
        input.addEventListener('keydown', (e) => {
             if (e.key === 'Enter') {
                 e.preventDefault(); // Stop default Enter action
                 e.target.blur(); // Remove focus from the input, triggering 'change' event if needed
             }
        });
    });
    // Note: The remove button listener is handled by event delegation in setupEventListeners
};


// Helper Function: Calculates the total value based on a list of items and a discount value
// Expects itemsList: array of { price: number, quantity: number }
// Expects discountValue: number
const calculateTotalValue = (itemsList, discountValue) => {
    // Ensure itemsList is an array
    const validItems = Array.isArray(itemsList) ? itemsList : [];

    // Calculate the sum of (price * quantity) for all valid items
    const itemsTotal = validItems.reduce((sum, item) => {
        const price = parseFloat(item.price) || 0;
        const quantity = parseInt(item.quantity) || 1; // Default to 1 if quantity is invalid/missing
        return sum + (price * quantity);
    }, 0); // Start sum at 0

    // Apply discount, ensuring the total doesn't go below zero
    const total = Math.max(0, itemsTotal - (parseFloat(discountValue) || 0));
    // console.log(`Calculating Total: Items Total = ${itemsTotal}, Discount = ${discountValue}, Final Total = ${total}`); // For debugging
    return total;
};


// UPDATED: Calculates and updates the total display in the details modal
const calculateDetailsTotal = (saveToDB = false) => {
    const descontoInput = document.getElementById('detailsDesconto');
    const desconto = parseFloat(descontoInput?.value) || 0;

    // IMPORTANT: Ensure quantities in the state reflect the current input values
    // This function might be called by listeners BEFORE the state is updated elsewhere
    // updateItemQuantitiesFromDOM(); // Consider if this is needed here or only before saving

    // Call the helper function to calculate the total based on current state
    const total = calculateTotalValue(itensAdicionadosState, desconto);

    // Update the total display element on the screen
    const totalDisplay = document.getElementById('detailsValorTotalDisplay');
    if(totalDisplay) {
        totalDisplay.textContent = formatCurrency(total);
    } else {
        console.warn("Elemento 'detailsValorTotalDisplay' não encontrado para atualizar total.");
    }

    // Optional: Immediately save the new total to Firebase
    // This is generally discouraged as it triggers frequent updates.
    // It's better to save only when the user clicks "Save" or "Save and Advance".
    if (saveToDB) {
        const id = document.getElementById('logPedidoId')?.value;
        if (id && allPedidos[id]) {
            const valorAtualDB = allPedidos[id].valorTotal;
            // Only update Firebase if the calculated total is different from the current DB value
            // Use a tolerance or formatted comparison if dealing with floating point issues
            if (formatCurrency(valorAtualDB) !== formatCurrency(total)) {
                 console.log(`(calculateDetailsTotal: saveToDB=true) Atualizando valorTotal no DB para pedido ${id}: ${formatCurrency(total)}`);
                 if(db) {
                     db.ref(`pedidos/${id}/valorTotal`).set(total).catch(error => {
                         console.error("Erro ao salvar total no DB (via calculateDetailsTotal):", error);
                         // Avoid user notification for background saves unless critical
                     });
                 } else {
                     console.error("DB não disponível para salvar total (via calculateDetailsTotal).");
                 }
            }
        }
    }
    // console.log("Total recalculado (sem salvar no DB):", formatCurrency(total)); // For debugging
    return total; // Return the calculated total value
};


const renderTimeline = (pedido) => {
   const timelineContainer = document.getElementById('timelineContainer');
   if (!timelineContainer) { console.error("Elemento timelineContainer não encontrado."); return; }
   // Get logs, convert Firebase object to array, sort by timestamp descending
   const logs = pedido.logs ? Object.entries(pedido.logs)
                                .map(([key, value]) => ({ ...value, id: key })) // Add Firebase key as 'id'
                                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)) // Newest first
                           : []; // Empty array if no logs

   // Display message if no logs found
   if (logs.length === 0) {
       timelineContainer.innerHTML = '<p class="text-gray-500 text-center py-4 text-sm italic">Nenhum histórico registrado para este pedido.</p>';
       return;
   }
   // Generate HTML for each log entry
   timelineContainer.innerHTML = logs.map(log => {
       const iconClass = log.type === 'status' ? 'bx-transfer' : 'bx-message-detail'; // Icon based on log type
       const iconColor = log.type === 'status' ? 'text-green-600 border-green-500' : 'text-blue-600 border-blue-500'; // Color based on log type
       const userDisplay = log.user || 'Sistema'; // Default to 'Sistema' if user not logged
       return `
       <div class="timeline-item ${log.type === 'status' ? 'timeline-item-status' : 'timeline-item-log'}">
           {/* Timeline Icon */}
           <div class="timeline-icon ${iconColor}">
               <i class='bx ${iconClass}'></i>
           </div>
           {/* Log Content Bubble */}
           <div class="bg-white p-3 rounded-lg shadow-sm border border-gray-200 ml-2 relative">
               <div class="flex justify-between items-start mb-1 gap-2">
                   <h4 class="font-semibold text-gray-700 text-sm flex-grow">${userDisplay}</h4>
                   <span class="text-xs text-gray-500 flex-shrink-0">${formatDateTime(log.timestamp)}</span>
               </div>
               <p class="text-gray-600 text-sm break-words">${log.description || '(Sem descrição)'}</p>
           </div>
       </div>`;
    }).join(''); // Join all log item HTML strings
};

// Renders the media gallery thumbnails in the details modal
const renderMediaGallery = (pedido) => {
    const thumbnailGrid = document.getElementById('thumbnail-grid');
    if(!thumbnailGrid) { console.error("Elemento thumbnail-grid para galeria não encontrado."); return; }

    // Get media items from order data, convert Firebase object to array
    const media = pedido.media || {};
    // Add Firebase key as 'key' property to each media item
    const mediaEntries = Object.entries(media).map(([key, item]) => ({ ...item, key: key }));
    // Update the global array used by the lightbox
    lightboxMedia = mediaEntries;
    console.log(`Renderizando galeria com ${mediaEntries.length} itens de mídia.`);

    // Display placeholder if no media items
    if (mediaEntries.length === 0) {
        thumbnailGrid.innerHTML = `
            <div class="col-span-full text-center py-6 text-gray-400">
                <i class='bx bx-image bx-sm mb-2'></i>
                <p class="text-xs italic">Nenhuma mídia anexada a este pedido.</p>
            </div>`;
        return;
    }

    // Generate HTML for each media thumbnail
    thumbnailGrid.innerHTML = mediaEntries.map((item, index) => {
        // Skip rendering if item URL is missing (data integrity issue)
        if (!item?.url) {
            console.warn(`Item de mídia inválido (sem URL) no índice ${index}:`, item);
            return ''; // Return empty string to skip this item
        }

        // Check if the current user has permission to delete (Gestor role)
        const canDelete = currentUser?.role?.toLowerCase().includes('gestor');
        // Generate delete button HTML only if user has permission
        const deleteButtonHTML = canDelete ? `
            <button class="delete-media-btn" data-pedido-id="${pedido.id}" data-media-key="${item.key}" title="Excluir Mídia">
                <i class='bx bxs-trash bx-xs'></i>
            </button>` : '';

        // Determine file type and generate appropriate thumbnail content
        const fileType = item.type || ''; // Get MIME type
        const isImage = fileType.startsWith('image/');
        const isVideo = fileType.startsWith('video/');
        const isPdf = fileType === 'application/pdf';
        const fileName = item.name || `Arquivo_${index + 1}`; // Use filename or generate one
        let thumbnailContent;

        if (isImage) {
            // Lazy load images for performance
            thumbnailContent = `<img src="${item.url}" alt="${fileName}" loading="lazy" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-200">`;
        } else if (isVideo) {
            thumbnailContent = `<div class="flex flex-col items-center justify-center h-full p-1 text-center"><i class='bx bx-play-circle text-3xl text-blue-500'></i><span class="text-xs text-gray-600 mt-1 truncate w-full px-1" title="${fileName}">${fileName}</span></div>`;
        } else if (isPdf) {
            thumbnailContent = `<div class="flex flex-col items-center justify-center h-full p-1 text-center"><i class='bx bxs-file-pdf text-3xl text-red-500'></i><span class="text-xs text-gray-600 mt-1 truncate w-full px-1" title="${fileName}">${fileName}</span></div>`;
        } else { // Generic file icon for other types
            thumbnailContent = `<div class="flex flex-col items-center justify-center h-full p-1 text-center"><i class='bx bx-file text-3xl text-gray-400'></i><span class="text-xs text-gray-500 mt-1 truncate w-full px-1" title="${fileName}">${fileName}</span></div>`;
        }

        // Return the complete HTML for the thumbnail container
        return `
        <div class="thumbnail-container group bg-gray-100 rounded-md overflow-hidden flex items-center justify-center relative border border-gray-300 hover:shadow-lg transition-shadow aspect-square">
            ${deleteButtonHTML} {/* Delete button (if allowed) */}
            {/* Clickable area for opening lightbox */}
            <div class="thumbnail-item w-full h-full flex items-center justify-center relative" data-index="${index}">
                ${thumbnailContent} {/* Image, icon, etc. */}
            </div>
        </div>`;
    }).join(''); // Join all thumbnail HTML strings
};

// Opens the lightbox modal to display a specific media item
const openLightbox = (index) => {
    // Validate index
    if (!lightboxMedia || index < 0 || index >= lightboxMedia.length) {
        console.warn("Índice inválido ou mídia não carregada para lightbox:", index);
        showNotification("Não foi possível abrir a mídia selecionada.", "warning");
        return;
    }
    currentLightboxIndex = index; // Store current index for potential navigation (not implemented)
    const media = lightboxMedia[index];

    // Validate media URL
    if (!media?.url) {
        showNotification("Erro: URL da mídia está faltando.", "error");
        console.warn("Tentativa de abrir lightbox para item sem URL:", media);
        return;
    }

    const lightboxContent = document.getElementById('lightbox-content');
    if(!lightboxContent) { console.error("Elemento 'lightbox-content' não encontrado para exibir mídia."); return; }

    // Show loading indicator
    lightboxContent.innerHTML = '<p class="text-white animate-pulse text-center">Carregando mídia...</p>';

    // Determine content based on media type and display it
    if (media.type === 'application/pdf') {
        // Display PDF info and link
        lightboxContent.innerHTML = `
            <div class="text-center p-6 bg-gray-800 rounded max-w-md">
                <i class='bx bxs-file-pdf text-6xl text-red-400 mb-4'></i>
                <p class="text-gray-300 text-sm mb-4 break-all">${media.name || 'Documento PDF'}</p>
                <a href="${media.url}" target="_blank" rel="noopener noreferrer" class="btn btn-red inline-flex items-center gap-2">
                    <i class='bx bx-link-external'></i>Abrir PDF em Nova Aba
                </a>
            </div>`;
    } else if (media.type?.startsWith('image/')) {
        // Display image
        const img = new Image();
        img.onload = () => { lightboxContent.innerHTML = ''; lightboxContent.appendChild(img); }; // Replace loading with image
        img.onerror = () => { lightboxContent.innerHTML = '<p class="text-red-400 text-center">Erro ao carregar imagem.</p>'; };
        img.src = media.url;
        img.alt = media.name || 'Imagem';
        img.className = "block max-w-full max-h-full object-contain rounded shadow-lg"; // Style image
    } else if (media.type?.startsWith('video/')) {
        // Display video player
        lightboxContent.innerHTML = `<video src="${media.url}" controls controlsList="nodownload" class="block max-w-full max-h-full rounded shadow-lg"></video>`;
    } else {
        // Display generic file info and download link
        lightboxContent.innerHTML = `
            <div class="text-center p-6 bg-gray-800 rounded max-w-md">
                <i class='bx bx-file text-6xl text-gray-400 mb-4'></i>
                <p class="text-gray-300 text-sm mb-4 break-all">${media.name || 'Arquivo'}</p>
                <a href="${media.url}" target="_blank" rel="noopener noreferrer" class="btn btn-blue inline-flex items-center gap-2" download="${media.name || ''}"> {/* Add download attribute */}
                    <i class='bx bx-download'></i>Abrir/Baixar Arquivo
                </a>
            </div>`;
    }

    // Show the lightbox modal
    if(lightbox){
        lightbox.classList.remove('hidden');
        lightbox.classList.add('flex');
    } else {
        console.error("Elemento do lightbox (lightbox) não encontrado.");
    }
};


/* ==================================================================
ASSISTENTE DE VENDAS e IA (Inteligência Artificial)
==================================================================
*/
// Generates rule-based sales suggestions (V1)
const generateSalesAssistV1Suggestions = (pedidoAtual, pedidosAnteriores) => {
    const outputDiv = document.getElementById('assistenteVendasOutput');
    if (!outputDiv) { console.warn("Elemento 'assistenteVendasOutput' não encontrado para sugestões V1."); return; }

    const suggestions = []; // Array to hold suggestion strings
    // Get lowercase names of items in the current order
    const itensAtuaisNomes = (Array.isArray(pedidoAtual.itens)?pedidoAtual.itens:[])
        .map(i => i.name.toLowerCase());
    // Ensure previous orders is an array
    pedidosAnteriores = Array.isArray(pedidosAnteriores)?pedidosAnteriores:[];

    // --- Rule 1: Cross-Sell based on CROSS_SELL_RULES constant ---
    itensAtuaisNomes.forEach(itemName => { // For each item in the current order
        for (const ruleItem in CROSS_SELL_RULES) { // Check against each rule key
            // If item name includes the rule key (e.g., "Cabo Flexível")
            if (itemName.includes(ruleItem.toLowerCase())) {
                // Check each suggestion associated with that rule (e.g., "Eletroduto", "Conector")
                CROSS_SELL_RULES[ruleItem].forEach(suggestion => {
                    // If the suggested item is NOT already in the current order
                    if (!itensAtuaisNomes.some(i => i.includes(suggestion.toLowerCase()))) {
                        suggestions.push(`Para ${ruleItem}: Ofereça **${suggestion}**.`); // Add suggestion
                    }
                });
            }
        }
    });

    // --- Rule 2: Frequency Alert/Opportunity for a specific product ---
    const produtoFreq = "Fita Isolante"; // Product to monitor
    // Find past orders containing this product, sorted by date descending
    const comprasProd = pedidosAnteriores
        .filter(p => p.itens?.some(i => i.name.toLowerCase().includes(produtoFreq.toLowerCase())))
        .sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));

    if (comprasProd.length > 0) { // If the customer has bought this product before
        // Calculate days since the last purchase
        const diffDays = Math.floor((new Date() - new Date(comprasProd[0].createdAt)) / (1000 * 60 * 60 * 24));
        // If it's been longer than the threshold
        if (diffDays > FREQUENCY_ALERT_DAYS) {
            suggestions.push(`ALERTA: Última compra de ${produtoFreq} foi há ${diffDays} dias. Verifique necessidade/estoque.`);
        }
    } else if (pedidosAnteriores.length > 0) { // If there's purchase history, but not for this specific product
        suggestions.push(`OPORTUNIDADE: Cliente tem histórico mas parece não comprar ${produtoFreq}. Oferecer?`);
    }

    // --- Rule 3: Simple Upsell/Informational suggestion based on cable size ---
    if (itensAtuaisNomes.some(i => i.includes("1.5mm"))) { // If buying 1.5mm cable now
        // Check if customer bought larger sizes (2.5mm or 4mm) in the past
        const comprouMaior = pedidosAnteriores.some(p => p.itens?.some(i => i.name.includes("2.5mm") || i.name.includes("4mm")));
        if (comprouMaior) {
            suggestions.push(`INFO: Cliente já utilizou cabos de bitola maior (2.5mm+). Confirmar aplicação deste 1.5mm.`);
        }
    }

    // --- Render Suggestions ---
    // If any suggestions were generated
    if (suggestions.length > 0) {
        // Take the top 3, format bold text using **, convert to HTML list items
        outputDiv.innerHTML = '<ul>' + suggestions.slice(0, 3).map(s =>
            `<li class="mb-1 text-xs">${s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</li>` // Format bold and create list item
        ).join('') + '</ul>';
    } else {
        // If no suggestions were generated by the rules
        outputDiv.innerHTML = '<p class="italic text-xs text-gray-500">Nenhuma sugestão automática (V1) no momento.</p>';
    }
     console.log("Sugestões V1 geradas:", suggestions);
};


// Fetches and displays AI-powered sales suggestions from Google Gemini (V2)
const getGeminiSuggestions = async (pedidoAtual, itensAtuais) => {
    const outputDiv = document.getElementById('assistenteVendasOutput');
    const refreshBtn = document.getElementById('geminiRefreshBtn');

    // --- Pre-checks ---
    // Ensure necessary elements exist and API key is configured
    if (!outputDiv || !refreshBtn) { console.warn("Elementos da UI para Assistente IA (V2) não encontrados."); return; }
    if (!GEMINI_API_KEY || GEMINI_API_KEY === "COLE_SUA_GEMINI_API_KEY_AQUI") {
        console.warn("Chave da API Gemini não configurada em app_setup.js. Sugestões V2 desativadas.");
        // Display message only if V1 suggestions are also empty
        if(outputDiv && !outputDiv.innerHTML.includes('<li>')) {
             outputDiv.innerHTML = '<p class="italic text-xs text-gray-500">Assistente IA (V2) não configurado.</p>';
        }
        refreshBtn.classList.add('hidden'); // Hide refresh button
        return;
    }

    // --- UI Update: Show Loading State ---
    refreshBtn.classList.remove('hidden'); // Show refresh button
    // Append loading message below existing V1 suggestions (if any)
    const loadingHTML = '<p class="ai-loading animate-pulse-subtle text-xs text-blue-700 mt-2 pt-2 border-t border-blue-200">IA Gerando sugestões...</p>';
     // Remove previous AI suggestions or errors before adding loading
    outputDiv.querySelectorAll('.ai-suggestion, .ai-error, .ai-loading').forEach(el => el.remove());
    outputDiv.insertAdjacentHTML('beforeend', loadingHTML); // Add loading message
    refreshBtn.disabled = true; // Disable refresh button during API call
    console.log("Chamando API Gemini...");

    // --- Prepare Data for Prompt ---
    const nomeCliente = pedidoAtual.clienteNome || "Cliente";
    // Format current items list including quantity and unit
    const itensAtuaisFormatado = (Array.isArray(itensAtuais)?itensAtuais:[])
        .map(i => `${i.quantity || 1}${i.unit || 'un'} ${i.name}`) // e.g., "2un Cabo Flexível"
        .join(', ') || "Nenhum item no pedido atual";
    // Format recent history items including quantity and unit (using stored history from openDetailsModal)
    const historicoItensFormatado = pedidoAtual.historicoAnterior?.slice(0,2) // Use last 2 orders from history
        .flatMap(p => p.itens||[]) // Get all items from those orders
        .map(i => `${i.quantity || 1}${i.unit || 'un'} ${i.name}`) // Format them
        .join(', ') || "Nenhum histórico recente encontrado";

    // --- Construct the Prompt ---
    // Detailed prompt providing context, current order, history, and desired output format
    const prompt = `Você é um assistente de vendas B2B especialista em materiais elétricos e de construção para uma distribuidora no Brasil. O cliente é "${nomeCliente}". O pedido ATUAL contém os seguintes itens: ${itensAtuaisFormatado}. O histórico RECENTE deste cliente (últimos 2 pedidos entregues) inclui: ${historicoItensFormatado}. Sua tarefa é gerar EXATAMENTE 2 sugestões CURTAS, OBJETIVAS e PRÁTICAS para o vendedor brasileiro: 1. Um item de cross-sell que complemente DIRETAMENTE um item do pedido ATUAL (ex: se tem cabo, sugerir conector). 2. Uma oportunidade de venda baseada no histórico (ex: item que ele comprava e parou, ou item comum que ele nunca comprou, como fita isolante). Use **negrito** para nomes de produtos. Formate a resposta como uma lista simples, cada sugestão em uma nova linha começando com "- ". Não inclua introduções ou despedidas, apenas as duas sugestões.`;
     console.log("Prompt para Gemini:", prompt); // Log prompt for debugging

    // --- API Call ---
    try {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                // Safety settings (adjust if blocking valid responses)
                safetySettings: [ { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }, { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" }, { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }, { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" } ],
                generationConfig: { temperature: 0.6, maxOutputTokens: 150 } // Control creativity/length
            })
        });

        // --- Handle API Response ---
        // Clear loading message before processing response
        outputDiv.querySelector('.ai-loading')?.remove();

        if (!response.ok) {
            // Handle API errors (e.g., 4xx, 5xx)
            let errorDetails = `Status: ${response.status}`;
            try { const errData = await response.json(); errorDetails += ` - ${errData.error?.message || response.statusText}`; } catch { errorDetails += ` - ${response.statusText}`; }
            console.error("Erro na resposta da API Gemini:", errorDetails);
            throw new Error(`Falha na API Gemini (${errorDetails})`);
        }

        const data = await response.json();
        console.log("Resposta da API Gemini:", data); // Log full response for debugging

        // Extract suggestion text from the candidate
        const suggestionText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        // Check if response might be blocked by safety settings
        const finishReason = data.candidates?.[0]?.finishReason;
         if (finishReason && finishReason !== "STOP") {
            console.warn(`Gemini finishReason: ${finishReason}`);
             if (finishReason === "SAFETY") {
                 throw new Error("Resposta bloqueada por filtros de segurança.");
             } else if (finishReason === "RECITATION") {
                  throw new Error("Resposta bloqueada por recitação.");
             } else {
                  throw new Error(`Resposta incompleta (${finishReason})`);
             }
        }


        if (suggestionText) {
            // Format the suggestions (bold text, list items)
            const formattedSuggestions = suggestionText
                .trim() // Remove leading/trailing whitespace
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Format **bold** to <strong>
                .replace(/^- /gm, '<li class="ai-suggestion mb-1">') // Start list items
                .replace(/\n/g, '</li>'); // End list items (assuming one suggestion per line)

            // Append the formatted suggestions as a list
            const aiListHTML = `<ul class="list-disc pl-4 text-xs mt-2 pt-2 border-t border-blue-200">${formattedSuggestions}</li></ul>`;
             outputDiv.insertAdjacentHTML('beforeend', aiListHTML);
             console.log("Sugestões V2 renderizadas.");

        } else {
            // Handle cases where response is valid but text is missing
            console.warn("Resposta da API Gemini válida, mas sem texto de sugestão.", data);
             const noIASuggestionHTML = '<p class="ai-suggestion italic text-xs text-orange-700 mt-2 pt-2 border-t border-blue-200">IA sem sugestões adicionais no momento.</p>';
              outputDiv.insertAdjacentHTML('beforeend', noIASuggestionHTML);
        }
    } catch (error) {
        // --- Handle Fetch/API Errors ---
        console.error("Erro ao chamar ou processar API Gemini:", error);
        // Clear loading message before showing error
        outputDiv.querySelector('.ai-loading')?.remove();
        // Display error message in the UI
        const errorHTML = `<p class="ai-error italic text-xs text-red-600 mt-2 pt-2 border-t border-blue-200">Erro ao consultar IA (${error.message}).</p>`;
        outputDiv.insertAdjacentHTML('beforeend', errorHTML);

    } finally {
        // Always re-enable the refresh button
        refreshBtn.disabled = false;
    }
};


/* ==================================================================
MODAL DE CONFIGURAÇÃO - Funções
==================================================================
*/
// Opens the configuration modal (for managing products)
const openConfigModal = () => {
    renderConfigLists(); // Update product list display before showing
    if(configModal){
        configModal.classList.remove('hidden'); // Show modal
        configModal.classList.add('flex');
        console.log("Modal de configuração aberto.");
     } else {
         console.error("Modal de configuração (configModal) não encontrado no DOM.");
         showNotification("Erro ao abrir configurações.", "error");
     }
};

// Renders the list of products in the configuration modal
const renderConfigLists = () => {
   const listContainer = document.getElementById('configServicosList');
   if (!listContainer) { console.warn("Elemento configServicosList para exibir produtos não encontrado."); return; }
   // Ensure configData.produtos is an array
   const produtos = Array.isArray(configData.produtos)?configData.produtos:[];
   console.log(`Renderizando lista de ${produtos.length} produtos na configuração.`);
   // Show message if no products
   if(produtos.length === 0){
       listContainer.innerHTML = '<p class="text-center italic p-4 text-gray-500 text-sm">Nenhum produto cadastrado no catálogo.</p>';
       return;
   }
   // Sort products alphabetically by name
   produtos.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
   // Generate HTML for each product item
   listContainer.innerHTML = produtos.map((p,i)=>`
      <div class="flex justify-between items-center bg-white p-3 rounded border border-gray-200 shadow-sm mb-2 hover:bg-gray-50 transition-colors duration-150">
        {/* Product Name and Price */}
        <span class="text-sm text-gray-800 flex-grow mr-2">${p.name || 'Produto Sem Nome'} - ${formatCurrency(p.price)}</span>
        {/* Remove Button */}
        <button class="remove-servico-btn text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100 transition-colors duration-150 text-xl leading-none flex-shrink-0" data-index="${i}" title="Excluir ${p.name || 'Produto'}">&times;</button>
      </div>`).join('');
};

// Adds a new product to the configuration in Firebase
const addProdutoConfig = async (e) => {
    e.preventDefault(); // Prevent form submission reload
    const nameInput = document.getElementById('newServicoName');
    const priceInput = document.getElementById('newServicoPrice');
    const btn = e.target.querySelector('button[type="submit"]');
    const name = nameInput?.value.trim()||'';
    // Ensure price is parsed correctly and is positive
    const price = parseFloat(priceInput?.value);

    // --- Input Validation ---
    if (!name || isNaN(price) || price <= 0) {
        showNotification("Nome do produto e um preço válido (maior que 0) são obrigatórios.", "error");
        return;
    }
    // Ensure configData.produtos exists and is an array
    if (!Array.isArray(configData.produtos)) configData.produtos = [];
    // Check if product name already exists (case-insensitive comparison)
    const exists = configData.produtos.some(p => p.name.toLowerCase() === name.toLowerCase());
    if (exists) {
        showNotification(`O produto "${name}" já existe no catálogo. Use um nome diferente.`, "warning");
        return;
    }
    // --- End Validation ---

    if(btn) btn.disabled = true; // Disable button during save operation
    const newProd = {name, price}; // Create the new product object
    // Create a temporary list including the new product for saving
    const tentativeList = [...configData.produtos, newProd];
    console.log("Tentando adicionar novo produto:", newProd);

    try {
        if(!db) throw new Error("Conexão com o banco de dados indisponível.");
        // Save the ENTIRE updated product list back to Firebase at '/config/produtos'
        await db.ref('config/produtos').set(tentativeList);
        console.log("Lista de produtos atualizada no Firebase.");
        // If Firebase save is successful, update the local state
        configData.produtos = tentativeList;
        renderConfigLists(); // Re-render the product list in the modal UI
        if(nameInput) nameInput.value = ''; // Clear input fields
        if(priceInput) priceInput.value = '';
        showNotification(`Produto "${name}" adicionado ao catálogo!`, "success");
    } catch (error) {
        console.error("Erro ao adicionar novo produto ao Firebase:", error);
        showNotification("Erro ao salvar novo produto. Verifique o console.", "error");
    } finally {
        if(btn) btn.disabled = false; // Re-enable button regardless of success/failure
    }
};

// Removes a product from the configuration in Firebase
const removeProdutoConfig = async (e) => {
    // Check if the clicked element is actually a remove button
    if (e.target.classList.contains('remove-servico-btn')) {
        const index = parseInt(e.target.dataset.index); // Get the index of the product to remove

        // Validate the index and ensure the product exists in the local state
        if (!isNaN(index) && configData.produtos?.[index]) {
             const prodToRemove = configData.produtos[index];
             // Confirm with the user before deleting
            if (confirm(`Tem certeza que deseja remover "${prodToRemove.name}" do catálogo permanentemente?`)) {
                console.log(`Tentando remover produto no índice ${index}:`, prodToRemove.name);
                // Create the new product list excluding the item at the specified index
                const updatedList = configData.produtos.filter((_, i) => i !== index);
                e.target.disabled = true; // Disable the button to prevent multiple clicks

                try {
                    if(!db) throw new Error("Conexão com o banco de dados indisponível.");
                    // Save the updated list (without the removed product) back to Firebase
                    await db.ref('config/produtos').set(updatedList);
                    console.log("Lista de produtos atualizada no Firebase após remoção.");
                    // If Firebase save is successful, update the local state
                    configData.produtos = updatedList;
                    renderConfigLists(); // Re-render the list in the modal UI
                    showNotification(`"${prodToRemove.name}" foi removido do catálogo.`, "success");
                } catch (error) {
                    console.error("Erro ao remover produto do Firebase:", error);
                    showNotification("Erro ao remover produto. Tente novamente.", "error");
                    e.target.disabled = false; // Re-enable the button if the operation failed
                }
            }
        } else {
             // Log if the index was invalid or the product wasn't found
             console.warn("Índice inválido ou produto não encontrado na lista local para remoção:", index);
        }
    }
};

/* ==================================================================
DASHBOARD GERENCIAL (Métricas e Ranking)
==================================================================
*/
// Renders the management dashboard with calculated metrics
const renderDashboardGerencial = async () => {
    // Get container elements
    const cardsContainer = document.getElementById('gerencial-cards');
    const rankingContainer = document.getElementById('gerencial-ranking-vendedores');
    const statusContainer = document.getElementById('gerencial-pedidos-status');

    // Check if elements exist
    if (!cardsContainer || !rankingContainer || !statusContainer) {
        console.warn("Um ou mais elementos do dashboard gerencial não foram encontrados para renderização.");
        return;
    }
    // Display loading indicators
    cardsContainer.innerHTML = '<p class="text-center text-gray-500 animate-pulse col-span-full">Calculando métricas...</p>';
    rankingContainer.innerHTML = '<p class="text-center text-gray-500 animate-pulse">Calculando ranking...</p>';
    statusContainer.innerHTML = '<p class="text-center text-gray-500 animate-pulse">Contando pedidos...</p>';
    console.log("Renderizando Dashboard Gerencial...");

    try {
        // Use locally cached order data if available, otherwise warn (data might be incomplete)
        const pedidosArray = initialDataLoaded ? Object.values(allPedidos) : [];
        if (!initialDataLoaded) {
            console.warn("Atenção: Dados de pedidos podem não estar completamente carregados para o dashboard gerencial.");
        }

        // --- Calculation Setup ---
        const agora = new Date();
        const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1); // First day of current month
        let faturamentoMes = 0, pgtoValor = 0, pgtoCount = 0;

        // Initialize counters for status and seller performance
        const pedidosPorStatus = STATUS_LIST.reduce((acc, s) => ({ ...acc, [s]: 0 }), {}); // { 'Novos-Leads': 0, ... }
        const vendasVendedorMes = vendedores.reduce((acc, v) => ({ ...acc, [v.name]: { count: 0, valor: 0 } }), {}); // { 'SellerName': { count: 0, valor: 0 }, ... }

        // --- Process Each Order ---
        pedidosArray.forEach(p => {
            // Count orders per status
            if (p.status && pedidosPorStatus.hasOwnProperty(p.status)) {
                 pedidosPorStatus[p.status]++;
            } else if (p.status) {
                // Log if an order has an unrecognized status
                console.warn(`Status desconhecido ('${p.status}') encontrado no pedido ${p.id || p.pedidoNumero}.`);
            }

            const dataPedido = new Date(p.createdAt || 0); // Use createdAt for date filtering

            // Calculate monthly revenue (only 'Entregue' orders created within the current month)
            if (p.status === 'Entregue' && dataPedido >= inicioMes) {
                faturamentoMes += (parseFloat(p.valorTotal) || 0);
                // Add to the responsible seller's monthly total
                if (p.vendedorResponsavel && vendasVendedorMes[p.vendedorResponsavel]) {
                    vendasVendedorMes[p.vendedorResponsavel].count++;
                    vendasVendedorMes[p.vendedorResponsavel].valor += (parseFloat(p.valorTotal) || 0);
                } else if (p.vendedorResponsavel) {
                     // Log if seller name from order doesn't match known sellers
                     console.warn(`Vendedor '${p.vendedorResponsavel}' do pedido ${p.id || p.pedidoNumero} não encontrado na lista de vendedores para ranking.`);
                }
            }

            // Sum total value and count of orders 'Aguardando-Pagamento'
            if (p.status === 'Aguardando-Pagamento') {
                pgtoValor += (parseFloat(p.valorTotal) || 0);
                pgtoCount++;
            }
        });

        const totalPedidos = pedidosArray.length;
        const pedidosAtivos = totalPedidos - (pedidosPorStatus['Entregue'] || 0); // Total minus delivered

        // --- Render Metric Cards ---
        cardsContainer.innerHTML = `
            <div class="bg-white p-4 rounded-lg shadow border tc"><p class="text-xs font-medium text-gray-500 uppercase">Faturamento Mês (Entregues)</p><p class="mt-1 text-2xl font-semibold text-green-600">${formatCurrency(faturamentoMes)}</p></div>
            <div class="bg-white p-4 rounded-lg shadow border tc"><p class="text-xs font-medium text-gray-500 uppercase">Valor Aguardando Pagamento</p><p class="mt-1 text-2xl font-semibold text-orange-600">${formatCurrency(pgtoValor)}</p><p class="text-xxs text-gray-500">(${pgtoCount} pedido${pgtoCount !== 1 ? 's' : ''})</p></div>
            <div class="bg-white p-4 rounded-lg shadow border tc"><p class="text-xs font-medium text-gray-500 uppercase">Pedidos Ativos</p><p class="mt-1 text-2xl font-semibold text-blue-600">${pedidosAtivos}</p><p class="text-xxs text-gray-500">(Total Geral: ${totalPedidos})</p></div>
            <div class="bg-white p-4 rounded-lg shadow border tc"><p class="text-xs font-medium text-gray-500 uppercase">Produtos Cadastrados</p><p class="mt-1 text-2xl font-semibold text-gray-700">${configData.produtos?.length || 0}</p></div>`;

        // --- Render Seller Ranking ---
        const rankingArray = Object.entries(vendasVendedorMes)
                               .map(([name, data]) => ({ name, ...data })) // Convert object to array
                               .sort((a, b) => b.valor - a.valor); // Sort by total value descending

        // Display ranking only if there are sales this month
        if(rankingArray.length > 0 && rankingArray.some(v => v.valor > 0)) {
             rankingContainer.innerHTML = `<ul class="space-y-2">${rankingArray.map((v, i) => `
                <li class="flex justify-between items-center p-2 rounded ${i === 0 ? 'bg-yellow-100 border-yellow-200' : 'bg-gray-50 border-gray-200'} border">
                    <span class="font-medium text-gray-700 text-sm">${i + 1}. ${v.name}</span>
                    <span class="text-xs text-green-700 font-semibold">${formatCurrency(v.valor)} (${v.count} pedido${v.count !== 1 ? 's' : ''})</span>
                </li>`).join('')}</ul>`;
        } else {
             rankingContainer.innerHTML = '<p class="text-gray-500 italic text-sm tc">Nenhuma venda entregue registrada neste mês para ranking.</p>';
        }

        // --- Render Order Count by Status ---
        statusContainer.innerHTML = `<ul class="space-y-1 text-sm">${STATUS_LIST.map(s => `
            <li class="flex justify-between p-1 px-2 rounded hover:bg-gray-100 transition-colors duration-150">
                <span class="text-gray-600">${formatStatus(s)}:</span>
                <span class="font-semibold text-gray-800">${pedidosPorStatus[s] || 0}</span>
            </li>`).join('')}
            {/* Total Row */}
            <li class="flex justify-between p-1 px-2 border-t mt-2 pt-2">
                <span class="font-bold text-gray-700">TOTAL GERAL:</span>
                <span class="font-bold text-gray-900">${totalPedidos}</span>
            </li></ul>`;

        console.log("Dashboard Gerencial renderizado com sucesso.");

    } catch (error) {
        console.error("Erro ao calcular ou renderizar dashboard gerencial:", error);
        // Display error messages in the UI
        cardsContainer.innerHTML = '<p class="text-red-500 col-span-full tc">Erro ao calcular métricas.</p>';
        rankingContainer.innerHTML = '<p class="text-red-500 tc">Erro ao calcular ranking.</p>';
        statusContainer.innerHTML = '<p class="text-red-500 tc">Erro ao contar status.</p>';
        showNotification("Erro ao atualizar painel gerencial.", "error");
    }
};

// Function to switch the active dashboard tab (Vendas/Gerencial)
const switchDashboardTab = (tabId) => {
    console.log(`Trocando para aba: ${tabId}`);
    // Hide all dashboard content sections first
    document.querySelectorAll('.dashboard-content').forEach(c => c.classList.add('hidden'));
    // Reset styles for all tab buttons (remove active state)
    document.querySelectorAll('.dashboard-tab').forEach(b => {
        b.classList.remove('active', 'text-blue-600', 'border-blue-600');
        b.classList.add('border-transparent', 'text-gray-500', 'hover:text-gray-600', 'hover:border-gray-300');
    });

    // Show the content section corresponding to the clicked tab ID
    const activeContent = document.getElementById(`${tabId}-content`);
    if (activeContent) {
        activeContent.classList.remove('hidden');
    } else {
        console.warn(`Conteúdo da aba com ID '${tabId}-content' não encontrado.`);
    }

    // Apply active styles to the clicked tab button
    const activeButton = document.querySelector(`.dashboard-tab[data-tab="${tabId}"]`);
    if (activeButton) {
        activeButton.classList.add('active', 'text-blue-600', 'border-blue-600');
        activeButton.classList.remove('border-transparent', 'text-gray-500', 'hover:text-gray-600', 'hover:border-gray-300');
    } else {
         console.warn(`Botão da aba com data-tab='${tabId}' não encontrado.`);
    }

    // If the 'Gerencial' tab is activated, refresh its data
    if(tabId === 'gerencial') {
        renderDashboardGerencial();
    }
};

/* ==================================================================
BUSCA GLOBAL
==================================================================
*/
// Handles input in the global search bar to filter and display orders
const handleGlobalSearch = () => {
    // Ensure search elements exist
    if(!globalSearchInput || !globalSearchResults) {
        console.warn("Elementos da busca global (input ou results) não encontrados.");
        return;
    }
    const searchTerm = globalSearchInput.value.toLowerCase().trim(); // Get and normalize search term

    // Hide results dropdown if search term is empty
    if (!searchTerm) {
        globalSearchResults.innerHTML = ''; // Clear previous results
        globalSearchResults.classList.add('hidden'); // Hide dropdown
        return;
    }

    console.log(`Buscando por: "${searchTerm}"`);
    // Filter the locally cached 'allPedidos' object
    const results = Object.values(allPedidos).filter(p =>
        (p.clienteNome?.toLowerCase().includes(searchTerm)) || // Match client name
        (p.pedidoNumero && String(p.pedidoNumero).includes(searchTerm)) || // Match order number
        (p.id?.toLowerCase().includes(searchTerm.replace('#',''))) || // Match Firebase ID (allow search with or without #)
        (Array.isArray(p.itens) && p.itens.some(i => i.name?.toLowerCase().includes(searchTerm))) || // Match item name within order
        (p.vendedorResponsavel?.toLowerCase().includes(searchTerm)) // Match seller name
    )
    // Sort results by most recent update or creation date
    .sort((a,b)=> new Date(b.lastUpdate || b.createdAt || 0) - new Date(a.lastUpdate || a.createdAt || 0))
    // Limit the number of results shown
    .slice(0, 10);

    console.log(`Encontrados ${results.length} resultados.`);
    // Display results or "not found" message
    if (results.length > 0) {
        // Generate HTML for each result item
        globalSearchResults.innerHTML = results.map(p => `
            <div class="search-result-item p-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0 transition-colors duration-150" data-id="${p.id}">
                <p class="font-semibold text-sm text-gray-800 truncate">${p.clienteNome||'Cliente Desconhecido'} (#${p.pedidoNumero||p.id.slice(-5)})</p> {/* Show Client & Order#/ID */}
                <p class="text-xs text-gray-500">${p.vendedorResponsavel||'N/A'} - <span class="font-medium ${p.status==='Entregue'?'text-green-600':'text-blue-600'}">${formatStatus(p.status)}</span></p> {/* Show Seller & Status */}
            </div>`).join('');
        globalSearchResults.classList.remove('hidden'); // Show results dropdown
    } else {
        // Show "not found" message if no results
        globalSearchResults.innerHTML = '<p class="p-3 text-center text-sm text-gray-500 italic">Nenhum pedido encontrado para sua busca.</p>';
        globalSearchResults.classList.remove('hidden'); // Show message
    }
};

/* ==================================================================
CONFIGURAÇÃO DOS LISTENERS DE EVENTOS GERAIS (UI Interactions)
==================================================================
*/
// Attaches all necessary event listeners to UI elements
const setupEventListeners = () => {
   console.log("Configurando listeners de eventos da UI...");

    // --- Login / Logout ---
    // Listener for clicks on the user selection list (event delegation)
    if (userList) {
        userList.addEventListener('click', (e) => {
            const userBtn = e.target.closest('.user-btn'); // Find the clicked user button element
            // Check if a valid user button was clicked and has user data
            if (userBtn?.dataset.user) {
                try {
                    // Parse the JSON data stored in the data-user attribute
                    const userData = JSON.parse(userBtn.dataset.user.replace(/&apos;/g, "'")); // Handle escaped quotes
                    loginUser(userData); // Call the login function with the parsed user data
                } catch(err){
                    // Handle errors during JSON parsing (e.g., malformed data attribute)
                    console.error("Erro ao parsear dados do usuário para login:", err, userBtn.dataset.user);
                    showNotification("Erro ao selecionar usuário. Tente novamente.", "error");
                }
            }
        });
        console.log("Listener de clique para userList configurado.");
    } else { console.warn("Elemento userList (para login) não encontrado."); }

    // Listener for the logout button
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            console.log("Botão de logout clicado.");
            localStorage.removeItem('eletroIAUser'); // Clear the saved user session
            try {
                // Attempt to detach Firebase listeners for 'pedidos' to prevent memory leaks/errors after logout
                if (db && typeof db.ref === 'function' && typeof db.ref('pedidos').off === 'function') {
                     db.ref('pedidos').off(); // Detach all listeners ('value', 'child_added', etc.) for the 'pedidos' path
                     console.log("Listeners do Firebase para 'pedidos' removidos com sucesso.");
                } else {
                     console.warn("Não foi possível remover listeners do Firebase (db ou ref('pedidos').off não disponíveis).");
                }
            } catch(e) {
                // Catch any errors during the detachment process
                console.warn("Erro ao tentar remover listeners do Firebase durante logout:", e);
            }
            location.reload(); // Reload the page to return to the login screen
        });
         console.log("Listener de clique para logoutButton configurado.");
    } else { console.warn("Botão de logout (logoutButton) não encontrado."); }

    // --- Abrir Modais Principais ---
    if(addPedidoBtn) { addPedidoBtn.addEventListener('click', openNewPedidoModal); console.log("Listener de clique para addPedidoBtn configurado."); } else { console.warn("Botão 'Novo Pedido' (addPedidoBtn) não encontrado."); }
    if(configBtn) { configBtn.addEventListener('click', openConfigModal); console.log("Listener de clique para configBtn configurado."); } else { console.warn("Botão 'Produtos' (configBtn) não encontrado."); }

    // --- Salvar Formulários Principais ---
    if(pedidoForm) { pedidoForm.addEventListener('submit', saveNewPedido); console.log("Listener de submit para pedidoForm configurado."); } else { console.warn("Formulário de novo pedido (pedidoForm) não encontrado."); }
    const addServicoForm = document.getElementById('addServicoForm'); if(addServicoForm) { addServicoForm.addEventListener('submit', addProdutoConfig); console.log("Listener de submit para addServicoForm configurado."); } else { console.warn("Formulário de adicionar produto (addServicoForm) não encontrado."); }

    // --- Fechar Modais (Genérico por classe e fundo) ---
    document.body.addEventListener('click', (e) => {
        // Check if the click target or its ancestor is a close button
        const closeButton = e.target.closest('.btn-close-modal');
        if (closeButton) {
             const modal = closeButton.closest('.modal-backdrop');
             if (modal) {
                 modal.classList.add('hidden');
                 console.log(`Modal ${modal.id || ''} fechado pelo botão.`);
             }
        }
        // Check if the click target is the modal backdrop itself (but not inside content and not lightbox)
        else if (e.target.classList.contains('modal-backdrop') && !e.target.closest('.modal-content') && e.target.id !== 'lightbox') {
             e.target.classList.add('hidden');
             console.log(`Modal ${e.target.id || ''} fechado pelo clique no fundo.`);
        }
    });
    // Specific close listeners for lightbox (X button and background)
    if(lightboxClose) lightboxClose.addEventListener('click', () => { if(lightbox) { lightbox.classList.add('hidden'); console.log("Lightbox fechado pelo botão X."); } }); else { console.warn("Botão de fechar lightbox (lightboxClose) não encontrado."); }
    const lightboxCloseBg = document.getElementById('lightbox-close-bg'); if(lightboxCloseBg) lightboxCloseBg.addEventListener('click', () => { if(lightbox) { lightbox.classList.add('hidden'); console.log("Lightbox fechado pelo clique no fundo."); } }); else { console.warn("Fundo de fechar lightbox (lightbox-close-bg) não encontrado."); }
    console.log("Listeners genéricos para fechar modais configurados.");

    // --- Ações no Kanban (Mover Status ou Abrir Detalhes) ---
    if (vendedorDashboard) {
        // Using event delegation on the main dashboard container
        vendedorDashboard.addEventListener('click', (e) => {
            const moveBtn = e.target.closest('.btn-move-status'); // Check if a move button was clicked
            const cardArea = e.target.closest('.card-clickable-area'); // Check if the main card area was clicked

            // Clicked on a move status button
            if (moveBtn?.dataset.id && moveBtn.dataset.newStatus && moveBtn.dataset.newStatus !== 'null') {
                e.stopPropagation(); // Prevent the click from also triggering the cardArea listener
                console.log(`Botão mover status clicado: Pedido ${moveBtn.dataset.id}, Novo Status ${moveBtn.dataset.newStatus}`);
                updatePedidoStatus(moveBtn.dataset.id, moveBtn.dataset.newStatus);
            }
            // Clicked on the main clickable area of the card
            else if (cardArea) {
                const card = cardArea.closest('.vehicle-card'); // Find the parent card element
                if (card?.dataset.id) {
                    console.log(`Área clicável do card clicada: Pedido ${card.dataset.id}`);
                    openDetailsModal(card.dataset.id); // Open the details modal
                }
            }
        });
        console.log("Listener de clique para vendedorDashboard (Kanban) configurado.");
    } else { console.warn("Dashboard de vendedores (vendedorDashboard) não encontrado para listeners do Kanban."); }

    // --- Ações no Modal de Detalhes ---
    if(detailsModal){
        // Using event delegation for buttons inside the modal
        detailsModal.addEventListener('click', (e) => {
            // Add Item Button
            if (e.target.id === 'detailsAddServicoBtn') {
                console.log("Botão 'Add Item' clicado.");
                const select = document.getElementById('detailsServicosList');
                const quantityInput = document.getElementById('detailsItemQuantity');
                const quantity = parseInt(quantityInput?.value);

                // Validate selection and quantity
                if (select?.value && !isNaN(quantity) && quantity >= 1) {
                    const [name, priceStr] = select.value.split('|');
                    const price = parseFloat(priceStr);
                    if(name && !isNaN(price)){
                        console.log(`Adicionando item: ${quantity}x ${name} (${price})`);
                        // Add item with quantity to local state
                        itensAdicionadosState.push({ name, price, quantity, unit: 'un' }); // Add 'un' as default unit
                        renderDetailsItems(); // Re-render items list
                        calculateDetailsTotal(false); // Recalculate total
                        select.value = ""; // Clear dropdown
                        if(quantityInput) quantityInput.value = 1; // Reset quantity input
                    } else { console.warn("Seleção de item inválida no dropdown:", select.value); showNotification("Item inválido selecionado.", "warning"); }
                } else { showNotification("Selecione um item válido e informe a quantidade (mínimo 1).", "warning"); }
            }
            // Remove Item Button (delegated from detailsItensContainer)
            else if (e.target.classList.contains('remove-item-btn')) {
                const index = parseInt(e.target.dataset.index);
                console.log(`Botão 'Remover Item' clicado para índice: ${index}`);
                if (!isNaN(index) && index >= 0 && index < itensAdicionadosState.length) {
                    const removedItem = itensAdicionadosState.splice(index, 1); // Remove from local state
                    console.log("Item removido:", removedItem);
                    renderDetailsItems(); // Re-render list
                    calculateDetailsTotal(false); // Recalculate total
                } else { console.warn("Índice inválido para remover item:", e.target.dataset.index); }
            }
            // Generate WhatsApp Offer Button
            else if (e.target.id === 'gerarOfertaWhatsappBtn') {
                 console.log("Botão 'Gerar Texto Oferta' clicado.");
                 generateWhatsappOffer();
            }
            // Refresh AI Suggestions Button
            else if (e.target.id === 'geminiRefreshBtn') {
                 console.log("Botão 'Novas Sugestões IA' clicado.");
                 const pedidoId = document.getElementById('logPedidoId')?.value;
                 if(pedidoId && allPedidos[pedidoId] && typeof getGeminiSuggestions === 'function') {
                      // Update quantities from DOM before getting new suggestions
                      updateItemQuantitiesFromDOM();
                      getGeminiSuggestions(allPedidos[pedidoId], itensAdicionadosState);
                 } else {
                      console.warn("Não foi possível atualizar sugestões IA: pedidoId ou função ausente.");
                 }
            }
        });

        // Listener for changes in the Discount input
        const descontoInput = document.getElementById('detailsDesconto'); if(descontoInput) { descontoInput.addEventListener('input', () => calculateDetailsTotal(false)); console.log("Listener de input para detailsDesconto configurado."); } else { console.warn("Input de desconto (detailsDesconto) não encontrado."); }

        // Listener for Save and Advance Status button
        const saveAndNextBtn = document.getElementById('saveAndNextStatusBtn'); if(saveAndNextBtn) { saveAndNextBtn.addEventListener('click', () => saveDetailsAndMaybeAdvance(true)); console.log("Listener de clique para saveAndNextStatusBtn configurado."); } else { console.warn("Botão 'Salvar e Avançar' (saveAndNextStatusBtn) não encontrado."); }

        // Listener for Delete Order button (opens confirmation modal)
        if(deleteBtn) { deleteBtn.addEventListener('click', (e) => {
            console.log("Botão 'Excluir Pedido' clicado.");
            const id = e.target.dataset.id || e.target.closest('[data-id]')?.dataset.id;
            const pedido = allPedidos[id];
            // Ensure confirmation modal elements exist before proceeding
            if(pedido && confirmDeleteText && confirmDeleteBtn && confirmDeleteModal){
                confirmDeleteText.innerHTML = `Tem certeza que deseja excluir o Pedido <strong>#${pedido.pedidoNumero||id.slice(-5)}</strong> de <strong>${pedido.clienteNome||'Cliente Desconhecido'}</strong>?<br><strong class="text-red-600">Esta ação não pode ser desfeita.</strong>`;
                confirmDeleteBtn.dataset.id = id; // Store ID on confirm button
                confirmDeleteModal.classList.remove('hidden'); // Show confirmation modal
                confirmDeleteModal.classList.add('flex');
                console.log(`Modal de confirmação aberto para excluir pedido ${id}`);
            } else {
                console.warn("Erro ao preparar modal de confirmação de exclusão. Elementos faltando ou pedido inválido.", {pedidoExists: !!pedido, confirmDeleteTextExists: !!confirmDeleteText, confirmDeleteBtnExists: !!confirmDeleteBtn, confirmDeleteModalExists: !!confirmDeleteModal});
                showNotification("Erro ao iniciar o processo de exclusão.", "error");
            }
        }); console.log("Listener de clique para deleteBtn configurado."); } else { console.warn("Botão 'Excluir Pedido' (deleteBtn) não encontrado."); }

        console.log("Listeners internos do modal de detalhes configurados.");
    } else { console.warn("Modal de detalhes (detailsModal) não encontrado para adicionar listeners."); }

     // --- Confirmação de Exclusão (Pedido) - Ação Final ---
     if(confirmDeleteBtn) {
         confirmDeleteBtn.addEventListener('click', (e) => {
             const id = e.target.dataset.id; // Get order ID from button's data attribute
             console.log(`Botão 'Sim, Excluir' clicado para pedido ${id}`);
             if (id && confirmDeleteModal) {
                 confirmDeleteBtn.disabled = true; // Disable button to prevent multiple clicks
                 confirmDeleteBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin mr-2'></i> Excluindo...";
                 if(db) {
                     // Attempt to remove the order data from Firebase
                     db.ref(`pedidos/${id}`).remove()
                       .then(() => {
                           console.log(`Pedido ${id} removido do Firebase com sucesso.`);
                           if(detailsModal && document.getElementById('logPedidoId')?.value === id) {
                               detailsModal.classList.add('hidden'); // Close details modal if it was open for this order
                           }
                           confirmDeleteModal.classList.add('hidden'); // Close confirmation modal
                           showNotification('Pedido excluído com sucesso.', 'success');
                           // Note: The realtime listener 'child_removed' should automatically handle removing the card from the UI.
                       })
                       .catch(error => {
                           // Handle potential errors during Firebase remove operation (e.g., permission denied)
                           console.error(`Erro ao excluir pedido ${id} do Firebase:`, error);
                           showNotification("Erro ao excluir o pedido. Verifique as permissões ou a conexão.", "error");
                       })
                       .finally(() => { // Ensure the button is re-enabled in any case
                           confirmDeleteBtn.disabled = false; confirmDeleteBtn.innerHTML = "Sim, Excluir";
                       });
                } else {
                     // Handle case where Firebase connection might be lost
                     showNotification("Erro: Conexão com o banco de dados perdida. Não foi possível excluir.", "error");
                     confirmDeleteBtn.disabled = false; confirmDeleteBtn.innerHTML = "Sim, Excluir";
                }
            } else {
                 console.warn("ID do pedido não encontrado no botão de confirmação de exclusão ou modal ausente.");
            }
        });
        console.log("Listener de clique para confirmDeleteBtn configurado.");
    } else { console.warn("Botão 'Confirmar Exclusão' (confirmDeleteBtn) não encontrado."); }

     if(cancelDeleteBtn) { cancelDeleteBtn.addEventListener('click', () => { if(confirmDeleteModal) confirmDeleteModal.classList.add('hidden'); }); console.log("Listener de clique para cancelDeleteBtn configurado."); } else { console.warn("Botão 'Cancelar Exclusão' (cancelDeleteBtn) não encontrado."); }

    // --- Formulário de Log e Uploads ---
    if(logForm) { logForm.addEventListener('submit', saveLogAndUploads); console.log("Listener de submit para logForm configurado."); } else { console.warn("Formulário de log/upload (logForm) não encontrado."); }
    // Camera Button
    if(openCameraBtn) { openCameraBtn.addEventListener('click', () => { if(mediaInput) { mediaInput.setAttribute('accept', 'image/*'); mediaInput.setAttribute('capture', 'environment'); mediaInput.multiple = true; mediaInput.value = null; /* Clear previous selection */ mediaInput.click(); } else { console.warn("Input de mídia (para câmera) não encontrado."); } }); console.log("Listener de clique para openCameraBtn configurado."); } else { console.warn("Botão 'Câmera' (openCameraBtn) não encontrado."); }
    // Gallery/File Button
    if(openGalleryBtn) { openGalleryBtn.addEventListener('click', () => { if(mediaInput){ mediaInput.setAttribute('accept', 'image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.zip,.rar'); mediaInput.removeAttribute('capture'); mediaInput.multiple = true; mediaInput.value = null; /* Clear previous selection */ mediaInput.click(); } else { console.warn("Input de mídia (para galeria) não encontrado."); } }); console.log("Listener de clique para openGalleryBtn configurado."); } else { console.warn("Botão 'Arquivo' (openGalleryBtn) não encontrado."); }
    // Media Input (listens for file selection)
    if(mediaInput) { mediaInput.addEventListener('change', (e) => {
        filesToUpload = Array.from(e.target.files); // Update the global array holding files to be uploaded
        if(fileNameDisplay) { // Update the UI to show how many files were selected
             fileNameDisplay.textContent = filesToUpload.length > 0 ? `${filesToUpload.length} arquivo(s) selecionado(s)` : '';
        }
        console.log("Arquivos selecionados para upload:", filesToUpload.map(f => f.name)); // Log selected file names for debugging
    }); console.log("Listener de change para mediaInput configurado."); } else { console.warn("Input de mídia (media-input) não encontrado."); }

    // --- Galeria de Mídia e Lightbox ---
    const thumbnailGrid = document.getElementById('thumbnail-grid');
    if(thumbnailGrid) {
        // Using event delegation for clicks within the gallery
        thumbnailGrid.addEventListener('click', (e) => {
            const thumbnailItem = e.target.closest('.thumbnail-item'); // Check if a thumbnail was clicked
            const deleteButton = e.target.closest('.delete-media-btn'); // Check if a delete button was clicked

            // Clicked on Delete Media Button
            if (deleteButton) {
                e.stopPropagation(); // Prevent the click from also opening the lightbox
                const { pedidoId, mediaKey } = deleteButton.dataset; // Get order ID and media key from button
                console.log(`Botão excluir mídia clicado: Pedido ${pedidoId}, Chave ${mediaKey}`);
                // Confirm deletion with the user
                if (pedidoId && mediaKey && confirm('Tem certeza que deseja excluir esta mídia permanentemente?')) {
                    deleteButton.innerHTML = "<i class='bx bx-loader-alt bx-spin bx-xs'></i>"; // Show loading indicator
                    deleteButton.disabled = true; // Disable button
                    if(db) {
                        // Attempt to remove the media reference from Firebase
                        db.ref(`pedidos/${pedidoId}/media/${mediaKey}`).remove()
                          .then(() => {
                              console.log(`Referência de mídia ${mediaKey} removida do Firebase.`);
                              showNotification("Mídia excluída com sucesso.", "success");
                              // The gallery will refresh automatically due to the 'child_changed' listener on the order
                          })
                          .catch(err => {
                              console.error(`Erro ao excluir mídia ${mediaKey} do Firebase:`, err);
                              showNotification("Erro ao excluir mídia. Tente novamente.", "error");
                              // Restore button state on error
                              deleteButton.innerHTML = "<i class='bx bxs-trash bx-xs'></i>";
                              deleteButton.disabled = false;
                          });
                    } else {
                         // Handle missing DB connection
                         showNotification("Erro: Conexão com banco de dados perdida.", "error");
                         deleteButton.innerHTML = "<i class='bx bxs-trash bx-xs'></i>";
                         deleteButton.disabled = false;
                    }
                }
            }
            // Clicked on Thumbnail Item (to open lightbox)
            else if (thumbnailItem?.dataset.index !== undefined) {
                const index = parseInt(thumbnailItem.dataset.index);
                console.log(`Miniatura de mídia clicada, abrindo lightbox para índice: ${index}`);
                openLightbox(index); // Open lightbox for the clicked item
            }
        });
        console.log("Listener de clique para thumbnailGrid (Galeria) configurado.");
    } else { console.warn("Grid de miniaturas de mídia (thumbnail-grid) não encontrado."); }

     // --- Ações no Modal de Configuração (Remover Produto) ---
     // Uses event delegation on the modal itself
     if(configModal) { configModal.addEventListener('click', removeProdutoConfig); console.log("Listener de clique para configModal (Remover Produto) configurado."); } else { console.warn("Modal de configuração (configModal) não encontrado."); }

     // --- Busca Global ---
     if(globalSearchInput) { globalSearchInput.addEventListener('input', handleGlobalSearch); console.log("Listener de input para globalSearchInput configurado."); } else { console.warn("Input de busca global (globalSearchInput) não encontrado."); }
     // Click on a search result item
     if(globalSearchResults) { globalSearchResults.addEventListener('click', (e) => {
         const resultItem = e.target.closest('.search-result-item');
         if (resultItem?.dataset.id) { // Check if a result item with an ID was clicked
             console.log(`Resultado da busca clicado: Pedido ${resultItem.dataset.id}`);
             openDetailsModal(resultItem.dataset.id); // Open details for the clicked order
             if(globalSearchInput) globalSearchInput.value = ''; // Clear search input
             globalSearchResults.innerHTML = ''; // Clear results list
             globalSearchResults.classList.add('hidden'); // Hide results dropdown
         }
     }); console.log("Listener de clique para globalSearchResults configurado."); } else { console.warn("Container de resultados da busca (globalSearchResults) não encontrado."); }
     // Hide search results when clicking anywhere outside the search container
     document.addEventListener('click', (e) => {
         const searchContainer = e.target.closest('.search-container'); // Check if click was inside search area
         // If click was outside and results are currently visible
         if (!searchContainer && globalSearchResults && !globalSearchResults.classList.contains('hidden')) {
             globalSearchResults.classList.add('hidden'); // Hide the results
             // console.log("Resultados da busca ocultos por clique externo.");
         }
     });
     console.log("Listener de clique externo para ocultar busca configurado.");

    // --- Botão Minha Agenda ---
    if(toggleAgendaBtn) { toggleAgendaBtn.addEventListener('click', toggleMyAgendaView); console.log("Listener de clique para toggleAgendaBtn configurado."); } else { console.warn("Botão 'Minha Agenda' (toggleAgendaBtn) não encontrado."); }

    // --- Navegação por Abas do Dashboard (Vendas/Gerencial) ---
    if(dashboardNav) {
        // Using event delegation on the nav container
        dashboardNav.addEventListener('click', (e) => {
            const tabButton = e.target.closest('.dashboard-tab'); // Find the clicked tab button
            if(tabButton?.dataset.tab) { // Check if it's a valid tab button with a data-tab attribute
                console.log(`Botão da aba '${tabButton.dataset.tab}' clicado.`);
                switchDashboardTab(tabButton.dataset.tab); // Switch to the clicked tab
            }
        });
        console.log("Listener de clique para dashboardNav (Abas) configurado.");
    } else { console.warn("Navegação de abas do dashboard (dashboardNav) não encontrada."); }

    console.log("Todos os listeners de eventos da UI foram configurados.");
}; // --- FIM de setupEventListeners ---

/* ==================================================================
INICIALIZAÇÃO DA APLICAÇÃO (BLOCO REMOVIDO)
==================================================================
*/
// --- O bloco de inicialização duplicado foi REMOVIDO deste arquivo ---
// A inicialização é agora controlada EXCLUSIVAMENTE pelo 'app_setup.js'
// que chama setupEventListeners() após garantir que checkLoggedInUser() (async) foi concluído.

// --- FIM DO CÓDIGO app_logic.js ---
