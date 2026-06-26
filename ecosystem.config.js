// PM2 process definitions for the Disha CAP platform.
// Run from the repo root after `npm run build`:  pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'ucb-backend',
      cwd: './backend',
      script: 'dist/index.js',
      env: { NODE_ENV: 'production' },
      // backend reads ./backend/.env via dotenv (PORT, COOKIE_SECURE, secrets, API keys)
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: 'ucb-frontend',
      cwd: './frontend',
      script: './node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      env: { NODE_ENV: 'production' },
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};
