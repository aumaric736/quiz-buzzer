import type { ReactNode } from 'react';
import { ReturnToRoleControl } from './ReturnToRoleControl.js';

interface ApplicationShellProps {
  roleReturnVisible: boolean;
  onReturned: () => void;
  children: ReactNode;
}

export function ApplicationShell({ roleReturnVisible, onReturned, children }: ApplicationShellProps) {
  return <main className="flex min-h-screen flex-col items-center bg-slate-50 px-5 py-14 text-slate-900">
    <h1 className="mb-8 text-3xl font-bold">課堂搶答系統</h1>
    <ReturnToRoleControl visible={roleReturnVisible} onReturned={onReturned} />
    {children}
  </main>;
}
