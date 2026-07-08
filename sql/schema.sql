CREATE DATABASE IF NOT EXISTS stripe_demo;

USE stripe_demo;

CREATE TABLE IF NOT EXISTS subscriptions (
    customer_id VARCHAR(100) PRIMARY KEY,
    subscription_id VARCHAR(100),
    plan VARCHAR(100),
    status VARCHAR(30),
    current_period_end BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS processed_events (
    event_id VARCHAR(100) PRIMARY KEY,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
