// Firebase & Firestore Imports
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
    getAuth,
    signInWithPopup,
    GoogleAuthProvider,
    onAuthStateChanged,
    signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    arrayUnion,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// 🔧 Demo mode flag
const DEMO_MODE = false;

// 🔐 Firebase Config
const firebaseConfig = {
    apiKey: "your api key",
    authDomain: "your api key",
    projectId: "your api key",
    storageBucket: "your api key",
};



let app, auth, provider, db, gameInstance;
let lastSaveTime = 0; // Rate limiting for saves
const SAVE_COOLDOWN = 1000; // 1 second between saves
let pendingDataLoad = null; // Store pending data load for when game instance is ready

// 🔒 Rate limiting for authentication
let authAttempts = 0;
const MAX_AUTH_ATTEMPTS = 5;
const AUTH_COOLDOWN = 300000; // 5 minutes
let lastAuthAttempt = 0;

// 🔒 CSRF Protection
let csrfToken = null;

// 🔒 Input Sanitization
function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.replace(/[<>'"&]/g, '');
}

// 🔒 XSS Prevention - Safe DOM manipulation
function safeSetTextContent(element, text) {
    if (element && typeof text === 'string') {
        element.textContent = sanitizeInput(text);
    }
}

function safeSetInnerHTML(element, html) {
    if (element && typeof html === 'string') {
        // Only allow safe HTML patterns
        const safeHTML = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        element.innerHTML = safeHTML;
    }
}

// 🔒 Rate limiting check
function isRateLimited() {
    const now = Date.now();
    if (now - lastAuthAttempt < AUTH_COOLDOWN) {
        return true;
    }
    if (authAttempts >= MAX_AUTH_ATTEMPTS) {
        return true;
    }
    return false;
}

// 🔒 Generate CSRF token
function generateCSRFToken() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// 🔄 Load User Data from Firestore
async function loadUserDataFromFirestore(user) {
    if (!user || !db) {
        console.log("❌ Cannot load user data: missing user or db");
        return;
    }

    // If game instance is not ready, store the load request
    if (!gameInstance) {
        console.log("⏳ Game instance not ready, storing data load request");
        pendingDataLoad = user;
        return;
    }

    try {
        console.log("🔄 Loading user data for:", sanitizeInput(user.displayName || 'Unknown'));
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const data = userSnap.data();
            console.log("✅ User data loaded from Firestore");
            
            // Validate and sanitize data
            const validatedData = validateAndSanitizeData(data);
            
            // Map Firestore fields to game expected keys
            if (typeof gameInstance.loadUserData === 'function') {
                gameInstance.loadUserData({
                    userPoints: validatedData.points,
                    userStats: validatedData.stats,
                    gameHistory: validatedData.gameHistory,
                    recentBets: validatedData.recentBets
                });
                
                // Force UI update after data load
                if (typeof gameInstance.updateUI === 'function') {
                    gameInstance.updateUI();
                }
                if (typeof gameInstance.updateRecentBets === 'function') {
                    gameInstance.updateRecentBets();
                }
            }
        } else {
            console.log("⚠️ No user data found, creating default data");
            // Create default data for existing user
            const defaultData = {
                uid: user.uid,
                email: sanitizeInput(user.email || ''),
                displayName: sanitizeInput(user.displayName || 'User'),
                points: 1000,
                stats: { wins: 0, totalBets: 0, totalWon: 0, biggestWin: 0, currentStreak: 0, maxStreak: 0 },
                gameHistory: [],
                recentBets: [],
                createdAt: serverTimestamp()
            };
            await setDoc(userRef, defaultData);
            
            if (typeof gameInstance.loadUserData === 'function') {
                gameInstance.loadUserData({
                    userPoints: defaultData.points,
                    userStats: defaultData.stats,
                    gameHistory: defaultData.gameHistory,
                    recentBets: defaultData.recentBets
                });
                
                // Force UI update after data load
                if (typeof gameInstance.updateUI === 'function') {
                    gameInstance.updateUI();
                }
            }
        }
    } catch (error) {
        console.error("❌ Failed to load user data");
        // Retry once after a short delay
        setTimeout(async () => {
            try {
                console.log("🔄 Retrying data load...");
                await loadUserDataFromFirestore(user);
            } catch (retryError) {
                console.error("❌ Retry failed, using fallback data");
                // Fallback to default data on error
                if (typeof gameInstance.loadUserData === 'function') {
                    gameInstance.loadUserData({
                        userPoints: 1000,
                        userStats: { wins: 0, totalBets: 0, totalWon: 0, biggestWin: 0, currentStreak: 0, maxStreak: 0 },
                        gameHistory: [],
                        recentBets: []
                    });
                    
                    if (typeof gameInstance.updateUI === 'function') {
                        gameInstance.updateUI();
                    }
                }
            }
        }, 2000);
    }
}

