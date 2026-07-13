/*
 * CampusVibe Assistant — floating help widget
 * ============================================
 * Self-contained: injects its own HTML/CSS and mounts on every page that
 * includes this script, so no per-page markup is needed.
 *
 * How it answers:
 * 1. First tries a local knowledge base (instant, works even if the server
 *    endpoint is unavailable) covering the common questions about how
 *    CampusVibe actually works — registration, payment, discount codes,
 *    approvals, tickets, organizer signup, etc.
 * 2. If nothing matches confidently, it asks the server (/api/chatbot).
 *    That endpoint uses a real LLM if the site owner has configured an
 *    OPENAI_API_KEY (see server.js) — otherwise it politely says it isn't
 *    sure and offers to escalate to the organizer/support instead of
 *    guessing.
 *
 * This is intentionally honest: without a configured LLM API key, the
 * assistant is a well-built FAQ bot, not a general-purpose AI. Once a key
 * is added server-side, the exact same widget starts giving genuinely
 * open-ended, LLM-generated answers with no client changes needed.
 */
(function () {
  const KB = [
    {
      keys: ['register', 'sign up', 'signup', 'how do i join', 'how to register'],
      answer: 'To register for an event: open **Browse Events** on the home page, click an event you like, choose a ticket type (single/duo/trio), fill in participant details, and click **Register Event**. If the event isn\'t free, you\'ll be sent to the payment page next.'
    },
    {
      keys: ['complete my payment', 'complete payment', 'finish payment', 'pay for my ticket', 'how can i pay', 'payment required'],
      answer: 'Go to **My Tickets** — any registration still needing payment shows a **💳 Complete Payment** button. Tapping it reopens the payment page for that exact ticket so you can submit your Transaction ID / UTR number. Note: unpaid registrations only hold your seat for 5 minutes, so pay promptly or you may need to register again.'
    },
    {
      keys: ['ticket pending', 'why is my ticket pending', 'awaiting verification', 'still pending'],
      answer: 'Once you submit your Transaction ID / UTR number, your ticket moves to **"Awaiting Verification"**. That means the organizer needs to manually check it against their bank/UPI records and approve it — it isn\'t automatic. You\'ll see it flip to "Confirmed" and get your QR code once they do.'
    },
    {
      keys: ['see my registration', 'my registrations', 'my tickets', 'where can i see my ticket', 'view my ticket'],
      answer: 'All your registrations are on the **My Tickets** page (link in the top navigation on every page).'
    },
    {
      keys: ['create an event', 'create event', 'how do i host', 'organize an event', 'set up an event'],
      answer: 'If you have an approved organizer account: go to **Dashboard → Create Event**, fill in the details, and click Create — you\'ll instantly get an Event ID. Then open the **Payment Setup** tab, paste that Event ID, and add your bank/UPI details so students can pay you directly. Don\'t have an organizer account yet? Look for "Apply to become an organizer" on the Dashboard or Register page.'
    },
    {
      keys: ['discount code', 'promo code', 'coupon'],
      answer: 'On an event\'s registration page, if the organizer has enabled discount codes for that event, you\'ll see a **"Discount code"** field before you submit — enter it there and the price updates automatically. If you don\'t see that field, the organizer hasn\'t enabled discounts for that particular event.'
    },
    {
      keys: ['cancel my registration', 'cancel registration', 'cancel ticket', 'refund'],
      answer: 'There isn\'t a self-service cancel button yet. If you haven\'t paid, just leave it — the seat hold automatically expires after 5 minutes and is released on its own. If you\'ve already paid, please contact the event organizer directly for a refund/cancellation, since payments go straight to them.'
    },
    {
      keys: ['what is campusvibe', 'about campusvibe', 'what does this website do'],
      answer: 'CampusVibe is a campus event management platform — students can discover fests, workshops and competitions, register and pay in minutes, and get a secure QR e-ticket. Organizers get a full dashboard to create events, collect payments, verify proofs, and scan tickets at entry.'
    },
    {
      keys: ['how do approvals work', 'approval process', 'verification process'],
      answer: 'After you submit a Transaction ID / UTR, the event organizer reviews it under their **Payment Proofs** tab and either approves or rejects it. Approved tickets get a QR code immediately; rejected ones let you resubmit with corrected details.'
    },
    {
      keys: ['when will my ticket be approved', 'how long does approval take', 'how long for verification'],
      answer: 'That depends entirely on how quickly the organizer reviews payment proofs — CampusVibe doesn\'t set a fixed time. Check **My Tickets** for the latest status; it\'ll update to "Confirmed" the moment they approve it.'
    },
    {
      keys: ['payment method', 'how to pay', 'upi', 'bank transfer', 'gpay'],
      answer: 'Payment methods depend on what the organizer has set up for that event — typically **bank transfer** and/or **UPI/GPay**. You\'ll see whichever options they\'ve configured on the payment page after registering.'
    },
    {
      keys: ['contact the organizer', 'contact organizer', 'talk to organizer', 'reach the organizer'],
      answer: 'CampusVibe doesn\'t have in-app messaging yet. Check the event\'s description for contact details, or reach out through your college\'s usual event channels.'
    },
    {
      keys: ['seat hold', 'seat released', 'seat expired', 'lost my seat', 'registration expired'],
      answer: 'To stop people blocking seats without paying, an unpaid registration only holds your seat for **5 minutes**. If payment isn\'t submitted in that window, the hold is automatically released and the seat becomes available to others — you\'d need to register again.'
    },
    {
      keys: ['how do i login', 'how to login', 'log in', 'sign in'],
      answer: 'Click **Login** in the top navigation and enter your registered email and password. New here? Use **Register** instead to create an account first.'
    },
    {
      keys: ['forgot password', 'reset password', 'change password'],
      answer: 'Password reset isn\'t self-service yet in this version — please contact your event organizer or site admin for help resetting it.'
    },
    {
      keys: ['checked in', 'check-in', 'attendance', 'scan qr'],
      answer: 'At the event, organizers scan your ticket\'s QR code (visible on the ticket page once your payment is confirmed) to check you in.'
    },
    {
      keys: ['capacity full', 'event full', 'no seats', 'sold out'],
      answer: 'If an event shows as full, all seats are currently held by paid or awaiting-verification registrations. It\'s worth checking back — an unpaid hold that isn\'t completed within 5 minutes gets released automatically and could open up a seat.'
    }
  ];

  function scoreMatch(input, entry) {
    const text = input.toLowerCase();
    let score = 0;
    entry.keys.forEach(k => { if (text.includes(k)) score += k.split(' ').length; });
    return score;
  }

  function findAnswer(input) {
    let best = null, bestScore = 0;
    KB.forEach(entry => {
      const s = scoreMatch(input, entry);
      if (s > bestScore) { bestScore = s; best = entry; }
    });
    return bestScore > 0 ? best.answer : null;
  }

  function mdLite(text) {
    // Minimal, safe **bold** rendering only — everything else stays as
    // plain escaped text so the bot can never inject markup.
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  const SUGGESTIONS = [
    'How do I register for an event?',
    'How can I complete my payment?',
    'Why is my ticket pending?',
    'How do I create an event?'
  ];

  function pageContextGreeting() {
    const path = location.pathname;
    if (path.includes('payment.html')) return "Looks like you're on the payment page — need help completing it, or wondering about accepted payment methods?";
    if (path.includes('my-tickets.html')) return "This is your My Tickets page. I can help with pending payments, ticket status, or anything else.";
    if (path.includes('dashboard.html')) return "You're in the organizer Dashboard. I can help with creating events, payment setup, or discount codes.";
    if (path.includes('event.html')) return "Checking out an event? I can help with registration, ticket types, or discount codes.";
    return "Hi! I'm the CampusVibe Assistant. Ask me anything about registering, payments, tickets, or organizing events.";
  }

  function injectStyles() {
    if (document.getElementById('cvbot-styles')) return;
    const style = document.createElement('style');
    style.id = 'cvbot-styles';
    style.textContent = `
      #cvbot-launcher {
        position: fixed; bottom: 20px; right: 20px; z-index: 9999;
        width: 58px; height: 58px; border-radius: 50%;
        background: linear-gradient(135deg, var(--primary, #6c8cff), var(--primary-2, #4a6cff));
        color: #fff; border: none; cursor: pointer; font-size: 26px;
        box-shadow: 0 8px 24px rgba(74,108,255,0.45);
        display: flex; align-items: center; justify-content: center;
        transition: transform .2s ease;
      }
      #cvbot-launcher:hover { transform: scale(1.06); }
      #cvbot-panel {
        position: fixed; bottom: 90px; right: 20px; z-index: 9999;
        width: 360px; max-width: calc(100vw - 32px);
        height: 480px; max-height: calc(100vh - 140px);
        background: rgba(10,14,32,0.98);
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 18px; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        display: none; flex-direction: column; overflow: hidden;
        font-family: inherit;
      }
      #cvbot-panel.open { display: flex; }
      #cvbot-head {
        padding: 14px 16px; background: linear-gradient(135deg, #4a6cff, #3558ee);
        color: #fff; display: flex; align-items: center; justify-content: space-between;
      }
      #cvbot-head strong { font-size: .95rem; }
      #cvbot-head span.sub { display: block; font-size: .72rem; opacity: .85; font-weight: 400; }
      #cvbot-close { background: none; border: none; color: #fff; font-size: 20px; cursor: pointer; line-height: 1; padding: 4px; }
      #cvbot-messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
      .cvbot-msg { max-width: 85%; padding: 9px 12px; border-radius: 12px; font-size: .86rem; line-height: 1.45; }
      .cvbot-msg.bot { align-self: flex-start; background: rgba(255,255,255,0.08); color: #e8ecff; border-bottom-left-radius: 4px; }
      .cvbot-msg.user { align-self: flex-end; background: linear-gradient(135deg, #6c8cff, #4a6cff); color: #fff; border-bottom-right-radius: 4px; }
      .cvbot-msg strong { color: #fff; }
      #cvbot-suggestions { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 10px; }
      .cvbot-chip {
        font-size: .74rem; padding: 6px 10px; border-radius: 999px;
        background: rgba(108,140,255,0.14); border: 1px solid rgba(108,140,255,0.4);
        color: #c9d4ff; cursor: pointer;
      }
      .cvbot-chip:hover { background: rgba(108,140,255,0.24); }
      #cvbot-inputrow { display: flex; gap: 8px; padding: 12px; border-top: 1px solid rgba(255,255,255,0.1); }
      #cvbot-input {
        flex: 1; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.18);
        border-radius: 10px; padding: 9px 12px; color: #fff; font-size: .86rem;
      }
      #cvbot-input:focus { outline: none; border-color: #6c8cff; }
      #cvbot-send {
        background: linear-gradient(135deg, #6c8cff, #4a6cff); color: #fff; border: none;
        border-radius: 10px; padding: 0 16px; cursor: pointer; font-size: .9rem;
      }
      @media (max-width: 480px) {
        #cvbot-panel { right: 12px; left: 12px; width: auto; bottom: 84px; }
        #cvbot-launcher { right: 16px; bottom: 16px; }
      }
    `;
    document.head.appendChild(style);
  }

  function injectMarkup() {
    if (document.getElementById('cvbot-launcher')) return;

    const launcher = document.createElement('button');
    launcher.id = 'cvbot-launcher';
    launcher.setAttribute('aria-label', 'Open CampusVibe Assistant');
    launcher.textContent = '🤔';

    const panel = document.createElement('div');
    panel.id = 'cvbot-panel';
    panel.innerHTML = `
      <div id="cvbot-head">
        <div><strong>CampusVibe Assistant</strong><span class="sub">Usually replies instantly</span></div>
        <button id="cvbot-close" aria-label="Close chat">✕</button>
      </div>
      <div id="cvbot-messages"></div>
      <div id="cvbot-suggestions"></div>
      <div id="cvbot-inputrow">
        <input id="cvbot-input" type="text" placeholder="Ask a question..." />
        <button id="cvbot-send">➤</button>
      </div>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    launcher.addEventListener('click', () => togglePanel(true));
    panel.querySelector('#cvbot-close').addEventListener('click', () => togglePanel(false));

    const input = panel.querySelector('#cvbot-input');
    const sendBtn = panel.querySelector('#cvbot-send');
    sendBtn.addEventListener('click', () => sendUserMessage());
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendUserMessage(); });

    renderSuggestions();
    addMessage(pageContextGreeting(), 'bot');
  }

  let panelOpened = false;
  function togglePanel(open) {
    const panel = document.getElementById('cvbot-panel');
    panel.classList.toggle('open', open);
    if (open && !panelOpened) {
      panelOpened = true;
      document.getElementById('cvbot-input').focus();
    }
  }

  function addMessage(text, who) {
    const messages = document.getElementById('cvbot-messages');
    const div = document.createElement('div');
    div.className = `cvbot-msg ${who}`;
    div.innerHTML = who === 'bot' ? mdLite(text) : (() => { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; })();
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function renderSuggestions() {
    const wrap = document.getElementById('cvbot-suggestions');
    wrap.innerHTML = '';
    SUGGESTIONS.forEach(q => {
      const chip = document.createElement('button');
      chip.className = 'cvbot-chip';
      chip.type = 'button';
      chip.textContent = q;
      chip.addEventListener('click', () => { document.getElementById('cvbot-input').value = q; sendUserMessage(); });
      wrap.appendChild(chip);
    });
  }

  async function sendUserMessage() {
    const input = document.getElementById('cvbot-input');
    const text = input.value.trim();
    if (!text) return;
    addMessage(text, 'user');
    input.value = '';

    const localAnswer = findAnswer(text);
    if (localAnswer) {
      addMessage(localAnswer, 'bot');
      return;
    }

    addMessage('Let me think about that...', 'bot');
    const messages = document.getElementById('cvbot-messages');
    const thinkingEl = messages.lastElementChild;

    try {
      const res = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, page: location.pathname })
      });
      const data = await res.json();
      thinkingEl.remove();
      if (data.handled && data.reply) {
        addMessage(data.reply, 'bot');
      } else {
        addMessage("I'm not fully sure about that one. You can check the **Help** page for more answers, or contact your event's organizer directly for anything specific to their event.", 'bot');
      }
    } catch (e) {
      thinkingEl.remove();
      addMessage("I couldn't reach the server just now. Please check the **Help** page, or try again in a moment.", 'bot');
    }
  }

  function init() {
    injectStyles();
    injectMarkup();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
