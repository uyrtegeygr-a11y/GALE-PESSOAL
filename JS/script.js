// Configuração da API SheetMonkey
const SHEET_API_URL = 'https://api.sheetmonkey.io/form/sqnHjsqh4R7RQ8Fu9iE4n9';

// Estado da aplicação
let currentUser = null;
let photos = [];
let selectedPhotos = new Set();
let isUploading = false; // Prevenir uploads simultâneos

// Elementos DOM
const loginScreen = document.getElementById('loginScreen');
const galleryScreen = document.getElementById('galleryScreen');
const loginForm = document.getElementById('loginForm');
const uploadForm = document.getElementById('uploadForm');
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const previewSection = document.getElementById('previewSection');
const previewGrid = document.getElementById('previewGrid');
const photoGrid = document.getElementById('photoGrid');
const photoModal = document.getElementById('photoModal');
const loadingOverlay = document.getElementById('loadingOverlay');
const toastContainer = document.getElementById('toastContainer');

// Inicialização
document.addEventListener('DOMContentLoaded', function () {
    initializeApp();
    setupEventListeners();
    loadStoredData();
});

function initializeApp() {
    // Verificar se há usuário logado
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
        currentUser = storedUser;
        showGalleryScreen();
    }
}

function setupEventListeners() {
    // Login
    loginForm.addEventListener('submit', handleLogin);

    // Upload
    uploadForm.addEventListener('submit', handleUpload);
    fileInput.addEventListener('change', handleFileSelect);
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('drop', handleDrop);

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Header buttons
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('syncBtn').addEventListener('click', syncData);

    // Modal
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('deletePhotoBtn').addEventListener('click', deleteCurrentPhoto);
    document.getElementById('downloadPhotoBtn').addEventListener('click', downloadCurrentPhoto);

    // Search
    document.getElementById('searchQuery').addEventListener('input', debounce(filterPhotos, 300));
    document.getElementById('searchTags').addEventListener('input', debounce(filterPhotos, 300));

    // Bulk actions
    document.getElementById('clearSelectionBtn').addEventListener('click', clearSelection);
    document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelectedPhotos);
}

// Login
async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();

    if (!email) {
        showToast('Por favor, insira um email válido', 'error');
        return;
    }

    // Validação básica de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showToast('Por favor, insira um email válido', 'error');
        return;
    }

    showLoading('Fazendo login...');

    try {
        // Fazer login localmente primeiro
        currentUser = email;
        localStorage.setItem('currentUser', email);

        // Tentar logar na planilha (não bloquear o login se falhar)
        logUserActivity(email, 'login').catch(error => {
            console.warn('Aviso: Não foi possível logar atividade na planilha:', error);
            showToast('Login realizado (modo offline)', 'warning');
        });

        hideLoading();
        showGalleryScreen();
        showToast('Login realizado com sucesso!', 'success');

    } catch (error) {
        hideLoading();
        showToast('Erro ao fazer login. Tente novamente.', 'error');
        console.error('Erro no login:', error);
    }
}

function showGalleryScreen() {
    loginScreen.classList.remove('active');
    galleryScreen.classList.add('active');
    document.getElementById('userEmail').textContent = currentUser;
    loadPhotos();
    updateStats();
}

function handleLogout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    galleryScreen.classList.remove('active');
    loginScreen.classList.add('active');
    document.getElementById('email').value = '';
    photos = [];
    selectedPhotos.clear();
}

// Upload de fotos
function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    displayPreview(files);
}

function handleDragOver(event) {
    event.preventDefault();
    dropZone.classList.add('dragover');
}

