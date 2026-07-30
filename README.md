# AI QA Copilot

> AI-powered QA platform that transforms requirements and bug descriptions into comprehensive test cases and professional bug reports, managed within a project-centric hub.

**Status:** Active · **Last updated:** 2026-07-30

---

## 🚀 Features

- **Project Management Hub** — Central organizing unit where all bugs, test cases, and reports live
- **AI Test Case Generation** — Multi-agent system generates comprehensive test cases from requirements
- **AI Bug Report Generation** — Professional bug reports from bug descriptions
- **Test Case Management** — Full CRUD operations with import/export capabilities
- **Bug Management** — Track and manage bugs with status tracking
- **Project Estimation** — Estimate effort and resources for projects
- **Dashboard & Analytics** — Visual overview of project metrics
- **Documentation-First** — Comprehensive documentation for all features

---

## 🛠️ Tech Stack

### Backend
- **Runtime:** Node.js
- **Framework:** Express + TypeScript
- **Database:** PostgreSQL (planned migration from in-memory)
- **ORM:** Drizzle (planned)
- **AI:** Multi-agent system with GLM/Gemini providers
- **Port:** 5001

### Frontend
- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** React + TypeScript
- **Styling:** Tailwind CSS
- **Port:** 3000

---

## 📋 Quick Start

### Prerequisites
- Node.js 18+ and npm/yarn/pnpm
- PostgreSQL 15+ (for production)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd QA-Project-Management-Tool
   ```

2. **Set up backend**
   ```bash
   cd backend
   cp .env.example .env
   npm install
   npm run dev
   ```
   Backend runs on `http://localhost:5001`

3. **Set up frontend**
   ```bash
   cd frontend
   cp .env.example .env
   npm install
   npm run dev
   ```
   Frontend runs on `http://localhost:3000`

### Environment Variables

**Backend (`.env`):**
```env
DATABASE_URL=postgresql://user:password@localhost:5432/qa_copilot
JWT_SECRET=your-secret-key
PORT=5001
```

**Frontend (`.env`):**
```env
NEXT_PUBLIC_API_URL=http://localhost:5001
```

---

## 📁 Project Structure

```
QA-Project-Management-Tool/
├── backend/                 # Node.js + Express backend
│   ├── src/
│   │   ├── modules/        # Feature modules
│   │   │   ├── project-management/
│   │   │   ├── test-generation/
│   │   │   ├── test-case-management/
│   │   │   ├── bug-management/
│   │   │   ├── project-estimation/
│   │   │   └── identity/
│   │   ├── ai/             # AI agents and providers
│   │   ├── shared/         # Shared utilities
│   │   └── index.ts        # Entry point
│   └── package.json
├── frontend/               # Next.js frontend
│   ├── app/                # App Router pages
│   ├── features/           # Feature components
│   ├── components/         # Shared UI components
│   └── package.json
├── docs/                   # Documentation
│   ├── architecture/       # System architecture
│   ├── modules/            # Module documentation
│   ├── api/                # API reference
│   └── workflows/          # User workflows
└── requirements/           # Requirements and specs
```

---

## 📚 Documentation

- **[Documentation Map](./docs/README.md)** — Entry point to all project documentation
- **[Architecture Guide](./docs/architecture/README.md)** — System design and architecture decisions
- **[API Reference](./docs/api/)** — Complete API documentation
- **[Module Documentation](./docs/modules/)** — Feature-specific documentation
- **[Workflows](./docs/workflows/)** — User journey documentation

---

## 🎯 Core Modules

| Module | Description | Status |
|--------|-------------|--------|
| **Project Management** | Central hub for organizing bugs, test cases, and reports | ✅ Active |
| **Test Case Generator** | AI-powered test case generation from requirements | ✅ Active |
| **Test Case Management** | CRUD operations and import/export for test cases | ✅ Active |
| **Bug Generator** | AI-powered bug report generation | ✅ Active |
| **Bug Management** | Track and manage bugs with status tracking | ✅ Active |
| **Project Estimation** | Estimate effort and resources for projects | 🟡 Phase 1–3 |
| **Dashboard** | Visual overview of project metrics | ✅ Active |
| **Authentication** | User authentication and authorization | ✅ Active (RBAC planned) |

---

## 🔄 Data Flow

```
Frontend Page
    ↓
Feature Service (features/<feature>/services/*.service.ts)
    ↓
API Client (fetch('/api/<resource>'))
    ↓
Next.js Route Handler (app/api/<resource>/route.ts)
    ↓
Backend Controller
    ↓
Backend Service
    ↓
Repository (in-memory → PostgreSQL)
    ↓
Database
```

---

## 🤝 Contributing

1. Read the [Documentation First Policy](./docs/documentation-standards.md)
2. Analyze existing code before making changes
3. Follow the [Architecture Guidelines](./docs/architecture-guidelines.md)
4. Update documentation alongside code changes
5. Run tests: `npm test` (backend) and `npm run test` (frontend)

---

## 📄 License

[Specify your license here]

---

## 🆘 Support

- **Documentation:** See [`docs/README.md`](./docs/README.md)
- **Issues:** [GitHub Issues](https://github.com/your-repo/issues)
- **Discussions:** [GitHub Discussions](https://github.com/your-repo/discussions)

---

## 🗺️ Roadmap

See the [Architecture Documentation](./docs/architecture/README.md) for detailed planning documents and the [PostgreSQL Migration](./docs/postgresql-migration/README.md) for the database migration roadmap.

**Current Focus:**
- Complete PostgreSQL migration
- Implement RBAC system
- Enhance AI generation capabilities
- Improve performance and scalability