// 🔍 Validate and sanitize data from Firestore
function validateAndSanitizeData(data) {
    const validated = {
        points: 1000,
        stats: { wins: 0, totalBets: 0, totalWon: 0, biggestWin: 0, currentStreak: 0, maxStreak: 0 },
        gameHistory: [],
        recentBets: []
    };

    // Validate points
    if (typeof data.points === 'number' && data.points >= 0 && data.points <= 999999) {
        validated.points = Math.floor(data.points);
    }

    // Validate stats
    if (data.stats && typeof data.stats === 'object') {
        const requiredStats = ['wins', 'totalBets', 'totalWon', 'biggestWin', 'currentStreak', 'maxStreak'];
        requiredStats.forEach(stat => {
            if (typeof data.stats[stat] === 'number' && data.stats[stat] >= 0 && data.stats[stat] <= 999999) {
                validated.stats[stat] = Math.floor(data.stats[stat]);
            }
        });
    }

    // Validate gameHistory
    if (Array.isArray(data.gameHistory)) {
        validated.gameHistory = data.gameHistory.filter(item => 
            typeof item === 'string' && ['red', 'green', 'blue'].includes(item)
        ).slice(0, 100); // Limit to 100 items
    }

    // Validate recentBets
    if (Array.isArray(data.recentBets)) {
        validated.recentBets = data.recentBets.filter(bet => 
            bet && typeof bet === 'object' && 
            typeof bet.amount === 'number' && bet.amount >= 0 && bet.amount <= 999999 &&
            typeof bet.round === 'number' && bet.round >= 0 &&
            ['red', 'green', 'blue'].includes(bet.color)
        ).slice(0, 50); // Limit to 50 items
    }

    return validated;
}

// 🔄 Manual Data Loading (for when game instance is set up after auth)
export async function loadCurrentUserData() {
    if (DEMO_MODE) {
        console.log("🔄 Demo mode: loading demo data");
        if (typeof window.demoSignIn === 'function') {
            await window.demoSignIn();
        }
        return;
    }
    
    if (auth?.currentUser && gameInstance) {
        console.log("🔄 Manually loading data for current user");
        await loadUserDataFromFirestore(auth.currentUser);
    } else {
        console.log("⚠️ No authenticated user or game instance available");
    }
}

// 🔍 Check if auth system is ready
export function isAuthReady() {
    return !DEMO_MODE ? (auth && db) : true;
}

// 🔍 Get current user
export function getCurrentUser() {
    return auth?.currentUser || null;
}

// 🔗 Connect to game instance when available
function connectToGameInstance() {
    // Check if game instance is available globally
    if (window.game && !gameInstance) {
        console.log("🎮 Found game instance, connecting...");
        setGameInstance(window.game);
    }
}

// 🔄 Retry connection to game instance
function retryGameConnection() {
    setTimeout(() => {
        connectToGameInstance();
        if (!gameInstance) {
            retryGameConnection();
        }
    }, 1000);
}

// 🌐 Global function for script.js to connect game instance
window.connectGameToAuth = function(game) {
    if (game) {
        setGameInstance(game);
        return true;
    }
    return false;
};

