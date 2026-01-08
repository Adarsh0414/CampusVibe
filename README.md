# CampusVibe

**Tagline:** *Ideal Management, Ideal Moments*

CampusVibe is a full-stack web application built for efficient campus event management. It enables students to discover and register for events, organizers (committees) to create and manage events with ticketing and attendance tracking, and administrators to oversee the platform.

## 🎥 CampusVibe Demo

https://github.com/user-attachments/assets/68cb29be-3b74-4084-beb2-19d8928dd3ae

### Screenshots
### Landing/Home Page
![CampusVibe Landing Page]<img width="1890" height="910" alt="LandingHome Page" src="https://github.com/user-attachments/assets/4b495e53-0b73-48b8-b017-01d8017ecd6e" />

### My Tickets Page
![My Tickets]<img width="1908" height="910" alt="My Tickets Page" src="https://github.com/user-attachments/assets/8253f725-1f80-45b8-ad1f-ddf65f39abdd" />
<img width="1897" height="915" alt="My Tickets Page1" src="https://github.com/user-attachments/assets/8840cc46-5b2d-4015-86cc-de3303b28b8a" />

### Organizer Dashboard (Create Event)
![Organizer Dashboard]<img width="1894" height="914" alt="Dashboard (Create Event)" src="https://github.com/user-attachments/assets/9317e221-6efc-4372-83ad-bc61c6f0a9c1" />

### Attendance Scanning
![QR Attendance Scan]<img width="1893" height="918" alt="Attendance Scanning" src="https://github.com/user-attachments/assets/0c3a5769-038f-415b-adf4-95fb73341d50" />

### Registration Page
![Registration]<img width="1897" height="911" alt="Registration Page" src="https://github.com/user-attachments/assets/dc4f6f22-f412-430f-a3c8-017da221200a" />

### User Profile
![User Profile]<img width="1908" height="919" alt="User Profile" src="https://github.com/user-attachments/assets/286d6929-4aa9-4ec7-8a23-2ad5dbc3bfd6" />

### FAQ & Help
![FAQ Help]<img width="1885" height="911" alt="FAQ" src="https://github.com/user-attachments/assets/06c50af8-92c6-4866-9c1e-b2660f392963" />

## Features

### User Roles
- **Students** — Browse public events, register, upload payment proofs, view and manage personal tickets.
- **Organizers (Committees)** — Create/edit events, manage registrations, verify payments, scan QR codes for attendance, view analytics.
- **Administrators** — Full control over users, events, and platform settings.

### Event & Ticketing
- Create events (title, description, category, date/time, location, capacity).
- Public/private and draft/published states.
- Ticket types: Single, Duo, Trio with custom pricing.
- Free or paid events.
- Manual payment verification via UPI/bank transfer proof uploads.
- Secure QR-code e-tickets.
- Discount codes and waitlist support.
- ICS calendar export.

### Attendance & Analytics
- Real-time QR code scanning (camera support) or manual JSON paste.
- Manual attendance marking fallback.
- Organizer analytics: registrations, payments, check-ins.

### Other Highlights
- Modern space/nebula-themed UI with Lottie animations.
- Built-in searchable FAQ & Help section.
- Profile management with roll number and contact details.

## Technologies Used

- **Backend:**
    - Node.js
    - Express.js
    - `better-sqlite3` for the database
    - `jsonwebtoken` for authentication (JWT)
    - `bcryptjs` for password hashing
    - `multer` for file uploads
    - `qrcode` for generating QR codes
    - `nodemailer` for email notifications (placeholder)
    - `passport` for Google OAuth (placeholder)
    - `razorpay` and `stripe` for payments (placeholders)

- **Frontend:**
  - HTML5, CSS3, Vanilla JavaScript
  - Lottie animations

- **Planned Integrations**
  - Stripe & Razorpay
  - Email/SMS notifications
  - Google OAuth

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
│   │   │   └── lottie.min.js
│   │   ├── img/
│   │   └── lottie/
│   └── uploads/
│       ├── payment_proofs/
│       └── upi_qr/
└── node_modules/
```

- **`.env.example`**: An example file for environment variables. You should create a `.env` file based on this.
- **`server.js`**: The main backend file, built with Express.js. It handles all the API routes, database interactions, and business logic.
- **`package.json`**: Lists the project's dependencies and scripts.
- **`data/`**: Contains the SQLite database file (`campusvibe.db`).
- **`public/`**: The frontend of the application, with HTML, CSS, and JavaScript files.
    - **`assets/`**: Contains static assets like CSS, JavaScript, images, and Lottie animations.
    - **`uploads/`**: Stores user-uploaded files, such as payment proofs and UPI QR codes.
- **`node_modules/`**: Contains all the installed Node.js modules.



## Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/campusvibe.git
    cd campusvibe
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    Create a `.env` file in the root directory and add the following variables:
    ```
    PORT=3000
    JWT_SECRET=your_jwt_secret
    QR_SIGNING_SECRET=your_qr_signing_secret
    ADMIN_EMAIL=admin@example.com
    ADMIN_PASSWORD=your_admin_password
    ```
    You can also add SMTP, Google OAuth, Stripe, and Razorpay keys if you want to use those features.

4.  **Start the server:**
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
- **Register:** New users can register as students.
- **Organizer:** To become an organizer (committee member), you can use the "register-organizer" flow.
- **Create Events:** Once you are an organizer, you can access the dashboard to create and manage your events.
- **Register for Events:** As a student, you can browse public events and register for them.
- **View Tickets:** You can view your tickets in the "My Tickets" section.

## Contributing

Contributions are welcome! Please feel free to submit a pull request.

## Git Remote

To add a remote to the project, use the following command:

```bash
git remote add origin https://github.com/your-username/campusvibe.git
```

## Future Improvements

- Implement the placeholder features (Google OAuth, Stripe, Razorpay, email, and SMS notifications).
- Improve the UI/UX of the frontend.
- Add more detailed analytics and reporting.
- Implement real-time notifications using WebSockets.
- Add a dedicated admin panel for user management.

<div align="center">
**CampusVibe – Making campus events effortless and memorable. 🚀**
</div>
