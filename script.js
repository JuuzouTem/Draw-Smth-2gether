// Firebase'i başlat (config.js'den gelen firebaseConfig ile)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- DOM Elementleri ---
const screens = document.querySelectorAll('.screen');
const setupScreen = document.getElementById('setup-screen');
const waitingScreen = document.getElementById('waiting-screen');
const gameScreen = document.getElementById('game-screen');
const resultsScreen = document.getElementById('results-screen');

const createSessionBtn = document.getElementById('create-session-btn');
const themeInput = document.getElementById('theme-input');
const timeSelect = document.getElementById('time-select');
const shareLinkInput = document.getElementById('share-link');
const copyLinkBtn = document.getElementById('copy-link-btn');

const gameTheme = document.getElementById('game-theme');
const timerDisplay = document.getElementById('timer');

// Oyuncu 1 (Kullanıcı)
const p1UploadInput = document.getElementById('p1-upload-input');
const p1Preview = document.getElementById('p1-preview');
const p1UploadLabel = document.querySelector('label[for="p1-upload-input"]');
const p1ReadyBtn = document.getElementById('p1-ready-btn');
const p1Status = document.getElementById('p1-status');

// Oyuncu 2 (Arkadaş)
const p2Preview = document.getElementById('p2-preview');
const p2Placeholder = document.getElementById('p2-placeholder');
const p2Status = document.getElementById('p2-status');

// Sonuç Ekranı
const resultTheme = document.getElementById('result-theme');
const resultImg1 = document.getElementById('result-img1');
const resultImg2 = document.getElementById('result-img2');
const newGameBtn = document.getElementById('new-game-btn');

// --- Global Değişkenler ---
let currentSessionId = null;
let currentPlayerId = null;
let unsubscribe; // Firestore dinleyicisini tutar
let timerInterval; // Zamanlayıcıyı tutar

// --- Fonksiyonlar ---

