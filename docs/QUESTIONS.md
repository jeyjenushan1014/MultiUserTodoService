# Questions and Challenges

## 1. How can I make the Docker setup simple for a new developer?

### Challenge

The Docker setup was one of the most difficult parts of this project. Initially, my `Dockerfile` and `docker-compose.yml` did not produce the expected results. I was concerned that a new developer would find it difficult to run the project after cloning the repository because they might need to install PostgreSQL and Redis separately or execute several undocumented commands manually.


### Solution

I reviewed Docker and Docker Compose documentation and also used AI as a supporting resource to understand the problem. I then improved the setup by containerizing the Node.js application and defining the application, PostgreSQL, and Redis as separate services in Docker Compose.

I added health checks for PostgreSQL and Redis so that their availability could be verified. The application service was configured to depend on the healthy database and cache services. I also documented the required environment variables, ports, migration process, and startup command in the README.

As a result, a new developer can clone the repository, create the required `.env` file from the example, and start the complete environment using the documented Docker Compose command. This reduces manual setup and helps avoid the common “it works on my machine” problem.

### Learning Outcome

This challenge helped me understand the difference between a Docker image and a container, multi-stage Docker builds, Docker Compose service communication, health checks, volumes, environment variables, startup order, and reproducible development environments.

---

## 2. How can I implement Redis caching without returning incorrect or stale TODO data?

### Challenge

Redis caching was another major challenge. The first implementation did not always return the expected result. A cached TODO list could become outdated after creating, updating, or deleting a TODO. Because the application supports multiple users, I also needed to ensure that one user's cached TODO data could never be returned to another user.

### Solution

I researched Redis caching strategies and used AI to help compare possible approaches. I implemented user-specific cache keys so that cached data is isolated by owner. The cache keys also include the TODO identifier or a normalized representation of the list query.

I used a version-based invalidation strategy. When a TODO is created, updated, or deleted, the user's cache version is incremented. Future read operations use the new version, so old cached entries are no longer selected. Cached values also have a time-to-live to ensure that unused entries expire automatically.

The database remains the source of truth. Redis is used only to improve read performance. If Redis is unavailable, the application logs the cache failure and continues retrieving data from PostgreSQL instead of failing the entire API request.

### Learning Outcome

This challenge helped me understand cache hits and misses, TTL, user-specific cache keys, cache invalidation, stale-data prevention, graceful degradation, and why a cache must not replace the main database.

---

## Overall Reflection

The Docker and Redis tasks were the most challenging parts of the project because my initial implementations did not provide the expected results. Instead of stopping, I identified the specific problems, reviewed relevant documentation, used AI as a supporting learning tool, tested different solutions, and corrected the implementations. These challenges improved both my technical knowledge and my confidence in troubleshooting backend infrastructure problems.
