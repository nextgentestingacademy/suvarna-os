import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'suvarna-saas',
    milestone: 1,
    timestamp: new Date().toISOString(),
  });
}
