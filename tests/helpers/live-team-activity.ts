import WebSocket from 'ws';
import type { SheetsCellUpdate, SheetsGateway, SheetsWorksheetGrid } from '../../server/src/features/guided-notes/google-sheets/sheets-gateway.js';
import { guidedNotesGridFixture } from './guided-notes-grid.js';

export interface ControlledClock {
  now(): Date;
  advanceBy(milliseconds: number): Date;
  set(time: Date): Date;
}

/** A deterministic clock for application services that accept an explicit `now`. */
export function createControlledClock(initialTime = new Date('2026-01-01T00:00:00.000Z')): ControlledClock {
  let currentTime = initialTime.getTime();
  if (!Number.isFinite(currentTime)) throw new RangeError('Initial clock time must be a valid date.');

  const now = () => new Date(currentTime);
  return {
    now,
    advanceBy(milliseconds) {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new RangeError('Clock advance must be a non-negative number.');
      currentTime += milliseconds;
      return now();
    },
    set(time) {
      const nextTime = time.getTime();
      if (!Number.isFinite(nextTime)) throw new RangeError('Clock time must be a valid date.');
      currentTime = nextTime;
      return now();
    }
  };
}

export function cloneFakeSheetsGrid(grid: SheetsWorksheetGrid = guidedNotesGridFixture()): SheetsWorksheetGrid {
  return structuredClone(grid);
}

export interface FakeSheetsGatewayFixture {
  gateway: SheetsGateway;
  getGrid(): SheetsWorksheetGrid;
  replaceGrid(grid: SheetsWorksheetGrid): void;
  readonly writes: SheetsCellUpdate[][];
}

export function createFakeSheetsGateway(initialGrid: SheetsWorksheetGrid = guidedNotesGridFixture()): FakeSheetsGatewayFixture {
  let grid = cloneFakeSheetsGrid(initialGrid);
  const writes: SheetsCellUpdate[][] = [];
  const gateway: SheetsGateway = {
    async listWorksheets() {
      return [{ sheetId: grid.sheetId, title: grid.title }];
    },
    async readWorksheet() {
      return cloneFakeSheetsGrid(grid);
    },
    async writeCellUpdates(_spreadsheetId, updates) {
      writes.push(structuredClone(updates));
      for (const update of updates) {
        const existing = grid.cells.find((cell) => cell.rowIndex === update.rowIndex && cell.columnIndex === update.columnIndex);
        if (existing) existing.enteredValue = update.value;
        else grid.cells.push({ rowIndex: update.rowIndex, columnIndex: update.columnIndex, enteredValue: update.value });
      }
    }
  };

  return {
    gateway,
    getGrid: () => cloneFakeSheetsGrid(grid),
    replaceGrid: (nextGrid) => { grid = cloneFakeSheetsGrid(nextGrid); },
    writes
  };
}

export async function connectTestWebSocket(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    const onOpen = () => { cleanup(); resolve(); };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const cleanup = () => {
      socket.off('open', onOpen);
      socket.off('error', onError);
    };
    socket.once('open', onOpen);
    socket.once('error', onError);
  });
  return socket;
}

interface MessageWaiter { resolve(value: string): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
interface SocketMessageQueue { messages: string[]; waiters: MessageWaiter[] }
const socketMessageQueues = new WeakMap<WebSocket, SocketMessageQueue>();

function getSocketMessageQueue(socket: WebSocket): SocketMessageQueue {
  const existing = socketMessageQueues.get(socket);
  if (existing) return existing;
  const queue: SocketMessageQueue = { messages: [], waiters: [] };
  socketMessageQueues.set(socket, queue);
  socket.on('message', (data: WebSocket.RawData) => {
    const value = data.toString();
    const waiter = queue.waiters.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(value);
    } else queue.messages.push(value);
  });
  socket.once('close', () => {
    for (const waiter of queue.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('WebSocket closed before the expected message arrived.'));
    }
  });
  return queue;
}

export function nextTestWebSocketMessage(socket: WebSocket, timeoutMs = 1_500): Promise<string> {
  const queue = getSocketMessageQueue(socket);
  const message = queue.messages.shift();
  if (message !== undefined) return Promise.resolve(message);
  return new Promise((resolve, reject) => {
    const waiter: MessageWaiter = {
      resolve,
      reject,
      timer: setTimeout(() => {
        const index = queue.waiters.indexOf(waiter);
        if (index >= 0) queue.waiters.splice(index, 1);
        reject(new Error(`WebSocket message was not received within ${timeoutMs}ms.`));
      }, timeoutMs)
    };
    queue.waiters.push(waiter);
  });
}

export interface LiveTeamTestHarness {
  connect(url: string): Promise<WebSocket>;
  nextMessage(socket: WebSocket, timeoutMs?: number): Promise<string>;
  closeSockets(): Promise<void>;
}

/** Tracks connected clients so each realtime test can close sockets during cleanup. */
export function createLiveTeamTestHarness(): LiveTeamTestHarness {
  const sockets = new Set<WebSocket>();
  return {
    async connect(url) {
      const socket = await connectTestWebSocket(url);
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
      return socket;
    },
    nextMessage: nextTestWebSocketMessage,
    async closeSockets() {
      const closing = [...sockets].map((socket) => new Promise<void>((resolve) => {
        if (socket.readyState === WebSocket.CLOSED) {
          sockets.delete(socket);
          resolve();
          return;
        }
        socket.once('close', () => { sockets.delete(socket); resolve(); });
        socket.close();
      }));
      await Promise.all(closing);
    }
  };
}
