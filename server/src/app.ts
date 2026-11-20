import express, { type Express } from 'express';
import { createServer, type Server } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { errorMiddleware } from './api/error-middleware.js';
import { loadConfig, type AppConfig } from './config/env.js';
import { log } from './logging/logger.js';
import { openDatabase, type SqliteDatabase } from './features/user-stage-sync/persistence/database.js';
import { sessionRoutes } from './features/user-stage-sync/api/session-routes.js';
import { activityRoutes } from './features/user-stage-sync/api/activity-routes.js';
import { groupRoutes } from './features/user-stage-sync/api/group-routes.js';
import { answerStatusRoutes } from './features/user-stage-sync/api/answer-status-routes.js';
import { answerAttemptCheckRoutes } from './features/user-stage-sync/api/answer-attempt-check-routes.js';
import { buzzerFlowRoutes } from './features/buzzer-flow/api/buzzer-flow-routes.js';
import { resultsReviewRoutes } from './features/results-review/api/results-review-routes.js';
import { attachActivitySubscriptions } from './features/user-stage-sync/realtime/websocket-server.js';
import type { ActivityPhaseUpdatedEvent } from '@quiz-buzzer/shared';
import type { BuzzerQuestionUpdatedEvent } from '@quiz-buzzer/shared';
import { GoogleSheetsGateway } from './features/guided-notes/google-sheets/google-sheets-gateway.js';
import { guidedNotesRoutes } from './features/guided-notes/api/guided-notes-routes.js';
import type { WinningAnswerProvider } from '@quiz-buzzer/shared';
import type { SheetsGateway } from './features/guided-notes/google-sheets/sheets-gateway.js';
import { createWinningAnswerProvider } from './features/buzzer-flow/application/winning-answer-provider.js';

export interface AppDependencies {
  sheetsGateway?: SheetsGateway;
  winningAnswerProvider?: WinningAnswerProvider;
  publishBuzzerQuestion?: (event: BuzzerQuestionUpdatedEvent) => void;
}

export function createApp(
  db: SqliteDatabase,
  allowedOrigin = 'http://127.0.0.1:5173',
  publishPhase: (event: ActivityPhaseUpdatedEvent) => void = () => undefined,
  dependencies: AppDependencies = {}
): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use((request, response, next) => {
    const origin = request.headers.origin;
    if (origin === allowedOrigin) {
      response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      response.setHeader('Vary', 'Origin');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Local-Session-Id');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (request.method === 'OPTIONS') { response.sendStatus(origin === allowedOrigin ? 204 : 403); return; }
    next();
  });
  app.use(express.json({ limit: '16kb', strict: false }));
  app.get('/health', (_request, response) => response.json({ status: 'ok' }));
  app.use(sessionRoutes(db));
  app.use(activityRoutes(db, publishPhase));
  app.use(groupRoutes(db));
  app.use(answerStatusRoutes(db));
  app.use(answerAttemptCheckRoutes(db));
  app.use(buzzerFlowRoutes(db, dependencies.publishBuzzerQuestion));
  app.use(resultsReviewRoutes(db));
  app.use(guidedNotesRoutes(db, dependencies.sheetsGateway ?? new GoogleSheetsGateway(), dependencies.winningAnswerProvider ?? createWinningAnswerProvider(db)));
  app.use(errorMiddleware);
  return app;
}

export function createHttpServer(db: SqliteDatabase, config: AppConfig, dependencies: AppDependencies = {}): { server: Server; sockets: WebSocketServer } {
  const server = createServer();
  const sockets = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
  const publishers = attachActivitySubscriptions(sockets, db);
  server.on('request', createApp(db, config.clientOrigin, publishers.publishPhase, { ...dependencies, publishBuzzerQuestion: publishers.publishBuzzerQuestion }));
  return { server, sockets };
}

export function startServer(config: AppConfig = loadConfig(), dependencies: AppDependencies = {}): Server {
  const absoluteDbPath = config.databasePath === ':memory:' ? config.databasePath : resolve(process.cwd(), config.databasePath);
  if (absoluteDbPath !== ':memory:') mkdirSync(dirname(absoluteDbPath), { recursive: true });
  const db = openDatabase(absoluteDbPath);
  const { server } = createHttpServer(db, config, dependencies);
  server.listen(config.port, config.host, () => log('info', 'service_started', { port: config.port }));
  server.on('close', () => db.close());
  return server;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  startServer();
}