function handleDrop(event) {
    event.preventDefault();
    dropZone.classList.remove('dragover');

    const files = Array.from(event.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    if (files.length > 0) {
        fileInput.files = createFileList(files);
        displayPreview(files);
    }
}

function createFileList(files) {
    const dt = new DataTransfer();
    files.forEach(file => dt.items.add(file));
    return dt.files;
}

function displayPreview(files) {
    if (files.length === 0) {
        previewSection.classList.add('hidden');
        document.getElementById('uploadBtn').disabled = true;
        return;
    }

    previewSection.classList.remove('hidden');
    previewGrid.innerHTML = '';

    files.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            const previewItem = document.createElement('div');
            previewItem.className = 'preview-item';
            previewItem.innerHTML = `
                <img src="${e.target.result}" alt="${file.name}">
                <button type="button" class="preview-remove" onclick="removePreview(${index})">×</button>
            `;
            previewGrid.appendChild(previewItem);
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('uploadBtn').disabled = false;
}

function removePreview(index) {
    const files = Array.from(fileInput.files);
    files.splice(index, 1);
    fileInput.files = createFileList(files);
    displayPreview(files);
}

async function handleUpload(event) {
    event.preventDefault();

    // Prevenir uploads simultâneos
    if (isUploading) {
        showToast('Upload já em andamento. Aguarde...', 'warning');
        return;
    }

    const files = Array.from(fileInput.files);
    const tags = document.getElementById('photoTags').value.trim();

    if (files.length === 0) {
        showToast('Selecione pelo menos uma foto', 'warning');
        return;
    }

    // Verificar duplicatas antes do upload
    const duplicates = await checkForDuplicates(files);
    if (duplicates.length > 0) {
        const duplicateNames = duplicates.map(f => f.name).join(', ');
        if (!confirm(`As seguintes fotos já existem: ${duplicateNames}\n\nDeseja continuar mesmo assim?`)) {
            return;
        }
    }

    isUploading = true;
    document.getElementById('uploadBtn').disabled = true;
    showLoading(`Fazendo upload de ${files.length} foto(s)...`);

    try {
        let successCount = 0;
        let errorCount = 0;

        for (const [index, file] of files.entries()) {
            try {
                showLoading(`Fazendo upload da foto ${index + 1} de ${files.length}...`);
                await uploadSinglePhoto(file, tags);
                successCount++;
            } catch (error) {
                console.error(`Erro no upload da foto ${file.name}:`, error);
                errorCount++;
            }
        }

        // Reset form
        fileInput.value = '';
        document.getElementById('photoTags').value = '';
        previewSection.classList.add('hidden');
        document.getElementById('uploadBtn').disabled = true;

        hideLoading();
        await loadPhotos(); // Recarregar fotos após upload
        updateStats();

        if (successCount > 0) {
            showToast(`${successCount} foto(s) enviada(s) com sucesso!`, 'success');
        }
        if (errorCount > 0) {
            showToast(`${errorCount} foto(s) falharam no upload`, 'error');
        }

        // Switch to gallery tab
        switchTab('gallery');

    } catch (error) {
        hideLoading();
        showToast('Erro ao fazer upload. Tente novamente.', 'error');
        console.error('Erro no upload:', error);
    } finally {
        isUploading = false;
        document.getElementById('uploadBtn').disabled = false;
    }
}

async function checkForDuplicates(files) {
    const duplicates = [];
    
    for (const file of files) {
        const fileHash = await generateFileHash(file);
        const existingPhoto = photos.find(photo => 
            photo.name === file.name || 
            photo.fileHash === fileHash ||
            (photo.size === file.size && photo.type === file.type)
        );
        
        if (existingPhoto) {
            duplicates.push(file);
        }
    }
    
    return duplicates;
}

async function generateFileHash(file) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function uploadSinglePhoto(file, tags) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function (e) {
            try {
                const fileHash = await generateFileHash(file);
                
                const photoData = {
                    id: generateUniqueId(),
                    name: file.name,
                    originalName: file.name,
                    data: e.target.result,
                    size: file.size,
                    type: file.type,
                    fileHash: fileHash,
                    tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
                    uploadDate: new Date().toISOString(),
                    userEmail: currentUser
                };

                // Verificar se já existe uma foto com o mesmo hash
                const existingPhoto = photos.find(photo => photo.fileHash === fileHash);
                if (existingPhoto) {
                    console.warn(`Foto duplicada detectada: ${file.name}`);
                    resolve(); // Não falhar, apenas pular
                    return;
                }

                // Salvar localmente
                await savePhotoLocally(photoData);

                // Tentar enviar para a planilha (não bloquear se falhar)
                logPhotoUpload(photoData).catch(error => {
                    console.warn('Aviso: Não foi possível logar upload na planilha:', error);
                });

                resolve();
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Armazenamento local
async function savePhotoLocally(photoData) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('PhotoGallery', 2); // Incrementar versão

        request.onerror = () => reject(request.error);

        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['photos'], 'readwrite');
            const store = transaction.objectStore('photos');

            // Verificar duplicata antes de adicionar
            const checkRequest = store.get(photoData.id);
            checkRequest.onsuccess = () => {
                if (checkRequest.result) {
                    console.warn(`Foto com ID ${photoData.id} já existe`);
                    resolve(); // Não adicionar duplicata
                    return;
                }

                const addRequest = store.add(photoData);
                addRequest.onsuccess = () => resolve();
                addRequest.onerror = () => reject(addRequest.error);
            };
            checkRequest.onerror = () => reject(checkRequest.error);
        };

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('photos')) {
                const store = db.createObjectStore('photos', { keyPath: 'id' });
                store.createIndex('userEmail', 'userEmail', { unique: false });
                store.createIndex('uploadDate', 'uploadDate', { unique: false });
                store.createIndex('fileHash', 'fileHash', { unique: true }); // Índice único para hash
            } else {
                // Atualizar store existente
                const transaction = request.transaction;
                const store = transaction.objectStore('photos');
                if (!store.indexNames.contains('fileHash')) {
                    store.createIndex('fileHash', 'fileHash', { unique: true });
                }
            }
        };
    });
}

