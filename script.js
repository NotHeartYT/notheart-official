/**
 * ============================================================================
 * PART 1: SINGLE PAGE APPLICATION (SPA) NAVIGATION ENGINE
 * ============================================================================
 */
document.addEventListener('DOMContentLoaded', () => {
    const menuToggle   = document.getElementById('menuToggle');
    const navContainer = document.getElementById('navContainer');
    const navTabs      = document.querySelectorAll('.nav-tab');
    const viewPanels   = document.querySelectorAll('.view-panel');

    // --- VIEWPORT SWAP ENGINE ---
    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetPage = tab.getAttribute('data-target');

            navTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            viewPanels.forEach(panel => {
                panel.classList.toggle('active', panel.id === targetPage);
            });

            // Close mobile sidebar when a nav link is tapped
            if (navContainer && navContainer.classList.contains('active')) {
                navContainer.classList.remove('active');
            }

            window.scrollTo({ top: 0, behavior: 'smooth' });

            // Notify game engine of resize when arcade panel becomes visible
            if (targetPage === 'arcade' && window.arcadeGameEngine) {
                window.arcadeGameEngine.resizeCanvas();
            }

            // Start carousel auto-scroll when videos tab becomes active
            if (targetPage === 'videos' && window.carouselEngine) {
                window.carouselEngine.play();
            }
        });
    });

    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            navContainer.classList.toggle('active');
        });
    }

    // Boot the arcade game engine if the canvas exists
    if (document.getElementById('gameCanvas')) {
        window.arcadeGameEngine = new TrapShootingGame();
    }

    // -------------------------------------------------------------------------
    // IMPROVEMENT 1: FAQ ACCORDION — smooth toggle with animated +/− icon
    // -------------------------------------------------------------------------
    initFaqAccordion();

    // -------------------------------------------------------------------------
    // INFINITE SCROLLING CAROUSEL
    // -------------------------------------------------------------------------
    if (document.getElementById('carouselTrack')) {
        window.carouselEngine = new InfiniteCarousel({
            trackId:    'carouselTrack',
            pauseBtnId: 'carouselPause',
            playBtnId:  'carouselPlay',
            leftBtnId:  'carouselLeft',
            rightBtnId: 'carouselRight',
        });
    }
});


/**
 * ============================================================================
 * IMPROVEMENT 1: FAQ ACCORDION CONTROLLER
 * Handles smooth expand / collapse with animated +/− icon swap.
 * ============================================================================
 */
function initFaqAccordion() {
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        const toggle = item.querySelector('.faq-toggle');
        if (!toggle) return;

        toggle.addEventListener('click', () => {
            const isOpen = item.classList.contains('active');

            // Close all open items first (accordion behaviour)
            faqItems.forEach(other => {
                if (other !== item) {
                    other.classList.remove('active');
                }
            });

            // Toggle the clicked item
            item.classList.toggle('active', !isOpen);
        });
    });
}


/**
 * ============================================================================
 * INFINITE CAROUSEL ENGINE  — CSS-keyframe edition
 *
 * AUTO-SCROLL TECHNIQUE (zero JS math, zero measurement):
 *   The HTML track contains [original 4 cards] + [clone 4 cards].
 *   A CSS @keyframes animation moves the track from translateX(0)
 *   to translateX(-50%). Because the track is exactly twice as wide
 *   as one card-set, -50% = one full set width. When the animation
 *   loops back to 0% the visual position is identical — seamless.
 *
 * PAUSE / PLAY:
 *   Toggle animation-play-state via the CSS class `.is-paused`.
 *
 * MANUAL LEFT / RIGHT STEPS:
 *   When the user clicks a step button:
 *   1. Read the current rendered translateX from getComputedStyle
 *      (this captures the live CSS animation position without needing
 *      to store any JS offset state).
 *   2. Add/subtract the step amount.
 *   3. Clamp into the valid range [0, -halfWidth] using modulo so we
 *      never escape the seamless zone.
 *   4. Switch to `.js-controlled` mode (CSS animation: none +
 *      CSS transition for smooth easing), apply the new translateX.
 *   5. After the step transition ends, hand control back to the CSS
 *      animation by removing `.js-controlled` and syncing the
 *      animation-delay so it resumes from the correct position.
 * ============================================================================
 */
