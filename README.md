# EventSphere Server

Express and MongoDB API for EventSphere. It handles authentication, expo and booth management, session booking, exhibitor applications, messaging, uploads, notifications, analytics, and admin workflows. Socket.IO provides live updates on long-running hosts; serverless deployments use the persisted change feed for client polling.

## Requirements and setup

- Node.js 24 (see `package.json`)
- npm
- MongoDB locally or a MongoDB Atlas database

```powershell
cd server
npm install
Copy-Item .env.example .env
```

Edit `server/.env` with your own values, then run:

```powershell
npm run dev
```

The API listens at `http://localhost:5000` by default. Keep the client running separately from `client/` on port 3000. The client Vite proxy forwards API calls to this server.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | Local HTTP port; defaults to `5000`. Hosting platforms provide their own port. |
| `MONGO_URI` | Production: yes | MongoDB connection string. Local default is `mongodb://127.0.0.1:27017/eventsphere`. |
| `JWT_SECRET` | Yes | Private, random signing key used for API and Socket.IO authentication. Generate a unique value with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `CLIENT_URL` | No | Frontend origin for CORS and links in email. |
| `ADMIN_SIGNUP_CODE` | No | Additional code required to register admin accounts after the first admin. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | No | SMTP delivery settings for OTP and notification email. If SMTP is not configured, development uses an Ethereal test inbox. |

Put real values only in `server/.env` locally or in the server hosting provider's secret/environment settings. Never commit `.env` files. Do not put backend secrets in `VITE_*` variables: those become public browser code. `server/.env.example` is a placeholder-only template.

## Commands

| Command | Description |
| --- | --- |
| `npm start` | Start the API with Node. |
| `npm run dev` | Start the API with nodemon for local development. |
| `npm run seed` | Add demo accounts and data to the configured database. |
| `npm run test:smoke` | Run the HTTP smoke suite against an in-memory MongoDB. |

The seed script uses the `MONGO_URI` environment value when set and otherwise connects to the local `eventsphere` database. Use a development database when seeding; do not run it against production unless that is intentional.

## Request lifecycle and security

`server.js` loads the private `.env`, configures Express, CORS, Helmet, JSON parsing and rate limits, then ensures MongoDB is connected before API requests. `/api/health` is available as a fast health probe. Route modules are mounted under `/api`, and a shared error handler returns JSON errors.

The auth middleware verifies bearer JWTs; role middleware restricts admin and exhibitor operations. Auth endpoints have a stricter rate limit than the general API. Route handlers whitelist editable fields and validate input. Passwords are hashed with bcrypt. Do not log or return passwords, OTPs, JWT signing keys, MongoDB credentials, or SMTP passwords.

On regular Node hosting, the server starts HTTP and Socket.IO. Socket connections authenticate with the same JWT and join private user/admin rooms; clients can subscribe to expo rooms. On Vercel, the app exports an Express handler instead of opening a long-running listener or socket server. Change records let the client poll for updates. Uploaded image data uses MongoDB GridFS so it survives serverless deployments; `/uploads` remains as a legacy local static path.

## API route modules

All routes are mounted below `/api`:

| Prefix | Responsibilities |
| --- | --- |
| `/auth` | Registration, OTP verification/resend, login, password reset, profile and current-user endpoints. |
| `/expos` | Expo listing/detail and admin CRUD, analytics, and booking reports. |
| `/booths` | Floor-plan listing/admin CRUD and approved exhibitor reserve/release actions. |
| `/sessions` | Agenda listing/admin CRUD, session bookings, cancellations, waitlists, and attendee lists. |
| `/exhibitors` | Public directory, company profiles, applications, and approval/rejection. |
| `/feedback` | Attendee feedback, admin listing/replies, and deletion. |
| `/announcements` | Expo announcement publishing, listing, and deletion. |
| `/enquiries` | Attendee-to-exhibitor messages, received/sent lists, and replies. |
| `/favourites` | Save/remove expos and list saved expo IDs. |
| `/notifications` | Notification listing, unread counts, marking read, and clearing. |
| `/events` | Polling change feed used when Socket.IO is unavailable. |
| `/upload`, `/images` | Image upload and GridFS image retrieval. |
| `/admin` | Admin account search, role/block changes, and account removal. |

See `routes/` for endpoint handlers and their validation and authorization rules.

## Source map

- `server.js`: application setup, route mounting, security middleware, realtime transport, and global errors.
- `config/db.js`: cached Mongoose connection, including serverless cold-start handling.
- `config/mailer.js`: SMTP and Ethereal email transport for OTP and notifications.
- `middleware/auth.js`: JWT authentication and role authorization.
- `models/`: Mongoose schemas for users, expos, booths, sessions, exhibitors, bookings, waitlists, feedback, OTPs, notifications, announcements, enquiries, favourites, and change-feed entries.
- `routes/`: HTTP API grouped by feature; `admin.js` is admin account management.
- `utils/validate.js`: field selection and validation helpers; `paginate.js`: pagination; `notify.js`: notifications and live/polling change events; `files.js` and `images.js`: uploaded image handling.
- `test/smoke.js`: end-to-end API smoke scenarios using `mongodb-memory-server`.
- `seed.js`: development fixtures and demo accounts.
- `vercel.json`: Express deployment settings for Vercel.
- `uploads/`: local/legacy upload storage; runtime uploads are not source files and should not be committed.

## Testing and deployment

Run the smoke suite with `npm run test:smoke`. It starts the real server against a temporary in-memory database and exercises health, auth-protected admin routes, expos, booths, bookings, waitlists, notifications, feedback, analytics, and image upload. It does not need your development MongoDB data.

For Vercel, configure `MONGO_URI`, a new strong `JWT_SECRET`, and the appropriate `CLIENT_URL` in the backend project's environment settings. Add SMTP settings only when real email delivery is configured. Redeploy after changing environment values. The root `docs/DEPLOYMENT.md` covers MongoDB Atlas and both Vercel projects.

## Credential incident checklist

The old server environment example contained a real MongoDB connection string. If that value or any other live credential was pushed to a remote repository, assume it is compromised: rotate the MongoDB database user's password, replace `JWT_SECRET` (this invalidates existing JWTs), and rotate SMTP credentials if they were real. Then check the repository's commit history and remove exposed secrets from history if policy requires it. The current workspace has no `.git` metadata, so its remote history cannot be inspected or rewritten here.
