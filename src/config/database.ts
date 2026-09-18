/*
A pool keeps reusable database connections. 
The application does not need to create a new PostgreSQL connection for every request.
pg is a PostgreSQL client for Node.js. It is used to connect to the PostgreSQL database and execute queries.
*/
import pg from "pg";
import { env } from "./env.js";
import { logger } from "./logger.js";

export const database = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

/*
Handles unexpected errors from idle PostgreSQL connections.

Without this listener, an error emitted by the pool may become an
unhandled error event and terminate the Node.js process.
*/
database.on("error", (error) => {
  logger.error(
    {
      error,
      errorCode:
        "code" in error ? error.code : undefined,
    },
   "Idle PostgreSQL client error; pool will recover"
  );
});

export async function verifyDatabaseConnection(): Promise<void> {
    // Verify that the database connection is working by executing a simple query.
  const client = await database.connect();

  try {
    // Execute a simple query to verify the connection. If the query fails, an error will be thrown.
    await client.query("SELECT 1");
  } finally {
    //It is very important to release the client back to the pool after using it. otherwise, the pool will run out of available clients and the application will hang.
    client.release();
  }
}