// 🌐 Global function for manual data loading (for debugging)
window.forceLoadUserData = function() {
    if (auth?.currentUser) {
        loadUserDataFromFirestore(auth.currentUser);
        return true;
    }
    return false;
};

// 🌐 Global function to check auth status
window.getAuthStatus = function() {
    return {
        isAuthenticated: !!auth?.currentUser,
        currentUser: auth?.currentUser ? {
            uid: auth.currentUser.uid,
            displayName: sanitizeInput(auth.currentUser.displayName || ''),
            email: sanitizeInput(auth.currentUser.email || '')
        } : null,
        gameInstanceConnected: !!gameInstance,
        isDemoMode: DEMO_MODE
    };
};

if (!DEMO_MODE && firebaseConfig.apiKey !== "your-api-key-here") {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    provider = new GoogleAuthProvider();
    db = getFirestore(app);

    // Generate CSRF token
    csrfToken = generateCSRFToken();

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log('User signed in:', sanitizeInput(user.displayName || 'Unknown'));
            updateSignInButton(user);
            // Load user data whenever auth state changes to signed in
            await loadUserDataFromFirestore(user);
        } else {
            console.log('User signed out');
            updateSignInButton(null);
            if (gameInstance) {
                // Reset game to default state instead of calling non-existent method
                gameInstance.userPoints = 1000;
                gameInstance.userStats = { wins: 0, totalBets: 0, totalWon: 0, biggestWin: 0, currentStreak: 0, maxStreak: 0 };
                gameInstance.gameHistory = [];
                gameInstance.recentBets = [];
                gameInstance.updateUI();
            }
        }
    });
} else {
    console.log('Running in DEMO MODE - data will not be saved');
    setupDemoMode();
}

// ✅ Google Sign-In + Firestore Init
async function signInWithGoogle() {
    if (DEMO_MODE) {
        if (typeof window.demoSignIn === 'function') {
            await window.demoSignIn();
        } else {
            console.error("❌ demoSignIn function not available");
        }
        return;
    }

    if (!auth || !db) {
        console.error('Firebase not initialized');
        return;
    }

    // Rate limiting check
    if (isRateLimited()) {
        alert("Too many sign-in attempts. Please wait before trying again.");
        return;
    }

    const signInBtn = document.getElementById('sign-in-btn');
    if (!signInBtn) {
        console.error('Sign-in button not found');
        return;
    }
    
    signInBtn.disabled = true;
    safeSetInnerHTML(signInBtn, '<i class="fas fa-spinner fa-spin"></i> Signing in...');

    try {
        authAttempts++;
        lastAuthAttempt = Date.now();
        
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        // Reset rate limiting on successful sign-in
        authAttempts = 0;

        // The onAuthStateChanged listener will handle data loading
        // We just need to update the button here
        updateSignInButton(user);
        
        console.log("✅ Sign-in successful, data loading handled by auth state listener");
    } catch (error) {
        console.error('Google Sign-In Error:', error.code);
        // Only alert for errors that are not cancelled-popup-request or popup-blocked
        if (error.code !== 'auth/cancelled-popup-request' && error.code !== 'auth/popup-blocked') {
            alert("Authentication Failed: " + error.message);
        } else {
            // Optionally, show a user-friendly message in the UI or ignore
            console.log("Sign-in popup was cancelled, blocked, or another popup was already open.");
        }
        if (signInBtn) {
            signInBtn.disabled = false;
            safeSetInnerHTML(signInBtn, '<i class="fas fa-sign-in-alt"></i> Sign In');
        }
    }
}

// 🚪 Sign Out
async function signOutUser() {
    const signInBtn = document.getElementById('sign-in-btn');
    if (!signInBtn) return;
    
    try {
        signInBtn.disabled = true;
        safeSetInnerHTML(signInBtn, '<i class="fas fa-spinner fa-spin"></i> Signing out...');

        await signOut(auth);
        console.log('Signed out');
    } catch (error) {
        console.error('Sign out error:', error.code);
        // Reset button state on error
        signInBtn.disabled = false;
        safeSetInnerHTML(signInBtn, '<i class="fas fa-sign-in-alt"></i> Sign In');
        signInBtn.onclick = signInWithGoogle;
    }
}

