# Flan Cloud 🍮

A tiny, self-hosted cloud platform, built from scratch.

> **This project is for fun and for learning.** It's a personal playground for
> understanding how cloud platforms work under the hood. It is not meant for
> production use, and nothing here comes with guarantees.

## What it is

Flan is a small "build your own cloud" that runs on Docker on a cheap VM. The
goal is to recreate the basic building blocks you'd use to ship a web app
backend on a real cloud provider:

- **Serverless functions**: write a `handler`, deploy it, call it
- **API gateway**: route HTTP traffic to functions
- **Database service**: a Postgres database per project
- **Auth**: sign-up/login and token-protected routes
- **Message queue**: functions triggered by messages
- **Object storage + static sites**: host files and websites
- **Logs and metrics**: see what's happening across everything

You drive it all through the `flan` CLI:

```sh
flan deploy ./hello
flan invoke hello --data '{"name":"Ryan"}'
```

## How it fits together

Flan is split into two halves:

- **Control plane**: a server that handles *changes* (deploying functions,
  creating databases, setting secrets, adding routes). The CLI talks to it.
- **Data plane**: the parts that serve *real traffic* (the gateway, function
  containers, Postgres, the queue).

```
your laptop                       your VM
flan CLI ──HTTPS──▶  control plane ──▶ Docker
                                          │
visitors ──────────▶ gateway ──▶ functions ──▶ Postgres / queue / storage
```

## Roadmap

Each step ends with something that works end to end.

- [ ] **1. Functions**: control plane, Node runtime, and `flan` CLI (TypeScript)
- [ ] **2. Gateway**: HTTP routing to functions (Go)
- [ ] **3. Database**: Postgres per project, with injected credentials
- [ ] **4. Ship it**: run on a VM with a real domain and HTTPS
- [ ] **5. Auth**: sign-up/login, JWT-protected routes
- [ ] 6. Queue: message-triggered functions (NATS)
- [ ] 7. Object storage and static site hosting (MinIO)
- [ ] 8. Logs and metrics

Steps 1–5 are **v1**. Later ideas: social login, cron triggers, a web console,
Kubernetes (k3s), and a full OAuth2/OIDC provider.

## Tech stack

- **TypeScript / Node.js**: control plane, CLI, function runtime
- **Go**: API gateway
- **Docker**: runs everything, Docker Compose to start
- **pnpm workspaces**: monorepo tooling

## Status

Just getting started. 🚧
