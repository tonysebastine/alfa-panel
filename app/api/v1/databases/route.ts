import { NextResponse } from 'next/server';

export interface DatabaseRecord {
  id: string;
  name: string;
  type: 'postgresql' | 'mysql' | 'redis' | 'mongodb';
  mode: 'local' | 'remote';
  host: string;
  port: number;
  user: string;
  status: 'running' | 'stopped' | 'connected' | 'error';
  version?: string;
  databaseName?: string;
  createdAt: string;
}

let mockDatabases: DatabaseRecord[] = [
  {
    id: 'db-local-postgres',
    name: 'Primary PostgreSQL',
    type: 'postgresql',
    mode: 'local',
    host: '127.0.0.1',
    port: 5432,
    user: 'alfa_user',
    status: 'running',
    version: 'PostgreSQL 16.2',
    databaseName: 'alfa_panel',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: 'db-local-redis',
    name: 'Session & Cache Store',
    type: 'redis',
    mode: 'local',
    host: '127.0.0.1',
    port: 6379,
    user: 'default',
    status: 'running',
    version: 'Redis 7.2',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'db-remote-mysql',
    name: 'External Production MySQL',
    type: 'mysql',
    mode: 'remote',
    host: 'db.prod.aws.internal',
    port: 3306,
    user: 'remote_admin',
    status: 'connected',
    version: 'MySQL 8.0.35',
    databaseName: 'customer_db',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

export async function GET() {
  return NextResponse.json({
    databases: mockDatabases,
    total: mockDatabases.length,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, type, mode, host, port, user, password, databaseName, version } = body;

    if (!name || !type) {
      return NextResponse.json({ error: 'Name and database engine type are required' }, { status: 400 });
    }

    const defaultPort = type === 'postgresql' ? 5432 : type === 'mysql' ? 3306 : type === 'redis' ? 6379 : 27017;
    const defaultHost = mode === 'local' ? '127.0.0.1' : host || 'remote.db.internal';

    const newDb: DatabaseRecord = {
      id: `db-${Date.now()}`,
      name: name.trim(),
      type,
      mode: mode || 'local',
      host: defaultHost,
      port: Number(port) || defaultPort,
      user: user || (type === 'postgresql' ? 'postgres' : 'root'),
      status: mode === 'local' ? 'running' : 'connected',
      version: version || (type === 'postgresql' ? 'PostgreSQL 16' : type === 'mysql' ? 'MySQL 8.0' : type === 'redis' ? 'Redis 7.2' : 'MongoDB 7.0'),
      databaseName: databaseName || (type === 'redis' ? undefined : 'production_db'),
      createdAt: new Date().toISOString(),
    };

    mockDatabases.unshift(newDb);
    return NextResponse.json({ success: true, database: newDb }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to provision or register database' }, { status: 400 });
  }
}
