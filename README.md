# CAP Frontend

**cap-frontend** is the React/Vite single-page application (SPA) for the **[Cardano Analytics Platform (CAP)](https://github.com/mobr-ai/cap)**.  
It delivers a modern, multilingual interface for querying and visualizing blockchain data, backed by the CAP knowledge graph and API services.

---

## ✨ Features

- **Authentication**
  - Email & password (with confirmation flow)
  - Google OAuth login
  - Cardano wallet login (CIP-30 compatible)

- **Analytics & Queries**
  - Natural language queries over the CAP knowledge graph
  - SPARQL editor for advanced users
  - Saved queries and insights

- **Visualization**
  - Interactive charts and dashboards
  - Entity and relationship exploration
  - Real-time status of ETL pipelines and traceability

- **User Tools**
  - Alerts and notifications
  - Settings and preferences
  - Multilingual interface (English, Portuguese, …)

- **Deployment**
  - Built with [Vite](https://vitejs.dev/) for fast development
  - Outputs a static bundle (`dist/`) served by the CAP FastAPI backend

---

## 📦 Project Structure
```
cap-frontend/
├── public/ # Static assets (logos, icons)
├── src/
│ ├── components/ # Reusable UI components (charts, wallet login, etc.)
│ ├── i18n/ # Translation setup
│ ├── pages/ # Page-level components (AuthPage, WaitingListPage, QueryPage, etc.)
│ ├── styles/ # CSS modules for pages and components
│ ├── index.jsx # App entrypoint with routing
│ └── App.jsx # Root component (if used)
├── package.json # Project dependencies and scripts
├── vite.config.js # Vite configuration
└── README.md # Project documentation
```
---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) ≥ 18
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

### Setup

```bash
# Clone the repository
git clone https://github.com/mobr-ai/cap-frontend.git
cd cap-frontend

# Install dependencies
npm install

# Start development server
npm run dev
```
The app will be available at http://localhost:5173.

## Build for Production
```bash
npm run build
```

This generates a static bundle in dist/, which is then copied into the backend (CAP's src/cap/static/) and served by Uvicorn/FastAPI.

---

## 🔗 Related Repositories
[CAP](https://github.com/mobr-ai/cap) – CAP backend (FastAPI, SQLAlchemy, ETL pipelines)

[cap-ontology](https://github.com/mobr-ai/cap/tree/main/src/ontologies) – Ontology definitions and semantic models

## 🛠️ Tech Stack

- [React](https://reactjs.org/) – UI library  
- [Vite](https://vitejs.dev/) – Frontend build tool  
- [react-router-dom](https://reactrouter.com/) – Routing  
- [Bootstrap](https://react-bootstrap.github.io/) – UI components  
- [@react-oauth/google](https://www.npmjs.com/package/@react-oauth/google) – Google login integration  
- [Cardano CIP-30 API](https://cips.cardano.org/cips/cip30/) – Wallet integration  


## 📜 License

This project is licensed under the **GNU General Public License v3.0 (GPLv3)** – see the [LICENSE](LICENSE) file for details.  
You are free to use, modify, and distribute this software under the terms of the GPLv3, provided that derivative works are also licensed under the same license.
