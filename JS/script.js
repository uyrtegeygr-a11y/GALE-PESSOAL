// Configuração da API SheetMonkey
const SHEET_API_URL = 'https://api.sheetmonkey.io/form/v1L6XCN5YiXywb6iTBvQtQ';

// Estado da aplicação
let currentUser = null;
let photos = [];
let selectedPhotos = new Set();
let uploadedPhotoHashes = new Set(); // Para prevenir duplicatas

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
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Upload
    if (uploadForm) {
        uploadForm.addEventListener('submit', handleUpload);
    }
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }
    if (dropZone) {
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', handleDragOver);
        dropZone.addEventListener('drop', handleDrop);
    }

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Header buttons
    const logoutBtn = document.getElementById('logoutBtn');
    const syncBtn = document.getElementById('syncBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    if (syncBtn) {
        syncBtn.addEventListener('click', syncData);
    }

    // Modal
    const closeModalBtn = document.getElementById('closeModalBtn');
    const deletePhotoBtn = document.getElementById('deletePhotoBtn');
    const downloadPhotoBtn = document.getElementById('downloadPhotoBtn');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeModal);
    }
    if (deletePhotoBtn) {
        deletePhotoBtn.addEventListener('click', deleteCurrentPhoto);
    }
    if (downloadPhotoBtn) {
        downloadPhotoBtn.addEventListener('click', downloadCurrentPhoto);
    }

    // Search - CORRIGIDO: Adicionado handler de função
    const searchQuery = document.getElementById('searchQuery');
    const searchTags = document.getElementById('searchTags');
    if (searchQuery) {
        searchQuery.addEventListener('input', filterPhotos);
    }
    if (searchTags) {
        searchTags.addEventListener('input', filterPhotos);
    }

    // Bulk actions
    const clearSelectionBtn = document.getElementById('clearSelectionBtn');
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    if (clearSelectionBtn) {
        clearSelectionBtn.addEventListener('click', clearSelection);
    }
    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', deleteSelectedPhotos);
    }
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
    if (loginScreen) loginScreen.classList.remove('active');
    if (galleryScreen) galleryScreen.classList.add('active');
    const userEmailElement = document.getElementById('userEmail');
    if (userEmailElement) userEmailElement.textContent = currentUser;
    loadPhotos();
    updateStats();
}

function handleLogout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    if (galleryScreen) galleryScreen.classList.remove('active');
    if (loginScreen) loginScreen.classList.add('active');
    const emailInput = document.getElementById('email');
    if (emailInput) emailInput.value = '';
    photos = [];
    selectedPhotos.clear();
    uploadedPhotoHashes.clear();
}

// Upload de fotos
function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    displayPreview(files);
}

function handleDragOver(event) {
    event.preventDefault();
    if (dropZone) dropZone.classList.add('dragover');
}

function handleDrop(event) {
    event.preventDefault();
    if (dropZone) dropZone.classList.remove('dragover');

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
        if (previewSection) previewSection.classList.add('hidden');
        const uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) uploadBtn.disabled = true;
        return;
    }

    if (previewSection) previewSection.classList.remove('hidden');
    if (previewGrid) previewGrid.innerHTML = '';

    files.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            const previewItem = document.createElement('div');
            previewItem.className = 'preview-item';
            previewItem.innerHTML = `
                <img src="${e.target.result}" alt="${file.name}">
                <button type="button" class="preview-remove" onclick="removePreview(${index})">×</button>
            `;
            if (previewGrid) previewGrid.appendChild(previewItem);
        };
        reader.readAsDataURL(file);
    });

    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) uploadBtn.disabled = false;
}

function removePreview(index) {
    const files = Array.from(fileInput.files);
    files.splice(index, 1);
    fileInput.files = createFileList(files);
    displayPreview(files);
}