async function loadPhotos() {
    try {
        const storedPhotos = await getPhotosFromStorage();
        photos = storedPhotos.filter(photo => photo.userEmail === currentUser);
        
        // Remover duplicatas baseadas em hash se existirem
        const uniquePhotos = [];
        const seenHashes = new Set();
        
        for (const photo of photos) {
            if (photo.fileHash && seenHashes.has(photo.fileHash)) {
                // Remover duplicata do storage
                await deletePhotoFromStorage(photo.id);
                continue;
            }
            
            if (photo.fileHash) {
                seenHashes.add(photo.fileHash);
            }
            uniquePhotos.push(photo);
        }
        
        photos = uniquePhotos;
        displayPhotos(photos);
        updatePhotoCount();
    } catch (error) {
        console.error('Erro ao carregar fotos:', error);
        photos = [];
        displayPhotos([]);
    }
}

async function getPhotosFromStorage() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('PhotoGallery', 2);

        request.onerror = () => reject(request.error);

        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['photos'], 'readonly');
            const store = transaction.objectStore('photos');

            const getAllRequest = store.getAll();
            getAllRequest.onsuccess = () => resolve(getAllRequest.result || []);
            getAllRequest.onerror = () => reject(getAllRequest.error);
        };

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('photos')) {
                const store = db.createObjectStore('photos', { keyPath: 'id' });
                store.createIndex('userEmail', 'userEmail', { unique: false });
                store.createIndex('uploadDate', 'uploadDate', { unique: false });
                store.createIndex('fileHash', 'fileHash', { unique: true });
            }
        };
    });
}

