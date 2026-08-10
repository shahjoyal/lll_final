# Ladies, Leadership & Logistics — MongoDB + Admin

This version keeps the existing premium static website and adds a Node/Express + MongoDB backend.

## What was added

- MongoDB storage for feedback, guest requests and newsletter subscribers.
- Hidden admin route: `/admin`
- Admin login protected by an HTTP-only signed cookie.
- Admin dashboard for:
  - viewing feedback
  - publishing/hiding reviews
  - deleting feedback
  - viewing guest requests and changing status
  - viewing, unsubscribing/reactivating and deleting newsletter subscribers
- A public **Customer Reviews** section. Only feedback marked **Publish** in the admin panel appears publicly.
- A public **Newsletter** section with name + email.
- Existing feedback and guest forms now submit to MongoDB instead of opening an email client.
- `.env` configuration so your MongoDB URI and admin credentials stay outside the code.

## Setup locally

1. Install Node.js 18+.
2. Open a terminal in this folder.
3. Run:

```bash
npm install
```

4. Copy `.env.example` to `.env`.
5. Put your MongoDB connection string in `MONGO_URI`.
6. Set a strong `JWT_SECRET`.
7. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
8. Start:

```bash
npm start
```

9. Open:
   - Website: `http://localhost:3000`
   - Admin: `http://localhost:3000/admin`

The first server start creates the admin user in MongoDB using `ADMIN_EMAIL` and a bcrypt hash of `ADMIN_PASSWORD`.

## MongoDB

You can use MongoDB Atlas. Create a database/user, allow the server IP in Atlas Network Access, then copy the connection string into `.env`.

The application creates these collections automatically:

- `feedbacks`
- `guestrequests`
- `subscribers`
- `admins`

## Deployment

This project is now a Node application, so deploy it to a Node-compatible host rather than GitHub Pages as a static-only site.

Set the same environment variables in the hosting provider's environment/secret settings. Do NOT commit `.env`.

For production set:

```text
NODE_ENV=production
```

The admin cookie will then use the `Secure` flag, so HTTPS is required.

## Important security note

`/admin` being unlinked/hidden is not the security mechanism. The API endpoints are protected by authentication. Keep the admin password strong and never expose `MONGO_URI`, `JWT_SECRET`, or `ADMIN_PASSWORD` in frontend JavaScript.

## Newsletter sending

The current implementation stores subscribers and gives the admin a clean subscriber list. It does not automatically send emails yet. If you want, an SMTP/Resend/Mailgun integration can be added later so you can compose a newsletter and send it to active subscribers from the admin dashboard.
