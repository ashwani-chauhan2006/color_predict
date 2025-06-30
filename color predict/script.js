// Game State Management
class ColorPredictionGame {
    constructor() {
        this._userPoints = 1000;
        this.currentRound = 1;
        this.countdown = 30;
        this.gameState = 'waiting'; // waiting, betting, result
        this.selectedColor = null;
        this.betAmount = 100;
        this.gameHistory = [];
        this.userStats = {
            wins: 0,
            totalBets: 0,
            totalWon: 0,
            biggestWin: 0,
            currentStreak: 0,
            maxStreak: 0
        };
        this.recentBets = [];
        this.leaderboard = [
            { name: "Player1", score: 2500 },
            { name: "Player2", score: 1800 },
            { name: "Player3", score: 1200 },
            { name: "Player4", score: 900 },
            { name: "Player5", score: 600 }
        ];
        
        this.countdownInterval = null;
        this.init();
    }

    get userPoints() {
        return this._userPoints;
    }

    set userPoints(value) {
        this._userPoints = value;
        if (typeof this.onUserDataChanged === 'function') {
            this.onUserDataChanged({
                userPoints: this._userPoints,
                userStats: this.userStats,
                gameHistory: this.gameHistory,
                recentBets: this.recentBets
            });
        }
    }

    init() {
        this.setupEventListeners();
        this.updateUI();
        this.showWelcomeModal();
        this.updateLeaderboard();
    }

