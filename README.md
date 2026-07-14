# CampusVibe — Smart Campus Event Management Platform

**Tagline:** *Ideal Management, Ideal Moments*

CampusVibe is a full-stack web application built for efficient campus event management. It enables students to discover and register for events, organizers (committees) to create and manage events with ticketing and attendance tracking, and administrators to oversee the platform.

## <img src="public/assets/img/favicon.png" alt="CampusVibe Logo" width="24" align="center"> Live Website

[CampusVibe](https://campusvibe-pu3g.onrender.com)

## Enhancements & Improvements

A running log of the larger features/fixes added on top of the original build :

- **"Add to Calendar" actually works now** — the button pointed at an API route (`/api/events/:uuid/calendar.ics`) that never existed, so clicking it silently 404'd and fell through to the homepage. It's now a small menu with two options: download a real .ics file (opens in Outlook, Apple Calendar, etc. — your OS decides which app handles it) or add the event directly via a **Google Calendar** web link for anyone who'd rather not deal with a downloaded file.

- **Proper share menu** — the event page's Share button no longer jumps straight to X/Twitter. It now uses the native share sheet on devices that support it (so WhatsApp, Instagram, etc. all show up automatically), with a fallback dropdown (WhatsApp, Facebook, X, Instagram, Copy Link) on browsers without that support.

- **Real Google OAuth login** — "Login with Google" now actually works (manual OAuth 2.0 flow, no extra dependencies). Requires you to add your own Google Cloud OAuth credentials — see [Google OAuth Setup](#google-oauth-setup) below. Until configured, the button fails with a clear message instead of doing nothing.

- **Stronger email validation** — server now validates email format on login/register (previously client-side only, easily bypassed) and gracefully handles Google-only accounts (no password) instead of crashing.

- **Seat-hold / registration timeout system** — an unpaid registration now only holds its seat for **5 minutes**. If payment isn't submitted in time, the hold auto-expires and the seat is released back into the pool — fixes the bug where abandoned registrations permanently reduced capacity.

- **Complete Payment flow** — My Tickets shows a **Complete Payment** button (with a live countdown) for any registration still awaiting payment, and a **Register Again** button once a hold has expired.

- **Discount codes** — organizers can enable and configure one or more discount codes per event (percentage or flat amount off, optional max uses) from the Create/Edit Event form; the code field only appears at registration if the organizer turned it on.

- **Multi-language support** — a language selector in the header (32 languages: English + 22 Indian languages + 9 international). Currently covers navigation, the homepage, and common buttons/labels site-wide; see [Multi-language Notes](#multi-language-notes) for what's covered and what isn't yet.

- **Floating AI chat assistant** — appears on every page, answers common "how do I…" questions about the site from a built-in knowledge base. Can optionally be upgraded to a real LLM (OpenAI) by adding an API key — see [AI Chatbot Setup](#ai-chatbot-setup).

- **Responsive pass** — header/nav no longer overflows on phones/tablets, larger touch targets on touch devices, safety-net breakpoints across grids and forms.

- **E-ticket redesign** — boarding-pass style ticket (perforated divider, category-colored header, QR glow states) used consistently for both pending and confirmed tickets.

- Assorted fixes: event page banner art now matches the homepage's category art, the Profile page's Cancel button actually discards unsaved edits, a Profile link was added to the homepage nav, the print button on the ticket page, and the language-selector layout on a few pages.

## Features

### User Roles

- **Students** — Browse public events, register, upload payment proofs, view and manage personal tickets, complete pending payments before their seat hold expires.
- **Organizers (Committees)** — Create/edit events, configure discount codes, manage registrations, verify payments, scan QR codes for attendance, view analytics.
- **Administrators** — Full control over users, events, organizer applications, and platform settings.

### Event & Ticketing
- Create events (title, description, category, date/time, location, capacity).
- Public/private and draft/published states.
- Ticket types: Single, Duo, Trio with custom pricing.
- Free or paid events.
- Optional, organizer-configured discount codes (percentage or flat amount, with an optional usage cap).
- Manual payment verification via UPI/bank transfer proof uploads.
- 5-minute seat hold on unpaid registrations, auto-released if payment isn't completed in time.
- Secure QR-code e-tickets, boarding-pass styled, reflecting live payment status.
- ICS calendar export.

### Accounts & Sign-in
- Email/password registration and login, with server-side email format validation.
- Google Sign-In (OAuth 2.0) — auto-links to an existing account by email, or creates a new (pre-verified) account.
- Organizer applications reviewed by an admin before organizer/committee access is granted.

### Attendance & Analytics
- Real-time QR code scanning (camera support) or manual JSON paste.
- Manual attendance marking fallback.
- Organizer analytics: registrations, payments, check-ins.

### Accessibility & Reach
- Language selector (32 languages) in the header, persisted across visits.
- Responsive layout tuned for phones, tablets, and laptops.
- Floating AI assistant for common support questions, on every page.

### Other Highlights
- Modern space/nebula-themed UI with Lottie animations.
- Built-in searchable FAQ & Help section.
- Profile management with roll number and contact details.

## Technologies Used

- **Backend:**
    - Node.js + Express.js
    - `sqlite3` for the database
    - `jsonwebtoken` for authentication (JWT)
    - `bcryptjs` for password hashing
    - `multer` for file uploads
    - `qrcode` for generating QR codes
    - Native `fetch` for the Google OAuth token exchange and the optional LLM chatbot call (no extra OAuth/HTTP client library needed)
    - `nodemailer` for email notifications (placeholder — not wired up to send yet)
    - `razorpay` and `stripe` for payments (placeholders — payment is currently manual proof-upload + organizer verification, not a live payment gateway)

- **Frontend:**
  - HTML5, CSS3, Vanilla JavaScript
  - Lottie animations
  - Custom lightweight i18n engine (`assets/js/i18n.js` + `assets/i18n/i18n-data.js`) — no external i18n library
  - Self-contained floating chat widget (`assets/js/chatbot.js`) — no external chat SDK

- **Planned / Not Yet Implemented**
  - Live payment gateways (Stripe & Razorpay) — today, payment is manual: student submits a UTR/transaction ID, organizer verifies it
  - Outbound email/SMS notifications (e.g. verification emails, reminders)
  - Full multi-language coverage of every page (see [Multi-language Notes](#multi-language-notes))

## Google OAuth Setup

"Login with Google" is implemented, but needs your own OAuth credentials to work (these can't be shared/pre-filled since they're tied to your domain):

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) → create (or pick) a project → **APIs & Services → Credentials → Create Credentials → OAuth client ID** (type: **Web application**).
2. Under **Authorized redirect URIs**, add:
   - `http://localhost:3000/api/auth/google/callback` (for local testing)
   - `https://yourdomain.com/api/auth/google/callback` (your deployed domain, once you have one)
3. Copy the generated **Client ID** and **Client Secret** into your `.env`:
   ```
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
   ```
4. Restart the server. Until these are set, clicking "Login with Google" shows a clear "not set up yet" message instead of failing silently.

## AI Chatbot Setup

The floating assistant works out of the box using a built-in knowledge base (no setup needed). To upgrade it to a real LLM for open-ended questions it can't otherwise answer:

```
OPENAI_API_KEY=your_openai_api_key
OPENAI_CHAT_MODEL=gpt-4o-mini
```

Without a key set, `/api/chatbot` simply reports it can't help with that particular question and the widget suggests the Help page or contacting the organizer — it never invents an answer.

## Multi-language Notes

The language selector (top navigation, every page) covers: **English, Hindi, Bengali, Telugu, Marathi, Tamil, Urdu, Gujarati, Kannada, Malayalam, Odia, Punjabi, Assamese, Maithili, Sanskrit, Konkani, Kashmiri, Manipuri, Nepali, Bodo, Dogri, Santali, Sindhi, Spanish, French, German, Portuguese, Russian, Chinese (Simplified), Japanese, Korean, and Arabic**.

**What's translated today:** header navigation, the homepage (hero, category filters, event cards' category/price labels), footer, and common shared buttons.
**What's not translated yet:** organizer dashboard forms, server-side validation/error messages, and page-specific copy (event descriptions are organizer-authored free text and can't be auto-translated). Extending coverage means adding more keys to `public/assets/i18n/i18n-data.js` and more `data-i18n` attributes in the relevant HTML — the mechanism already supports it.

**Translation quality:** high confidence for the widely-used languages; lower confidence for Assamese, Maithili, Konkani, Kashmiri, Manipuri, Bodo, Dogri, Santali, and Sindhi, since these have more script/dialect variation — have a native speaker review those before relying on them publicly.

## Folder Structure

```
.
├── .env.example
├── .gitignore
├── server.js
├── package.json
├── data/
│   └── campusvibe.db
├── public/
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── organizer-apply.html
│   ├── dashboard.html
│   ├── event.html
│   ├── ticket.html
│   ├── my-tickets.html
│   ├── attendance.html
│   ├── payment.html
│   ├── profile.html
│   ├── faq.html
│   ├── assets/
│   │   ├── css/
│   │   │   └── styles.css
│   │   ├── js/
│   │   │   ├── app.js
│   │   │   ├── i18n.js
│   │   │   ├── chatbot.js
│   │   │   └── lottie.min.js
│   │   ├── i18n/
│   │   │   └── i18n-data.js
│   │   ├── img/
│   │   └── lottie/
│   └── uploads/
│       ├── payment_proofs/
│       └── upi_qr/
└── node_modules(Generated automatically after npm install.)/
```

- **`.env.example`**: An example file for environment variables. You should create a `.env` file based on this.
- **`server.js`**: The main backend file, built with Express.js. Handles all API routes, database interactions, business logic, the seat-hold/expiry sweep, Google OAuth, and the chatbot endpoint.
- **`package.json`**: Lists the project's dependencies and scripts.
- **`data/`**: Contains the SQLite database file (`campusvibe.db`). Not committed to git — created automatically on first run.
- **`public/`**: The frontend of the application, with HTML, CSS, and JavaScript files.
    - **`assets/js/i18n.js`** + **`assets/i18n/i18n-data.js`**: the translation engine and string table for the language selector.
    - **`assets/js/chatbot.js`**: the self-contained floating chat widget (injects its own markup/styles into every page that includes it).
    - **`uploads/`**: Stores user-uploaded files, such as payment proofs and UPI QR codes.
- **`node_modules/`**: Contains all the installed Node.js modules (not included in the shared zip — run `npm install` to generate it for your platform).

## Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Adarsh0414/CampusVibe.git
    cd campusvibe
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Start the server:**
    - For development (with automatic restarts):
        ```bash
        npm run dev
        ```
    - For production:
        ```bash
        npm start
        ```

## How to Use

- **Admin User:** An admin user is seeded automatically on the first run. You can log in with the credentials you provided in the `.env` file.
- **Register:** New users can register as students, via email/password or Google Sign-In.
- **Organizer:** To become an organizer (committee member), use the "register-organizer" / "Apply to become an organizer" flow — an admin must approve the application first.
- **Create Events:** Once you're an approved organizer, use the Dashboard to create events, set up payment details, and optionally configure discount codes.
- **Register for Events:** As a student, browse public events and register; unpaid registrations hold your seat for 5 minutes.
- **View Tickets:** View and manage your tickets, including completing pending payments, in "My Tickets".

## Contributing

Contributions, suggestions, and feature requests are welcome. Feel free to open an issue or submit a pull request.

## Future Improvements

- Wire up live payment gateways (Stripe & Razorpay) instead of manual proof verification.
- Send real outbound email (verification links, payment reminders) via the scaffolded `nodemailer`/SMTP settings.
- Extend multi-language coverage to the organizer dashboard and server-side messages.
- Add more detailed analytics and reporting.
- Implement real-time notifications using WebSockets.
- Add a dedicated admin panel for user management.

<div align="center">
  !! - CampusVibe – Making campus events effortless and memorable 🚀 - !!
</div>
