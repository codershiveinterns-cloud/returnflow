// PM2 process file — `pm2 start deploy/ecosystem.config.cjs --env production`
module.exports = {
  apps: [
    {
      name: "returnflow",
      cwd: __dirname + "/../server",
      script: "dist/index.js",
      instances: 1, // SQLite: one writer process. Scale out after moving to PostgreSQL.
      exec_mode: "fork",
      max_memory_restart: "512M",
      kill_timeout: 10000,
      env_production: {
        NODE_ENV: "production",
        API_PORT: 4000,
        WEB_DIST: __dirname + "/../web/dist",
      },
    },
  ],
};