// Belirtilen ID'ye sahip ekranı gösterir
function showScreen(screenId) {
    screens.forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// Saniyeyi "dakika:saniye" formatına çevirir
function formatTime(seconds) {
    if (seconds === 0) return "Unlimited";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Yeni bir oyun odası oluşturur
async function createNewSession() {
    const theme = themeInput.value.trim();
    const duration = parseInt(timeSelect.value);

    if (!theme) {
        alert('Please enter a theme!');
        return;
    }

    try {
        const sessionRef = await db.collection('sessions').add({
            theme: theme,
            duration: duration,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'waiting', // Durumlar: waiting, in-progress, finished
            players: {
                p1: { uploaded: false, ready: false, imageUrl: '' },
                p2: { uploaded: false, ready: false, imageUrl: '' }
            }
        });

        currentSessionId = sessionRef.id;
        currentPlayerId = 'p1';
        
        const link = `${window.location.origin}${window.location.pathname}?session=${currentSessionId}`;
        shareLinkInput.value = link;
        
        history.pushState(null, '', `?session=${currentSessionId}`);
        
        showScreen('waiting-screen');
        listenToSession();

    } catch (error) {
        console.error("Error while creating room:", error);
        alert("The room could not be created. Please try again.");
    }
}

// Paylaşım linkini kopyalar
function copyShareLink() {
    shareLinkInput.select();
    document.execCommand('copy');
    copyLinkBtn.textContent = 'Copied!';
    setTimeout(() => { copyLinkBtn.textContent = 'Copy'; }, 2000);
}

// Firestore'daki oda verisini gerçek zamanlı dinler
function listenToSession() {
    if (unsubscribe) unsubscribe();

    unsubscribe = db.collection('sessions').doc(currentSessionId)
        .onSnapshot(doc => {
            if (!doc.exists) {
                alert("The room could not be found or has been deleted.");
                window.location.href = window.location.origin + window.location.pathname;
                return;
            }

            const sessionData = doc.data();
            
            updateUI(sessionData);

            const p1Ready = sessionData.players.p1.ready;
            const p2Ready = sessionData.players.p2.ready;
            
            if (sessionData.status === 'in-progress' && p1Ready && p2Ready) {
                finishGame();
            }

            if (sessionData.status === 'finished') {
                showResults(sessionData);
            }
        });
}

// Gelen veriye göre arayüzü günceller
function updateUI(data) {
    gameTheme.textContent = `Theme: ${data.theme}`;
    resultTheme.textContent = `Theme: ${data.theme}`;
    
    if (data.status === 'waiting' && currentPlayerId === 'p2') {
         db.collection('sessions').doc(currentSessionId).update({ status: 'in-progress' });
    }
    
    if (data.status === 'in-progress' && !gameScreen.classList.contains('active')) {
        showScreen('game-screen');
        if (data.createdAt) { // createdAt verisi geldiyse zamanlayıcıyı başlat
            startTimer(data.duration, data.createdAt);
        }
    }
    
    const friendId = currentPlayerId === 'p1' ? 'p2' : 'p1';
    const friendData = data.players[friendId];
    
    p2Status.textContent = friendData.uploaded ? (friendData.ready ? 'Ready!' : 'Image Uploaded') : 'Image is waiting...';
    if(friendData.ready){
        p2Placeholder.textContent = '✓';
        p2Placeholder.style.color = '#4caf50';
    }
}

// Zamanlayıcıyı başlatır
function startTimer(duration, startTime) {
    if (duration === 0) {
        timerDisplay.textContent = 'Time: Unlimited';
        return;
    }
    if (timerInterval) clearInterval(timerInterval);

    const endTime = startTime.toDate().getTime() + duration * 1000;

    timerInterval = setInterval(() => {
        const now = new Date().getTime();
        const remaining = Math.round((endTime - now) / 1000);

        if (remaining <= 0) {
            clearInterval(timerInterval);
            timerDisplay.textContent = "Time's up!";
            finishGame();
        } else {
            timerDisplay.textContent = `Time: ${formatTime(remaining)}`;
        }
    }, 1000);
}

// Oyunu bitirir ve durumu "finished" olarak günceller
function finishGame() {
    if (unsubscribe) unsubscribe();
    clearInterval(timerInterval);
    // Durumun zaten "finished" olup olmadığını kontrol edip gereksiz yazmayı önleyebiliriz.
    db.collection('sessions').doc(currentSessionId).get().then(doc => {
        if (doc.exists && doc.data().status !== 'finished') {
            db.collection('sessions').doc(currentSessionId).update({ status: 'finished' });
        }
    });
}

// Sonuçları gösterir
function showResults(data) {
    showScreen('results-screen');
    const p1ImageUrl = data.players.p1.imageUrl;
    const p2ImageUrl = data.players.p2.imageUrl;

    // Arayüzde kimin çiziminin nerede görüneceğini ayarlar
    // "Senin Çizimin" her zaman solda gösterilir
    if (currentPlayerId === 'p1') {
        resultImg1.src = p1ImageUrl || 'https://via.placeholder.com/350?text=No+Image';
        resultImg2.src = p2ImageUrl || 'https://via.placeholder.com/350?text=No+Image';
    } else { // Eğer siz Oyuncu 2 iseniz
        resultImg1.src = p2ImageUrl || 'https://via.placeholder.com/350?text=No+Image';
        resultImg2.src = p1ImageUrl || 'https://via.placeholder.com/350?text=No+Image';
    }
}

// Dosya seçildiğinde çalışır ve Cloudinary'ye yükler
async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    p1Status.textContent = 'Loading...';
    p1UploadLabel.style.display = 'none';

    const uploadToCloudinary = async (fileToUpload) => {
        const CLOUD_NAME = "dpxmx5bsx";
        const UPLOAD_PRESET = "drawst";
        const URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
        const formData = new FormData();
        formData.append('file', fileToUpload);
        formData.append('upload_preset', UPLOAD_PRESET);
        
        try {
            const response = await fetch(URL, { method: 'POST', body: formData });
            if (!response.ok) throw new Error('Upload failed.');
            const data = await response.json();
            return data.secure_url;
        } catch (error) {
            console.error("Cloudinary upload error:", error);
            return null;
        }
    };

    const imageUrl = await uploadToCloudinary(file);

    if (imageUrl) {
        await db.collection('sessions').doc(currentSessionId).update({
            [`players.${currentPlayerId}.imageUrl`]: imageUrl,
            [`players.${currentPlayerId}.uploaded`]: true
        });

        p1Preview.src = imageUrl;
        p1Preview.style.display = 'block';
        p1Status.textContent = 'Uploaded! Press Finished when ready.';
        p1ReadyBtn.disabled = false;
    } else {
        p1Status.textContent = 'Upload failed!';
        p1UploadLabel.style.display = 'block';
    }
}

// "Bitti" butonuna basıldığında oyuncuyu hazır olarak işaretler
function setPlayerReady() {
    db.collection('sessions').doc(currentSessionId).update({
        [`players.${currentPlayerId}.ready`]: true
    });
    p1ReadyBtn.disabled = true;
    p1ReadyBtn.textContent = 'Waiting for Friend...';
    p1Status.textContent = "You're ready!";
}

// "Yeni Oyun" butonuna basıldığında sayfayı yeniler
function startNewGame() {
    window.location.href = window.location.origin + window.location.pathname;
}

// Sayfa ilk yüklendiğinde çalışır
function handlePageLoad() {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');

    if (sessionId) { // Eğer URL'de bir oda ID'si varsa, odaya katıl
        db.collection('sessions').doc(sessionId).get().then(doc => {
            if (doc.exists) {
                currentSessionId = sessionId;
                currentPlayerId = 'p2';
                listenToSession();
            } else {
                alert("Invalid room link!");
                history.replaceState(null, '', window.location.pathname);
                showScreen('setup-screen');
            }
        });
    } else { // Yoksa, yeni oda oluşturma ekranını göster
        showScreen('setup-screen');
    }
}

// --- Event Listeners (Olay Dinleyicileri) ---
createSessionBtn.addEventListener('click', createNewSession);
copyLinkBtn.addEventListener('click', copyShareLink);
p1UploadInput.addEventListener('change', handleFileUpload);
p1ReadyBtn.addEventListener('click', setPlayerReady);
newGameBtn.addEventListener('click', startNewGame);
window.addEventListener('load', handlePageLoad);