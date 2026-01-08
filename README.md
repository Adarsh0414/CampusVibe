# CampusVibe

**Tagline:** *Ideal Management, Ideal Moments*

CampusVibe is a full-stack web application built for efficient campus event management. It enables students to discover and register for events, organizers (committees) to create and manage events with ticketing and attendance tracking, and administrators to oversee the platform.

## 🎥 CampusVibe Demo

https://github.com/user-attachments/assets/a2922ade-f0a2-42f6-95de-4b704e1e29d6


## Features

- **User Roles:** The platform supports three user roles:
    - **Student:** Can view public events, register for them, and manage their tickets.
    - **Committee:** Can create, manage, and monitor their own events. They can also manage payment proofs and attendance.
    - **Admin:** Has full control over the platform, including managing users and all events.
- **Event Management:** Organizers can create events with detailed information such as title, description, category, start and end times, location, and capacity. They can also set events as "draft" or "published" and "public" or "private".
- **Ticketing:**
    - Supports single, duo, and trio ticket types with different pricing tiers.
    - Free and paid events.
    - Manual payment verification via UPI/bank transfer proof uploads.
    - QR code generation for tickets.
- **Attendance Tracking:** Organizers can scan QR codes to mark attendance. Manual attendance marking is also supported.
- **Payment Integration:**
    - Organizers can provide their bank account or UPI details for receiving payments.
    - Integration with Stripe and Razorpay is planned (placeholders exist).
- **Discounts:** Organizers can create discount codes for their events.
- **Waitlist:** If an event is full, students can join a waitlist.
- **Notifications:** The platform has a system for sending email and SMS notifications (placeholders exist).
- **Analytics:** Organizers can view analytics for their events, including total registrations, paid attendees, and check-ins.
- **Calendar Export:** Events can be exported to an ICS file for easy addition to calendar applications.

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
    - HTML5
    - CSS3
    - JavaScript (with `fetch` for API calls)
    - Lottie for animations

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

The server will be running on `http://localhost:3000`.

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