// Função para gerar hash da foto (prevenir duplicatas)
async function generatePhotoHash(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const data = e.target.result;
            // Criar hash simples baseado no conteúdo, nome e tamanho
            const hashString = data + file.name + file.size + file.lastModified;
            let hash = 0;
            for (let i = 0; i < hashString.length; i++) {
                const char = hashString.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            resolve(Math.abs(hash).toString(36));
        };
        reader.readAsDataURL(file);
    });
}

async function handleUpload(event) {
    event.preventDefault();

    const files = Array.from(fileInput.files);
    const tagsInput = document.getElementById('photoTags');
    const tags = tagsInput ? tagsInput.value.trim() : '';

    if (files.length === 0) {
        showToast('Selecione pelo menos uma foto', 'warning');
        return;
    }

    showLoading('Verificando e fazendo upload das fotos...');

    try {
        let uploadedCount = 0;
        let duplicateCount = 0;

        for (const file of files) {
            const photoHash = await generatePhotoHash(file);
            
            // Verificar se a foto já foi enviada
            if (uploadedPhotoHashes.has(photoHash)) {
                duplicateCount++;
                console.log(`Foto duplicada ignorada: ${file.name}`);
                continue;
            }

            await uploadSinglePhoto(file, tags, photoHash);
            uploadedPhotoHashes.add(photoHash);
            uploadedCount++;
        }

        // Reset form
        fileInput.value = '';
        if (tagsInput) tagsInput.value = '';
        if (previewSection) previewSection.classList.add('hidden');
        const uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) uploadBtn.disabled = true;

        hideLoading();
        loadPhotos();
        updateStats();

        // Mensagem de sucesso personalizada
        let message = '';
        if (uploadedCount > 0 && duplicateCount > 0) {
            message = `${uploadedCount} foto(s) enviada(s) com sucesso! ${duplicateCount} foto(s) duplicada(s) ignorada(s).`;
        } else if (uploadedCount > 0) {
            message = `${uploadedCount} foto(s) enviada(s) com sucesso!`;
        } else {
            message = `Todas as ${duplicateCount} foto(s) já foram enviadas anteriormente.`;
        }
        
        showToast(message, uploadedCount > 0 ? 'success' : 'warning');

        // Switch to gallery tab
        switchTab('gallery');

    } catch (error) {
        hideLoading();
        showToast('Erro ao fazer upload. Tente novamente.', 'error');
        console.error('Erro no upload:', error);
    }
}

