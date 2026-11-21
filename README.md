# PizzaHub Server

Express and Better Auth backend for PizzaHub.

## Local setup

```bash
npm install
node index.js
```

The default server port is `5000`.

## Environment variables

```env
DB_URI=mongodb_connection_string
BETTER_AUTH_SECRET=random_secure_secret
BETTER_AUTH_URL=http://localhost:5000
CORS_ORIGIN=http://localhost:3000
PORT=5000
```

## Server responsibilities

- MongoDB connection
- Better Auth session and JWT integration
- Bearer JWT verification
- Admin role verification
- Blocked-account checks
- Admin user block/unblock API
- Approved and active public menu reads

## JWT verification

Protected Express routes require:

```text
Authorization: Bearer <jwt>
```

The JWT middleware rejects malformed tokens with `401`, invalid or expired
tokens with `401`, blocked accounts with `403`, and insufficient roles with
`403`.

## Live and repository links

- Live server: `https://pizzahub-server-beige.vercel.app`
- Server repository: `https://github.com/Bappi-dev/pizzahub-server`
