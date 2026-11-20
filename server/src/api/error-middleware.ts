import type { ErrorRequestHandler } from 'express';
import { HttpError } from './validation.js';
import { log } from '../logging/logger.js';

export const errorMiddleware: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof HttpError) {
    response.status(error.status).json({ code: error.code, message: error.message, ...(error.details ?? {}) });
    return;
  }
  if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
    response.status(400).json({ code: 'INVALID_JSON', message: '要求內容不是有效的 JSON。' });
    return;
  }
  log('error', 'request_failed', { statusCode: 500 });
  response.status(500).json({ code: 'INTERNAL_ERROR', message: '發生未預期錯誤，請稍後再試。' });
};