class InfiniteCarousel {
    constructor(opts) {
        this.track    = document.getElementById(opts.trackId);
        this.pauseBtn = document.getElementById(opts.pauseBtnId);
        this.playBtn  = document.getElementById(opts.playBtnId);
        this.leftBtn  = document.getElementById(opts.leftBtnId);
        this.rightBtn = document.getElementById(opts.rightBtnId);

        // Step size in px for manual navigation buttons
        this.STEP_PX = 420;

        // Animation duration in ms — must match the CSS (28s default)
        this.ANIM_DURATION_MS = this._readAnimDuration();

        // State
        this.isPlaying    = true;   // true = CSS animation running
        this.isJsControlled = false; // true while a manual step transition runs

        this._bindControls();
        this._updateControlHighlight();
    }

    // -----------------------------------------------------------------------
    // Read the current animation duration from computed style so responsive
    // CSS overrides (22s on tablet, 18s on mobile) are respected.
    // -----------------------------------------------------------------------
    _readAnimDuration() {
        const raw = getComputedStyle(this.track).animationDuration;
        // raw is e.g. "28s" or "22s"
        return (parseFloat(raw) || 28) * 1000;
    }

    // -----------------------------------------------------------------------
    // Return the track's current translateX in px by reading the live
    // computed transform matrix. Works whether CSS animation or JS is driving.
    // -----------------------------------------------------------------------
    _getCurrentTranslateX() {
        const matrix = new DOMMatrix(getComputedStyle(this.track).transform);
        return matrix.m41; // translateX component
    }

    // -----------------------------------------------------------------------
    // The half-width is the loop boundary: track.scrollWidth / 2.
    // Because the track contains exactly 2 equal sets this equals one set.
    // -----------------------------------------------------------------------
    _getHalfWidth() {
        return this.track.scrollWidth / 2;
    }

    // -----------------------------------------------------------------------
    // PAUSE — freeze the CSS animation in place
    // -----------------------------------------------------------------------
    pause() {
        if (this.isJsControlled) return; // step in progress, ignore
        this.isPlaying = false;
        this.track.classList.add('is-paused');
        this._updateControlHighlight();
    }

    // -----------------------------------------------------------------------
    // PLAY — resume the CSS animation from where it was frozen.
    // We sync the animation-delay so it continues from the current position
    // rather than jumping back to the start of the keyframe.
    // -----------------------------------------------------------------------
    play() {
        if (this.isJsControlled) return;
        this.isPlaying = true;

        if (this.track.classList.contains('is-paused')) {
            // Compute how far through the animation we currently are,
            // then set a negative delay so it picks up at that progress.
            this._syncAnimationToCurrentPosition();
        }

        this.track.classList.remove('is-paused');
        this._updateControlHighlight();
    }

    // -----------------------------------------------------------------------
    // Sync animation-delay to the current visual position so that removing
    // .is-paused resumes from exactly the right frame.
    // -----------------------------------------------------------------------
    _syncAnimationToCurrentPosition() {
        const halfWidth  = this._getHalfWidth();
        const currentX   = this._getCurrentTranslateX(); // negative px
        // progress 0→1 maps translateX 0 → -halfWidth
        const progress   = Math.abs(currentX) / halfWidth;
        const elapsed    = progress * this.ANIM_DURATION_MS;
        // Negative delay tells the browser the animation "already ran" by
        // that many ms, so it starts mid-cycle.
        this.track.style.animationDelay = `-${elapsed}ms`;
    }