    setupEventListeners() {
        // Color selection
        document.querySelectorAll('.color-option').forEach(option => {
            option.addEventListener('click', () => this.selectColor(option.dataset.color));
        });

        // Bet amount input
        document.getElementById('betAmount').addEventListener('input', (e) => {
            this.betAmount = parseInt(e.target.value) || 0;
            this.updateBetButton();
        });

        // Quick amount buttons
        document.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.betAmount = parseInt(btn.dataset.amount);
                document.getElementById('betAmount').value = this.betAmount;
                this.updateBetButton();
            });
        });

        // Place bet button
        document.getElementById('placeBetBtn').addEventListener('click', () => {
            this.placeBet();
        });

        // Modal buttons
        document.getElementById('startGameBtn').addEventListener('click', () => {
            this.hideWelcomeModal();
            this.startNewRound();
        });

        document.getElementById('continueBtn').addEventListener('click', () => {
            this.hideWinModal();
            this.startNewRound();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (this.gameState === 'betting') {
                switch(e.key) {
                    case '1':
                        this.selectColor('red');
                        break;
                    case '2':
                        this.selectColor('green');
                        break;
                    case '3':
                        this.selectColor('blue');
                        break;
                    case 'Enter':
                        if (this.selectedColor && this.betAmount > 0) {
                            this.placeBet();
                        }
                        break;
                }
            }
        });
    }

    selectColor(color) {
        if (this.gameState !== 'betting') return;

        // Remove previous selection
        document.querySelectorAll('.color-option').forEach(option => {
            option.classList.remove('selected');
        });

        // Add new selection
        document.querySelector(`[data-color="${color}"]`).classList.add('selected');
        this.selectedColor = color;

        // Update display
        const display = document.getElementById('selectedColorDisplay');
        display.textContent = color.charAt(0).toUpperCase() + color.slice(1);
        display.className = color;

        this.updateBetButton();
    }

    updateBetButton() {
        const btn = document.getElementById('placeBetBtn');
        const canBet = this.selectedColor && this.betAmount > 0 && this.betAmount <= this.userPoints;
        btn.disabled = !canBet;
    }

    placeBet() {
        if (!this.selectedColor || this.betAmount <= 0 || this.betAmount > this.userPoints) return;

        // Deduct points
        this.userPoints = this.userPoints - this.betAmount;
        this.userStats.totalBets++;

        // Store bet
        const bet = {
            color: this.selectedColor,
            amount: this.betAmount,
            round: this.currentRound,
            timestamp: new Date()
        };

        this.recentBets.unshift(bet);
        if (this.recentBets.length > 10) {
            this.recentBets.pop();
        }

        // Disable betting
        this.gameState = 'result';
        document.getElementById('placeBetBtn').disabled = true;
        document.querySelectorAll('.color-option').forEach(option => {
            option.style.pointerEvents = 'none';
        });

        // Show result after a short delay
        setTimeout(() => {
            this.showResult();
        }, 1000);
    }

    showResult() {
        const gameResult = document.getElementById('gameResult');
        gameResult.style.display = 'block';

        // Generate random result
        const colors = ['red', 'green', 'blue'];
        const weights = [0.4, 0.1, 0.5]; // Green is rarer
        const winningColor = this.weightedRandom(colors, weights);

        // Add to history
        this.gameHistory.push(winningColor);
        if (this.gameHistory.length > 10) {
            this.gameHistory.shift();
        }

        // Check if user won
        const won = this.selectedColor === winningColor;
        const multiplier = this.getMultiplier(this.selectedColor);
        const winnings = won ? this.betAmount * multiplier : 0;

        if (won) {
            this.userPoints = this.userPoints + winnings;
            this.userStats.wins++;
            this.userStats.totalWon += winnings;
            this.userStats.currentStreak++;
            this.userStats.maxStreak = Math.max(this.userStats.maxStreak, this.userStats.currentStreak);
            
            if (winnings > this.userStats.biggestWin) {
                this.userStats.biggestWin = winnings;
            }
        } else {
            this.userStats.currentStreak = 0;
        }

        // Update bet result
        const lastBet = this.recentBets[0];
        lastBet.result = winningColor;
        lastBet.won = won;
        lastBet.winnings = winnings;

        // Animate result
        this.animateResult(winningColor, won, winnings);

        // Update UI
        this.updateUI();
        this.updateRecentBets();

        // Show win modal if won
        if (won && winnings > this.betAmount) {
            setTimeout(() => {
                this.showWinModal(winnings);
            }, 2000);
        }

        // Start new round after delay
        setTimeout(() => {
            this.startNewRound();
        }, 4000);
    }

    animateResult(winningColor, won, winnings) {
        const resultMessage = document.getElementById('resultMessage');
        const resultDetails = document.getElementById('resultDetails');

        // Update result message
        if (won) {
            resultMessage.textContent = `🎉 You Won! 🎉`;
            resultMessage.style.color = '#51cf66';
        } else {
            resultMessage.textContent = `😔 You Lost`;
            resultMessage.style.color = '#ff6b6b';
        }

        // Update result details - SAFE DOM manipulation
        const detailsContainer = document.getElementById('resultDetails');
        detailsContainer.innerHTML = ''; // Clear first - safe as it's empty
        
        const winningColorPara = document.createElement('p');
        const winningColorSpan = document.createElement('span');
        winningColorSpan.style.color = this.getColorHex(winningColor);
        winningColorSpan.style.fontWeight = 'bold';
        winningColorSpan.textContent = winningColor.toUpperCase();
        winningColorPara.textContent = 'Winning Color: ';
        winningColorPara.appendChild(winningColorSpan);
        
        const yourBetPara = document.createElement('p');
        const yourBetSpan = document.createElement('span');
        yourBetSpan.style.color = this.getColorHex(this.selectedColor);
        yourBetSpan.style.fontWeight = 'bold';
        yourBetSpan.textContent = this.selectedColor.toUpperCase();
        yourBetPara.textContent = 'Your Bet: ';
        yourBetPara.appendChild(yourBetSpan);
        
        detailsContainer.appendChild(winningColorPara);
        detailsContainer.appendChild(yourBetPara);
        
        if (won) {
            const winningsPara = document.createElement('p');
            const winningsSpan = document.createElement('span');
            winningsSpan.style.color = '#51cf66';
            winningsSpan.style.fontWeight = 'bold';
            winningsSpan.textContent = `+${winnings} points`;
            winningsPara.textContent = 'Winnings: ';
            winningsPara.appendChild(winningsSpan);
            detailsContainer.appendChild(winningsPara);
        }

        // Add animation class
        gameResult.classList.add('fade-in');
    }

    weightedRandom(items, weights) {
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        let random = Math.random() * totalWeight;
        
        for (let i = 0; i < items.length; i++) {
            random -= weights[i];
            if (random <= 0) {
                return items[i];
            }
        }
        return items[items.length - 1];
    }

    getMultiplier(color) {
        const multipliers = {
            red: 2,
            green: 2,
            blue: 2
        };
        return multipliers[color] || 1;
    }

    getColorHex(color) {
        const colors = {
            red: '#ff6b6b',
            green: '#51cf66',
            blue: '#4dabf7'
        };
        return colors[color] || '#333';
    }

    startNewRound() {
        this.currentRound++;
        this.gameState = 'betting';
        this.selectedColor = null;
        this.countdown = 30;

        // Reset UI
        document.getElementById('gameResult').style.display = 'none';
        document.querySelectorAll('.color-option').forEach(option => {
            option.classList.remove('selected');
            option.style.pointerEvents = 'auto';
        });
        document.getElementById('selectedColorDisplay').textContent = 'None';
        document.getElementById('selectedColorDisplay').className = '';

        // Start countdown
        this.startCountdown();

        this.updateUI();
    }

    startCountdown() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }

        this.countdownInterval = setInterval(() => {
            this.countdown--;
            document.getElementById('countdown').textContent = this.countdown;

            if (this.countdown <= 0) {
                clearInterval(this.countdownInterval);
                this.endRound();
            }
        }, 1000);
    }

    endRound() {
        this.gameState = 'result';
        document.getElementById('placeBetBtn').disabled = true;
        document.querySelectorAll('.color-option').forEach(option => {
            option.style.pointerEvents = 'none';
        });

        // If no bet was placed, show result anyway
        if (!this.selectedColor) {
            setTimeout(() => {
                this.showResult();
            }, 1000);
        }
    }

    updateUI() {
        // Update header stats
        document.getElementById('userPoints').textContent = this.userPoints.toLocaleString();
        document.getElementById('userWins').textContent = this.userStats.wins;
        document.getElementById('userWinRate').textContent = 
            this.userStats.totalBets > 0 ? Math.round((this.userStats.wins / this.userStats.totalBets) * 100) + '%' : '0%';

        // Update round info
        document.getElementById('currentRound').textContent = this.currentRound;
        document.getElementById('countdown').textContent = this.countdown;

        // Update result history
        this.updateResultHistory();

        // Update statistics
        document.getElementById('totalBets').textContent = this.userStats.totalBets;
        document.getElementById('totalWon').textContent = this.userStats.totalWon.toLocaleString();
        document.getElementById('biggestWin').textContent = this.userStats.biggestWin.toLocaleString();
        document.getElementById('currentStreak').textContent = this.userStats.currentStreak;

        // Update bet amount
        document.getElementById('betAmount').value = this.betAmount;
    }

    updateResultHistory() {
        const historyContainer = document.getElementById('resultHistory');
        historyContainer.innerHTML = '';

        this.gameHistory.slice(-10).forEach(color => {
            const resultItem = document.createElement('div');
            resultItem.className = `result-item ${color}`;
            resultItem.style.backgroundColor = this.getColorHex(color);
            resultItem.textContent = color.charAt(0).toUpperCase();
            historyContainer.appendChild(resultItem);
        });
    }

    updateRecentBets() {
        const betsList = document.getElementById('betsList');
        betsList.innerHTML = '';

        this.recentBets.slice(0, 5).forEach(bet => {
            const betItem = document.createElement('div');
            betItem.className = `bet-item ${bet.won ? 'win' : 'lose'}`;
            
            // Create bet info container
            const betInfo = document.createElement('div');
            betInfo.className = 'bet-info';
            
            const betColor = document.createElement('div');
            betColor.className = `bet-color ${bet.color}`;
            
            const betDetails = document.createElement('div');
            betDetails.className = 'bet-details';
            
            const betAmount = document.createElement('div');
            betAmount.className = 'bet-amount';
            betAmount.textContent = `${bet.amount} points`;
            
            const betRound = document.createElement('div');
            betRound.textContent = `Round ${bet.round}`;
            
            betDetails.appendChild(betAmount);
            betDetails.appendChild(betRound);
            betInfo.appendChild(betColor);
            betInfo.appendChild(betDetails);
            
            // Create bet result
            const betResult = document.createElement('div');
            betResult.className = `bet-result ${bet.won ? 'win' : 'lose'}`;
            betResult.textContent = bet.won ? `+${bet.winnings}` : 'Lost';
            
            betItem.appendChild(betInfo);
            betItem.appendChild(betResult);
            betsList.appendChild(betItem);
        });
    }

    updateLeaderboard() {
        const leaderboard = document.getElementById('leaderboard');
        leaderboard.innerHTML = '';

        this.leaderboard.forEach((player, index) => {
            const item = document.createElement('div');
            item.className = 'leaderboard-item';
            
            const rank = document.createElement('div');
            rank.className = 'leaderboard-rank';
            rank.textContent = `#${index + 1}`;
            
            const name = document.createElement('div');
            name.className = 'leaderboard-name';
            name.textContent = player.name;
            
            const score = document.createElement('div');
            score.className = 'leaderboard-score';
            score.textContent = player.score.toLocaleString();
            
            item.appendChild(rank);
            item.appendChild(name);
            item.appendChild(score);
            leaderboard.appendChild(item);
        });
    }

    showWelcomeModal() {
        document.getElementById('welcomeModal').style.display = 'flex';
    }

    hideWelcomeModal() {
        document.getElementById('welcomeModal').style.display = 'none';
    }

    showWinModal(winnings) {
        const winMessage = document.getElementById('winMessage');
        winMessage.textContent = `You won ${winnings.toLocaleString()} points!`;
        document.getElementById('winModal').style.display = 'flex';
    }

    hideWinModal() {
        document.getElementById('winModal').style.display = 'none';
    }

    loadUserData(data) {
        let pointsValue = 1000;
        if (typeof data.userPoints !== 'undefined') pointsValue = data.userPoints;
        else if (typeof data.points !== 'undefined') pointsValue = data.points;
        this.userPoints = pointsValue;
        this.points = pointsValue; // keep both in sync
        if (data.userStats) this.userStats = data.userStats;
        else if (data.stats) this.userStats = data.stats;
        if (data.gameHistory) this.gameHistory = data.gameHistory;
        if (data.recentBets) this.recentBets = data.recentBets;
        this.updateUI();
        this.updateRecentBets && this.updateRecentBets();
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const game = new ColorPredictionGame();
    
    // Connect to auth system using global function
    if (window.connectGameToAuth) {
        const connected = window.connectGameToAuth(game);
        if (connected) {
            console.log("✅ Game connected to auth system via global function");
        } else {
            console.warn("⚠️ Failed to connect game to auth system");
        }
    } else {
        console.warn("⚠️ Auth system not available");
    }
    
    // Only expose game instance globally for debugging
    window.game = game;
    
    // Add some visual effects
    document.addEventListener('mousemove', (e) => {
        const cards = document.querySelectorAll('.color-option, .stat-card, .sidebar-section');
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        });
    });

    // Add confetti effect for big wins
    const createConfetti = () => {
        for (let i = 0; i < 50; i++) {
            const confetti = document.createElement('div');
            confetti.style.position = 'fixed';
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.top = '-10px';
            confetti.style.width = '10px';
            confetti.style.height = '10px';
            confetti.style.backgroundColor = ['#ff6b6b', '#51cf66', '#4dabf7', '#fcc419', '#ae3ec9'][Math.floor(Math.random() * 5)];
            confetti.style.borderRadius = '50%';
            confetti.style.pointerEvents = 'none';
            confetti.style.zIndex = '9999';
            confetti.style.animation = `fall ${Math.random() * 3 + 2}s linear forwards`;
            
            document.body.appendChild(confetti);
            
            setTimeout(() => {
                confetti.remove();
            }, 5000);
        }
    };

    // Add fall animation for confetti
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fall {
            to {
                transform: translateY(100vh) rotate(360deg);
            }
        }
    `;
    document.head.appendChild(style);

    console.log("🎮 Game initialized and ready!");
    
    // Debug: Check auth status after a delay
    setTimeout(() => {
        if (window.getAuthStatus) {
            const status = window.getAuthStatus();
            console.log("🔍 Auth Status:", status);
        }
    }, 2000);
});
  