// 🔁 Update Sign-In Button
function updateSignInButton(user) {
    const signInBtn = document.getElementById('sign-in-btn');
    if (!signInBtn) return;

    if (user) {
        safeSetInnerHTML(signInBtn, `<i class="fas fa-user"></i> ${sanitizeInput(user.displayName || 'User')}`);
        signInBtn.onclick = DEMO_MODE ? window.demoSignOut : signOutUser;
        signInBtn.title = 'Click to sign out';
        signInBtn.disabled = false;
    } else {
        safeSetInnerHTML(signInBtn, '<i class="fas fa-sign-in-alt"></i> Sign In');
        signInBtn.onclick = signInWithGoogle;
        signInBtn.title = DEMO_MODE ? 'Demo Sign In' : 'Sign in with Google';
        signInBtn.disabled = false;
    }
}

// 🧠 Save Game Data to Firestore
export async function saveUserDataToFirestore(userId, gameData) {
    if (DEMO_MODE || !db) return;
    
    // Rate limiting to prevent spam saves
    const now = Date.now();
    if (now - lastSaveTime < SAVE_COOLDOWN) {
        console.log("⏱️ Save rate limited, skipping...");
        return;
    }
    lastSaveTime = now;

    // Validate input parameters
    if (!userId || !gameData) {
        console.error("❌ Invalid parameters for saveUserDataToFirestore");
        return;
    }

    // Validate user ID format
    if (typeof userId !== 'string' || userId.length < 10) {
        console.error("❌ Invalid user ID format");
        return;
    }

    try {
        const userRef = doc(db, "users", userId);
        
        // Get current data to prevent duplicates
        const currentDoc = await getDoc(userRef);
        const currentData = currentDoc.exists() ? currentDoc.data() : {};
        
        // Always update points and stats (with validation)
        const updateData = {
            updatedAt: serverTimestamp()
        };
        
        if (typeof gameData.userPoints === 'number' && gameData.userPoints >= 0 && gameData.userPoints <= 999999) {
            updateData.points = Math.floor(gameData.userPoints);
        }
        
        if (gameData.userStats && typeof gameData.userStats === 'object') {
            updateData.stats = gameData.userStats;
        }
        
        await setDoc(userRef, updateData, { merge: true });

        // Only add new entries to gameHistory (prevent duplicates)
        if (Array.isArray(gameData.gameHistory) && gameData.gameHistory.length > 0) {
            const currentHistory = currentData.gameHistory || [];
            const newHistoryItems = gameData.gameHistory.filter(item => 
                item && typeof item === 'string' && ['red', 'green', 'blue'].includes(item) &&
                !currentHistory.some(existing => 
                    JSON.stringify(existing) === JSON.stringify(item)
                )
            ).slice(0, 10); // Limit new items
            
            if (newHistoryItems.length > 0) {
                await updateDoc(userRef, {
                    gameHistory: arrayUnion(...newHistoryItems)
                });
            }
        }
        
        // Only add new entries to recentBets (prevent duplicates)
        if (Array.isArray(gameData.recentBets) && gameData.recentBets.length > 0) {
            const currentBets = currentData.recentBets || [];
            const newBetItems = gameData.recentBets.filter(bet => 
                bet && typeof bet === 'object' && 
                typeof bet.amount === 'number' && bet.amount >= 0 && bet.amount <= 999999 &&
                typeof bet.round === 'number' && bet.round >= 0 &&
                ['red', 'green', 'blue'].includes(bet.color) &&
                !currentBets.some(existing => 
                    existing.round === bet.round && 
                    existing.timestamp?.toDate?.()?.getTime() === bet.timestamp?.toDate?.()?.getTime()
                )
            ).slice(0, 5); // Limit new items
            
            if (newBetItems.length > 0) {
                await updateDoc(userRef, {
                    recentBets: arrayUnion(...newBetItems)
                });
            }
        }
        
        console.log("✅ Firestore updated with new game data (append mode)");
    } catch (error) {
        console.error("❌ Firestore update failed:", error.code);
        // Don't show alert for every save error, just log it
        console.log("Failed to save data");
    }
}

