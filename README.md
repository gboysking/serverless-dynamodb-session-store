# DynamoDB Session Store for Express

This project provides a DynamoDB-based session store for Express applications. It allows you to store your Express session data in a DynamoDB table, providing a scalable and reliable storage solution. It is based on the implementation described in [this blog post](https://tobelinuxer.tistory.com/65).

## Features
- Store Express session data in DynamoDB
- Support for Time to Live (TTL) to automatically expire sessions
- Simple setup and easy-to-use API
- Utilizes AWS SDK for JavaScript V3 for improved performance and modularity

## Requirements

- Node.js v12.x or later
- An AWS account with DynamoDB access

## Installation

```bash
npm install --save serverless-dynamodb-session-store
```

## Usage

```
const express = require('express');
const session = require('express-session');
const { DynamoDBSessionStore } = require('serverless-dynamodb-session-store');

const app = express();

app.use(session({
  store: new DynamoDBSessionStore({
    table: 'YourDynamoDBTableName', // Optional, default is "sessions"
  }),
  secret: 'your-session-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: true }
}));

app.get('/', (req, res) => {
  res.send('Hello World!');
});

```

## Configuration
```
const store = new DynamoDBSessionStore({
  table: 'YourDynamoDBTableName', // Optional, default is "sessions"
  client: yourDynamoDBClient, // Optional, a custom DynamoDB client instance
});
```

## API
The DynamoDBSessionStore class extends the express-session.Store class and implements the following methods:

- get(sessionId: string, callback: (err: any, session: SessionData | null) => void): Promise<void>
- set(sessionId: string, session: SessionData, callback?: (err?: any) => void): Promise<void>
- destroy(sessionId: string, callback?: (err?: any) => void): Promise<void>
- length(callback: (err: any, length?: number) => void): Promise<void>
- touch(sessionId: string, session: SessionData, callback?: (err?: any) => void): Promise<void>
- reap(callback?: (err?: any) => void): Promise<void>
- all(callback: (err: any, sessions?: { [sid: string]: SessionData } | null) => void): Promise<void>