async function uploadSinglePhoto(file, tags, photoHash) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function (e) {
            try {
                const photoData = {
                    id: generateId(),
                    name: file.name,
                    originalName: file.name,
                    data: e.target.result,
                    size: file.size,
                    type: file.type,
                    tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
                    uploadDate: new Date().toISOString(),
                    userEmail: currentUser,
                    hash: photoHash // Adicionar hash para controle de duplicatas
                };

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

// CORRIGIDO: Função para limpar banco antigo e criar novo
async function clearOldDatabase() {
    return new Promise((resolve) => {
        const deleteRequest = indexedDB.deleteDatabase('PhotoGallery');
        deleteRequest.onsuccess = () => {
            console.log('Banco antigo removido com sucesso');
            resolve();
        };
        deleteRequest.onerror = () => {
            console.log('Erro ao remover banco antigo, continuando...');
            resolve();
        };
        deleteRequest.onblocked = () => {
            console.log('Remoção do banco bloqueada, continuando...');
            resolve();
        };
    });
}

// Armazenamento local - CORRIGIDO: Problema de versão do IndexedDB
async function savePhotoLocally(photoData) {
    return new Promise(async (resolve, reject) => {
        try {
            // Primeiro, tentar abrir com versão atual
            let request = indexedDB.open('PhotoGallery');
            
            request.onerror = async () => {
                // Se falhar, limpar banco e criar novo
                await clearOldDatabase();
                const newRequest = indexedDB.open('PhotoGallery', 1);
                
                newRequest.onerror = () => reject(newRequest.error);
                
                newRequest.onsuccess = () => {
                    const db = newRequest.result;
                    const transaction = db.transaction(['photos'], 'readwrite');
                    const store = transaction.objectStore('photos');

                    const addRequest = store.add(photoData);
                    addRequest.onsuccess = () => resolve();
                    addRequest.onerror = () => reject(addRequest.error);
                };

                newRequest.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    const store = db.createObjectStore('photos', { keyPath: 'id' });
                    store.createIndex('userEmail', 'userEmail', { unique: false });
                    store.createIndex('uploadDate', 'uploadDate', { unique: false });
                    store.createIndex('hash', 'hash', { unique: false });
                };
            };

            request.onsuccess = () => {
                const db = request.result;
                
                // Verificar se o store existe
                if (!db.objectStoreNames.contains('photos')) {
                    db.close();
                    // Recriar banco com versão incrementada
                    const upgradeRequest = indexedDB.open('PhotoGallery', db.version + 1);
                    
                    upgradeRequest.onerror = () => reject(upgradeRequest.error);
                    
                    upgradeRequest.onsuccess = () => {
                        const newDb = upgradeRequest.result;
                        const transaction = newDb.transaction(['photos'], 'readwrite');
                        const store = transaction.objectStore('photos');

                        const addRequest = store.add(photoData);
                        addRequest.onsuccess = () => resolve();
                        addRequest.onerror = () => reject(addRequest.error);
                    };

                    upgradeRequest.onupgradeneeded = (event) => {
                        const newDb = event.target.result;
                        const store = newDb.createObjectStore('photos', { keyPath: 'id' });
                        store.createIndex('userEmail', 'userEmail', { unique: false });
                        store.createIndex('uploadDate', 'uploadDate', { unique: false });
                        store.createIndex('hash', 'hash', { unique: false });
                    };
                } else {
                    // Store existe, usar normalmente
                    const transaction = db.transaction(['photos'], 'readwrite');
                    const store = transaction.objectStore('photos');

                    const addRequest = store.add(photoData);
                    addRequest.onsuccess = () => resolve();
                    addRequest.onerror = () => reject(addRequest.error);
                }
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('photos')) {
                    const store = db.createObjectStore('photos', { keyPath: 'id' });
                    store.createIndex('userEmail', 'userEmail', { unique: false });
                    store.createIndex('uploadDate', 'uploadDate', { unique: false });
                    store.createIndex('hash', 'hash', { unique: false });
                }
            };
        } catch (error) {
            reject(error);
        }
    });
}

async function loadPhotos() {
    try {
        const storedPhotos = await getPhotosFromStorage();
        photos = storedPhotos.filter(photo => photo.userEmail === currentUser);
        
        // Carregar hashes das fotos existentes para prevenir duplicatas
        uploadedPhotoHashes.clear();
        photos.forEach(photo => {
            if (photo.hash) {
                uploadedPhotoHashes.add(photo.hash);
            }
        });
        
        displayPhotos(photos);
        updatePhotoCount();
    } catch (error) {
        console.error('Erro ao carregar fotos:', error);
        photos = [];
        displayPhotos([]);
    }
}

async function getPhotosFromStorage() {
    return new Promise(async (resolve, reject) => {
        try {
            let request = indexedDB.open('PhotoGallery');
            
            request.onerror = async () => {
                // Se falhar, criar banco novo
                await clearOldDatabase();
                const newRequest = indexedDB.open('PhotoGallery', 1);
                
                newRequest.onerror = () => reject(newRequest.error);
                
                newRequest.onsuccess = () => {
                    const db = newRequest.result;
                    const transaction = db.transaction(['photos'], 'readonly');
                    const store = transaction.objectStore('photos');

                    const getAllRequest = store.getAll();
                    getAllRequest.onsuccess = () => resolve(getAllRequest.result || []);
                    getAllRequest.onerror = () => reject(getAllRequest.error);
                };

                newRequest.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    const store = db.createObjectStore('photos', { keyPath: 'id' });
                    store.createIndex('userEmail', 'userEmail', { unique: false });
                    store.createIndex('uploadDate', 'uploadDate', { unique: false });
                    store.createIndex('hash', 'hash', { unique: false });
                };
            };

            request.onsuccess = () => {
                const db = request.result;
                
                if (!db.objectStoreNames.contains('photos')) {
                    // Store não existe, retornar array vazio
                    resolve([]);
                } else {
                    const transaction = db.transaction(['photos'], 'readonly');
                    const store = transaction.objectStore('photos');

                    const getAllRequest = store.getAll();
                    getAllRequest.onsuccess = () => resolve(getAllRequest.result || []);
                    getAllRequest.onerror = () => reject(getAllRequest.error);
                }
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('photos')) {
                    const store = db.createObjectStore('photos', { keyPath: 'id' });
                    store.createIndex('userEmail', 'userEmail', { unique: false });
                    store.createIndex('uploadDate', 'uploadDate', { unique: false });
                    store.createIndex('hash', 'hash', { unique: false });
                }
            };
        } catch (error) {
            reject(error);
        }
    });
}