// 🧩 Connect Game Instance
export function setGameInstance(game) {
    if (!game) {
        console.error("❌ Invalid game instance provided to setGameInstance");
        return;
    }
    
    gameInstance = game;
    console.log("✅ Game instance connected to auth system");

    gameInstance.onUserDataChanged = (gameData) => {
        if (!gameData) {
            console.error("❌ Invalid gameData provided to onUserDataChanged");
            return;
        }
        
        if (!DEMO_MODE && auth?.currentUser) {
            saveUserDataToFirestore(auth.currentUser.uid, gameData);
        } else if (DEMO_MODE) {
            if (typeof window.demoSaveData === 'function') {
                window.demoSaveData(gameData);
            } else {
                console.error("❌ demoSaveData function not available");
            }
        }
    };

    // If user is already authenticated when game instance is set up, load their data
    if (auth?.currentUser) {
        console.log("🔄 Game instance set up with existing authenticated user, loading data...");
        loadUserDataFromFirestore(auth.currentUser);
    }

    // If there was a pending data load, process it now
    if (pendingDataLoad) {
        console.log("🔄 Processing pending data load...");
        loadUserDataFromFirestore(pendingDataLoad);
        pendingDataLoad = null;
    }
}

// 🧪 Demo Mode Logic
function setupDemoMode() {
    let demoUserData = {
        points: 1000,
        stats: { wins: 0, totalBets: 0, totalWon: 0, biggestWin: 0, currentStreak: 0, maxStreak: 0 },
        gameHistory: [],
        recentBets: []
    };

    window.demoSignIn = async function () {
        const signInBtn = document.getElementById('sign-in-btn');
        signInBtn.disabled = true;
        safeSetInnerHTML(signInBtn, '<i class="fas fa-spinner fa-spin"></i> Signing in...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        const demoUser = {
            displayName: 'Demo User',
            uid: 'demo-user-id'
        };

        updateSignInButton(demoUser);
        if (gameInstance) {
            gameInstance.loadUserData(demoUserData);
        }

        console.log('Demo user signed in');
    };

    window.demoSignOut = async function () {
        const signInBtn = document.getElementById('sign-in-btn');
        signInBtn.disabled = true;
        safeSetInnerHTML(signInBtn, '<i class="fas fa-spinner fa-spin"></i> Signing out...');
        await new Promise(resolve => setTimeout(resolve, 500));

        updateSignInButton(null);
        if (gameInstance) {
            // Reset game to default state instead of calling non-existent method
            gameInstance.userPoints = 1000;
            gameInstance.userStats = { wins: 0, totalBets: 0, totalWon: 0, biggestWin: 0, currentStreak: 0, maxStreak: 0 };
            gameInstance.gameHistory = [];
            gameInstance.recentBets = [];
            gameInstance.updateUI();
        }

        console.log('Demo user signed out');
    };

    window.demoSaveData = function (gameData) {
        demoUserData = {
            points: gameData.userPoints,
            stats: gameData.userStats,
            gameHistory: gameData.gameHistory,
            recentBets: gameData.recentBets
        };
        console.log('Demo data saved:', demoUserData);
    };
}

// ✅ Init on Page Load
document.addEventListener('DOMContentLoaded', () => {
    const signInBtn = document.getElementById('sign-in-btn');
    if (signInBtn) {
        signInBtn.addEventListener('click', signInWithGoogle);
        console.log('Auth initialized in', DEMO_MODE ? 'DEMO' : 'FIREBASE', 'mode');
    } else {
        console.warn('⚠️ Sign-in button not found, auth may not work properly');
    }

    // Try to connect to game instance
    connectToGameInstance();
    
    // If game instance is not immediately available, retry
    if (!gameInstance) {
        retryGameConnection();
    }
});