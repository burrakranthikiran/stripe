# Stripe Webhook Server (Node.js + Express + MySQL)

A robust, production-ready implementation of a Stripe webhook integration in Node.js, Express, and MySQL. It features Stripe signature verification, idempotency checks using database transactions, and a subscription lookup endpoint.

---

## 🛠️ Project Structure

```text
stripe-webhook/
├── server.js
├── db.js
├── package.json
├── .env
├── README.md
└── sql/
    └── schema.sql
```

---

## 🚀 Setup & Installation

### 1. Clone & Install Dependencies
Run the following command to install the required Node modules:
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory (a template is provided in the project) and populate it with your local credentials and Stripe API keys:
```env
PORT=3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=stripe_demo

STRIPE_SECRET_KEY=sk_test_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx
```

### 3. Create the Database Schema
Ensure MySQL is running, then run the SQL commands in `sql/schema.sql` to initialize the database:
```bash
mysql -u root -p < sql/schema.sql
```

This will create a `stripe_demo` database and two tables:
* `subscriptions` - Stores active and cancelled subscription data.
* `processed_events` - Prevents duplicate event processing (idempotency).

---

## 🖥️ Running the Server

Start the application in development mode (using nodemon):
```bash
npm run dev
```
Or start in standard production mode:
```bash
npm start
```

---

## 🧪 Testing with Stripe CLI

### 1. Set Up Webhook Forwarding
If you don't have the Stripe CLI installed, install it (e.g. using Homebrew: `brew install stripe/stripe-cli/stripe`).
Login to your Stripe account:
```bash
stripe login
```
Forward Stripe webhook events to your local server:
```bash
stripe listen --forward-to localhost:3000/webhook
```
*Note: Make sure to copy the webhook signature secret (`whsec_...`) printed in the CLI console and paste it as the `STRIPE_WEBHOOK_SECRET` in your `.env` file, then restart your server.*

### 2. Trigger Events
Open a separate terminal window and trigger the following events to verify the integration:

* **Succeeded Payment:**
  ```bash
  stripe trigger invoice.payment_succeeded
  ```
  *Result: A new subscription record is inserted or updated as `active` for the customer.*

* **Failed Payment:**
  ```bash
  stripe trigger invoice.payment_failed
  ```
  *Result: The subscription status updates to `past_due` (the subscription is not deleted).*

* **Cancelled Subscription:**
  ```bash
  stripe trigger customer.subscription.deleted
  ```
  *Result: The subscription status updates to `cancelled`.*

### 3. Retrieve Subscription Details
Fetch subscription information for a customer:
```bash
curl http://localhost:3000/subscriptions/cus_xxxxx
```

Response format:
```json
{
  "customer_id": "cus_xxxxx",
  "subscription_id": "sub_xxxxx",
  "plan": "price_xxxx",
  "status": "active",
  "current_period_end": 1754620100
}
```

### 4. Verify Idempotency
You can manually replay/simulate a Stripe event by sending a POST request to `/webhook`. If the event ID exists in the `processed_events` table, the server returns an HTTP `200` with `{"received": true, "message": "Duplicate event ignored"}` and skips executing any database logic.