function displayPhotos(photosToShow) {
    if (photosToShow.length === 0) {
        photoGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-images"></i>
                <h3>Nenhuma foto encontrada</h3>
                <p>Faça upload de algumas fotos para começar</p>
            </div>
        `;
        return;
    }

    photoGrid.innerHTML = photosToShow.map(photo => `
        <div class="photo-item" onclick="openPhotoModal('${photo.id}')">
            <input type="checkbox" class="photo-checkbox" onclick="event.stopPropagation(); togglePhotoSelection('${photo.id}')" ${selectedPhotos.has(photo.id) ? 'checked' : ''}>
            <img src="${photo.data}" alt="${photo.name}" loading="lazy">
            <div class="photo-info">
                <div class="photo-name">${photo.name}</div>
                <div class="photo-date">${formatDate(photo.uploadDate)}</div>
                <div class="photo-tags">
                    ${photo.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                </div>
            </div>
        </div>
    `).join('');
}

// API calls para planilha (otimizado para SheetMonkey)
async function logUserActivity(email, activity) {
    try {
        const response = await fetch(SHEET_API_URL, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                Email: email,
                Activity: activity,
                Timestamp: new Date().toISOString(),
                Type: 'user_activity'
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Erro ao logar atividade do usuário:', error);
        return null;
    }
}

async function logPhotoUpload(photoData) {
    try {
        const thumbnailData = await createOptimizedThumbnail(photoData.data, 600, 600);

        const base64Size = thumbnailData.length;
        console.log(`Tamanho do thumbnail: ${Math.round(base64Size / 1024)}KB`);

        let finalThumbnail = thumbnailData;
        if (base64Size > 100000) {
            finalThumbnail = await createOptimizedThumbnail(photoData.data, 500, 500);
            console.log('Thumbnail reduzido para compatibilidade com SheetMonkey');
        }

        const response = await fetch(SHEET_API_URL, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                Email: photoData.userEmail,
                PhotoName: photoData.name,
                PhotoSize: photoData.size,
                PhotoType: photoData.type,
                Tags: photoData.tags.join(', '),
                UploadDate: photoData.uploadDate,
                Thumbnail: finalThumbnail,
                PhotoHash: photoData.fileHash,
                Type: 'photo_upload'
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Erro ao logar upload da foto:', error);
        return null;
    }
}

async function createOptimizedThumbnail(imageData, maxWidth, maxHeight) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            let { width, height } = img;
            const aspectRatio = width / height;

            if (width > height) {
                if (width > maxWidth) {
                    width = maxWidth;
                    height = width / aspectRatio;
                }
            } else {
                if (height > maxHeight) {
                    height = maxHeight;
                    width = height * aspectRatio;
                }
            }

            canvas.width = width;
            canvas.height = height;

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            ctx.drawImage(img, 0, 0, width, height);

            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = imageData;
    });
}

// Modal de foto
function openPhotoModal(photoId) {
    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;

    document.getElementById('modalPhotoName').textContent = photo.name;
    document.getElementById('modalPhoto').src = photo.data;
    document.getElementById('modalOriginalName').textContent = photo.originalName;
    document.getElementById('modalUploadDate').textContent = formatDate(photo.uploadDate);
    document.getElementById('modalFileSize').textContent = formatFileSize(photo.size);
    document.getElementById('modalFileType').textContent = photo.type;

    const tagsContainer = document.getElementById('modalTags');
    if (photo.tags.length > 0) {
        tagsContainer.innerHTML = photo.tags.map(tag => `<span class="tag">${tag}</span>`).join('');
        document.getElementById('modalTagsSection').style.display = 'flex';
    } else {
        document.getElementById('modalTagsSection').style.display = 'none';
    }

    photoModal.classList.remove('hidden');
    photoModal.dataset.currentPhotoId = photoId;
}

function closeModal() {
    photoModal.classList.add('hidden');
}

async function deleteCurrentPhoto() {
    const photoId = photoModal.dataset.currentPhotoId;
    if (!photoId) return;

    if (!confirm('Tem certeza que deseja excluir esta foto?')) return;

    try {
        await deletePhotoFromStorage(photoId);
        photos = photos.filter(p => p.id !== photoId);
        displayPhotos(photos);
        updatePhotoCount();
        closeModal();
        showToast('Foto excluída com sucesso!', 'success');
    } catch (error) {
        showToast('Erro ao excluir foto', 'error');
        console.error('Erro ao excluir foto:', error);
    }
}

function downloadCurrentPhoto() {
    const photoId = photoModal.dataset.currentPhotoId;
    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;

    const link = document.createElement('a');
    link.href = photo.data;
    link.download = photo.originalName;
    link.click();
}

// Seleção múltipla
function togglePhotoSelection(photoId) {
    if (selectedPhotos.has(photoId)) {
        selectedPhotos.delete(photoId);
    } else {
        selectedPhotos.add(photoId);
    }

    updateBulkActions();
}

function updateBulkActions() {
    const bulkActions = document.getElementById('bulkActions');
    const selectedCount = document.getElementById('selectedCount');

    if (selectedPhotos.size > 0) {
        bulkActions.classList.remove('hidden');
        selectedCount.textContent = `${selectedPhotos.size} foto${selectedPhotos.size > 1 ? 's' : ''} selecionada${selectedPhotos.size > 1 ? 's' : ''}`;
    } else {
        bulkActions.classList.add('hidden');
    }
}

function clearSelection() {
    selectedPhotos.clear();
    updateBulkActions();
    displayPhotos(photos);
}

async function deleteSelectedPhotos() {
    if (selectedPhotos.size === 0) return;

    if (!confirm(`Tem certeza que deseja excluir ${selectedPhotos.size} foto(s)?`)) return;

    showLoading('Excluindo fotos...');

    try {
        for (const photoId of selectedPhotos) {
            await deletePhotoFromStorage(photoId);
        }

        photos = photos.filter(p => !selectedPhotos.has(p.id));
        selectedPhotos.clear();

        displayPhotos(photos);
        updatePhotoCount();
        updateBulkActions();

        hideLoading();
        showToast('Fotos excluídas com sucesso!', 'success');
    } catch (error) {
        hideLoading();
        showToast('Erro ao excluir fotos', 'error');
        console.error('Erro ao excluir fotos:', error);
    }
}

async function deletePhotoFromStorage(photoId) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('PhotoGallery', 2);

        request.onerror = () => reject(request.error);

        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['photos'], 'readwrite');
            const store = transaction.objectStore('photos');

            const deleteRequest = store.delete(photoId);
            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = () => reject(deleteRequest.error);
        };
    });
}

// Filtros e busca
function filterPhotos() {
    const query = document.getElementById('searchQuery').value.toLowerCase();
    const tags = document.getElementById('searchTags').value.toLowerCase();

    let filteredPhotos = photos;

    if (query) {
        filteredPhotos = filteredPhotos.filter(photo =>
            photo.name.toLowerCase().includes(query) ||
            photo.originalName.toLowerCase().includes(query)
        );
    }

    if (tags) {
        const searchTags = tags.split(',').map(tag => tag.trim());
        filteredPhotos = filteredPhotos.filter(photo =>
            searchTags.some(searchTag =>
                photo.tags.some(photoTag =>
                    photoTag.toLowerCase().includes(searchTag)
                )
            )
        );
    }

    displayPhotos(filteredPhotos);
}

// Tabs
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}Tab`).classList.add('active');
}

// Sincronização
async function syncData() {
    showLoading('Sincronizando dados...');

    try {
        if (currentUser) {
            await logUserActivity(currentUser, 'sync');
        }

        hideLoading();
        showToast('Dados sincronizados com sucesso!', 'success');
    } catch (error) {
        hideLoading();
        showToast('Sincronização realizada localmente', 'warning');
        console.warn('Erro na sincronização:', error);
    }
}

// Estatísticas
function updateStats() {
    updatePhotoCount();

    document.getElementById('localPhotoCount').textContent = `${photos.length} fotos armazenadas`;
    document.getElementById('totalPhotos').textContent = photos.length;

    const today = new Date().toDateString();
    const todayUploads = photos.filter(photo =>
        new Date(photo.uploadDate).toDateString() === today
    ).length;
    document.getElementById('todayUploads').textContent = todayUploads;

    const uniqueUsers = new Set([currentUser]).size;
    document.getElementById('uniqueUsers').textContent = uniqueUsers;
}

function updatePhotoCount() {
    const count = photos.length;
    document.getElementById('photoCount').textContent = `${count} foto${count !== 1 ? 's' : ''}`;
}

// Utilitários
function generateUniqueId() {
    // Gerar ID mais único combinando timestamp, random e counter
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    const counter = (generateUniqueId.counter = (generateUniqueId.counter || 0) + 1).toString(36);
    return `${timestamp}-${random}-${counter}`;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showLoading(text = 'Carregando...') {
    document.getElementById('loadingText').textContent = text;
    loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 5000);
}

function loadStoredData() {
    if (currentUser) {
        loadPhotos();
        updateStats();
    }
}

// Função debounce para otimizar busca
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Event listeners para modal (fechar ao clicar fora)
photoModal.addEventListener('click', function (event) {
    if (event.target === photoModal) {
        closeModal();
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        if (!photoModal.classList.contains('hidden')) {
            closeModal();
        }
    }
});

// Tornar funções globais para uso inline
window.removePreview = removePreview;
window.openPhotoModal = openPhotoModal;
window.togglePhotoSelection = togglePhotoSelection;