function displayPhotos(photosToShow) {
    if (!photoGrid) return;

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

// API calls para planilha (otimizado para SheetMonkey) - MELHORADO: Prevenção de duplicatas
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
        // Verificar se já foi enviado para a planilha usando hash
        const existingUploads = JSON.parse(localStorage.getItem('uploadedToSheet') || '[]');
        if (existingUploads.includes(photoData.hash)) {
            console.log('Foto já foi enviada para a planilha anteriormente');
            return null;
        }

        // Criar thumbnail otimizado para SheetMonkey
        const thumbnailData = await createOptimizedThumbnail(photoData.data, 600, 600);

        // Verificar tamanho do base64 antes de enviar
        const base64Size = thumbnailData.length;
        console.log(`Tamanho do thumbnail: ${Math.round(base64Size / 1024)}KB`);

        // Se muito grande, reduzir mais
        let finalThumbnail = thumbnailData;
        if (base64Size > 100000) { // Se maior que ~100KB
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
                PhotoHash: photoData.hash, // Adicionar hash para controle de duplicatas
                Type: 'photo_upload'
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Marcar como enviado para a planilha
        existingUploads.push(photoData.hash);
        localStorage.setItem('uploadedToSheet', JSON.stringify(existingUploads));

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

            // Calcular dimensões mantendo proporção
            let { width, height } = img;
            const aspectRatio = width / height;

            // Redimensionar para o tamanho ideal
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

            // Configurar contexto para boa qualidade
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            // Desenhar imagem
            ctx.drawImage(img, 0, 0, width, height);

            // Retornar com qualidade otimizada (80% - equilibrio perfeito)
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = imageData;
    });
}

// Modal de foto
function openPhotoModal(photoId) {
    const photo = photos.find(p => p.id === photoId);
    if (!photo || !photoModal) return;

    const modalPhotoName = document.getElementById('modalPhotoName');
    const modalPhoto = document.getElementById('modalPhoto');
    const modalOriginalName = document.getElementById('modalOriginalName');
    const modalUploadDate = document.getElementById('modalUploadDate');
    const modalFileSize = document.getElementById('modalFileSize');
    const modalFileType = document.getElementById('modalFileType');

    if (modalPhotoName) modalPhotoName.textContent = photo.name;
    if (modalPhoto) modalPhoto.src = photo.data;
    if (modalOriginalName) modalOriginalName.textContent = photo.originalName;
    if (modalUploadDate) modalUploadDate.textContent = formatDate(photo.uploadDate);
    if (modalFileSize) modalFileSize.textContent = formatFileSize(photo.size);
    if (modalFileType) modalFileType.textContent = photo.type;

    const tagsContainer = document.getElementById('modalTags');
    const modalTagsSection = document.getElementById('modalTagsSection');
    if (tagsContainer && modalTagsSection) {
        if (photo.tags.length > 0) {
            tagsContainer.innerHTML = photo.tags.map(tag => `<span class="tag">${tag}</span>`).join('');
            modalTagsSection.style.display = 'flex';
        } else {
            modalTagsSection.style.display = 'none';
        }
    }

    photoModal.classList.remove('hidden');
    photoModal.dataset.currentPhotoId = photoId;
}