    // -----------------------------------------------------------------------
    // MANUAL STEP — smoothly nudge the track by STEP_PX, staying in range.
    // -----------------------------------------------------------------------
    _step(direction) {
        // direction: +1 = right (scroll track left), -1 = left (scroll track right)
        if (this.isJsControlled) return; // ignore if a step is already running

        const halfWidth  = this._getHalfWidth();
        if (halfWidth === 0) return;

        // Freeze CSS animation and snapshot the current position
        const wasPlaying = this.isPlaying;
        this.track.classList.add('is-paused');

        let currentX = this._getCurrentTranslateX(); // px, e.g. -240.5

        // Target after the step
        let targetX = currentX - direction * this.STEP_PX;

        // Clamp into [-halfWidth, 0] using modulo so we never escape
        // the seamless zone. E.g. if targetX = 10 (past 0) we wrap to
        // the equivalent position one half-width in.
        if (targetX > 0) {
            targetX = targetX - halfWidth; // wrap from right edge to equivalent in left half
        } else if (targetX < -halfWidth) {
            targetX = targetX + halfWidth; // wrap from left edge to equivalent in right half
        }

        // Switch to JS control: remove CSS animation, add transition class
        this.isJsControlled = true;
        this.track.classList.add('js-controlled');
        this.track.style.animationDelay = ''; // clear any delay we set

        // Force a reflow so the browser registers the class change before
        // we set the transform (without this the transition won't fire).
        void this.track.offsetWidth;

        // Apply the target position — CSS transition handles the ease
        this.track.style.transform = `translateX(${targetX}px)`;

        // After the transition completes, hand back to CSS animation
        const onDone = () => {
            this.track.removeEventListener('transitionend', onDone);

            // Sync animation delay to resume from the position we just landed on
            const halfW    = this._getHalfWidth();
            const progress = Math.abs(targetX) / halfW;
            const elapsed  = progress * this._readAnimDuration();
            this.track.style.animationDelay = `-${elapsed}ms`;

            // Remove JS control — CSS animation takes over again
            this.track.style.transform = '';
            this.track.classList.remove('js-controlled');
            this.isJsControlled = false;

            if (wasPlaying) {
                this.track.classList.remove('is-paused');
            }
            // If user had paused, leave it paused (is-paused stays)
        };

        this.track.addEventListener('transitionend', onDone, { once: true });
    }

    // -----------------------------------------------------------------------
    // BIND CONTROLS
    // -----------------------------------------------------------------------
    _bindControls() {
        this.pauseBtn.addEventListener('click', () => this.pause());
        this.playBtn.addEventListener('click',  () => this.play());
        this.leftBtn.addEventListener('click',  () => this._step(-1));
        this.rightBtn.addEventListener('click', () => this._step(+1));
    }

    _updateControlHighlight() {
        this.pauseBtn.classList.toggle('is-active-ctrl', !this.isPlaying);
        this.playBtn.classList.toggle('is-active-ctrl',   this.isPlaying);
    }
}


