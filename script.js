firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

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

const p1UploadInput = document.getElementById('p1-upload-input');
const p1Preview = document.getElementById('p1-preview');
const p1UploadLabel = document.querySelector('label[for="p1-upload-input"]');
const p1ReadyBtn = document.getElementById('p1-ready-btn');
const p1Status = document.getElementById('p1-status');

const p2Preview = document.getElementById('p2-preview');
const p2Placeholder = document.getElementById('p2-placeholder');
const p2Status = document.getElementById('p2-status');

const resultTheme = document.getElementById('result-theme');
const resultImg1 = document.getElementById('result-img1');
const resultImg2 = document.getElementById('result-img2');
const newGameBtn = document.getElementById('new-game-btn');

let currentSessionId = null;
let currentPlayerId = null;
let unsubscribe;
let timerInterval;


function showScreen(screenId) {
    screens.forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

function formatTime(seconds) {
    if (seconds === 0) return "Unlimited";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

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

function copyShareLink() {
    shareLinkInput.select();
    document.execCommand('copy');
    copyLinkBtn.textContent = 'Copied!';
    setTimeout(() => { copyLinkBtn.textContent = 'Copy'; }, 2000);
}

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

function finishGame() {
    if (unsubscribe) unsubscribe();
    clearInterval(timerInterval);
    db.collection('sessions').doc(currentSessionId).get().then(doc => {
        if (doc.exists && doc.data().status !== 'finished') {
            db.collection('sessions').doc(currentSessionId).update({ status: 'finished' });
        }
    });
}

function showResults(data) {
    showScreen('results-screen');

    let myImageUrl;
    let friendImageUrl;

    if (currentPlayerId === 'p1') {
        myImageUrl = data.players.p1.imageUrl;
        friendImageUrl = data.players.p2.imageUrl;
    } 
    else {
        myImageUrl = data.players.p2.imageUrl;
        friendImageUrl = data.players.p1.imageUrl;
    }

    resultImg1.src = myImageUrl || 'https://via.placeholder.com/350?text=No+Image';
    
    resultImg2.src = friendImageUrl || 'https://via.placeholder.com/350?text=No+Image';
}

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

function setPlayerReady() {
    db.collection('sessions').doc(currentSessionId).update({
        [`players.${currentPlayerId}.ready`]: true
    });
    p1ReadyBtn.disabled = true;
    p1ReadyBtn.textContent = 'Waiting for Friend...';
    p1Status.textContent = "You're ready!";
}

function startNewGame() {
    window.location.href = window.location.origin + window.location.pathname;
}

function handlePageLoad() {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');

    if (sessionId) {
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
    } else {
        showScreen('setup-screen');
    }
}

createSessionBtn.addEventListener('click', createNewSession);
copyLinkBtn.addEventListener('click', copyShareLink);
p1UploadInput.addEventListener('change', handleFileUpload);
p1ReadyBtn.addEventListener('click', setPlayerReady);
newGameBtn.addEventListener('click', startNewGame);
window.addEventListener('load', handlePageLoad);