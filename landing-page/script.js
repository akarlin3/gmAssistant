/* ==========================================================================
   Gamemaster Assistant - Premium Webpage Logic
   Handles Interactive Dashboard Mockup, Live Clocks, AI Streaming, & Waitlist
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* --- 0. FIREBASE INITIALIZATION & FIRESTORE SETUP --- */
  const firebaseConfig = {
    apiKey: "AIzaSyCWKBxIi9DTuA8hiSMCDUCkNiG_fsFlxyg",
    authDomain: "campaign-prep-fc9ed.firebaseapp.com",
    projectId: "campaign-prep-fc9ed",
    storageBucket: "campaign-prep-fc9ed.firebasestorage.app",
    messagingSenderId: "549573496390",
    appId: "1:549573496390:web:0e718df86b18bbbbb28447"
  };

  let db = null;
  try {
    if (typeof firebase !== 'undefined') {
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
    }
  } catch (err) {
    console.error("Firebase Web SDK initialization failed:", err);
  }

  /* --- 1. STICKY HEADER SCROLL BEHAVIOR --- */
  const header = document.getElementById('main-header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });


  /* --- 2. INTERACTIVE MOCKUP: TAB SWITCHING --- */
  const tabs = document.querySelectorAll('.mockup-tab');
  const panes = document.querySelectorAll('.mockup-pane');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active from all tabs
      tabs.forEach(t => t.classList.remove('active'));
      // Add active to clicked tab
      tab.classList.add('active');

      // Hide all panes
      panes.forEach(pane => pane.classList.remove('active'));
      // Show matching pane
      const targetPaneId = `pane-${tab.dataset.tab}`;
      const targetPane = document.getElementById(targetPaneId);
      if (targetPane) {
        targetPane.classList.add('active');
      }
    });
  });


  /* --- 3. INTERACTIVE MOCKUP: PLAY MODE SWITCHER (Standard / Duet / Solo) --- */
  const modeSwitcherContainer = document.getElementById('mode-switcher-container');
  const modeLabels = modeSwitcherContainer.querySelectorAll('.mode-label');

  // Secrets selectors
  const labelSecrets = document.getElementById('progress-label-secrets');
  const counterSecrets = document.getElementById('progress-counter-secrets');
  const fillSecrets = document.getElementById('progress-fill-secrets');

  // Factions selectors
  const labelFactions = document.getElementById('progress-label-factions');
  const counterFactions = document.getElementById('progress-counter-factions');
  const fillFactions = document.getElementById('progress-fill-factions');

  // Mock State Tracking
  let currentPlayMode = 'standard'; // 'standard' | 'duet' | 'solo'
  let activeSecretsCount = 3; // Starting state: 3 secrets resolved/toggled
  let activeFactionsCount = 2; // Starting state: 2 active factions

  function updateMockupTargets() {
    // Sync active style classes across labels
    modeLabels.forEach(label => {
      if (label.dataset.mode === currentPlayMode) {
        label.classList.add('active');
      } else {
        label.classList.remove('active');
      }
    });

    if (currentPlayMode === 'solo') {
      // SOLO TARGETS: 5 Secrets, 2 Factions
      labelSecrets.textContent = "Shoot for 5 Secrets (Solo Target)";
      counterSecrets.textContent = `${activeSecretsCount} / 5`;
      const secretPercent = Math.min((activeSecretsCount / 5) * 100, 100);
      fillSecrets.style.width = `${secretPercent}%`;

      labelFactions.textContent = "Active Factions (Solo Target)";
      counterFactions.textContent = `${activeFactionsCount} / 2`;
      const factionPercent = Math.min((activeFactionsCount / 2) * 100, 100);
      fillFactions.style.width = `${factionPercent}%`;
    } else if (currentPlayMode === 'duet') {
      // DUET TARGETS: 7 Secrets, 3 Factions
      labelSecrets.textContent = "Shoot for 7 Secrets (Duet Target)";
      counterSecrets.textContent = `${activeSecretsCount} / 7`;
      const secretPercent = Math.min((activeSecretsCount / 7) * 100, 100);
      fillSecrets.style.width = `${secretPercent}%`;

      labelFactions.textContent = "Active Factions (Duet Target)";
      counterFactions.textContent = `${activeFactionsCount} / 3`;
      const factionPercent = Math.min((activeFactionsCount / 3) * 100, 100);
      fillFactions.style.width = `${factionPercent}%`;
    } else {
      // STANDARD TARGETS: 10 Secrets, 4 Factions
      labelSecrets.textContent = "Shoot for 10 Secrets";
      counterSecrets.textContent = `${activeSecretsCount} / 10`;
      const secretPercent = Math.min((activeSecretsCount / 10) * 100, 100);
      fillSecrets.style.width = `${secretPercent}%`;

      labelFactions.textContent = "Active Factions";
      counterFactions.textContent = `${activeFactionsCount} / 4`;
      const factionPercent = Math.min((activeFactionsCount / 4) * 100, 100);
      fillFactions.style.width = `${factionPercent}%`;
    }
  }

  modeLabels.forEach(label => {
    label.addEventListener('click', () => {
      currentPlayMode = label.dataset.mode;
      updateMockupTargets();
    });
  });


  /* --- 4. SECRETS CHECKLIST: CLICK REVEAL TO PARTY --- */
  const secretItems = document.querySelectorAll('.secret-item');

  secretItems.forEach((item, idx) => {
    // Set initially active classes based on start state (first 3 are revealed)
    item.classList.add('revealed');

    item.addEventListener('click', () => {
      item.classList.toggle('revealed');
      
      // Update state count
      if (item.classList.contains('revealed')) {
        activeSecretsCount++;
      } else {
        activeSecretsCount--;
      }

      // Safeguard boundaries
      activeSecretsCount = Math.max(0, Math.min(activeSecretsCount, secretItems.length));
      
      // Update targets live
      updateMockupTargets();
    });
  });


  /* --- 5. INTERACTIVE FACTION CLOCKS --- */
  const clockDials = document.querySelectorAll('.clock-dial');

  clockDials.forEach(clock => {
    renderClockDial(clock);

    clock.addEventListener('click', () => {
      let currentTicks = parseInt(clock.getAttribute('data-ticks'), 10);
      const maxTicks = parseInt(clock.getAttribute('data-max'), 10);

      // Increment clock segment
      currentTicks = (currentTicks + 1) % (maxTicks + 1);
      clock.setAttribute('data-ticks', currentTicks);

      renderClockDial(clock);
    });
  });

  // Dynamically redraw SVG segments depending on tick values
  function renderClockDial(svg) {
    const ticks = parseInt(svg.getAttribute('data-ticks'), 10);
    const max = parseInt(svg.getAttribute('data-max'), 10);
    
    // Clear old segment paths (keep background circle and tick lines)
    const oldPaths = svg.querySelectorAll('.clock-filled-segment');
    oldPaths.forEach(p => p.remove());

    if (ticks === 0) return;

    // Create segments paths
    const cx = 50;
    const cy = 50;
    const r = 45;

    if (ticks === max) {
      // Full circle filled
      const fullCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      fullCircle.setAttribute('cx', cx);
      fullCircle.setAttribute('cy', cy);
      fullCircle.setAttribute('r', r);
      fullCircle.setAttribute('fill', 'rgba(212, 175, 55, 0.3)');
      fullCircle.setAttribute('stroke', 'var(--color-gold-parchment)');
      fullCircle.setAttribute('stroke-width', '4');
      fullCircle.setAttribute('class', 'clock-filled-segment');
      // Insert before tick lines so lines stay visible on top
      svg.insertBefore(fullCircle, svg.querySelector('.clock-ticks'));
      return;
    }

    // Pie slice mathematics
    const sliceAngle = 360 / max;
    for (let i = 0; i < ticks; i++) {
      const startAngle = -90 + (i * sliceAngle);
      const endAngle = startAngle + sliceAngle;

      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      const x1 = cx + r * Math.cos(startRad);
      const y1 = cy + r * Math.sin(startRad);
      const x2 = cx + r * Math.cos(endRad);
      const y2 = cy + r * Math.sin(endRad);

      const largeArc = 0; // Each slice is < 180 degrees

      const pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('fill', 'rgba(212, 175, 55, 0.3)');
      path.setAttribute('stroke', 'var(--color-gold-parchment)');
      path.setAttribute('stroke-width', '4');
      path.setAttribute('class', 'clock-filled-segment');
      
      svg.insertBefore(path, svg.querySelector('.clock-ticks'));
    }
  }


  /* --- 6. VIVIFY PROSE GENERATOR: LIVE NARRATIVE STREAMING --- */
  const btnVivify = document.getElementById('btn-vivify-trigger');
  const vivifyPlaceholder = document.getElementById('vivify-placeholder');
  const vivifyTargetText = document.getElementById('vivify-target-text');
  const vivifyCursor = document.getElementById('vivify-cursor-elem');

  const vivifyProseScript = [
    "The cold stone arches of the Bleeding Star Temple hum with a low, vibrational frequency that rattles the teeth. ",
    "Incense heavy with myrrh and iron filings chokes the air, rising in spiraling pillars toward a jagged skylight. ",
    "At the obsidian altar stands High Priest Vaelen, his eyes vacant, glassy, and completely unblinking. ",
    "He mutters an ancient dialect of the Void that no living man should know—his shadow dancing against the wall as if it has a mind of its own..."
  ].join("");

  let isStreaming = false;

  btnVivify.addEventListener('click', () => {
    if (isStreaming) return;

    isStreaming = true;
    btnVivify.disabled = true;
    btnVivify.style.opacity = '0.5';
    vivifyPlaceholder.style.display = 'none';
    vivifyTargetText.textContent = "";
    vivifyCursor.style.display = 'inline-block';

    let index = 0;
    
    function streamChar() {
      if (index < vivifyProseScript.length) {
        vivifyTargetText.textContent += vivifyProseScript.charAt(index);
        index++;
        
        // Dynamic reading pacing - faster for spaces, slightly paused for punctuation
        let delay = 25;
        const char = vivifyProseScript.charAt(index - 1);
        if (char === '.' || char === '—' || char === ',') delay = 180;
        
        setTimeout(streamChar, delay);
      } else {
        // Complete
        isStreaming = false;
        btnVivify.disabled = false;
        btnVivify.style.opacity = '1';
        vivifyCursor.style.display = 'none';
      }
    }

    streamChar();
  });


  /* --- 7. PLAYER MODE DISCLOSURES (REAL-TIME GM TO PLAYER SYNC) --- */
  const revealBtns = document.querySelectorAll('.reveal-btn');
  const playerBubbleDrakespire = document.getElementById('player-bubble-drakespire');
  const playerBubbleDoppel = document.getElementById('player-bubble-doppel');

  revealBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const entity = btn.dataset.entity;
      const revealState = btn.dataset.reveal; // "private" or "party"

      // Select sibling controls
      const siblingBtns = btn.parentElement.querySelectorAll('.reveal-btn');
      siblingBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (entity === 'drakespire') {
        if (revealState === 'party') {
          playerBubbleDrakespire.classList.add('highlighted');
          playerBubbleDrakespire.innerHTML = `<strong>Fantastic Location:</strong> Fallen Drakespire <span class="mono-ui" style="font-size: 0.65rem; color: var(--color-success); border: 1px solid var(--color-success); padding: 1px 4px; border-radius:3px; margin-left: 6px;">REVEALED</span><br><span style="font-size:0.8rem; color: var(--color-text-secondary);">An ancient mountain vault featuring a massive, inactive portal keyed to the elemental plane of fire.</span>`;
        } else {
          playerBubbleDrakespire.classList.remove('highlighted');
          playerBubbleDrakespire.innerHTML = `<strong>Fantastic Location:</strong> <span class="player-content-redacted">[Redacted by GM]</span>`;
        }
      } else if (entity === 'doppel') {
        if (revealState === 'party') {
          playerBubbleDoppel.classList.add('highlighted');
          playerBubbleDoppel.innerHTML = `<strong>NPC:</strong> High Priest Vaelen <span class="mono-ui" style="font-size: 0.65rem; color: var(--color-success); border: 1px solid var(--color-success); padding: 1px 4px; border-radius:3px; margin-left: 6px;">REVEALED</span><br><span style="font-size:0.8rem; color: var(--color-text-secondary);">The spiritual leader of the star cult. A secret shapeshifter doppelganger has killed and replaced him.</span>`;
        } else {
          playerBubbleDoppel.classList.remove('highlighted');
          playerBubbleDoppel.innerHTML = `<strong>NPC:</strong> <span class="player-content-redacted">[Redacted by GM]</span>`;
        }
      }
    });
  });


  /* --- 8. PRICING & EMAIL WAITLIST SIGNUP --- */
  const signupForm = document.getElementById('email-signup-form');
  const waitlistInput = document.getElementById('waitlist-email');
  const formContainer = document.getElementById('waitlist-form-container');
  const successContainer = document.getElementById('waitlist-success-container');
  const successEmailDisplay = document.getElementById('success-email-display');
  const formError = document.getElementById('form-error-msg');
  const btnSubmit = document.getElementById('btn-submit-form');

  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const emailValue = waitlistInput.value.trim();
    
    // Quick validation check
    if (!validateEmail(emailValue)) {
      formError.style.display = 'block';
      waitlistInput.classList.add('invalid');
      return;
    }
    
    // Clear any previous error states
    formError.style.display = 'none';
    waitlistInput.classList.remove('invalid');
    
    // Set loading button state
    btnSubmit.disabled = true;
    btnSubmit.style.opacity = '0.7';
    btnSubmit.textContent = "Writing scroll...";

    const completeFormSubmission = () => {
      // Transition views
      formContainer.style.display = 'none';
      successContainer.style.display = 'flex';
      successEmailDisplay.textContent = `SUMMONED TO: ${emailValue.toUpperCase()}`;

      // Trigger beautiful custom confetti fireworks
      triggerConfettiExplosion(successContainer);
    };

    // Save locally as backup
    saveSignupToLocalStorage(emailValue);

    // Save to Google Cloud Firestore if available
    if (db) {
      db.collection('publicWaitlist').doc(emailValue).set({
        email: emailValue,
        createdAtMs: Date.now(),
        createdAt: new Date().toISOString()
      })
      .then(() => {
        completeFormSubmission();
      })
      .catch((err) => {
        console.error("Firestore write failed:", err);
        // Fallback to local success even if database write fails (fault-tolerant UX)
        completeFormSubmission();
      });
    } else {
      // Fallback if Firebase is offline or not loaded
      setTimeout(completeFormSubmission, 1200);
    }
  });

  function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  function saveSignupToLocalStorage(email) {
    try {
      let signups = JSON.parse(localStorage.getItem('gamemaster_waitlist_emails')) || [];
      if (!signups.includes(email)) {
        signups.push({
          email: email,
          timestamp: new Date().toISOString()
        });
        localStorage.setItem('gamemaster_waitlist_emails', JSON.stringify(signups));
      }
    } catch (err) {
      console.warn("Could not save waitlist locally:", err);
    }
  }


  /* --- 9. CUSTOM CONFETTI EXPLOSION PHYSICS --- */
  function triggerConfettiExplosion(parentElement) {
    const particleCount = 45;
    const colors = ['#d4af37', '#ffbf00', '#8b5cf6', '#a78bfa', '#10b981', '#ffffff'];
    
    const rect = parentElement.getBoundingClientRect();
    const parentX = rect.left + rect.width / 2;
    const parentY = rect.top + rect.height / 2;

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'confetti-sparkle';
      
      // Random color
      const color = colors[Math.floor(Math.random() * colors.length)];
      particle.style.backgroundColor = color;
      
      // Position particle at center of wrapper
      particle.style.left = '50%';
      particle.style.top = '40%';
      
      // Physics vectors - random direction angles and distances
      const angle = Math.random() * Math.PI * 2;
      const velocity = 50 + Math.random() * 150;
      
      const tx = Math.cos(angle) * velocity;
      const ty = Math.sin(angle) * velocity;
      
      particle.style.setProperty('--tx', `${tx}px`);
      particle.style.setProperty('--ty', `${ty}px`);

      // Random sizes
      const size = 6 + Math.random() * 8;
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      
      // Random rotation
      particle.style.transform = `rotate(${Math.random() * 360}deg)`;

      parentElement.appendChild(particle);

      // Clean up DOM after animation completes
      setTimeout(() => {
        particle.remove();
      }, 1500);
    }
  }

});