function closeModal() {
    if (photoModal) photoModal.classList.add('hidden');
}

async function deleteCurrentPhoto() {
    if (!photoModal) return;
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
    if (!photoModal) return;
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

    if (bulkActions && selectedCount) {
        if (selectedPhotos.size > 0) {
            bulkActions.classList.remove('hidden');
            selectedCount.textContent = `${selectedPhotos.size} foto${selectedPhotos.size > 1 ? 's' : ''} selecionada${selectedPhotos.size > 1 ? 's' : ''}`;
        } else {
            bulkActions.classList.add('hidden');
        }
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
        const request = indexedDB.open('PhotoGallery');

        request.onerror = () => reject(request.error);

        request.onsuccess = () => {
            const db = request.result;
            
            if (!db.objectStoreNames.contains('photos')) {
                resolve(); // Se não existe, considerar como deletado
                return;
            }
            
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
    const searchQuery = document.getElementById('searchQuery');
    const searchTags = document.getElementById('searchTags');
    
    const query = searchQuery ? searchQuery.value.toLowerCase() : '';
    const tags = searchTags ? searchTags.value.toLowerCase() : '';

    let filteredPhotos = photos;

    if (query) {
        filteredPhotos = filteredPhotos.filter(photo =>
            photo.name.toLowerCase().includes(query) ||
            photo.originalName.toLowerCase().includes(query)
        );
    }

    if (tags) {
        const searchTagsArray = tags.split(',').map(tag => tag.trim());
        filteredPhotos = filteredPhotos.filter(photo =>
            searchTagsArray.some(searchTag =>
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
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeTab) activeTab.classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    const activeContent = document.getElementById(`${tabName}Tab`);
    if (activeContent) activeContent.classList.add('active');
}

// Sincronização
async function syncData() {
    showLoading('Sincronizando dados...');

    try {
        // Tentar sincronizar dados com a planilha
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

    // Estatísticas locais
    const localPhotoCount = document.getElementById('localPhotoCount');
    const totalPhotos = document.getElementById('totalPhotos');
    if (localPhotoCount) localPhotoCount.textContent = `${photos.length} fotos armazenadas`;
    if (totalPhotos) totalPhotos.textContent = photos.length;

    // Uploads hoje
    const today = new Date().toDateString();
    const todayUploads = photos.filter(photo =>
        new Date(photo.uploadDate).toDateString() === today
    ).length;
    const todayUploadsElement = document.getElementById('todayUploads');
    if (todayUploadsElement) todayUploadsElement.textContent = todayUploads;

    // Usuários únicos (simulado localmente)
    const uniqueUsers = new Set([currentUser]).size;
    const uniqueUsersElement = document.getElementById('uniqueUsers');
    if (uniqueUsersElement) uniqueUsersElement.textContent = uniqueUsers;
}

function updatePhotoCount() {
    const count = photos.length;
    const photoCountElement = document.getElementById('photoCount');
    if (photoCountElement) {
        photoCountElement.textContent = `${count} foto${count !== 1 ? 's' : ''}`;
    }
}

// Utilitários
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
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
    const loadingText = document.getElementById('loadingText');
    if (loadingText) loadingText.textContent = text;
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
}

function showToast(message, type = 'info') {
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 5000);
}

function loadStoredData() {
    // Carregar dados armazenados se necessário
    if (currentUser) {
        loadPhotos();
        updateStats();
    }
}

// Event listeners para modal (fechar ao clicar fora)
if (photoModal) {
    photoModal.addEventListener('click', function (event) {
        if (event.target === photoModal) {
            closeModal();
        }
    });
}

// Keyboard shortcuts
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        if (photoModal && !photoModal.classList.contains('hidden')) {
            closeModal();
        }
    }
});

// Tornar funções globais para uso inline
window.removePreview = removePreview;
window.openPhotoModal = openPhotoModal;
window.togglePhotoSelection = togglePhotoSelection;
