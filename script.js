/**
 * ============================================================================
 * PART 1: SINGLE PAGE APPLICATION (SPA) NAVIGATION ENGINE
 * ============================================================================
 */
document.addEventListener('DOMContentLoaded', () => {
    const menuToggle = document.getElementById('menuToggle');
    const navContainer = document.getElementById('navContainer');
    const navTabs = document.querySelectorAll('.nav-tab');
    const viewPanels = document.querySelectorAll('.view-panel');

    // --- VIEWPORT SWAP ENGINE ---
    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetPage = tab.getAttribute('data-target');

            navTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            viewPanels.forEach(panel => {
                if (panel.id === targetPage) {
                    panel.classList.add('active');
                } else {
                    panel.classList.remove('active');
                }
            });

            // Automatically close sidebar/drawer layouts on mobile when a link is tapped
            if (navContainer && navContainer.classList.contains('active')) {
                navContainer.classList.remove('active');
            }

            window.scrollTo({ top: 0, behavior: 'smooth' });
            
            if (targetPage === 'arcade' && window.arcadeGameEngine) {
                window.arcadeGameEngine.resizeCanvas();
            }
        });
    });

    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            navContainer.classList.toggle('active');
        });
    }

    if (document.getElementById('gameCanvas')) {
        window.arcadeGameEngine = new TrapShootingGame();
    }
});


/**
 * ============================================================================
 * PART 2: TRAP SHOOTING PRO GAME ENGINE (BALANCED POWER-UPS MATRIX)
 * ============================================================================
 */
class TrapShootingGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.baseWidth = 854;
        this.baseHeight = 480;
        this.resolutionMode = 'auto';
        
        this.score = 0;
        this.lives = 3;
        this.gameTime = 60; 
        this.gameMode = null; 
        this.isPlaying = false;
        this.isPaused = false;
        
        this.targets = [];
        this.particles = [];
        this.powerups = [];
        this.crosshair = { x: 427, y: 240 };
        this.spawnTimer = 0;
        this.spawnInterval = 1500; 
        this.lastTime = 0;
        this.gameClockInterval = null;
        
        this.cryoActive = false; this.cryoTimer = 0;
        this.frenzyActive = false; this.frenzyTimer = 0;
        this.netActive = false; this.netTimer = 0;

        this.audioEnabled = true;
        this.synth = null;

        // --- VISUAL EFFECTS PARAMETERS ---
        this.isMouseInside = false;
        this.crosshairGlowPulse = 0;
        this.uiParticles = [];

        // --- AUTOMATIC MOBILE ENVIRONMENT DETECTION ---
        this.detectDeviceEnvironment();

        this.initElements();
        this.initAudio();
        this.resizeCanvas();
        this.setupEventListeners();
        
        requestAnimationFrame((t) => this.loop(t));
    }

    detectDeviceEnvironment() {
        // Evaluate dynamic window scaling and platform metrics safely
        const mobileCheck = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const smallWindowCheck = window.innerWidth <= 760 || window.innerHeight > window.innerWidth;
        
        if (mobileCheck || smallWindowCheck) {
            this.resolutionMode = '360x640'; // Auto-force vertical layout profile
        } else {
            this.resolutionMode = 'auto'; // Standard landscape desktop configuration
        }
    }

    initElements() {
        this.hudWrapper = document.getElementById('hudWrapper');
        this.scoreSpan = document.querySelector('#scoreDisplay span');
        this.livesSpan = document.querySelector('#livesDisplay span');
        this.timerPanel = document.getElementById('timerDisplay');
        this.timerSpan = document.querySelector('#timerDisplay span');
        
        this.gameOverlay = document.getElementById('gameOverlay');
        this.overlayMessage = document.getElementById('overlayMessage');
        this.overlaySubtext = document.getElementById('overlaySubtext');
        this.modeSelection = document.getElementById('modeSelection');
        this.gameEndButtons = document.getElementById('gameEndButtons');
        
        this.pauseOverlay = document.getElementById('pauseOverlay');
        this.guideOverlay = document.getElementById('guideOverlay');
        this.settingsOverlay = document.getElementById('settingsOverlay');
        this.resolutionSelect = document.getElementById('resolutionSelect');

        // Match UI selector values to auto-detected resolution rules if available
        if (this.resolutionSelect) {
            this.resolutionSelect.value = this.resolutionMode;
        }
    }

    initAudio() {
        try {
            this.synth = new Tone.PolySynth(Tone.Synth).toDestination();
            this.synth.set({
                oscillator: { type: 'triangle' },
                envelope: { attack: 0.02, decay: 0.1, sustain: 0.1, release: 0.1 }
            });
        } catch (e) {
            console.log("Audio pipeline queued.");
        }
    }

    playTone(type) {
        if (!this.audioEnabled || !this.synth) return;
        try {
            if (Tone.context.state !== 'running') Tone.start();
            if (type === 'shoot') this.synth.triggerAttackRelease("C3", "0.05");
            else if (type === 'hit') this.synth.triggerAttackRelease("E5", "0.08");
            else if (type === 'powerup') this.synth.triggerAttackRelease(["G4", "C5", "E5"], "0.15");
            else if (type === 'miss') this.synth.triggerAttackRelease("A2", "0.2");
        } catch (e) {}
    }

    resizeCanvas() {
        if (!this.canvas) return;
        const container = this.canvas.parentElement;

        if (this.resolutionMode === '360x640') {
            this.baseWidth = 360;
            this.baseHeight = 640;
        } else if (this.resolutionMode === '1920x1080') {
            this.baseWidth = 1920;
            this.baseHeight = 1080;
        } else { 
            this.baseWidth = 854;
            this.baseHeight = 480;
        }

        this.canvas.width = this.baseWidth;
        this.canvas.height = this.baseHeight;
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        container.style.aspectRatio = `${this.baseWidth} / ${this.baseHeight}`;
    }

    updatePointerCoordinates(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        this.crosshair.x = ((clientX - rect.left) / rect.width) * this.baseWidth;
        this.crosshair.y = ((clientY - rect.top) / rect.height) * this.baseHeight;
    }

    setupEventListeners() {
        window.addEventListener('resize', () => {
            // Re-verify view limits if window scales fluidly without full reboots
            this.detectDeviceEnvironment();
            this.resizeCanvas();
        });

        this.canvas.addEventListener('mouseenter', () => {
            this.isMouseInside = true;
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.isMouseInside = false;
        });

        this.canvas.addEventListener('mousemove', (e) => {
            this.updatePointerCoordinates(e.clientX, e.clientY);
        });

        this.canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length > 0) {
                this.updatePointerCoordinates(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, { passive: true });

        this.canvas.addEventListener('touchstart', (e) => {
            if (!this.isPlaying || this.isPaused) return;
            if (e.touches.length > 0) {
                this.updatePointerCoordinates(e.touches[0].clientX, e.touches[0].clientY);
                this.fireWeapon();
            }
        }, { passive: true });

        this.canvas.addEventListener('mousedown', () => {
            if (!this.isPlaying || this.isPaused) return;
            this.fireWeapon();
        });

        document.querySelectorAll('.game-btn, .text-link, .nav-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.createUiRipple(e);
            });
        });

        document.getElementById('livesModeButton').addEventListener('click', () => this.startGame('classic'));
        document.getElementById('timedModeButton').addEventListener('click', () => this.startGame('timed'));
        document.getElementById('pauseButton').addEventListener('click', () => this.togglePause());
        document.getElementById('resumeButton').addEventListener('click', () => this.togglePause());
        document.getElementById('quitMenuButton').addEventListener('click', () => this.abortGame());
        document.getElementById('quitToMenuFromEnd').addEventListener('click', () => this.showMainMenu());

        document.getElementById('openGuideButton').addEventListener('click', () => this.openOverlay(this.guideOverlay));
        document.getElementById('closeGuideButton').addEventListener('click', () => this.closeOverlay(this.guideOverlay));
        document.getElementById('backFromGuideButton').addEventListener('click', () => this.closeOverlay(this.guideOverlay));
        
        document.getElementById('settingsButton').addEventListener('click', () => this.openOverlay(this.settingsOverlay));
        document.getElementById('pauseSettingsButton').addEventListener('click', () => this.openOverlay(this.settingsOverlay));
        
        document.getElementById('backToMainButton').addEventListener('click', () => {
            this.closeOverlay(this.settingsOverlay);
            if (this.resolutionSelect) {
                this.resolutionMode = this.resolutionSelect.value;
                this.resizeCanvas();
            }
            const sfx = document.getElementById('sfxToggle');
            this.audioEnabled = sfx ? sfx.checked : true;
        });
    }

    createUiRipple(e) {
        const rect = e.currentTarget.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : rect.left + rect.width / 2);
        const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : rect.top + rect.height / 2);
        
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        const ripple = document.createElement('span');
        ripple.style.position = 'absolute';
        ripple.style.backgroundColor = 'rgba(255, 255, 255, 0.35)';
        ripple.style.width = ripple.style.height = 'max(' + rect.width + 'px, ' + rect.height + 'px)';
        ripple.style.left = x - (Math.max(rect.width, rect.height) / 2) + 'px';
        ripple.style.top = y - (Math.max(rect.width, rect.height) / 2) + 'px';
        ripple.style.borderRadius = '50%';
        ripple.style.transform = 'scale(0)';
        ripple.style.transition = 'transform 0.5s ease-out, opacity 0.5s ease-out';
        ripple.style.pointerEvents = 'none';
        ripple.className = 'ripple';
        
        e.currentTarget.style.position = 'relative';
        e.currentTarget.style.overflow = 'hidden';
        e.currentTarget.appendChild(ripple);
        
        setTimeout(() => {
            ripple.style.transform = 'scale(2.5)';
            ripple.style.opacity = '0';
        }, 10);
        
        setTimeout(() => { ripple.remove(); }, 500);
    }

    openOverlay(overlay) { overlay.classList.remove('hidden'); }
    closeOverlay(overlay) { overlay.classList.add('hidden'); }

    startGame(mode) {
        if (Tone.context.state !== 'running') Tone.start();
        
        this.isPlaying = true;
        this.isPaused = false;
        this.gameMode = mode;
        this.score = 0;
        this.targets = [];
        this.particles = [];
        this.powerups = [];
        this.uiParticles = [];
        
        this.cryoActive = this.frenzyActive = this.netActive = false;

        this.scoreSpan.textContent = this.score;
        this.hudWrapper.classList.remove('hidden');
        this.gameOverlay.classList.add('hidden');
        this.pauseOverlay.classList.add('hidden');

        if (mode === 'classic') {
            this.lives = 3;
            this.livesSpan.parentElement.classList.remove('hidden');
            this.timerPanel.classList.add('hidden');
            this.livesSpan.textContent = this.lives;
        } else {
            this.gameTime = 60;
            this.livesSpan.parentElement.classList.add('hidden');
            this.timerPanel.classList.remove('hidden');
            this.timerSpan.textContent = this.gameTime + "s";
            
            clearInterval(this.gameClockInterval);
            this.gameClockInterval = setInterval(() => {
                if (!this.isPaused && this.isPlaying) {
                    this.gameTime--;
                    this.timerSpan.textContent = this.gameTime + "s";
                    if (this.gameTime <= 0) this.endGame(true);
                }
            }, 1000);
        }
    }

    togglePause() {
        if (!this.isPlaying) return;
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            this.pauseOverlay.classList.remove('hidden');
        } else {
            this.pauseOverlay.classList.add('hidden');
        }
    }

    abortGame() {
        clearInterval(this.gameClockInterval);
        this.isPlaying = false;
        this.isPaused = false;
        this.showMainMenu();
    }

    showMainMenu() {
        this.hudWrapper.classList.add('hidden');
        this.pauseOverlay.classList.add('hidden');
        this.gameOverlay.classList.remove('hidden');
        this.modeSelection.classList.remove('hidden');
        this.gameEndButtons.classList.add('hidden');
        this.overlayMessage.textContent = "TRAP SHOOTING PRO";
        this.overlayMessage.style.backgroundImage = 'linear-gradient(135deg, #10b981 0%, #047857 100%)';
        this.overlaySubtext.textContent = "Select operational loop parameter to initialize target arrays";
    }

    endGame(victory = false) {
        this.isPlaying = false;
        clearInterval(this.gameClockInterval);
        
        this.hudWrapper.classList.add('hidden');
        this.gameOverlay.classList.remove('hidden');
        this.modeSelection.classList.add('hidden');
        this.gameEndButtons.classList.remove('hidden');
        
        this.overlayMessage.textContent = victory ? "TIME ELAPSED" : "Game Over";
        this.overlayMessage.style.backgroundImage = victory ? 'linear-gradient(135deg, #06b6d4 0%, #0369a1 100%)' : 'linear-gradient(135deg, #ef4444 0%, #991b1b 100%)';
        this.overlaySubtext.textContent = `Come on, you can do better than that. Lock In! Your score is: ${this.score}`;
    }

    fireWeapon() {
        this.playTone('shoot');
        this.createExplosion(this.crosshair.x, this.crosshair.y, '#ffffff', 5);
        this.createUiShockwave(this.crosshair.x, this.crosshair.y);

        let hitRegistered = false;

        for (let i = this.targets.length - 1; i >= 0; i--) {
            let t = this.targets[i];
            let dist = Math.hypot(this.crosshair.x - t.x, this.crosshair.y - t.y);
            
            if (dist <= t.radius) {
                hitRegistered = true;
                this.targets.splice(i, 1);
                this.score += 10;
                this.scoreSpan.textContent = this.score;
                this.playTone('hit');
                this.createExplosion(t.x, t.y, t.color, 15);
                
                if (Math.random() < 0.25) {
                    this.spawnPowerup(t.x, t.y);
                }
                break;
            }
        }

        if (!hitRegistered) {
            for (let i = this.powerups.length - 1; i >= 0; i--) {
                let p = this.powerups[i];
                let dist = Math.hypot(this.crosshair.x - p.x, this.crosshair.y - p.y);
                if (dist <= p.radius) {
                    this.triggerPowerup(p.type);
                    this.powerups.splice(i, 1);
                    this.createExplosion(p.x, p.y, p.color, 12);
                    break;
                }
            }
        }
    }

    createUiShockwave(x, y) {
        this.uiParticles.push({
            type: 'shockwave',
            x: x,
            y: y,
            radius: 5,
            maxRadius: 40,
            alpha: 1,
            decay: 0.05
        });
    }

    spawnTarget() {
        const side = Math.random() > 0.5 ? 'left' : 'right';
        const radius = (this.baseWidth * 0.03) + Math.random() * (this.baseWidth * 0.015);
        
        const x = side === 'left' ? radius + Math.random() * (this.baseWidth * 0.2) : this.baseWidth - radius - Math.random() * (this.baseWidth * 0.2);
        const y = this.baseHeight + radius;
        
        const targetX = this.baseWidth / 2 + (Math.random() - 0.5) * (this.baseWidth * 0.3);
        const targetY = this.baseHeight * 0.15 + Math.random() * (this.baseHeight * 0.25);
        
        const gravity = this.baseHeight * 0.0005;
        const timeToPeak = Math.sqrt((2 * (y - targetY)) / gravity);
        
        const vy = -gravity * timeToPeak;
        const vx = (targetX - x) / timeToPeak;

        this.targets.push({ x, y, vx, vy, radius, gravity, color: '#f97316' });
    }

    spawnPowerup(x, y) {
        const types = ['medic', 'cryo', 'net', 'frenz'];
        const randType = types[Math.floor(Math.random() * types.length)];
        let color = '#fff';

        if (randType === 'medic') color = '#10b981';
        if (randType === 'cryo') color = '#06b6d4';
        if (randType === 'net') color = '#a855f7';
        if (randType === 'frenz') color = '#eab308';

        this.powerups.push({ x, y, vy: this.baseHeight * 0.004, radius: this.baseWidth * 0.02, type: randType, color });
    }

    triggerPowerup(type) {
        this.playTone('powerup');
        
        if (type === 'medic') {
            if (this.gameMode === 'classic') {
                this.lives = Math.min(5, this.lives + 1);
                this.livesSpan.textContent = this.lives;
            } else {
                this.score += 100;
                this.scoreSpan.textContent = this.score;
                this.createExplosion(this.crosshair.x, this.crosshair.y, '#10b981', 6);
            }
        } else if (type === 'cryo') {
            this.cryoActive = true; this.cryoTimer = 300;
        } else if (type === 'net') {
            this.netActive = true; this.netTimer = 400;
        } else if (type === 'frenz') {
            if (this.gameMode === 'timed') {
                this.frenzyActive = true; 
                this.frenzyTimer = 240; 
            } else {
                this.score += 75;
                this.scoreSpan.textContent = this.score;
                this.createExplosion(this.crosshair.x, this.crosshair.y, '#eab308', 6);
            }
        }
    }

    createExplosion(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * (this.baseWidth * 0.01),
                vy: (Math.random() - 0.5) * (this.baseHeight * 0.015),
                radius: 1 + Math.random() * (this.baseWidth * 0.006),
                alpha: 1,
                decay: 0.02 + Math.random() * 0.03,
                color
            });
        }
    }

    update(dt) {
        if (this.cryoActive) { this.cryoTimer--; if (this.cryoTimer <= 0) this.cryoActive = false; }
        if (this.frenzyActive) { this.frenzyTimer--; if (this.frenzyTimer <= 0) this.frenzyActive = false; }
        if (this.netActive) { this.netTimer--; if (this.netTimer <= 0) this.netActive = false; }

        this.crosshairGlowPulse += 0.1;

        this.spawnTimer += dt;
        let currentInterval = this.frenzyActive ? this.spawnInterval * 0.3 : this.spawnInterval;
        if (this.spawnTimer >= currentInterval) {
            this.spawnTarget();
            this.spawnTimer = 0;
        }

        let speedFactor = this.cryoActive ? 0.45 : 1.0;
        for (let i = this.targets.length - 1; i >= 0; i--) {
            let t = this.targets[i];
            t.vy += t.gravity * speedFactor;
            t.x += t.vx * speedFactor;
            t.y += t.vy * speedFactor;

            if (t.y > this.baseHeight + t.radius * 2) {
                this.targets.splice(i, 1);
                if (this.netActive) {
                    this.createExplosion(t.x, this.baseHeight - 10, '#a855f7', 8);
                } else {
                    this.playTone('miss');
                    if (this.gameMode === 'classic') {
                        this.lives--;
                        this.livesSpan.textContent = this.lives;
                        if (this.lives <= 0) this.endGame(false);
                    } else {
                        this.score = Math.max(0, this.score - 15);
                        this.scoreSpan.textContent = this.score;
                    }
                }
            }
        }

        for (let i = this.powerups.length - 1; i >= 0; i--) {
            let p = this.powerups[i];
            p.y += p.vy;
            if (p.y > this.baseHeight + p.radius * 2) this.powerups.splice(i, 1);
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];
            p.x += p.vx; p.y += p.vy; p.alpha -= p.decay;
            if (p.alpha <= 0) this.particles.splice(i, 1);
        }

        for (let i = this.uiParticles.length - 1; i >= 0; i--) {
            let up = this.uiParticles[i];
            if (up.type === 'shockwave') {
                up.radius += (up.maxRadius - up.radius) * 0.15;
                up.alpha -= up.decay;
                if (up.alpha <= 0) this.uiParticles.splice(i, 1);
            }
        }
    }

    draw() {
        this.ctx.fillStyle = '#0f172a'; 
        this.ctx.fillRect(0, 0, this.baseWidth, this.baseHeight);

        this.ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
        this.ctx.lineWidth = 1;
        let stepX = this.baseWidth / 20;
        let stepY = this.baseHeight / 12;
        
        for (let i = 0; i < this.baseWidth; i += stepX) {
            this.ctx.beginPath(); this.ctx.moveTo(i, 0); this.ctx.lineTo(i, this.baseHeight); this.ctx.stroke();
        }
        for (let j = 0; j < this.baseHeight; j += stepY) {
            this.ctx.beginPath(); this.ctx.moveTo(0, j); this.ctx.lineTo(this.baseWidth, j); this.ctx.stroke();
        }

        if ((this.isMouseInside || this.resolutionMode === '360x640') && this.isPlaying && !this.isPaused) {
            this.ctx.save();
            this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
            this.ctx.lineWidth = 1;
            this.ctx.setLineDash([4, 4]);
            
            this.ctx.beginPath();
            this.ctx.moveTo(0, this.crosshair.y);
            this.ctx.lineTo(this.baseWidth, this.crosshair.y);
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.moveTo(this.crosshair.x, 0);
            this.ctx.lineTo(this.crosshair.x, this.baseHeight);
            this.ctx.stroke();
            this.ctx.restore();
        }

        if (this.netActive) {
            let netH = this.baseHeight * 0.035;
            this.ctx.fillStyle = 'rgba(168, 85, 247, 0.15)';
            this.ctx.fillRect(0, this.baseHeight - netH, this.baseWidth, netH);
            this.ctx.strokeStyle = '#a855f7';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(0, this.baseHeight - netH, this.baseWidth, netH);
        }

        this.targets.forEach(t => {
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = t.color;
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = t.color;
            this.ctx.fill();
            this.ctx.beginPath();
            this.ctx.arc(t.x, t.y, t.radius * 0.6, 0, Math.PI * 2);
            this.ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            this.ctx.restore();
        });

        this.powerups.forEach(p => {
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = p.color;
            this.ctx.shadowBlur = 12;
            this.ctx.shadowColor = p.color;
            this.ctx.fill();
            this.ctx.fillStyle = '#fff';
            this.ctx.font = `900 ${this.baseWidth * 0.015}px Outfit, sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            let letter = p.type.charAt(0).toUpperCase();
            this.ctx.fillText(letter, p.x, p.y);
            this.ctx.restore();
        });

        this.particles.forEach(p => {
            this.ctx.save();
            this.ctx.globalAlpha = p.alpha;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = p.color;
            this.ctx.fill();
            this.ctx.restore();
        });

        this.uiParticles.forEach(up => {
            if (up.type === 'shockwave') {
                this.ctx.save();
                this.ctx.globalAlpha = up.alpha;
                this.ctx.strokeStyle = '#38bdf8';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(up.x, up.y, up.radius, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.restore();
            }
        });

        if (this.isPlaying && !this.isPaused) {
            this.ctx.save();

            if (this.cryoActive) {
                this.ctx.shadowBlur = 15 + Math.sin(this.crosshairGlowPulse) * 5;
                this.ctx.shadowColor = '#06b6d4';
            } else if (this.frenzyActive) {
                this.ctx.shadowBlur = 15 + Math.sin(this.crosshairGlowPulse) * 5;
                this.ctx.shadowColor = '#eab308';
            }

            this.ctx.beginPath();
            this.ctx.arc(this.crosshair.x, this.crosshair.y, this.baseWidth * 0.01, 0, Math.PI * 2);
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            let tick = this.baseWidth * 0.016;
            let gap = this.baseWidth * 0.005;
            
            this.ctx.beginPath();
            this.ctx.moveTo(this.crosshair.x - tick, this.crosshair.y); this.ctx.lineTo(this.crosshair.x - gap, this.crosshair.y);
            this.ctx.moveTo(this.crosshair.x + gap, this.crosshair.y); this.ctx.lineTo(this.crosshair.x + tick, this.crosshair.y);
            this.ctx.moveTo(this.crosshair.x, this.crosshair.y - tick); this.ctx.lineTo(this.crosshair.x, this.crosshair.y - gap);
            this.ctx.moveTo(this.crosshair.x, this.crosshair.y + gap); this.ctx.lineTo(this.crosshair.x, this.baseWidth * 0.016 + gap);
            
            this.ctx.strokeStyle = this.cryoActive ? '#06b6d4' : (this.frenzyActive ? '#eab308' : '#38bdf8');
            this.ctx.lineWidth = 1.5;
            this.ctx.stroke();
            this.ctx.restore();
        }
    }

    loop(timestamp) {
        if (!this.lastTime) this.lastTime = timestamp;
        let dt = timestamp - this.lastTime;
        this.lastTime = timestamp;

        if (dt > 100) dt = 16.66;
        if (this.isPlaying && !this.isPaused) this.update(dt);
        this.draw();
        requestAnimationFrame((t) => this.loop(t));
    }
}