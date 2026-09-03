# Architecture

- The system has an admin back office and a public customer frontend.
- It uses Next.js App Router.
- Business validation is enforced server-side.
- Prisma and PostgreSQL will provide the persistence layer.
- Production credentials must not be available to development agents.
- Domain logic should not be embedded unnecessarily in UI components.

Do not introduce a complex Clean Architecture, DDD framework, repository pattern, or additional layers without an explicit requirement.
