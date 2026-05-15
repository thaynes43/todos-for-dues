import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

export interface StartedPostgres {
  url: string;
  container: StartedPostgreSqlContainer;
  stop: () => Promise<void>;
}

export async function startPostgres(): Promise<StartedPostgres> {
  const container = await new PostgreSqlContainer('postgres:16').start();
  return {
    url: container.getConnectionUri(),
    container,
    stop: () => container.stop().then(() => undefined),
  };
}