/**
 * ============================================================================
 * PART 2: TRAP SHOOTING PRO GAME ENGINE (BALANCED POWER-UPS MATRIX)
 * (Original code — fully preserved, no changes)
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

        this.isMouseInside = false;
        this.crosshairGlowPulse = 0;
        this.uiParticles = [];

        this.detectDeviceEnvironment();
        this.initElements();
        this.initAudio();
        this.resizeCanvas();
        this.setupEventListeners();
        
        requestAnimationFrame((t) => this.loop(t));
    }

    detectDeviceEnvironment() {
        const mobileCheck = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const smallWindowCheck = window.innerWidth <= 760 || window.innerHeight > window.innerWidth;
        
        if (mobileCheck || smallWindowCheck) {
            this.resolutionMode = '360x640';
        } else {
            this.resolutionMode = 'auto';
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
            if (type === 'shoot')  this.synth.triggerAttackRelease("C3", "0.05");
            else if (type === 'hit')     this.synth.triggerAttackRelease("E5", "0.08");
            else if (type === 'powerup') this.synth.triggerAttackRelease(["G4", "C5", "E5"], "0.15");
            else if (type === 'miss')    this.synth.triggerAttackRelease("A2", "0.2");
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
            this.detectDeviceEnvironment();
            this.resizeCanvas();
        });

        this.canvas.addEventListener('mouseenter', () => { this.isMouseInside = true; });
        this.canvas.addEventListener('mouseleave', () => { this.isMouseInside = false; });

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
            btn.addEventListener('click', (e) => { this.createUiRipple(e); });
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
        ripple.style.cssText = `
            position:absolute;
            background-color:rgba(255,255,255,.35);
            width:${Math.max(rect.width, rect.height)}px;
            height:${Math.max(rect.width, rect.height)}px;
            left:${x - Math.max(rect.width, rect.height) / 2}px;
            top:${y - Math.max(rect.width, rect.height) / 2}px;
            border-radius:50%;
            transform:scale(0);
            transition:transform .5s ease-out, opacity .5s ease-out;
            pointer-events:none;
        `;
        ripple.className = 'ripple';
        e.currentTarget.style.position = 'relative';
        e.currentTarget.style.overflow = 'hidden';
        e.currentTarget.appendChild(ripple);
        
        setTimeout(() => { ripple.style.transform = 'scale(2.5)'; ripple.style.opacity = '0'; }, 10);
        setTimeout(() => { ripple.remove(); }, 500);
    }

    openOverlay(overlay)  { overlay.classList.remove('hidden'); }
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
        this.pauseOverlay.classList.toggle('hidden', !this.isPaused);
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
        this.overlayMessage.style.backgroundImage = victory
            ? 'linear-gradient(135deg, #06b6d4 0%, #0369a1 100%)'
            : 'linear-gradient(135deg, #ef4444 0%, #991b1b 100%)';
        this.overlaySubtext.textContent = `Come on, you can do better than that. Lock In! Your score is: ${this.score}`;
    }

    fireWeapon() {
        this.playTone('shoot');
        this.createExplosion(this.crosshair.x, this.crosshair.y, '#ffffff', 5);
        this.createUiShockwave(this.crosshair.x, this.crosshair.y);

        let hitRegistered = false;

        for (let i = this.targets.length - 1; i >= 0; i--) {
            let t = this.targets[i];
            if (Math.hypot(this.crosshair.x - t.x, this.crosshair.y - t.y) <= t.radius) {
                hitRegistered = true;
                this.targets.splice(i, 1);
                this.score += 10;
                this.scoreSpan.textContent = this.score;
                this.playTone('hit');
                this.createExplosion(t.x, t.y, t.color, 15);
                if (Math.random() < 0.25) this.spawnPowerup(t.x, t.y);
                break;
            }
        }

        if (!hitRegistered) {
            for (let i = this.powerups.length - 1; i >= 0; i--) {
                let p = this.powerups[i];
                if (Math.hypot(this.crosshair.x - p.x, this.crosshair.y - p.y) <= p.radius) {
                    this.triggerPowerup(p.type);
                    this.powerups.splice(i, 1);
                    this.createExplosion(p.x, p.y, p.color, 12);
                    break;
                }
            }
        }
    }

    createUiShockwave(x, y) {
        this.uiParticles.push({ type: 'shockwave', x, y, radius: 5, maxRadius: 40, alpha: 1, decay: 0.05 });
    }

    spawnTarget() {
        const side   = Math.random() > 0.5 ? 'left' : 'right';
        const radius = (this.baseWidth * 0.03) + Math.random() * (this.baseWidth * 0.015);
        
        const x = side === 'left'
            ? radius + Math.random() * (this.baseWidth * 0.2)
            : this.baseWidth - radius - Math.random() * (this.baseWidth * 0.2);
        const y = this.baseHeight + radius;
        
        const targetX = this.baseWidth / 2 + (Math.random() - 0.5) * (this.baseWidth * 0.3);
        const targetY = this.baseHeight * 0.15 + Math.random() * (this.baseHeight * 0.25);
        
        const gravity   = this.baseHeight * 0.0005;
        const timeToPeak = Math.sqrt((2 * (y - targetY)) / gravity);
        
        this.targets.push({
            x, y,
            vx: (targetX - x) / timeToPeak,
            vy: -gravity * timeToPeak,
            radius,
            gravity,
            color: '#f97316'
        });
    }

    spawnPowerup(x, y) {
        const types   = ['medic', 'cryo', 'net', 'frenz'];
        const randType = types[Math.floor(Math.random() * types.length)];
        const colorMap = { medic: '#10b981', cryo: '#06b6d4', net: '#a855f7', frenz: '#eab308' };

        this.powerups.push({
            x, y,
            vy:     this.baseHeight * 0.004,
            radius: this.baseWidth * 0.02,
            type:   randType,
            color:  colorMap[randType] || '#fff'
        });
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
                this.frenzyActive = true; this.frenzyTimer = 240;
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
                vx:    (Math.random() - 0.5) * (this.baseWidth * 0.01),
                vy:    (Math.random() - 0.5) * (this.baseHeight * 0.015),
                radius: 1 + Math.random() * (this.baseWidth * 0.006),
                alpha:  1,
                decay:  0.02 + Math.random() * 0.03,
                color
            });
        }
    }

    update(dt) {
        if (this.cryoActive)   { this.cryoTimer--;   if (this.cryoTimer <= 0)   this.cryoActive = false; }
        if (this.frenzyActive) { this.frenzyTimer--;  if (this.frenzyTimer <= 0) this.frenzyActive = false; }
        if (this.netActive)    { this.netTimer--;     if (this.netTimer <= 0)    this.netActive = false; }

        this.crosshairGlowPulse += 0.1;

        this.spawnTimer += dt;
        const currentInterval = this.frenzyActive ? this.spawnInterval * 0.3 : this.spawnInterval;
        if (this.spawnTimer >= currentInterval) {
            this.spawnTarget();
            this.spawnTimer = 0;
        }

        const speedFactor = this.cryoActive ? 0.45 : 1.0;
        for (let i = this.targets.length - 1; i >= 0; i--) {
            let t = this.targets[i];
            t.vy += t.gravity * speedFactor;
            t.x  += t.vx * speedFactor;
            t.y  += t.vy * speedFactor;

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
                up.alpha  -= up.decay;
                if (up.alpha <= 0) this.uiParticles.splice(i, 1);
            }
        }
    }

    draw() {
        this.ctx.fillStyle = '#0f172a';
        this.ctx.fillRect(0, 0, this.baseWidth, this.baseHeight);

        // Grid lines
        this.ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
        this.ctx.lineWidth = 1;
        for (let i = 0; i < this.baseWidth; i += this.baseWidth / 20) {
            this.ctx.beginPath(); this.ctx.moveTo(i, 0); this.ctx.lineTo(i, this.baseHeight); this.ctx.stroke();
        }
        for (let j = 0; j < this.baseHeight; j += this.baseHeight / 12) {
            this.ctx.beginPath(); this.ctx.moveTo(0, j); this.ctx.lineTo(this.baseWidth, j); this.ctx.stroke();
        }

        // Crosshair guide lines
        if ((this.isMouseInside || this.resolutionMode === '360x640') && this.isPlaying && !this.isPaused) {
            this.ctx.save();
            this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
            this.ctx.lineWidth = 1;
            this.ctx.setLineDash([4, 4]);
            this.ctx.beginPath();
            this.ctx.moveTo(0, this.crosshair.y); this.ctx.lineTo(this.baseWidth, this.crosshair.y); this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.moveTo(this.crosshair.x, 0); this.ctx.lineTo(this.crosshair.x, this.baseHeight); this.ctx.stroke();
            this.ctx.restore();
        }

        // Net powerup visualiser
        if (this.netActive) {
            const netH = this.baseHeight * 0.035;
            this.ctx.fillStyle = 'rgba(168, 85, 247, 0.15)';
            this.ctx.fillRect(0, this.baseHeight - netH, this.baseWidth, netH);
            this.ctx.strokeStyle = '#a855f7';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(0, this.baseHeight - netH, this.baseWidth, netH);
        }

        // Targets
        this.targets.forEach(t => {
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = t.color;
            this.ctx.shadowBlur = 10; this.ctx.shadowColor = t.color;
            this.ctx.fill();
            this.ctx.beginPath();
            this.ctx.arc(t.x, t.y, t.radius * 0.6, 0, Math.PI * 2);
            this.ctx.strokeStyle = 'rgba(255,255,255,0.4)'; this.ctx.lineWidth = 2; this.ctx.stroke();
            this.ctx.restore();
        });

        // Power-ups
        this.powerups.forEach(p => {
            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = p.color; this.ctx.shadowBlur = 12; this.ctx.shadowColor = p.color; this.ctx.fill();
            this.ctx.fillStyle = '#fff';
            this.ctx.font = `900 ${this.baseWidth * 0.015}px Outfit, sans-serif`;
            this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle';
            this.ctx.fillText(p.type.charAt(0).toUpperCase(), p.x, p.y);
            this.ctx.restore();
        });

        // Explosion particles
        this.particles.forEach(p => {
            this.ctx.save();
            this.ctx.globalAlpha = p.alpha;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = p.color; this.ctx.fill();
            this.ctx.restore();
        });

        // UI shockwaves
        this.uiParticles.forEach(up => {
            if (up.type === 'shockwave') {
                this.ctx.save();
                this.ctx.globalAlpha = up.alpha;
                this.ctx.strokeStyle = '#38bdf8'; this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(up.x, up.y, up.radius, 0, Math.PI * 2); this.ctx.stroke();
                this.ctx.restore();
            }
        });

        // Crosshair
        if (this.isPlaying && !this.isPaused) {
            this.ctx.save();

            if (this.cryoActive) {
                this.ctx.shadowBlur = 15 + Math.sin(this.crosshairGlowPulse) * 5;
                this.ctx.shadowColor = '#06b6d4';
            } else if (this.frenzyActive) {
                this.ctx.shadowBlur = 15 + Math.sin(this.crosshairGlowPulse) * 5;
                this.ctx.shadowColor = '#eab308';
            }

            const tick = this.baseWidth * 0.016;
            const gap  = this.baseWidth * 0.005;

            this.ctx.beginPath();
            this.ctx.arc(this.crosshair.x, this.crosshair.y, this.baseWidth * 0.01, 0, Math.PI * 2);
            this.ctx.strokeStyle = '#ffffff'; this.ctx.lineWidth = 2; this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.moveTo(this.crosshair.x - tick, this.crosshair.y); this.ctx.lineTo(this.crosshair.x - gap, this.crosshair.y);
            this.ctx.moveTo(this.crosshair.x + gap,  this.crosshair.y); this.ctx.lineTo(this.crosshair.x + tick, this.crosshair.y);
            this.ctx.moveTo(this.crosshair.x, this.crosshair.y - tick); this.ctx.lineTo(this.crosshair.x, this.crosshair.y - gap);
            this.ctx.moveTo(this.crosshair.x, this.crosshair.y + gap);  this.ctx.lineTo(this.crosshair.x, this.crosshair.y + tick);

            this.ctx.strokeStyle = this.cryoActive ? '#06b6d4' : (this.frenzyActive ? '#eab308' : '#38bdf8');
            this.ctx.lineWidth = 1.5; this.ctx.stroke();
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
